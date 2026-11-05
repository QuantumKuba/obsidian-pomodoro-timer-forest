import type StorageManager from './StorageManager'
import type PomodoroTimerPlugin from '../main'
import type {
    ActiveSessionPlant,
    BiomeType,
    BoardLaneRole,
    BoardMemory,
    DailyForestLog,
    DailyQuest,
    ForestExportPayload,
    GamificationData,
    GrowthStage,
    PlacedHomesteadItem,
    PlantedTree,
    QuestKind,
    RequestKind,
    RewardEvent,
    RewardLine,
    TreasureSource,
    VillagerRequest,
} from '../types/forest'
import {
    BIOME_UNLOCK_LEVELS,
    CROPS,
    FLORA_SPECIES,
    GARDEN_PLOT_ID,
    HOMESTEAD_BUILDINGS,
    LAND_EXPANSIONS,
    TREE_MAX_LEVEL,
    charterLandmark,
    cropProgress,
    getBuilding,
    getCrop,
    getSpecies,
    isRipePlot,
} from '../assets/floraCatalog'
import {
    ACHIEVEMENTS,
    BOARD_CLEAR_MIN_CARDS,
    BOARD_CLEAR_REWARD,
    BOARD_HISTORY_LIMIT,
    BOARD_MILESTONES,
    CHECK_IN_ACK_CAP,
    CHECK_IN_ACK_REWARD,
    CHEST_REWARD,
    EARLY_HARVEST_RATE,
    HYPERFOCUS_MIN_MINUTES,
    TASK_WATERING_MINUTES,
    VITALITY_DAILY_FADE,
    VITALITY_FLOOR,
    addDays,
    boardMilestoneReward,
    cardReward,
    dateKey,
    daysBetween,
    earlyHarvestBaseReward,
    estimateOnTarget,
    earlyHarvestMinMinutes,
    formatMinutes,
    generateQuestBoard,
    hyperfocusGrowthRatio,
    hyperfocusReward,
    hyperfocusStage,
    levelFromXp,
    perkValue,
    saplingSellValue,
    sessionBaseReward,
    upgradeCost,
    type BaseReward,
    type CardCompletion,
} from './Progression'
import { CHARTER_CHAPTERS, CHARTER_RANKS, chapterComplete, charterRank, goalStatus, residentJoining } from './Charter'
import { FRIEND_GIFT, KEEPSAKE_HEARTS, MAX_HEARTS, RESIDENTS, getResident, hearts, keepsakeValue, makeRequest, requestReward, requestSlots } from './Neighbours'
import { CHARTER_ORNAMENTS, ORNAMENTS, getTreasure, isOrnament } from '../assets/treasureCatalog'
import { HEART_BLESSING_PCT, HEART_STAGES, NEEDS, careFor, heartNeed, heartPerkPct, heartSlots, heartStage, heartStageIndex, heartTreeItem, newHeartTree } from './HeartTree'
import { charterOrnamentsDue, chestTreasure, makePickup, questCareItem, residentTreasures } from './Treasures'
import SoundManager, { type AmbientSoundType } from './SoundManager'
import ConfettiEngine from './ConfettiEngine'
import { writable, type Writable, get } from 'svelte/store'
import { Notice, TFile, getAllTags } from 'obsidian'
import * as utils from '../utils'

import { activePlantStore } from '../stores'

/** Max checked-off tasks rewarded per day, so rewards stay meaningful. */
const DAILY_TASK_REWARD_CAP = 30

export interface HyperfocusOutcome {
    pomodoros: number
    checkInsAcked: number
}

export interface SessionCompletionResult {
    tree: PlantedTree
    sunlightEarned: number
    coinsEarned: number
    currentStreak: number
    speciesName: string
}

type Grant = { sunlight?: number; coins?: number; xp?: number }

/** A card that was just finished: ticked off, or moved into a done lane. */
export interface FinishedCard extends Omit<CardCompletion, 'today'> {
    /** The board note, its name, and the card's key on it. */
    path: string
    board: string
    key: string
    /** The card's text, as plain as possible. */
    label: string
}

/** A card as the board watcher sees it, for the board's memory. */
export interface BoardCardState {
    key: string
    lane: string
    role: BoardLaneRole
}

/** Tags from the task and from the session's note, without repeats. */
function mergeTags(...lists: (string[] | undefined)[]): string[] {
    const out: string[] = []
    for (const list of lists) {
        for (const t of list ?? []) {
            const tag = (t.startsWith('#') ? t : `#${t}`).toLowerCase()
            if (!out.includes(tag)) out.push(tag)
        }
    }
    return out
}

/** The keepsake a resident you are close to adds to a perk, if any. */
function keepsakeOf(g: GamificationData, kind: Parameters<typeof keepsakeValue>[1]): { label: string; value: number } | null {
    const value = keepsakeValue(g, kind)
    if (!value) return null
    const resident = RESIDENTS.find((r) => r.keepsake.kind === kind && hearts(g, r.id) >= KEEPSAKE_HEARTS)
    return { label: resident?.keepsake.label ?? 'A neighbour’s keepsake', value }
}

function emptyBoard(title: string): BoardMemory {
    return { title, cards: {}, shipped: 0, history: [], milestones: [] }
}

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
        const rankBefore = charterRank(g)
        fn(g)
        this.checkAchievements(g)
        this.checkCharter(g)
        this.applyLevelUps(g, levelBefore)
        this.storage.updateGamification(() => g, options)
        // A rank-up is celebrated once: save it even when the change itself would not be saved
        if (options.persist === false && charterRank(g) > rankBefore) this.storage.markChanged()
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

        const big = events.some((e) => e.kind === 'levelup' || e.kind === 'achievement' || e.kind === 'chest' || e.kind === 'rank')
        if (this.settings().forestSounds && big) this.soundManager.playLevelUp()

        if (this.plugin.hasVisibleForestView()) {
            this.rewardEvents.update((q) => [...q, ...events].slice(-8))
        } else {
            // No view open to celebrate in — fall back to compact notices.
            for (const e of events) {
                if (e.kind === 'task' || e.kind === 'crop' || e.minor) continue
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
        // A chapter can be complete without a change today, e.g. an old save on its first launch
        // (or chapters signed before their ornaments existed, still to bring them)
        if (g0.lastVisitDate === today && g0.questBoard?.date === today && !chapterComplete(g0) && !charterOrnamentsDue(g0).length) return

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
                    const log = g.dailyLogs[d]
                    if (!(log?.completedPomodoros > 0 || (log?.earlyHarvests ?? 0) > 0)) {
                        g.vitality = Math.max(VITALITY_FLOOR, g.vitality - fade)
                    }
                }
                g.vitality = Math.round(g.vitality)
            }

            shieldUsed = this.resolveStreak(g, today)

            if (g.questBoard?.date !== today) {
                g.questBoard = generateQuestBoard(today, settings.dailyGoal || 4, settings.workLen || 25, {
                    boards: Object.keys(g.boards || {}).length > 0,
                })
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

    /** Tags on the task and the note being focused on, lower case with `#`, task tags first. */
    public contextTags(notePath?: string, taskText?: string, tags?: string[]): string[] {
        const candidates: string[] = []
        const add = (t: string) => {
            const tag = (t.startsWith('#') ? t : `#${t}`).toLowerCase()
            if (!candidates.includes(tag)) candidates.push(tag)
        }
        tags?.forEach(add)
        taskText?.match(/#[\w\-/]+/g)?.forEach(add)
        if (notePath) {
            const file = this.plugin.app.vault?.getAbstractFileByPath(notePath)
            if (file instanceof TFile) {
                const cache = this.plugin.app.metadataCache.getFileCache(file)
                if (cache) getAllTags(cache)?.forEach(add)
            }
        }
        return candidates
    }

    public detectFloraFromContext(notePath?: string, taskText?: string, tags?: string[]): string | null {
        const state = this.state
        const mappings = state.tagMappings || []
        const candidates = this.contextTags(notePath, taskText, tags)

        for (const candidate of candidates) {
            const match = mappings.find((m) => m.tag.toLowerCase() === candidate)
            if (match && state.unlockedSpecies.includes(match.speciesId)) {
                return match.speciesId
            }
        }
        return null
    }

    public startSession(
        durationMinutes: number,
        taskText?: string,
        notePath?: string,
        tags?: string[],
        hyperfocus = false,
    ): void {
        this.ensureToday()
        const gamification = this.state
        const detected = this.detectFloraFromContext(notePath, taskText, tags)
        const speciesId = detected || gamification.selectedSpeciesId || 'classic_pine'
        const sessionTags = this.contextTags(notePath, taskText, tags)

        this.activePlantStore.set({
            speciesId,
            startTime: Date.now(),
            totalDurationMillis: durationMinutes * 60 * 1000,
            currentStage: 'seed',
            progressRatio: 0,
            taskText,
            notePath,
            autoTagged: !!detected,
            hyperfocus,
            ...(sessionTags.length ? { tags: sessionTags } : {}),
        })

        if (this.settings().forestSounds) this.soundManager.playPlantSeed()
        if (gamification.ambientSound && gamification.ambientSound !== 'none') {
            this.soundManager.startAmbient(gamification.ambientSound, gamification.ambientVolume || 0.3)
        }
    }

    /** A finished focus session turns into a hyperfocus one: the same tree keeps growing. */
    public extendToHyperfocus(elapsedMillis: number): void {
        this.activePlantStore.update((plant) => (plant ? { ...plant, hyperfocus: true } : plant))
        this.updateProgress(elapsedMillis, elapsedMillis)
    }

    public updateProgress(elapsedMillis: number, totalMillis: number): void {
        this.activePlantStore.update((plant) => {
            if (!plant) return null
            if (plant.hyperfocus) {
                // No countdown to measure against: the tree grows by minutes focused
                const minutes = elapsedMillis / 60000
                return { ...plant, progressRatio: hyperfocusGrowthRatio(minutes), currentStage: hyperfocusStage(minutes) }
            }
            const ratio = Math.max(0, Math.min(1, elapsedMillis / Math.max(1, totalMillis)))
            let stage: GrowthStage = 'seed'
            if (ratio >= 0.75) stage = 'mature'
            else if (ratio >= 0.5) stage = 'sapling'
            else if (ratio >= 0.25) stage = 'sprout'
            return { ...plant, progressRatio: ratio, currentStage: stage }
        })
    }

    /**
     * Lands a hyperfocus session. Stopping is always finishing: a dive of at least
     * HYPERFOCUS_MIN_MINUTES grows a full tree (see completeSession), a shorter one simply ends
     * without growing anything. Nothing ever withers.
     */
    public landHyperfocus(
        minutes: number,
        taskContext?: { taskText?: string; notePath?: string; tags?: string[] },
        outcome: HyperfocusOutcome = { pomodoros: 1, checkInsAcked: 0 },
    ): SessionCompletionResult | null {
        if (minutes < HYPERFOCUS_MIN_MINUTES) {
            this.soundManager.stopAmbient()
            this.activePlantStore.set(null)
            return null
        }
        return this.completeSession(minutes, taskContext, outcome)
    }

    public completeSession(
        durationMinutes: number,
        taskContext?: { taskText?: string; notePath?: string; tags?: string[] },
        hyperfocus?: HyperfocusOutcome,
    ): SessionCompletionResult | null {
        this.soundManager.stopAmbient()
        this.ensureToday()

        const currentPlant = get(this.activePlantStore)
        const speciesId = currentPlant?.speciesId || this.state.selectedSpeciesId || 'classic_pine'
        const species = getSpecies(speciesId) || FLORA_SPECIES[0]
        const today = dateKey()
        const settings = this.settings()
        const isHyper = !!hyperfocus || !!currentPlant?.hyperfocus
        const tags = mergeTags(taskContext?.tags, currentPlant?.tags)

        const newTree: PlantedTree = {
            id: `tree_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            speciesId,
            plantedAt: new Date().toISOString(),
            durationMinutes,
            status: 'mature',
            notePath: taskContext?.notePath || currentPlant?.notePath,
            taskText: taskContext?.taskText || currentPlant?.taskText,
            tags: tags.length ? tags : undefined,
            hyperfocus: isHyper,
        }

        let result: SessionCompletionResult | null = null

        this.mutate((g) => {
            const base = isHyper ? hyperfocusReward(durationMinutes) : sessionBaseReward(durationMinutes)
            const lines: RewardLine[] = isHyper
                ? [{ label: `🌊 ${formatMinutes(durationMinutes)} hyperfocus dive`, ...base }]
                : [{ label: `${durationMinutes}m of focus`, ...base }]

            // Streak first, so today's session counts toward its own bonus
            this.checkInStreak(g, today)
            const { sunPct, coinPct } = this.focusBonuses(g, base, durationMinutes, lines)

            const log = this.todayLog(g, today)
            const firstToday = log.completedPomodoros === 0
            let bonusSun = 0
            let bonusCoins = 0
            let bonusXp = 0
            if (firstToday) {
                bonusXp += 10
                lines.push({ label: '🌅 First tree of the day', xp: 10 })
                const eggs = perkValue(g.homestead, 'first_tree_coins')
                if (eggs) {
                    bonusCoins += eggs
                    lines.push({ label: '🥚 Fresh eggs from the coop', coins: eggs })
                }
                this.keepsakeLine(g, 'first_tree_coins', lines, (v) => {
                    bonusCoins += v
                    return { coins: v }
                })
            }

            if (isHyper && hyperfocus && hyperfocus.checkInsAcked > 0) {
                const ackCount = Math.min(hyperfocus.checkInsAcked, CHECK_IN_ACK_CAP)
                const checkSun = ackCount * CHECK_IN_ACK_REWARD.sunlight
                const checkXp = ackCount * CHECK_IN_ACK_REWARD.xp
                bonusSun += checkSun
                bonusXp += checkXp
                lines.push({
                    label: `💧 Looked after yourself ×${ackCount}`,
                    sunlight: checkSun,
                    xp: checkXp,
                })
            }

            const goal = settings.dailyGoal || 4
            const pomodorosEarned = isHyper && hyperfocus ? Math.max(1, hyperfocus.pomodoros) : 1
            const oldPoms = log.completedPomodoros
            const newPoms = oldPoms + pomodorosEarned
            if (oldPoms < goal && newPoms >= goal) {
                bonusSun += 40
                bonusCoins += 5
                bonusXp += 20
                lines.push({ label: `🎯 Daily goal reached (${goal})`, sunlight: 40, coins: 5, xp: 20 })
            }

            const earned = this.grant(g, {
                sunlight: base.sunlight * (1 + sunPct / 100) + bonusSun,
                coins: base.coins * (1 + coinPct / 100) + bonusCoins,
                xp: base.xp + bonusXp,
            })

            // The grown tree becomes a sapling you can plant in the village
            const key = `tree:${speciesId}`
            g.inventory[key] = (g.inventory[key] || 0) + 1
            lines.push({ label: `🌱 ${species.name} sapling added to your village inventory` })
            this.growCrops(g, durationMinutes, lines)

            log.trees.push(newTree)
            log.totalMinutes += durationMinutes
            log.completedPomodoros += pomodorosEarned
            g.lifetimeStats.totalFocusMinutes += durationMinutes
            g.lifetimeStats.totalPomodoros += pomodorosEarned
            g.lifetimeStats.treesGrown += 1
            if (isHyper) {
                g.lifetimeStats.hyperfocusSessions = (g.lifetimeStats.hyperfocusSessions || 0) + 1
                g.lifetimeStats.hyperfocusMinutes = (g.lifetimeStats.hyperfocusMinutes || 0) + durationMinutes
                if (hyperfocus && hyperfocus.checkInsAcked > 0) {
                    g.lifetimeStats.checkInsAcked = (g.lifetimeStats.checkInsAcked || 0) + hyperfocus.checkInsAcked
                }
            }
            g.vitality = Math.min(100, g.vitality + 12)

            this.emit({
                kind: 'harvest',
                title: isHyper ? `🌊 ${species.name} fully grown!` : `${species.name} fully grown!`,
                subtitle: newTree.taskText || (newTree.notePath ? newTree.notePath.split('/').pop()?.replace(/\.md$/, '') : undefined),
                speciesId,
                ...earned,
                lines,
            })

            this.progressQuests(g, 'sessions', pomodorosEarned)
            this.progressQuests(g, 'minutes', durationMinutes)
            if (newTree.taskText) this.progressQuests(g, 'linked_task', 1)
            if (currentPlant?.autoTagged || (taskContext?.tags?.length ?? 0) > 0) this.progressQuests(g, 'tagged_session', 1)

            this.progressRequests(g, 'trees', 1)
            this.progressRequests(g, 'species', 1, { speciesId })
            this.progressRequests(g, 'minutes', durationMinutes)
            this.progressRequests(g, 'long', 1, { minutes: durationMinutes })
            this.progressRequests(g, 'tag', durationMinutes, { tags })
            // After the progress, so a new request never starts half done
            this.postRequest(g, today)

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

    /**
     * The focused task was done before the timer ended and the session was cut short. The
     * minutes focused pay at EARLY_HARVEST_RATE and a young tree joins today's grove, but none
     * of a full tree's extras: no sapling for the village, no daily goal or "grow trees" quest
     * progress, no first-tree bonus. Finishing the session is always worth more per minute.
     */
    public harvestEarly(
        focusedMinutes: number,
        sessionMinutes: number,
        taskContext?: { taskText?: string; notePath?: string; tags?: string[] },
    ): SessionCompletionResult | null {
        this.soundManager.stopAmbient()
        this.ensureToday()

        const currentPlant = get(this.activePlantStore)
        this.activePlantStore.set(null)
        const minutes = Math.floor(focusedMinutes)
        if (focusedMinutes < earlyHarvestMinMinutes(sessionMinutes) || minutes < 1) return null

        const speciesId = currentPlant?.speciesId || this.state.selectedSpeciesId || 'classic_pine'
        const species = getSpecies(speciesId) || FLORA_SPECIES[0]
        const today = dateKey()
        const settings = this.settings()

        const youngTree: PlantedTree = {
            id: `tree_young_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            speciesId,
            plantedAt: new Date().toISOString(),
            durationMinutes: minutes,
            status: 'young',
            notePath: taskContext?.notePath || currentPlant?.notePath,
            taskText: taskContext?.taskText || currentPlant?.taskText,
            tags: taskContext?.tags,
        }
        const tags = mergeTags(taskContext?.tags, currentPlant?.tags)

        let result: SessionCompletionResult | null = null

        this.mutate((g) => {
            const base = earlyHarvestBaseReward(minutes)
            const pct = Math.round(EARLY_HARVEST_RATE * 100)
            const lines: RewardLine[] = [{ label: `${minutes}m of focus · ${pct}% early rate`, ...base }]

            // Real focus happened today, so the streak holds
            this.checkInStreak(g, today)
            const { sunPct, coinPct } = this.focusBonuses(g, base, minutes, lines)
            lines.push({ label: `🌳 Finish the full ${sessionMinutes}m next time for a sapling and a tree toward your goal` })
            this.growCrops(g, minutes, lines)

            const earned = this.grant(g, {
                sunlight: base.sunlight * (1 + sunPct / 100),
                coins: base.coins * (1 + coinPct / 100),
                xp: base.xp,
            })

            const log = this.todayLog(g, today)
            log.trees.push(youngTree)
            log.totalMinutes += minutes
            log.earlyHarvests = (log.earlyHarvests || 0) + 1
            g.lifetimeStats.totalFocusMinutes += minutes
            g.lifetimeStats.earlyHarvests = (g.lifetimeStats.earlyHarvests || 0) + 1
            g.vitality = Math.min(100, g.vitality + 4)

            this.emit({
                kind: 'early',
                title: `Task done early — a young ${species.name}`,
                subtitle: youngTree.taskText || (youngTree.notePath ? youngTree.notePath.split('/').pop()?.replace(/\.md$/, '') : undefined),
                speciesId,
                ...earned,
                lines,
            })

            this.progressQuests(g, 'minutes', minutes)
            if (youngTree.taskText) this.progressQuests(g, 'linked_task', 1)
            this.progressRequests(g, 'minutes', minutes)
            this.progressRequests(g, 'tag', minutes, { tags })

            result = {
                tree: youngTree,
                sunlightEarned: earned.sunlight,
                coinsEarned: earned.coins,
                currentStreak: g.streak.current,
                speciesName: species.name,
            }
        })

        if (settings.forestSounds) this.soundManager.playCoin()

        if (settings.logForestToDailyNote && result) {
            const r = result as SessionCompletionResult
            void this.logToDailyNote(youngTree, minutes, r.sunlightEarned, r.coinsEarned)
        }
        return result
    }

    /** A focus day counts toward the streak once, on its first session. */
    private checkInStreak(g: GamificationData, today: string): void {
        const last = g.streak.lastCheckInDate
        if (last === today) return
        g.streak.current = last === addDays(today, -1) ? g.streak.current + 1 : 1
        g.streak.longest = Math.max(g.streak.longest, g.streak.current)
        g.streak.lastCheckInDate = today
    }

    /** Streak and building percentages on a session's base reward; adds a line for each. */
    private focusBonuses(g: GamificationData, base: BaseReward, minutes: number, lines: RewardLine[]): { sunPct: number; coinPct: number } {
        let sunPct = 0
        let coinPct = 0
        const pctLine = (label: string, pct: number, kind: 'sun' | 'coin') => {
            if (pct <= 0) return
            if (kind === 'sun') sunPct += pct
            else coinPct += pct
            lines.push({
                label: `${label} +${pct}%`,
                sunlight: kind === 'sun' ? Math.round((base.sunlight * pct) / 100) : undefined,
                coins: kind === 'coin' ? Math.round((base.coins * pct) / 100) : undefined,
            })
        }
        pctLine(`🔥 ${g.streak.current}-day streak`, Math.min(20, Math.max(0, g.streak.current - 1) * 2), 'sun')
        pctLine('🏡 Cozy Cabin', perkValue(g.homestead, 'sunlight_pct'), 'sun')
        pctLine(`🌳 Heart Tree, ${heartStage(g).name.toLowerCase()}`, heartPerkPct(g), 'sun')
        // A met need's blessing is spent on the next session, however many days later that is
        if (g.heartTree?.blessing && heartTreeItem(g)) {
            pctLine('✨ Heart Tree’s blessing', HEART_BLESSING_PCT, 'sun')
            g.heartTree.blessing = false
        }
        if (minutes >= 45) {
            pctLine('🌬️ Windmill (long session)', perkValue(g.homestead, 'long_session_sunlight_pct'), 'sun')
            const ash = keepsakeOf(g, 'long_session_sunlight_pct')
            if (ash) pctLine(ash.label, ash.value, 'sun')
        }
        const hour = new Date().getHours()
        if (hour >= 19 || hour < 5) pctLine('🏮 Lanterns (evening)', perkValue(g.homestead, 'night_sunlight_pct'), 'sun')
        pctLine('🪣 Village Well', perkValue(g.homestead, 'coins_pct'), 'coin')
        return { sunPct, coinPct }
    }

    public completeBreak(): void {
        this.ensureToday()
        this.mutate((g) => {
            const gazebo = perkValue(g.homestead, 'break_sunlight')
            const lines: RewardLine[] = gazebo ? [{ label: '🍵 Tea Gazebo', sunlight: gazebo }] : []
            let tea = 0
            this.keepsakeLine(g, 'break_sunlight', lines, (v) => {
                tea = v
                return { sunlight: v }
            })
            g.lifetimeStats.breaksCompleted += 1
            const log = this.todayLog(g)
            log.breaksCompleted = (log.breaksCompleted || 0) + 1
            const earned = this.grant(g, { sunlight: gazebo + tea, xp: 3 })
            this.emit({
                kind: 'break',
                title: '🍵 Break well taken',
                subtitle: gazebo ? 'The tea gazebo thanks you for resting.' : 'Rested minds grow taller trees.',
                ...earned,
                lines,
            })
            this.progressQuests(g, 'break', 1)
            this.progressRequests(g, 'breaks', 1)
        })
    }

    /**
     * Ends a work session before it finished. The tree withers in hardcore mode, unless
     * `forgive` is set: the session's task was done, so stopping is not giving up.
     */
    public abortSession(
        elapsedMinutes: number,
        taskContext?: { taskText?: string; notePath?: string },
        forgive = false,
    ): PlantedTree | null {
        this.soundManager.stopAmbient()

        const currentPlant = get(this.activePlantStore)
        this.activePlantStore.set(null)
        if (!currentPlant || forgive || currentPlant.hyperfocus) return null
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
            // A finished task waters the garden
            this.growCrops(g, TASK_WATERING_MINUTES)
            this.emit({ kind: 'task', title: text.length > 60 ? `${text.slice(0, 57)}…` : text, ...earned, lines })
            this.progressQuests(g, 'tasks', 1)
            this.progressRequests(g, 'tasks', 1)
        })
        if (this.settings().forestSounds) this.soundManager.playCoin()
    }

    // -----------------------------------------------------------------------
    // Kanban boards
    // -----------------------------------------------------------------------

    /**
     * Called by the board watcher when a card is finished. Every card counts once a day, like a
     * task, and shares the daily cap with tasks; past the cap it still counts as work done, it
     * just pays nothing. With task rewards turned off the game leaves cards alone, and only the
     * board's own statistics keep counting.
     */
    public onCardCompleted(card: FinishedCard): void {
        this.ensureToday()
        const today = dateKey()
        const rewardKey = `${card.path}::${card.key}`
        const g0 = this.state
        const rewarded = g0.rewardedTaskKeys?.date === today ? g0.rewardedTaskKeys.keys : []
        if (rewarded.includes(rewardKey)) return
        const playing = this.settings().rewardTaskCompletion
        const paying = playing && rewarded.length < DAILY_TASK_REWARD_CAP

        this.mutate((g) => {
            if (g.rewardedTaskKeys?.date !== today) g.rewardedTaskKeys = { date: today, keys: [] }
            g.rewardedTaskKeys.keys.push(rewardKey)

            const board = (g.boards[card.path] ??= emptyBoard(card.board))
            const started = board.cards[card.key]?.started
            board.shipped += 1
            board.history.push({
                date: today,
                days: started ? Math.max(0, daysBetween(started, today)) : null,
                actual: card.actual,
                expected: card.expected,
                onTime: card.due ? today <= card.due : null,
            })
            if (board.history.length > BOARD_HISTORY_LIMIT) board.history.splice(0, board.history.length - BOARD_HISTORY_LIMIT)
            if (!playing) return

            const log = this.todayLog(g, today)
            log.cardsCompleted = (log.cardsCompleted || 0) + 1
            g.lifetimeStats.cardsCompleted = (g.lifetimeStats.cardsCompleted || 0) + 1
            if (estimateOnTarget(card.actual, card.expected)) g.lifetimeStats.cardsOnEstimate = (g.lifetimeStats.cardsOnEstimate || 0) + 1

            if (paying) {
                const { coins, xp, lines } = cardReward({ ...card, today })
                const bench = perkValue(g.homestead, 'task_coins')
                if (bench) lines.push({ label: '🪑 Garden Bench', coins: bench })
                const earned = this.grant(g, { coins: coins + bench, xp })
                // A card is a task too: it counts for task quests and the task tally
                g.lifetimeStats.tasksCompleted += 1
                log.tasksCompleted = (log.tasksCompleted || 0) + 1
                g.vitality = Math.min(100, g.vitality + 2)
                this.growCrops(g, TASK_WATERING_MINUTES)
                const title = card.label.length > 60 ? `${card.label.slice(0, 57)}…` : card.label
                this.emit({ kind: 'task', title, subtitle: card.board, ref: rewardKey, ...earned, lines })
                this.progressQuests(g, 'tasks', 1)
                this.progressQuests(g, 'cards', 1)
                if (card.focused || card.actual > 0) this.progressQuests(g, 'card_focus', 1)
                // Only cards that pay count: the daily cap keeps requests from being farmed too
                this.progressRequests(g, 'tasks', 1)
                this.progressRequests(g, 'cards', 1)
            }

            for (const m of BOARD_MILESTONES) {
                if (board.shipped < m || board.milestones.includes(m)) continue
                board.milestones.push(m)
                const reward = boardMilestoneReward(m)
                const earned = this.grant(g, reward)
                this.emit({
                    kind: 'achievement',
                    title: `${m} cards finished on ${card.board}`,
                    subtitle: 'A board milestone. Steady work adds up.',
                    ...earned,
                    lines: [{ label: `Milestone · ${m} cards`, ...reward }],
                })
            }
        })
        if (paying && this.settings().forestSounds) this.soundManager.playCoin()
    }

    /** Every card on a board is finished. Celebrated once a day per board. */
    public onBoardCleared(path: string, title: string, cards: number): void {
        if (cards < BOARD_CLEAR_MIN_CARDS || !this.settings().rewardTaskCompletion) return
        const today = dateKey()
        if (this.state.boards[path]?.clearedOn === today) return
        this.mutate((g) => {
            const board = (g.boards[path] ??= emptyBoard(title))
            board.clearedOn = today
            g.lifetimeStats.boardsCleared = (g.lifetimeStats.boardsCleared || 0) + 1
            const reward = BOARD_CLEAR_REWARD
            const earned = this.grant(g, reward)
            this.emit({
                kind: 'achievement',
                title: `${title} is clear`,
                subtitle: `All ${cards} cards finished. Take a moment before the next thing.`,
                ...earned,
                lines: [{ label: 'Board cleared', ...reward }],
            })
        })
    }

    /**
     * Keeps a board's memory in step with its cards: which lane each card is in and since when.
     * Cards that are gone are forgotten. `renames` carries a card's memory over when its text,
     * and so its key, changed. Does nothing (and saves nothing) when nothing changed.
     */
    public syncBoard(path: string, title: string, cards: BoardCardState[], renames: [string, string][] = []): void {
        const today = dateKey()
        const before = this.state.boards?.[path]
        const prev = { ...(before?.cards ?? {}) }
        for (const [from, to] of renames) if (prev[from] && !prev[to]) prev[to] = prev[from]

        const next: BoardMemory['cards'] = {}
        for (const c of cards) {
            const p = prev[c.key]
            if (!p) {
                next[c.key] = { lane: c.lane, since: today, seen: today, ...(c.role === 'active' ? { started: today } : {}) }
            } else if (p.lane !== c.lane) {
                next[c.key] = { ...p, lane: c.lane, since: today, ...(c.role === 'active' && !p.started ? { started: today } : {}) }
            } else {
                next[c.key] = p
            }
        }
        if (before && before.title === title && JSON.stringify(before.cards) === JSON.stringify(next)) return
        this.mutate((g) => {
            const board = (g.boards[path] ??= emptyBoard(title))
            board.title = title
            board.cards = next
        })
    }

    /** A board note was renamed or moved. */
    public renameBoard(oldPath: string, newPath: string, title: string): void {
        const board = this.state.boards?.[oldPath]
        if (!board || this.state.boards[newPath]) return
        this.mutate((g) => {
            g.boards[newPath] = { ...g.boards[oldPath], title }
            delete g.boards[oldPath]
        })
    }

    /** Sets the role of a lane by hand, or (null) goes back to reading it from the lane. */
    public setLaneRole(path: string, title: string, lane: string, role: BoardLaneRole | null): void {
        this.mutate((g) => {
            const board = (g.boards[path] ??= emptyBoard(title))
            const roles = { ...(board.laneRoles ?? {}) }
            if (role) roles[lane] = role
            else delete roles[lane]
            board.laneRoles = roles
        })
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
        lines.push(...this.leaveFind(g, questCareItem(g, dateKey()), 'quest', { note: q.title }))
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

            // And a find: an ornament now and then (never more than a few chests apart), the salve otherwise
            const find = chestTreasure(g, dateKey())
            g.chestPity = find.ornament ? 0 : (g.chestPity || 0) + 1
            lines.push(...this.leaveFind(g, find.itemId, 'chest', { note: 'The daily chest' }))

            this.emit({ kind: 'chest', title: 'Daily chest opened!', subtitle: 'All three quests done — see you tomorrow.', ...earned, lines })
        })
    }

    // -----------------------------------------------------------------------
    // Village Charter
    // -----------------------------------------------------------------------

    /**
     * Ranks the village up through every chapter whose goals are all met. Goals met in the
     * current chapter are remembered, so they never un-tick (a stowed well still counts). A save
     * from before the charter can climb several ranks at once; that gets a single card.
     */
    private checkCharter(g: GamificationData): void {
        g.charter ??= { rank: 0, met: [], reachedOn: {} }
        const today = dateKey()
        const reached: number[] = []
        const lines: RewardLine[] = []
        const total = { sunlight: 0, coins: 0, xp: 0 }
        for (;;) {
            const rank = charterRank(g)
            const chapter = CHARTER_CHAPTERS[rank]
            if (!chapter) break
            for (const goal of chapter.goals) {
                if (!g.charter.met.includes(goal.id) && goalStatus(g, goal).done) g.charter.met.push(goal.id)
            }
            if (!chapter.goals.every((goal) => g.charter.met.includes(goal.id))) break

            const next = rank + 1
            g.charter.rank = next
            g.charter.met = []
            g.charter.reachedOn = { ...g.charter.reachedOn, [next]: today }
            const earned = this.grant(g, chapter.reward)
            total.sunlight += earned.sunlight
            total.coins += earned.coins
            total.xp += earned.xp
            lines.push({ label: `📜 ${CHARTER_RANKS[next].name} · ${chapter.title}`, ...earned })
            const landmark = charterLandmark(next)
            if (landmark) {
                if (!g.unlockedBuildings.includes(landmark.id)) g.unlockedBuildings.push(landmark.id)
                if (this.ownedCount(g, landmark.id) === 0) g.inventory[`building:${landmark.id}`] = 1
                lines.push({ label: `🏛️ ${landmark.name} is waiting in your inventory` })
            }
            const resident = residentJoining(next)
            if (resident) lines.push({ label: `🏡 ${resident.name}, ${resident.role}, moves in` })
            const ornament = CHARTER_ORNAMENTS[next - 1]
            if (ornament && charterOrnamentsDue(g).includes(ornament)) {
                lines.push(...this.leaveFind(g, ornament, 'charter', { note: chapter.title, id: `pk_charter_${ornament}` }))
            }
            reached.push(next)
        }
        // Chapters signed before ornaments existed still bring theirs, once
        for (const ornament of charterOrnamentsDue(g)) {
            const chapter = CHARTER_CHAPTERS[CHARTER_ORNAMENTS.indexOf(ornament)]
            this.leaveFind(g, ornament, 'charter', { note: chapter?.title, id: `pk_charter_${ornament}` })
        }
        if (!reached.length) return

        const top = reached[reached.length - 1]
        this.emit({
            kind: 'rank',
            rank: CHARTER_RANKS[top].name,
            buildingId: charterLandmark(top)?.id,
            title: reached.length > 1 ? `${reached.length} chapters of the charter, signed at once` : `Chapter ${top} complete: ${CHARTER_CHAPTERS[top - 1].title}`,
            subtitle: reached.length > 1 ? `Everything you had already built counts. ${CHARTER_RANKS[top].blurb}` : CHARTER_RANKS[top].blurb,
            ...total,
            lines,
        })
    }

    // -----------------------------------------------------------------------
    // Neighbours' requests
    // -----------------------------------------------------------------------

    /** Adds a keepsake's line to `lines` when a resident you are close to boosts `kind`. */
    private keepsakeLine(g: GamificationData, kind: Parameters<typeof keepsakeValue>[1], lines: RewardLine[], apply: (v: number) => Omit<RewardLine, 'label'>): void {
        const keepsake = keepsakeOf(g, kind)
        if (keepsake) lines.push({ label: keepsake.label, ...apply(keepsake.value) })
    }

    private progressRequests(g: GamificationData, kind: RequestKind, amount: number, ctx: { speciesId?: string; tags?: string[]; minutes?: number } = {}): void {
        if (!g.requests?.length || !(amount > 0)) return
        for (const r of [...g.requests]) {
            if (r.kind !== kind) continue
            if (kind === 'species' && r.speciesId !== ctx.speciesId) continue
            if (kind === 'tag' && !(r.tag && ctx.tags?.includes(r.tag.toLowerCase()))) continue
            if (kind === 'long' && (ctx.minutes ?? 0) < (r.minMinutes ?? 45)) continue
            r.progress = Math.min(r.target, (r.progress || 0) + amount)
            if (r.progress >= r.target) this.fulfilRequest(g, r)
        }
    }

    private fulfilRequest(g: GamificationData, r: VillagerRequest): void {
        g.requests = g.requests.filter((q) => q.id !== r.id)
        const resident = getResident(r.residentId)
        const name = resident?.name ?? 'A neighbour'
        const before = hearts(g, r.residentId)
        g.friendship = { ...(g.friendship || {}), [r.residentId]: (g.friendship?.[r.residentId] || 0) + 1 }
        const after = hearts(g, r.residentId)
        g.lifetimeStats.requestsFulfilled = (g.lifetimeStats.requestsFulfilled || 0) + 1

        const reward = r.reward ?? requestReward(r.kind)
        const lines: RewardLine[] = [{ label: r.title, ...reward }]
        if (after > before) lines.push({ label: `${'♥'.repeat(after)}${'♡'.repeat(MAX_HEARTS - after)} with ${name}` })
        let gift = 0
        if (resident && before < KEEPSAKE_HEARTS && after >= KEEPSAKE_HEARTS) lines.push({ label: `🎁 ${name}’s keepsake: ${resident.keepsake.text}` })
        if (resident && before < MAX_HEARTS && after >= MAX_HEARTS) {
            gift = FRIEND_GIFT.coins
            const key = `tree:${resident.favourite}`
            g.inventory[key] = (g.inventory[key] || 0) + FRIEND_GIFT.saplings
            lines.push({ label: `🎁 A gift: ${FRIEND_GIFT.saplings} ${getSpecies(resident.favourite)?.name ?? ''} saplings`, coins: gift })
        }
        for (const find of residentTreasures(g, r.residentId, after)) {
            lines.push(...this.leaveFind(g, find, 'request', { residentId: r.residentId, note: r.title }))
        }
        const earned = this.grant(g, { sunlight: reward.sunlight, coins: reward.coins + gift, xp: reward.xp })
        g.vitality = Math.min(100, g.vitality + 3)
        this.emit({
            kind: 'request',
            residentId: r.residentId,
            title: after >= MAX_HEARTS && before < MAX_HEARTS ? `${name} counts you a dear friend` : `Thank you, from ${name}`,
            subtitle: r.title,
            ...earned,
            lines,
        })
    }

    /** A resident with nothing open may pin a new request: one a day at most, while a slot is free. */
    private postRequest(g: GamificationData, today: string): void {
        g.requests ??= []
        if (g.lastRequestDate === today || g.requests.length >= requestSlots(g)) return
        const request = makeRequest(g, today, this.settings().workLen || 25)
        if (!request) return
        g.requests.push(request)
        g.lastRequestDate = today
        // Mentioned on the card of the session that brought it
        const card = [...this.pendingEvents].reverse().find((e) => e.kind === 'harvest')
        card?.lines.push({ label: `✉️ ${getResident(request.residentId)?.name ?? 'A neighbour'} pinned a request: ${request.title}` })
    }

    /** Lets a request go. Nothing is lost; a new one may come after a session on another day. */
    public declineRequest(id: string): void {
        if (!this.state.requests?.some((r) => r.id === id)) return
        this.mutate((g) => {
            g.requests = g.requests.filter((r) => r.id !== id)
        })
    }

    // -----------------------------------------------------------------------
    // Finds and the Heart Tree
    // -----------------------------------------------------------------------

    /**
     * Leaves a mission's find in the village to be picked up, and returns the reward card's line
     * about it. An ornament already found or already waiting is never left twice.
     */
    private leaveFind(g: GamificationData, itemId: string, source: TreasureSource, extra: { residentId?: string; note?: string; id?: string } = {}): RewardLine[] {
        const t = getTreasure(itemId)
        g.pickups ??= []
        if (!t || (isOrnament(itemId) && (g.ornaments?.includes(itemId) || g.pickups.some((p) => p.itemId === itemId)))) return []
        g.pickups.push(makePickup(itemId, source, dateKey(), extra))
        const from = extra.residentId ? ` from ${getResident(extra.residentId)?.name ?? 'a neighbour'}` : ''
        const where = !extra.residentId && heartTreeItem(g) ? 'by your Heart Tree' : 'in the village'
        return [{ label: `${t.emoji} ${t.kind === 'ornament' ? 'An ornament: ' : ''}${t.name}${from}, waiting ${where}` }]
    }

    /**
     * Picks up finds lying in the village (all of them when no ids are given): care items go into
     * the satchel, ornaments into the collection. Returns what was picked up, for the UI.
     */
    public collectPickups(ids?: string[]): { id: string; itemId: string }[] {
        const waiting = (this.state.pickups ?? []).filter((p) => !ids || ids.includes(p.id))
        if (!waiting.length) return []
        const got: { id: string; itemId: string }[] = []
        this.mutate((g) => {
            const fresh: string[] = []
            for (const p of waiting) {
                g.pickups = g.pickups.filter((q) => q.id !== p.id)
                if (isOrnament(p.itemId)) {
                    if (g.ornaments.includes(p.itemId)) continue
                    g.ornaments.push(p.itemId)
                    fresh.push(p.itemId)
                } else {
                    g.satchel[p.itemId] = (g.satchel[p.itemId] || 0) + 1
                }
                got.push({ id: p.id, itemId: p.itemId })
            }
            if (!got.length) return
            const name = (id: string) => getTreasure(id)?.name ?? id
            const counts = new Map<string, number>()
            for (const { itemId } of got) if (!isOrnament(itemId)) counts.set(itemId, (counts.get(itemId) || 0) + 1)
            const care = [...counts].map(([id, n]) => `${name(id)}${n > 1 ? ` ×${n}` : ''}`).join(', ')
            const lines: RewardLine[] = fresh.length || got.length > 1
                ? got.map(({ id, itemId }) => {
                    const note = waiting.find((p) => p.id === id)?.note
                    return { label: `${getTreasure(itemId)?.emoji ?? ''} ${name(itemId)}${note ? ` · ${note}` : ''}` }
                })
                : []
            if (fresh.length) {
                const first = getTreasure(fresh[0])
                this.emit({
                    kind: 'treasure',
                    treasureId: fresh[0],
                    title: fresh.length > 1 ? `${fresh.length} ornaments found` : `Found: ${first?.name}`,
                    subtitle: `${fresh.length > 1 ? fresh.map(name).join(', ') : first?.description} · ${g.ornaments.length} of ${ORNAMENTS.length} ornaments found`,
                    sunlight: 0, coins: 0, xp: 0,
                    lines: got.length > 1 ? lines : [],
                })
            } else {
                this.emit({ kind: 'treasure', minor: true, treasureId: got[0].itemId, title: `${care} into your satchel`, sunlight: 0, coins: 0, xp: 0, lines })
            }
        })
        if (got.length && this.settings().forestSounds) this.soundManager.playPickup()
        return got
    }

    /**
     * Chooses a planted tree as the Heart Tree. Choosing another later is free: the bond, the
     * stage, the ornaments and today's care all belong to the player and come along.
     */
    public chooseHeartTree(itemId: string): boolean {
        const g0 = this.state
        const item = g0.homestead.find((i) => i.id === itemId && i.itemType === 'tree')
        if (!item) return false
        if (g0.heartTree?.itemId === itemId) return true
        const name = getSpecies(item.itemId)?.name ?? 'tree'
        this.mutate((g) => {
            const before = g.heartTree
            g.heartTree = before ? { ...before, itemId, speciesId: item.itemId } : newHeartTree(item, dateKey())
            if (before) {
                this.emit({
                    kind: 'heart', minor: true, speciesId: item.itemId, title: `The ${name} is your Heart Tree now`,
                    subtitle: 'Its bond and ornaments came with it.', sunlight: 0, coins: 0, xp: 0, lines: [],
                })
                return
            }
            this.emit({
                kind: 'heart', speciesId: item.itemId, title: `The ${name} is your Heart Tree`,
                subtitle: 'Look in on it once a day. Daily quests, the chest and your neighbours bring what it needs.',
                sunlight: 0, coins: 0, xp: 0,
                lines: [
                    { label: `🌳 +${HEART_STAGES[0].sunlightPct}% Sunlight on every session, more as it grows` },
                    { label: `🎐 Room for ${HEART_STAGES[0].slots} ornament, more as it grows` },
                    { label: '🍃 It never wilts: a day without care is a day it waits' },
                ],
            })
        })
        return true
    }

    /**
     * Meets today's need with a care item from the satchel: +1 bond, and a blessing on the next
     * session. Once a day; a day missed costs nothing.
     */
    public tendHeartTree(): boolean {
        const g0 = this.state
        const today = dateKey()
        const tree = heartTreeItem(g0)
        if (!g0.heartTree || !tree) return false
        if (g0.heartTree.tendedOn === today) {
            new Notice('Already looked after today. It will be glad to see you tomorrow.')
            return false
        }
        const need = heartNeed(today)
        const use = careFor(g0, need)
        if (!use) {
            new Notice(`Today it would like ${NEEDS[need].ask}. Daily quests bring care items.`)
            return false
        }
        const name = getSpecies(tree.itemId)?.name ?? 'Heart Tree'
        let grew = false
        this.mutate((g) => {
            const ht = g.heartTree
            if (!ht) return
            g.satchel[use] = (g.satchel[use] || 0) - 1
            if (g.satchel[use] <= 0) delete g.satchel[use]
            const before = heartStageIndex(ht.bond)
            ht.bond += 1
            ht.tendedOn = today
            ht.blessing = true
            const after = heartStageIndex(ht.bond)
            const item = getTreasure(use)
            const lines: RewardLine[] = [
                { label: `${item?.emoji ?? ''} ${item?.name} for ${NEEDS[need].label.toLowerCase()}` },
                { label: `🌳 Bond ${ht.bond}` },
                { label: `✨ Blessing: +${HEART_BLESSING_PCT}% Sunlight on your next session` },
            ]
            if (after > before) {
                grew = true
                const stage = HEART_STAGES[after]
                lines.push({ label: `☀️ +${stage.sunlightPct}% Sunlight on every session` }, { label: `🎐 Room for ${stage.slots} ornaments` })
                if (stage.aura && !HEART_STAGES[before].aura) lines.push({ label: '🌟 A soft light about it, day and night' })
                this.emit({ kind: 'heart', speciesId: tree.itemId, title: `Your ${name} is ${stage.name.toLowerCase()} now`, subtitle: stage.blurb, sunlight: 0, coins: 0, xp: 0, lines })
            } else {
                this.emit({ kind: 'heart', minor: true, speciesId: tree.itemId, title: `Your ${name} ${NEEDS[need].done}`, subtitle: `Bond ${ht.bond}`, sunlight: 0, coins: 0, xp: 0, lines })
            }
            this.progressQuests(g, 'village_action', 1)
        })
        if (this.settings().forestSounds) {
            if (grew) this.soundManager.playLevelUp()
            else this.soundManager.playPickup()
        }
        return true
    }

    /** Hangs a found ornament on the Heart Tree, or takes it down again. */
    public toggleOrnament(id: string): boolean {
        const g0 = this.state
        if (!g0.heartTree || !g0.ornaments?.includes(id)) return false
        const hung = g0.heartTree.hung.includes(id)
        const slots = heartSlots(g0)
        if (!hung && g0.heartTree.hung.length >= slots) {
            new Notice(`All ${slots} places on it are taken. Take one down first; more open up as the bond grows.`)
            return false
        }
        this.mutate((g) => {
            const ht = g.heartTree
            if (ht) ht.hung = hung ? ht.hung.filter((o) => o !== id) : [...ht.hung, id]
        })
        return true
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
        for (const crop of CROPS) if (crop.unlockLevel > levelBefore && crop.unlockLevel <= levelAfter) unlocks.push(`${crop.icon} ${crop.name} for your garden plots`)

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
        if (building.charterRank) {
            new Notice(`The ${building.name} is not for sale: the village earns it by reaching ${CHARTER_RANKS[building.charterRank]?.name} in the charter.`)
            return false
        }
        if (building.unique && g0.unlockedBuildings.includes(buildingId)) {
            new Notice(`You already own the ${building.name}.`)
            return false
        }
        if (levelFromXp(g0.xp) < building.unlockLevel) {
            new Notice(`${building.name} unlocks at village level ${building.unlockLevel}.`)
            return false
        }
        if (building.limit && this.ownedCount(g0, buildingId) >= building.limit) {
            new Notice(`A village has room for ${building.limit} of these — yours has them all.`)
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

    /** Copies of a building owned, placed or still in the inventory. */
    public ownedCount(g: GamificationData, buildingId: string): number {
        return g.homestead.filter((i) => i.itemType === 'building' && i.itemId === buildingId).length + (g.inventory[`building:${buildingId}`] || 0)
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
        const id = `${itemType[0]}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
        this.mutate((g) => {
            g.inventory[key] -= 1
            if (g.inventory[key] <= 0) delete g.inventory[key]
            // A stowed Heart Tree planted again is the Heart Tree again
            if (g.heartTree && !g.heartTree.itemId && itemType === 'tree' && itemId === g.heartTree.speciesId) g.heartTree.itemId = id
            g.homestead.push({
                id,
                itemType,
                itemId,
                gridX,
                gridY,
                level: 1,
                // A new plot is sown right away, so there is always something growing
                ...(itemType === 'building' && itemId === GARDEN_PLOT_ID ? { cropId: CROPS[0].id, cropGrowth: 0 } : {}),
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
        // A ripe crop is picked first, so stowing a plot never throws a harvest away
        const placed = this.state.homestead.find((i) => i.id === id)
        if (placed && isRipePlot(placed)) this.harvestCrops([id])
        this.mutate((g) => {
            const item = g.homestead.find((i) => i.id === id)
            if (!item) return
            g.homestead = g.homestead.filter((i) => i.id !== id)
            // Stowing the Heart Tree keeps everything about it; planting it again brings it back
            if (g.heartTree?.itemId === id) g.heartTree.itemId = null
            const key = `${item.itemType}:${item.itemId}`
            g.inventory[key] = (g.inventory[key] || 0) + 1
        })
    }

    /**
     * Sell spare saplings from the inventory for coins (only unplaced ones, so a tree in
     * the village is never lost by accident). Returns the coins earned, 0 if nothing sold.
     */
    public sellSapling(speciesId: string, count = 1): number {
        const key = `tree:${speciesId}`
        const owned = this.state.inventory[key] || 0
        const sold = Math.min(Math.max(0, Math.floor(count)), owned)
        const species = getSpecies(speciesId)
        if (!species || sold <= 0) return 0

        const price = saplingSellValue(speciesId) * sold
        this.mutate((g) => {
            g.inventory[key] -= sold
            if (g.inventory[key] <= 0) delete g.inventory[key]
            this.grant(g, { coins: price })
        })
        if (this.settings().forestSounds) this.soundManager.playCoin()
        new Notice(`🪙 Sold ${sold > 1 ? `${sold} ` : 'a '}${species.name} sapling${sold > 1 ? 's' : ''} for ${price} coin${price === 1 ? '' : 's'}.`)
        return price
    }

    // -----------------------------------------------------------------------
    // Garden plots
    // -----------------------------------------------------------------------

    /**
     * Crops grow with focus, never with the clock: a plot left alone simply waits. Adds a
     * line to `lines` when there is something worth telling. Returns how many crops ripened.
     */
    private growCrops(g: GamificationData, minutes: number, lines?: RewardLine[]): number {
        const boost = 1 + (perkValue(g.homestead, 'crop_growth_pct') + keepsakeValue(g, 'crop_growth_pct')) / 100
        let growing = 0
        let ripened = 0
        for (const item of g.homestead) {
            if (item.itemType !== 'building' || item.itemId !== GARDEN_PLOT_ID || cropProgress(item) >= 1) continue
            const crop = getCrop(item.cropId)
            item.cropId = crop.id
            item.cropGrowth = Math.min(crop.growMinutes, Math.round(((item.cropGrowth || 0) + minutes * boost) * 10) / 10)
            growing += 1
            if (item.cropGrowth >= crop.growMinutes) ripened += 1
        }
        if (lines && ripened) lines.push({ label: `🧺 ${ripened} crop${ripened > 1 ? 's are' : ' is'} ready to harvest in your village` })
        else if (lines && growing) lines.push({ label: '🌾 Your crops grew with your focus' })
        return ripened
    }

    /**
     * Sow a different crop in a garden plot. A ripe crop is harvested first. A growing one
     * keeps the minutes it has: changing your mind never throws focus away.
     */
    public plantCrop(itemId: string, cropId: string): boolean {
        const item = this.state.homestead.find((i) => i.id === itemId)
        const crop = CROPS.find((c) => c.id === cropId)
        if (!item || !crop || item.itemId !== GARDEN_PLOT_ID) return false
        if (levelFromXp(this.state.xp) < crop.unlockLevel) {
            new Notice(`${crop.name} unlock at village level ${crop.unlockLevel}.`)
            return false
        }
        if (isRipePlot(item)) this.harvestCrops([itemId])
        this.mutate((g) => {
            const target = g.homestead.find((i) => i.id === itemId)
            if (!target) return
            target.cropId = crop.id
            target.cropGrowth = Math.min(target.cropGrowth || 0, crop.growMinutes)
            this.progressQuests(g, 'village_action', 1)
        })
        return true
    }

    /**
     * Pick the ripe crops among `ids` (all ripe plots when omitted). Each plot is sown again
     * with the same crop. Returns what was harvested, for the UI to celebrate.
     */
    public harvestCrops(ids?: string[]): { id: string; coins: number; xp: number }[] {
        const ripe = this.state.homestead.filter((i) => isRipePlot(i) && (!ids || ids.includes(i.id)))
        if (!ripe.length) return []

        const harvested: { id: string; coins: number; xp: number }[] = []
        this.mutate((g) => {
            const counts = new Map<string, number>()
            let coins = 0
            let xp = 0
            for (const { id } of ripe) {
                const item = g.homestead.find((i) => i.id === id)
                if (!item) continue
                const crop = getCrop(item.cropId)
                coins += crop.coins
                xp += crop.xp
                counts.set(crop.id, (counts.get(crop.id) || 0) + 1)
                item.cropGrowth = 0
                harvested.push({ id, coins: crop.coins, xp: crop.xp })
            }
            const earned = this.grant(g, { coins, xp })
            g.lifetimeStats.cropsHarvested = (g.lifetimeStats.cropsHarvested || 0) + harvested.length
            const names = [...counts].map(([cropId, n]) => `${getCrop(cropId).icon} ${getCrop(cropId).name}${n > 1 ? ` ×${n}` : ''}`)
            this.emit({ kind: 'crop', title: `Harvested ${names.join(', ')}`, ...earned, lines: [] })
            this.progressQuests(g, 'village_action', 1)
            this.progressRequests(g, 'harvest', harvested.length)
        })
        if (this.settings().forestSounds) this.soundManager.playCoin()
        return harvested
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
        const status = tree.status === 'young' ? 'early' : 'completed'
        try {
            const dailyNote = await utils.getDailyNoteFile()
            if (!dailyNote || !(dailyNote instanceof TFile)) return

            const now = new Date()
            const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
            const speciesName = getSpecies(tree.speciesId)?.name || 'Classic Pine'
            const noteLink = tree.notePath ? `[[${tree.notePath.replace(/\.md$/, '')}]]` : ''
            const label = [tree.taskText, noteLink].filter(Boolean).join(' · ') || 'Focus session'

            const line = `- 🌲 **Pomodoro Forest** (${timeStr}): ${label} · *${speciesName}* · [duration:: ${duration}m] [tree:: ${tree.speciesId}] [sunlight:: +${sunlight}] [coins:: +${coins}] [status:: ${status}]`
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
