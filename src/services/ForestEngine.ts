import type StorageManager from './StorageManager'
import type PomodoroTimerPlugin from '../main'
import type {
    ActiveSessionPlant,
    BiomeType,
    DailyForestLog,
    DailyQuest,
    ForestExportPayload,
    GamificationData,
    GrowthStage,
    PlacedHomesteadItem,
    PlantedTree,
    QuestKind,
    RewardEvent,
    RewardLine,
} from '../types/forest'
import {
    BIOME_UNLOCK_LEVELS,
    FLORA_SPECIES,
    HOMESTEAD_BUILDINGS,
    LAND_EXPANSIONS,
    TREE_MAX_LEVEL,
    getBuilding,
    getSpecies,
} from '../assets/floraCatalog'
import {
    ACHIEVEMENTS,
    CHEST_REWARD,
    VITALITY_DAILY_FADE,
    VITALITY_FLOOR,
    addDays,
    dateKey,
    daysBetween,
    generateQuestBoard,
    levelFromXp,
    perkValue,
    upgradeCost,
} from './Progression'
import SoundManager, { type AmbientSoundType } from './SoundManager'
import ConfettiEngine from './ConfettiEngine'
import { writable, type Writable, get } from 'svelte/store'
import { Notice, TFile, getAllTags } from 'obsidian'
import * as utils from '../utils'

import { activePlantStore } from '../stores'

/** Max checked-off tasks rewarded per day, so rewards stay meaningful. */
const DAILY_TASK_REWARD_CAP = 30

export interface SessionCompletionResult {
    tree: PlantedTree
    sunlightEarned: number
    coinsEarned: number
    currentStreak: number
    speciesName: string
}

type Grant = { sunlight?: number; coins?: number; xp?: number }

export default class ForestEngine {
    private storage: StorageManager
    private plugin: PomodoroTimerPlugin
    public activePlantStore: Writable<ActiveSessionPlant | null> = activePlantStore
    /** Queue of celebrations for the UI to display, oldest first. */
    public rewardEvents: Writable<RewardEvent[]> = writable([])
    public soundManager: SoundManager
    public confettiEngine: ConfettiEngine

    private pendingEvents: RewardEvent[] = []

    constructor(plugin: PomodoroTimerPlugin, storage: StorageManager) {
        this.plugin = plugin
        this.storage = storage
        this.soundManager = new SoundManager()
        this.confettiEngine = new ConfettiEngine()
    }

    // -----------------------------------------------------------------------
    // State plumbing
    // -----------------------------------------------------------------------

    private get state(): GamificationData {
        return this.storage.getGamification()
    }

    private settings() {
        return this.plugin.getSettings()
    }

    /**
     * Apply a change to a deep copy of the game state, then run the shared
     * follow-ups (level-ups, achievements) and publish the result in one update.
     */
    private mutate(fn: (g: GamificationData) => void, options: { persist?: boolean } = {}): void {
        const g: GamificationData = structuredClone(this.state)
        const levelBefore = levelFromXp(g.xp)
        fn(g)
        this.checkAchievements(g)
        this.applyLevelUps(g, levelBefore)
        this.storage.updateGamification(() => g, options)
        this.flushEvents()
    }

    private grant(g: GamificationData, reward: Grant): Required<Grant> {
        const xpBoost = perkValue(g.homestead, 'xp_pct')
        const xp = Math.round((reward.xp || 0) * (1 + xpBoost / 100))
        const sunlight = Math.round(reward.sunlight || 0)
        const coins = Math.round(reward.coins || 0)
        g.sunlight += sunlight
        g.coins += coins
        g.xp += xp
        return { sunlight, coins, xp }
    }

    private emit(event: Omit<RewardEvent, 'id' | 'at'>): void {
        this.pendingEvents.push({
            ...event,
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            at: Date.now(),
        })
    }

    private flushEvents(): void {
        if (!this.pendingEvents.length) return
        const events = this.pendingEvents
        this.pendingEvents = []

        const big = events.some((e) => e.kind === 'levelup' || e.kind === 'achievement' || e.kind === 'chest')
        if (this.settings().forestSounds && big) this.soundManager.playLevelUp()

        if (this.plugin.hasVisibleForestView()) {
            this.rewardEvents.update((q) => [...q, ...events].slice(-8))
        } else {
            // No view open to celebrate in — fall back to compact notices.
            for (const e of events) {
                if (e.kind === 'task') continue
                const parts = [e.sunlight && `+${e.sunlight}☀️`, e.coins && `+${e.coins}🪙`, e.xp && `+${e.xp} XP`].filter(Boolean)
                new Notice(`${e.title}${parts.length ? `\n${parts.join('  ')}` : ''}`)
            }
        }
    }

    public dismissReward(id: string): void {
        this.rewardEvents.update((q) => q.filter((e) => e.id !== id))
    }

    private todayLog(g: GamificationData, today = dateKey()): DailyForestLog {
        if (!g.dailyLogs[today]) {
            g.dailyLogs[today] = { date: today, trees: [], totalMinutes: 0, completedPomodoros: 0, tasksCompleted: 0, breaksCompleted: 0 }
        }
        return g.dailyLogs[today]
    }

    // -----------------------------------------------------------------------
    // Daily rollover: quests, streak shields, gentle vitality fade
    // -----------------------------------------------------------------------

    /**
     * Cheap to call often; only does work the first time it runs on a new day.
     *
     * The rollover is not saved by itself: every device works it out from the date, and it is
     * written with the next real change. Saving it on launch would change data.json before the
     * sync tool has pulled, and make the pull conflict.
     */
    public ensureToday(): void {
        const today = dateKey()
        const g0 = this.state
        if (g0.lastVisitDate === today && g0.questBoard?.date === today) return

        let shieldUsed = false
        this.mutate((g) => {
            const settings = this.settings()

            if (g.lastVisitDate && g.lastVisitDate !== today) {
                // Fade vitality for each past day without a single session (never below the floor)
                const keep = perkValue(g.homestead, 'vitality_keep_pct')
                const fade = VITALITY_DAILY_FADE * (1 - Math.min(90, keep) / 100)
                const span = Math.min(60, daysBetween(g.lastVisitDate, today))
                for (let i = 0; i < span; i++) {
                    const d = addDays(g.lastVisitDate, i)
                    if (!(g.dailyLogs[d]?.completedPomodoros > 0)) {
                        g.vitality = Math.max(VITALITY_FLOOR, g.vitality - fade)
                    }
                }
                g.vitality = Math.round(g.vitality)
            }

            shieldUsed = this.resolveStreak(g, today)

            if (g.questBoard?.date !== today) {
                g.questBoard = generateQuestBoard(today, settings.dailyGoal || 4, settings.workLen || 25)
            }
            g.lastVisitDate = today
        }, { persist: false })
        // A used shield is announced once; save it so the notice does not repeat on every launch
        if (shieldUsed) this.storage.markChanged()
    }

    /** Returns true when a streak shield covered the missed days. */
    private resolveStreak(g: GamificationData, today: string): boolean {
        const last = g.streak.lastCheckInDate
        if (!last || g.streak.current === 0) return false
        const missed = daysBetween(last, today) - 1
        if (missed <= 0) return false

        const month = today.slice(0, 7)
        if (g.streak.shieldMonth !== month) {
            g.streak.shieldMonth = month
            g.streak.shieldsUsed = 0
        }
        const shields = perkValue(g.homestead, 'streak_shield') - g.streak.shieldsUsed
        if (missed <= shields) {
            g.streak.shieldsUsed += missed
            g.streak.lastCheckInDate = addDays(today, -1)
            this.emit({
                kind: 'achievement',
                title: '🛡️ The watermill kept your streak safe',
                subtitle: `${missed} rest day${missed > 1 ? 's' : ''} covered — your ${g.streak.current}-day streak lives on.`,
                sunlight: 0, coins: 0, xp: 0, lines: [],
            })
            return true
        }
        g.streak.current = 0
        return false
    }

    // -----------------------------------------------------------------------
    // Focus sessions
    // -----------------------------------------------------------------------

    public detectFloraFromContext(notePath?: string, taskText?: string, tags?: string[]): string | null {
        const state = this.state
        const mappings = state.tagMappings || []

        const candidates: string[] = []
        const add = (t: string) => {
            const tag = (t.startsWith('#') ? t : `#${t}`).toLowerCase()
            if (!candidates.includes(tag)) candidates.push(tag)
        }
        tags?.forEach(add)
        taskText?.match(/#[\w\-/]+/g)?.forEach(add)
        if (notePath) {
            const file = this.plugin.app.vault.getAbstractFileByPath(notePath)
            if (file instanceof TFile) {
                const cache = this.plugin.app.metadataCache.getFileCache(file)
                if (cache) getAllTags(cache)?.forEach(add)
            }
        }

        for (const candidate of candidates) {
            const match = mappings.find((m) => m.tag.toLowerCase() === candidate)
            if (match && state.unlockedSpecies.includes(match.speciesId)) {
                return match.speciesId
            }
        }
        return null
    }

    public startSession(durationMinutes: number, taskText?: string, notePath?: string, tags?: string[]): void {
        this.ensureToday()
        const gamification = this.state
        const detected = this.detectFloraFromContext(notePath, taskText, tags)
        const speciesId = detected || gamification.selectedSpeciesId || 'classic_pine'

        this.activePlantStore.set({
            speciesId,
            startTime: Date.now(),
            totalDurationMillis: durationMinutes * 60 * 1000,
            currentStage: 'seed',
            progressRatio: 0,
            taskText,
            notePath,
            autoTagged: !!detected,
        })

        if (this.settings().forestSounds) this.soundManager.playPlantSeed()
        if (gamification.ambientSound && gamification.ambientSound !== 'none') {
            this.soundManager.startAmbient(gamification.ambientSound, gamification.ambientVolume || 0.3)
        }
    }

    public updateProgress(elapsedMillis: number, totalMillis: number): void {
        this.activePlantStore.update((plant) => {
            if (!plant) return null
            const ratio = Math.max(0, Math.min(1, elapsedMillis / Math.max(1, totalMillis)))
            let stage: GrowthStage = 'seed'
            if (ratio >= 0.75) stage = 'mature'
            else if (ratio >= 0.5) stage = 'sapling'
            else if (ratio >= 0.25) stage = 'sprout'
            return { ...plant, progressRatio: ratio, currentStage: stage }
        })
    }

    public completeSession(
        durationMinutes: number,
        taskContext?: { taskText?: string; notePath?: string; tags?: string[] },
    ): SessionCompletionResult | null {
        this.soundManager.stopAmbient()
        this.ensureToday()

        const currentPlant = get(this.activePlantStore)
        const speciesId = currentPlant?.speciesId || this.state.selectedSpeciesId || 'classic_pine'
        const species = getSpecies(speciesId) || FLORA_SPECIES[0]
        const today = dateKey()
        const settings = this.settings()

        const newTree: PlantedTree = {
            id: `tree_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            speciesId,
            plantedAt: new Date().toISOString(),
            durationMinutes,
            status: 'mature',
            notePath: taskContext?.notePath || currentPlant?.notePath,
            taskText: taskContext?.taskText || currentPlant?.taskText,
            tags: taskContext?.tags,
        }

        let result: SessionCompletionResult | null = null

        this.mutate((g) => {
            const lines: RewardLine[] = []
            const baseSun = Math.max(5, Math.round(durationMinutes * 1.2))
            const baseCoins = Math.max(1, Math.floor(durationMinutes / 10))
            lines.push({ label: `${durationMinutes}m of focus`, sunlight: baseSun, coins: baseCoins, xp: durationMinutes })

            // Streak first, so today's session counts toward its own bonus
            const last = g.streak.lastCheckInDate
            if (last !== today) {
                g.streak.current = last === addDays(today, -1) ? g.streak.current + 1 : 1
                g.streak.longest = Math.max(g.streak.longest, g.streak.current)
                g.streak.lastCheckInDate = today
            }

            let sunPct = 0
            let coinPct = 0
            const pctLine = (label: string, pct: number, kind: 'sun' | 'coin') => {
                if (pct <= 0) return
                if (kind === 'sun') sunPct += pct
                else coinPct += pct
                lines.push({
                    label: `${label} +${pct}%`,
                    sunlight: kind === 'sun' ? Math.round((baseSun * pct) / 100) : undefined,
                    coins: kind === 'coin' ? Math.round((baseCoins * pct) / 100) : undefined,
                })
            }
            pctLine(`🔥 ${g.streak.current}-day streak`, Math.min(20, Math.max(0, g.streak.current - 1) * 2), 'sun')
            pctLine('🏡 Cozy Cabin', perkValue(g.homestead, 'sunlight_pct'), 'sun')
            if (durationMinutes >= 45) pctLine('🌬️ Windmill (long session)', perkValue(g.homestead, 'long_session_sunlight_pct'), 'sun')
            const hour = new Date().getHours()
            if (hour >= 19 || hour < 5) pctLine('🏮 Lanterns (evening)', perkValue(g.homestead, 'night_sunlight_pct'), 'sun')
            pctLine('🪣 Village Well', perkValue(g.homestead, 'coins_pct'), 'coin')

            const log = this.todayLog(g, today)
            const firstToday = log.completedPomodoros === 0
            let bonusSun = 0
            let bonusCoins = 0
            let bonusXp = 0
            if (firstToday) {
                bonusXp += 10
                lines.push({ label: '🌅 First tree of the day', xp: 10 })
            }
            const goal = settings.dailyGoal || 4
            if (log.completedPomodoros + 1 === goal) {
                bonusSun += 40
                bonusCoins += 5
                bonusXp += 20
                lines.push({ label: `🎯 Daily goal reached (${goal})`, sunlight: 40, coins: 5, xp: 20 })
            }

            const earned = this.grant(g, {
                sunlight: baseSun * (1 + sunPct / 100) + bonusSun,
                coins: baseCoins * (1 + coinPct / 100) + bonusCoins,
                xp: durationMinutes + bonusXp,
            })

            // The grown tree becomes a sapling you can plant in the village
            const key = `tree:${speciesId}`
            g.inventory[key] = (g.inventory[key] || 0) + 1
            lines.push({ label: `🌱 ${species.name} sapling added to your village inventory` })

            log.trees.push(newTree)
            log.totalMinutes += durationMinutes
            log.completedPomodoros += 1
            g.lifetimeStats.totalFocusMinutes += durationMinutes
            g.lifetimeStats.totalPomodoros += 1
            g.lifetimeStats.treesGrown += 1
            g.vitality = Math.min(100, g.vitality + 12)

            this.emit({
                kind: 'harvest',
                title: `${species.name} fully grown!`,
                subtitle: newTree.taskText || (newTree.notePath ? newTree.notePath.split('/').pop()?.replace(/\.md$/, '') : undefined),
                speciesId,
                ...earned,
                lines,
            })

            this.progressQuests(g, 'sessions', 1)
            this.progressQuests(g, 'minutes', durationMinutes)
            if (newTree.taskText) this.progressQuests(g, 'linked_task', 1)
            if (currentPlant?.autoTagged || (taskContext?.tags?.length ?? 0) > 0) this.progressQuests(g, 'tagged_session', 1)

            result = {
                tree: newTree,
                sunlightEarned: earned.sunlight,
                coinsEarned: earned.coins,
                currentStreak: g.streak.current,
                speciesName: species.name,
            }
        })

        this.activePlantStore.set(null)

        if (settings.forestSounds) this.soundManager.playHarvestCelebration()
        if (settings.enableCelebrationParticles) this.confettiEngine.triggerCelebration(speciesId)

        if (settings.logForestToDailyNote && result) {
            const r = result as SessionCompletionResult
            void this.logToDailyNote(newTree, durationMinutes, r.sunlightEarned, r.coinsEarned)
        }
        return result
    }

    public completeBreak(): void {
        this.ensureToday()
        this.mutate((g) => {
            const bonus = perkValue(g.homestead, 'break_sunlight')
            g.lifetimeStats.breaksCompleted += 1
            const log = this.todayLog(g)
            log.breaksCompleted = (log.breaksCompleted || 0) + 1
            const earned = this.grant(g, { sunlight: bonus, xp: 3 })
            this.emit({
                kind: 'break',
                title: '🍵 Break well taken',
                subtitle: bonus ? 'The tea gazebo thanks you for resting.' : 'Rested minds grow taller trees.',
                ...earned,
                lines: bonus ? [{ label: '🍵 Tea Gazebo', sunlight: bonus }] : [],
            })
            this.progressQuests(g, 'break', 1)
        })
    }

    public abortSession(elapsedMinutes: number, taskContext?: { taskText?: string; notePath?: string }): PlantedTree | null {
        this.soundManager.stopAmbient()

        const currentPlant = get(this.activePlantStore)
        this.activePlantStore.set(null)
        if (!currentPlant) return null
        if (!this.settings().hardcoreMode || elapsedMinutes < 1) return null

        if (this.settings().forestSounds) this.soundManager.playWitherSound()
        const witheredTree: PlantedTree = {
            id: `tree_withered_${Date.now()}`,
            speciesId: currentPlant.speciesId,
            plantedAt: new Date().toISOString(),
            durationMinutes: Math.round(elapsedMinutes),
            status: 'withered',
            notePath: taskContext?.notePath || currentPlant.notePath,
            taskText: taskContext?.taskText || currentPlant.taskText,
        }

        this.mutate((g) => {
            this.todayLog(g).trees.push(witheredTree)
            g.lifetimeStats.treesWithered += 1
            this.emit({
                kind: 'wither',
                title: 'A tree withered',
                subtitle: 'It happens. The next seed is already waiting for you.',
                speciesId: currentPlant.speciesId,
                sunlight: 0, coins: 0, xp: 0, lines: [],
            })
        })
        return witheredTree
    }

    // -----------------------------------------------------------------------
    // Tasks
    // -----------------------------------------------------------------------

    /** Called by the task watcher when a markdown task flips from open to done. */
    public onTaskCompleted(key: string, text: string, wasFocused: boolean): void {
        if (!this.settings().rewardTaskCompletion) return
        this.ensureToday()
        const today = dateKey()
        const g0 = this.state
        const rewarded = g0.rewardedTaskKeys?.date === today ? g0.rewardedTaskKeys.keys : []
        if (rewarded.includes(key) || rewarded.length >= DAILY_TASK_REWARD_CAP) return

        this.mutate((g) => {
            if (g.rewardedTaskKeys?.date !== today) g.rewardedTaskKeys = { date: today, keys: [] }
            g.rewardedTaskKeys.keys.push(key)

            const lines: RewardLine[] = [{ label: 'Task done', coins: 3, xp: 5 }]
            let coins = 3
            const bench = perkValue(g.homestead, 'task_coins')
            if (bench) {
                coins += bench
                lines.push({ label: '🪑 Garden Bench', coins: bench })
            }
            if (wasFocused) {
                coins += 2
                lines.push({ label: '🍅 Focused task', coins: 2 })
            }
            const earned = this.grant(g, { coins, xp: 5 })
            g.lifetimeStats.tasksCompleted += 1
            const log = this.todayLog(g)
            log.tasksCompleted = (log.tasksCompleted || 0) + 1
            g.vitality = Math.min(100, g.vitality + 2)
            this.emit({ kind: 'task', title: text.length > 60 ? `${text.slice(0, 57)}…` : text, ...earned, lines })
            this.progressQuests(g, 'tasks', 1)
        })
        if (this.settings().forestSounds) this.soundManager.playCoin()
    }

    // -----------------------------------------------------------------------
    // Quests, chest, achievements, levels
    // -----------------------------------------------------------------------

    private progressQuests(g: GamificationData, kind: QuestKind, amount: number): void {
        const board = g.questBoard
        if (!board || board.date !== dateKey()) return
        const bonusPct = perkValue(g.homestead, 'quest_bonus_pct')
        for (const q of board.quests) {
            if (q.kind !== kind || q.claimed) continue
            q.progress = Math.min(q.target, q.progress + amount)
            if (q.progress >= q.target) this.completeQuest(g, q, bonusPct)
        }
    }

    private completeQuest(g: GamificationData, q: DailyQuest, bonusPct: number): void {
        q.claimed = true
        g.lifetimeStats.questsCompleted += 1
        const mult = 1 + bonusPct / 100
        const earned = this.grant(g, { sunlight: q.rewardSunlight * mult, coins: q.rewardCoins * mult, xp: q.rewardXp * mult })
        const lines: RewardLine[] = [{ label: 'Quest reward', sunlight: q.rewardSunlight, coins: q.rewardCoins, xp: q.rewardXp }]
        if (bonusPct) lines.push({ label: `⛩️ Torii Gate +${bonusPct}%` })
        this.emit({ kind: 'quest', title: `Quest complete: ${q.title}`, ...earned, lines })
    }

    public openDailyChest(): void {
        const board = this.state.questBoard
        if (!board || board.chestClaimed || !board.quests.every((q) => q.claimed)) return
        this.mutate((g) => {
            g.questBoard!.chestClaimed = true
            g.lifetimeStats.chestsOpened += 1
            g.vitality = Math.min(100, g.vitality + 5)
            const earned = this.grant(g, CHEST_REWARD)
            const lines: RewardLine[] = [{ label: 'Daily chest', ...CHEST_REWARD }]

            // A chance at a sapling of an unlocked, non-starter species
            const pool = g.unlockedSpecies.filter((id) => id !== 'classic_pine')
            const pick = pool.length ? pool[Math.floor(Math.random() * pool.length)] : 'classic_pine'
            g.inventory[`tree:${pick}`] = (g.inventory[`tree:${pick}`] || 0) + 1
            lines.push({ label: `🌱 Bonus ${getSpecies(pick)?.name} sapling` })

            this.emit({ kind: 'chest', title: 'Daily chest opened!', subtitle: 'All three quests done — see you tomorrow.', ...earned, lines })
        })
    }

    private checkAchievements(g: GamificationData): void {
        for (const a of ACHIEVEMENTS) {
            if (g.achievements.includes(a.id) || !a.check(g)) continue
            g.achievements.push(a.id)
            const earned = this.grant(g, a.reward)
            this.emit({ kind: 'achievement', title: `${a.icon} Achievement: ${a.title}`, subtitle: a.description, ...earned, lines: [] })
        }
    }

    private applyLevelUps(g: GamificationData, levelBefore: number): void {
        const levelAfter = levelFromXp(g.xp)
        if (levelAfter <= levelBefore) return

        const unlocks: string[] = []
        for (const [biome, lvl] of Object.entries(BIOME_UNLOCK_LEVELS) as [BiomeType, number][]) {
            if (lvl <= levelAfter && !g.unlockedBiomes.includes(biome)) {
                g.unlockedBiomes.push(biome)
                unlocks.push(`🗺️ New biome: ${biome.replace(/_/g, ' ')}`)
            }
        }
        for (const sp of FLORA_SPECIES) if (sp.unlockLevel > levelBefore && sp.unlockLevel <= levelAfter) unlocks.push(`🌳 ${sp.name} in the nursery`)
        for (const b of HOMESTEAD_BUILDINGS) if (b.unlockLevel > levelBefore && b.unlockLevel <= levelAfter) unlocks.push(`🏗️ ${b.name} in the market`)
        for (const land of LAND_EXPANSIONS) if (land.unlockLevel > levelBefore && land.unlockLevel <= levelAfter) unlocks.push(`🧭 Land expansion to ${land.size}×${land.size}`)

        const earned = this.grant(g, { sunlight: 25 * levelAfter, coins: 3 * levelAfter })
        this.emit({
            kind: 'levelup',
            title: 'Your village grew!',
            subtitle: unlocks.length ? 'New things to discover:' : 'Your village grows more beautiful.',
            ...earned,
            xp: 0,
            levelUp: levelAfter,
            lines: unlocks.map((label) => ({ label })),
        })
    }

    // -----------------------------------------------------------------------
    // Nursery, market & village building
    // -----------------------------------------------------------------------

    private canAfford(sunlight: number, coins: number): boolean {
        const g = this.state
        if (g.sunlight >= sunlight && g.coins >= coins) return true
        new Notice(`Not enough yet — needs ☀️${sunlight} and 🪙${coins}. Another focus session or a few tasks will get you there!`)
        return false
    }

    public selectSpecies(speciesId: string): void {
        if (!this.state.unlockedSpecies.includes(speciesId)) return
        this.mutate((g) => {
            g.selectedSpeciesId = speciesId
        })
    }

    public unlockSpecies(speciesId: string): boolean {
        const species = getSpecies(speciesId)
        if (!species) return false
        const g0 = this.state
        if (g0.unlockedSpecies.includes(speciesId)) return true
        if (levelFromXp(g0.xp) < species.unlockLevel) {
            new Notice(`${species.name} unlocks at village level ${species.unlockLevel}.`)
            return false
        }
        if (!this.canAfford(species.sunlightCost, species.coinsCost)) return false

        this.mutate((g) => {
            g.sunlight -= species.sunlightCost
            g.coins -= species.coinsCost
            g.unlockedSpecies.push(speciesId)
            g.selectedSpeciesId = speciesId
        })
        if (this.settings().forestSounds) this.soundManager.playCoin()
        new Notice(`🌱 ${species.name} seeds unlocked — it's now your focus seed.`)
        return true
    }

    /** Buy a building into the inventory; the UI then enters placement mode. */
    public buyBuilding(buildingId: string): boolean {
        const building = getBuilding(buildingId)
        if (!building) return false
        const g0 = this.state
        if (building.unique && g0.unlockedBuildings.includes(buildingId)) {
            new Notice(`You already own the ${building.name}.`)
            return false
        }
        if (levelFromXp(g0.xp) < building.unlockLevel) {
            new Notice(`${building.name} unlocks at village level ${building.unlockLevel}.`)
            return false
        }
        if (!this.canAfford(building.sunlightCost, building.coinsCost)) return false

        this.mutate((g) => {
            g.sunlight -= building.sunlightCost
            g.coins -= building.coinsCost
            if (!g.unlockedBuildings.includes(buildingId)) g.unlockedBuildings.push(buildingId)
            const key = `building:${buildingId}`
            g.inventory[key] = (g.inventory[key] || 0) + 1
        })
        if (this.settings().forestSounds) this.soundManager.playCoin()
        return true
    }

    private isFree(g: GamificationData, x: number, y: number, ignoreId?: string): boolean {
        if (x < 0 || y < 0 || x >= g.landSize || y >= g.landSize) return false
        return !g.homestead.some((i) => i.id !== ignoreId && i.gridX === x && i.gridY === y)
    }

    /** Place an inventory item (`tree:<id>` or `building:<id>`) onto a tile. */
    public placeFromInventory(key: string, gridX: number, gridY: number): boolean {
        const g0 = this.state
        if (!(g0.inventory[key] > 0)) return false
        if (!this.isFree(g0, gridX, gridY)) {
            new Notice('That tile is taken — pick an empty one.')
            return false
        }
        const [itemType, itemId] = key.split(':') as ['tree' | 'building', string]
        this.mutate((g) => {
            g.inventory[key] -= 1
            if (g.inventory[key] <= 0) delete g.inventory[key]
            g.homestead.push({
                id: `${itemType[0]}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                itemType,
                itemId,
                gridX,
                gridY,
                level: 1,
            })
            this.progressQuests(g, 'village_action', 1)
        })
        return true
    }

    public moveHomesteadItem(id: string, newX: number, newY: number): boolean {
        if (!this.isFree(this.state, newX, newY, id)) return false
        this.mutate((g) => {
            const item = g.homestead.find((i) => i.id === id)
            if (item) {
                item.gridX = newX
                item.gridY = newY
            }
        })
        return true
    }

    /** Return a placed item to the inventory (its level is kept only while placed). */
    public stowHomesteadItem(id: string): void {
        this.mutate((g) => {
            const item = g.homestead.find((i) => i.id === id)
            if (!item) return
            g.homestead = g.homestead.filter((i) => i.id !== id)
            const key = `${item.itemType}:${item.itemId}`
            g.inventory[key] = (g.inventory[key] || 0) + 1
        })
    }

    public getUpgradeInfo(item: PlacedHomesteadItem): { sunlight: number; coins: number; maxed: boolean } {
        if (item.itemType === 'tree') {
            return { sunlight: 40 * item.level, coins: 4 * item.level, maxed: item.level >= TREE_MAX_LEVEL }
        }
        const b = getBuilding(item.itemId)
        if (!b) return { sunlight: 0, coins: 0, maxed: true }
        return { ...upgradeCost(b, item.level), maxed: item.level >= b.maxLevel }
    }

    public upgradeHomesteadItem(id: string): boolean {
        const item = this.state.homestead.find((i) => i.id === id)
        if (!item) return false
        const cost = this.getUpgradeInfo(item)
        if (cost.maxed) {
            new Notice('Already at its finest.')
            return false
        }
        if (!this.canAfford(cost.sunlight, cost.coins)) return false

        this.mutate((g) => {
            g.sunlight -= cost.sunlight
            g.coins -= cost.coins
            const target = g.homestead.find((i) => i.id === id)
            if (target) target.level += 1
            this.progressQuests(g, 'village_action', 1)
        })
        if (this.settings().forestSounds) this.soundManager.playCoin()
        return true
    }

    public expandLand(): boolean {
        const g0 = this.state
        const next = LAND_EXPANSIONS.find((l) => l.size === g0.landSize + 1)
        if (!next) return false
        if (levelFromXp(g0.xp) < next.unlockLevel) {
            new Notice(`Land expansion unlocks at village level ${next.unlockLevel}.`)
            return false
        }
        if (!this.canAfford(next.sunlightCost, next.coinsCost)) return false
        this.mutate((g) => {
            g.sunlight -= next.sunlightCost
            g.coins -= next.coinsCost
            g.landSize = next.size
            this.progressQuests(g, 'village_action', 1)
        })
        new Notice(`🧭 Your land now spans ${next.size}×${next.size}!`)
        return true
    }

    public selectBiome(biome: BiomeType): void {
        if (!this.state.unlockedBiomes.includes(biome)) {
            new Notice(`This biome unlocks at village level ${BIOME_UNLOCK_LEVELS[biome]}.`)
            return
        }
        this.mutate((g) => {
            g.activeBiome = biome
        })
    }

    public setAmbientSound(sound: AmbientSoundType, volume = 0.3): void {
        this.mutate((g) => {
            g.ambientSound = sound
            g.ambientVolume = volume
        })
        if (sound === 'none') this.soundManager.stopAmbient()
        else if (get(this.activePlantStore)) this.soundManager.startAmbient(sound, volume)
        // Not focusing yet: play a short sample so the choice can be heard
        else this.soundManager.previewAmbient(sound, volume)
    }

    // -----------------------------------------------------------------------
    // Daily note & export
    // -----------------------------------------------------------------------

    public async logToDailyNote(tree: PlantedTree, duration: number, sunlight: number, coins: number): Promise<void> {
        try {
            const dailyNote = await utils.getDailyNoteFile()
            if (!dailyNote || !(dailyNote instanceof TFile)) return

            const now = new Date()
            const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
            const speciesName = getSpecies(tree.speciesId)?.name || 'Classic Pine'
            const noteLink = tree.notePath ? `[[${tree.notePath.replace(/\.md$/, '')}]]` : ''
            const label = [tree.taskText, noteLink].filter(Boolean).join(' · ') || 'Focus session'

            const line = `- 🌲 **Pomodoro Forest** (${timeStr}): ${label} · *${speciesName}* · [duration:: ${duration}m] [tree:: ${tree.speciesId}] [sunlight:: +${sunlight}] [coins:: +${coins}] [status:: completed]`
            await this.plugin.app.vault.append(dailyNote, `\n${line}`)
        } catch {
            // Daily notes not enabled/configured — skip silently
        }
    }

    public generateExportPayload(): ForestExportPayload {
        const data = this.state
        return {
            $schema: 'https://obsidian-pomodoro-forest.dev/schemas/v1/export.json',
            exportTimestamp: Date.now(),
            pluginVersion: this.plugin.manifest.version,
            village: {
                level: levelFromXp(data.xp),
                xp: data.xp,
                landSize: data.landSize,
                vitality: data.vitality,
                activeBiome: data.activeBiome,
            },
            activeBiome: data.activeBiome,
            homestead: data.homestead,
            streak: { current: data.streak.current, longest: data.streak.longest, lastCheckInDate: data.streak.lastCheckInDate },
            lifetimeStats: data.lifetimeStats,
            achievements: data.achievements,
            dailyLogsSummary: Object.values(data.dailyLogs)
                .sort((a, b) => a.date.localeCompare(b.date))
                .slice(-30),
        }
    }
}
