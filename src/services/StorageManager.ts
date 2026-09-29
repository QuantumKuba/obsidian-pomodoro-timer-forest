import type PomodoroTimerPlugin from '../main'
import PomodoroSettings, { type Settings } from '../Settings'
import type { BiomeType, PluginData, GamificationData } from '../types/forest'
import { writable, type Writable, get } from 'svelte/store'
import { BIOME_UNLOCK_LEVELS } from '../assets/floraCatalog'
import { levelFromXp } from './Progression'

export const CURRENT_DATA_VERSION = 3

export const DEFAULT_GAMIFICATION_DATA: GamificationData = {
    sunlight: 150, // Starting bonus for new planters
    coins: 15,
    xp: 0,
    selectedSpeciesId: 'classic_pine',
    activeBiome: 'meadow',
    unlockedBiomes: ['meadow'],
    streak: {
        current: 0,
        longest: 0,
        lastCheckInDate: '',
        shieldMonth: '',
        shieldsUsed: 0,
    },
    unlockedSpecies: ['classic_pine'],
    unlockedBuildings: ['campfire'],
    // A couple of starter saplings so the village can be decorated right away
    inventory: { 'tree:classic_pine': 2 },
    homestead: [
        {
            id: 'init_campfire',
            itemType: 'building',
            itemId: 'campfire',
            gridX: 2,
            gridY: 2,
            level: 1,
            customName: 'Homestead Heart',
        },
    ],
    landSize: 5,
    vitality: 60,
    lastVisitDate: '',
    questBoard: null,
    achievements: [],
    rewardedTaskKeys: { date: '', keys: [] },
    dailyLogs: {},
    tagMappings: [
        { tag: '#code', speciesId: 'classic_pine' },
        { tag: '#dev', speciesId: 'classic_pine' },
        { tag: '#write', speciesId: 'sakura' },
        { tag: '#writing', speciesId: 'sakura' },
        { tag: '#study', speciesId: 'ancient_oak' },
        { tag: '#reading', speciesId: 'ancient_oak' },
        { tag: '#zen', speciesId: 'bonsai' },
        { tag: '#meditate', speciesId: 'bonsai' },
        { tag: '#creative', speciesId: 'autumn_maple' },
        { tag: '#sprint', speciesId: 'sunflower' },
    ],
    ambientSound: 'none',
    ambientVolume: 0.3,
    lifetimeStats: {
        totalFocusMinutes: 0,
        totalPomodoros: 0,
        treesGrown: 0,
        treesWithered: 0,
        tasksCompleted: 0,
        breaksCompleted: 0,
        questsCompleted: 0,
        chestsOpened: 0,
    },
    preferences: {
        hardcoreMode: true,
        enableCelebrationParticles: true,
        ambientForestSounds: true,
        logToDailyNoteWithDataview: false,
    },
}

export const DEFAULT_PLUGIN_DATA: PluginData = {
    version: CURRENT_DATA_VERSION,
    settings: PomodoroSettings.DEFAULT_SETTINGS,
    gamification: DEFAULT_GAMIFICATION_DATA,
}

export function freshGamificationData(): GamificationData {
    return JSON.parse(JSON.stringify(DEFAULT_GAMIFICATION_DATA))
}

// Single canonical gamification store
export const gamificationStore: Writable<GamificationData> = writable<GamificationData>(freshGamificationData())

export default class StorageManager {
    private plugin: PomodoroTimerPlugin
    private data: PluginData = { ...DEFAULT_PLUGIN_DATA }
    private saveTimer: any = null
    private isInitialized = false

    public settingsStore: Writable<Settings> = PomodoroSettings.settings
    public gamificationStore: Writable<GamificationData> = gamificationStore

    constructor(plugin: PomodoroTimerPlugin) {
        this.plugin = plugin
    }

    public async initialize(): Promise<PluginData> {
        if (this.isInitialized) {
            return this.data
        }
        this.isInitialized = true

        const rawData = await this.plugin.loadData()
        this.data = this.migrate(rawData)

        this.settingsStore.set(this.data.settings)
        this.gamificationStore.set(this.data.gamification)

        // Subscribe to changes and debounce save
        this.settingsStore.subscribe((newSettings) => {
            if (this.isInitialized) {
                this.data.settings = newSettings
                this.requestSave()
            }
        })

        this.gamificationStore.subscribe((newGamification) => {
            if (this.isInitialized) {
                this.data.gamification = newGamification
                this.requestSave()
            }
        })

        return this.data
    }

    public getSettings(): Settings {
        return this.data.settings
    }

    public getGamification(): GamificationData {
        return this.data.gamification
    }

    public updateGamification(updater: (state: GamificationData) => GamificationData): void {
        this.gamificationStore.update((state) => {
            const updated = updater(state)
            return updated
        })
    }

    public updateSettings(updater: (state: Settings) => Settings): void {
        this.settingsStore.update((state) => {
            const updated = updater(state)
            return updated
        })
    }

    public requestSave(): void {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer)
        }
        this.saveTimer = setTimeout(async () => {
            await this.forceSave()
        }, 500)
    }

    public async forceSave(): Promise<void> {
        try {
            this.data.settings = get(this.settingsStore)
            this.data.gamification = get(this.gamificationStore)
            await this.plugin.saveData(this.data)
        } catch (err) {
            console.error('[PomodoroForest] Failed to save plugin data:', err)
        }
    }

    private migrate(raw: any): PluginData {
        if (!raw) {
            return { version: CURRENT_DATA_VERSION, settings: { ...PomodoroSettings.DEFAULT_SETTINGS }, gamification: freshGamificationData() }
        }

        // Case 1: Already unified data format
        if (raw.version && raw.settings && raw.gamification) {
            return {
                version: CURRENT_DATA_VERSION,
                settings: {
                    ...PomodoroSettings.DEFAULT_SETTINGS,
                    ...raw.settings,
                },
                gamification: this.normalizeGamification(raw.gamification, raw.version),
            }
        }

        // Case 2: Legacy format (settings only or old stores attempt)
        console.log('[PomodoroForest] Migrating legacy plugin data format...')
        const migrated: PluginData = { version: CURRENT_DATA_VERSION, settings: { ...PomodoroSettings.DEFAULT_SETTINGS }, gamification: freshGamificationData() }

        // Check if raw contains settings keys
        if (typeof raw.workLen === 'number') {
            migrated.settings = {
                ...PomodoroSettings.DEFAULT_SETTINGS,
                ...raw,
            }
        }

        // Check if raw contains old pointsData or old forest
        if (raw.pointsData) {
            migrated.gamification.sunlight = raw.pointsData.total || 150
            migrated.gamification.coins = Math.floor((raw.pointsData.total || 0) / 10)
        }

        if (Array.isArray(raw.forest) && raw.forest.length > 0) {
            raw.forest.forEach((oldPlant: any, idx: number) => {
                migrated.gamification.homestead.push({
                    id: `migrated_${idx}`,
                    itemType: 'tree',
                    itemId: oldPlant.name === 'Big Tree' ? 'ancient_oak' : (oldPlant.name === 'Flower' ? 'sunflower' : 'classic_pine'),
                    gridX: (idx + 1) % 5,
                    gridY: Math.floor((idx + 1) / 5),
                    level: oldPlant.level || 1,
                })
            })
        }

        return migrated
    }

    /** Fill in any fields added since the data was written, and repair inconsistent state. */
    private normalizeGamification(raw: any, fromVersion: number): GamificationData {
        const base = freshGamificationData()
        const g: GamificationData = {
            ...base,
            ...raw,
            streak: { ...base.streak, ...(raw.streak || {}) },
            lifetimeStats: { ...base.lifetimeStats, ...(raw.lifetimeStats || {}) },
            preferences: { ...base.preferences, ...(raw.preferences || {}) },
            rewardedTaskKeys: raw.rewardedTaskKeys || base.rewardedTaskKeys,
            inventory: { ...(raw.inventory || {}) },
            homestead: Array.isArray(raw.homestead) ? raw.homestead : base.homestead,
            dailyLogs: raw.dailyLogs || {},
            achievements: raw.achievements || [],
        }

        if (fromVersion < 3) {
            // v2 had every biome unlocked and awarded no XP; grant XP for past focus so
            // early adopters keep their progress, and let levels re-derive biome unlocks.
            g.xp = Math.max(g.xp || 0, g.lifetimeStats.totalFocusMinutes || 0)
            g.unlockedBiomes = ['meadow']
            if (g.activeBiome !== 'meadow') g.unlockedBiomes.push(g.activeBiome)
            // v2 buildings were unique & owned only while placed — keep the ids consistent
            g.unlockedBuildings = Array.from(
                new Set([...(g.unlockedBuildings || []), ...g.homestead.filter((i) => i.itemType === 'building').map((i) => i.itemId)]),
            )
        }

        // Items placed outside the plot (e.g. after a data edit) go back to inventory
        const size = Math.max(5, Math.min(8, g.landSize || 5))
        g.landSize = size
        g.homestead = g.homestead.filter((item) => {
            if (item.gridX < size && item.gridY < size) return true
            const key = `${item.itemType}:${item.itemId}`
            g.inventory[key] = (g.inventory[key] || 0) + 1
            return false
        })
        g.vitality = Math.max(0, Math.min(100, typeof g.vitality === 'number' ? g.vitality : base.vitality))

        // Biomes are earned by level; make sure everything already earned is available
        const level = levelFromXp(g.xp || 0)
        for (const [biome, lvl] of Object.entries(BIOME_UNLOCK_LEVELS) as [BiomeType, number][]) {
            if (lvl <= level && !g.unlockedBiomes.includes(biome)) g.unlockedBiomes.push(biome)
        }
        return g
    }
}
