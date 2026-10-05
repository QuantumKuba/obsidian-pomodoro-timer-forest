import type PomodoroTimerPlugin from '../main'
import PomodoroSettings, { type Settings } from '../Settings'
import type { BiomeType, PluginData, GamificationData } from '../types/forest'
import { writable, type Writable, get } from 'svelte/store'
import { Notice } from 'obsidian'
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
        earlyHarvests: 0,
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
    return structuredClone(DEFAULT_GAMIFICATION_DATA)
}

/** Old plugin versions stored their data in different shapes; nothing in it can be trusted. */
interface RawPluginData {
    version?: number
    settings?: Partial<Settings>
    gamification?: Partial<GamificationData>
    // pre-2.0 layouts
    workLen?: number
    pointsData?: { total?: number }
    forest?: { name?: string; level?: number }[]
}

// Single canonical gamification store
export const gamificationStore: Writable<GamificationData> = writable<GamificationData>(freshGamificationData())

/** What data.json held when it was read. */
type DiskState =
    | { kind: 'missing' }
    | { kind: 'ok'; raw: unknown; key: string }
    /** Not valid JSON: half written, or a sync tool left git conflict markers in it. */
    | { kind: 'unreadable'; conflict: boolean }

/** JSON text that does not depend on key order, to tell whether the file really changed. */
function canonicalJson(value: unknown): string {
    const sortKeys = (v: unknown): unknown => {
        if (Array.isArray(v)) return v.map(sortKeys)
        if (v && typeof v === 'object') {
            const src = v as Record<string, unknown>
            const out: Record<string, unknown> = {}
            for (const key of Object.keys(src).sort()) out[key] = sortKeys(src[key])
            return out
        }
        return v
    }
    return JSON.stringify(sortKeys(value))
}

/**
 * Owns data.json. Syncing between devices is left to the user's sync tool (Obsidian Sync,
 * the Git plugin…); this class makes sure the plugin works with that:
 * - a data.json replaced by the sync tool is loaded again while Obsidian is running,
 * - a save never writes over a newer file it has not loaded yet,
 * - the file is only written when something really changed, so opening Obsidian alone
 *   does not create changes that conflict with the next pull,
 * - a file it cannot read is never replaced with a fresh game.
 */
export default class StorageManager {
    private plugin: PomodoroTimerPlugin
    private data: PluginData = { ...DEFAULT_PLUGIN_DATA }
    private saveTimer: number | null = null
    private isInitialized = false

    /** Canonical text of data.json when we last read or wrote it; null when there was no file. */
    private diskKey: string | null = null
    /** Something changed that is not on disk yet. */
    private dirty = false
    /** Set while publishing data that must not be saved on its own (a reload, the daily rollover). */
    private silent = false
    private settingsKey = ''
    /** Reads and writes run one at a time. */
    private queue: Promise<unknown> = Promise.resolve()

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

        const disk = await this.readDisk()
        if (disk.kind === 'unreadable') {
            // Starting a fresh game here would overwrite the player's real progress on the next save
            new Notice(
                disk.conflict
                    ? 'Pomodoro Timer Forest: data.json contains a sync conflict, so the plugin is paused to protect your progress. Resolve the conflict in your sync tool (keep one version of the file), then reload the plugin.'
                    : 'Pomodoro Timer Forest: data.json could not be read, so the plugin is paused to protect your progress. Restore the file from your sync history or a backup, then reload the plugin.',
                0,
            )
            throw new Error('data.json could not be read')
        }

        this.data = this.migrate(disk.kind === 'ok' ? disk.raw : null)
        this.diskKey = disk.kind === 'ok' ? disk.key : null
        // New or upgraded data needs writing once; data that loaded unchanged does not
        this.dirty = canonicalJson(this.data) !== this.diskKey

        this.silently(() => {
            this.settingsStore.set(this.data.settings)
            this.gamificationStore.set(this.data.gamification)
        })
        this.settingsKey = canonicalJson(this.data.settings)

        // Subscribe to changes and debounce save
        this.settingsStore.subscribe((newSettings) => {
            this.data.settings = newSettings
            // The settings tab re-publishes the same values when it is created; that is not a change
            const key = canonicalJson(newSettings)
            if (key === this.settingsKey) return
            this.settingsKey = key
            if (!this.silent) this.markChanged()
        })

        this.gamificationStore.subscribe((newGamification) => {
            if (newGamification === this.data.gamification) return
            this.data.gamification = newGamification
            if (!this.silent) this.markChanged()
        })

        if (this.dirty) this.requestSave()
        return this.data
    }

    public getSettings(): Settings {
        return this.data.settings
    }

    public getGamification(): GamificationData {
        return this.data.gamification
    }

    /**
     * `persist: false` keeps the change in memory only; it is written with the next real change.
     * Used for the daily rollover, which every device works out from the date by itself.
     */
    public updateGamification(updater: (state: GamificationData) => GamificationData, options: { persist?: boolean } = {}): void {
        const update = () => this.gamificationStore.update((state) => updater(state))
        if (options.persist === false) this.silently(update)
        else update()
    }

    public updateSettings(updater: (state: Settings) => Settings): void {
        this.settingsStore.update((state) => {
            const updated = updater(state)
            return updated
        })
    }

    /** Record that the current state must be saved, and save it shortly. */
    public markChanged(): void {
        this.dirty = true
        this.requestSave()
    }

    public requestSave(): void {
        if (this.saveTimer !== null) {
            window.clearTimeout(this.saveTimer)
        }
        this.saveTimer = window.setTimeout(() => {
            void this.forceSave()
        }, 500)
    }

    /** Write a pending change now, e.g. before the app goes to the background or is closed. */
    public flush(): Promise<void> {
        return this.saveTimer !== null ? this.forceSave() : this.queue.then(() => undefined)
    }

    public forceSave(): Promise<void> {
        if (this.saveTimer !== null) {
            window.clearTimeout(this.saveTimer)
            this.saveTimer = null
        }
        return this.enqueue(async () => {
            if (!this.dirty) return
            try {
                const disk = await this.readDisk()
                if (disk.kind === 'unreadable') return // the sync tool is mid-write or left a conflict; try again later
                if (disk.kind === 'ok' && disk.key !== this.diskKey) {
                    // The sync tool brought a newer file that was not loaded yet. It is the
                    // source of truth; writing now would throw away progress from the other device.
                    console.warn('[PomodoroForest] data.json changed on another device; loading it instead of saving over it.')
                    new Notice('Pomodoro Timer Forest: loaded progress synced from another device. Your last change on this device could not be kept.')
                    this.apply(disk.raw, disk.key)
                    return
                }
                this.data.settings = get(this.settingsStore)
                this.data.gamification = get(this.gamificationStore)
                const key = canonicalJson(this.data)
                if (key !== this.diskKey) await this.plugin.saveData(this.data)
                this.diskKey = key
                this.dirty = false
            } catch (err) {
                console.error('[PomodoroForest] Failed to save plugin data:', err)
            }
        })
    }

    /**
     * Load data.json again if something other than this plugin changed it (a sync tool).
     * Cheap when nothing changed. Returns true when new data was loaded.
     */
    public reloadFromDisk(): Promise<boolean> {
        if (!this.isInitialized) return Promise.resolve(false)
        return this.enqueue(async () => {
            try {
                const disk = await this.readDisk()
                // Missing or half written: keep what we have; the next check sees the finished file
                if (disk.kind !== 'ok' || disk.key === this.diskKey) return false
                this.apply(disk.raw, disk.key)
                return true
            } catch (err) {
                console.error('[PomodoroForest] Failed to reload plugin data:', err)
                return false
            }
        })
    }

    /** Replace the in-memory state with what is on disk, without saving it back. */
    private apply(raw: unknown, key: string): void {
        if (this.saveTimer !== null) {
            window.clearTimeout(this.saveTimer)
            this.saveTimer = null
        }
        const loaded = this.migrate(raw)
        this.diskKey = key
        this.dirty = false
        this.silently(() => {
            this.settingsStore.set(loaded.settings)
            this.gamificationStore.set(loaded.gamification)
        })
        this.data = loaded
    }

    private silently(fn: () => void): void {
        const was = this.silent
        this.silent = true
        try {
            fn()
        } finally {
            this.silent = was
        }
    }

    private enqueue<T>(task: () => Promise<T>): Promise<T> {
        const run = this.queue.then(task)
        this.queue = run.catch(() => undefined)
        return run
    }

    /** Reads data.json itself (as plugin.loadData() does) so a damaged file can be told apart from a missing one. */
    private async readDisk(): Promise<DiskState> {
        const adapter = this.plugin.app.vault.adapter
        const path = `${this.plugin.manifest.dir}/data.json`
        if (!this.plugin.manifest.dir || !(await adapter.exists(path))) return { kind: 'missing' }
        const text = await adapter.read(path)
        if (!text.trim()) return { kind: 'missing' }
        try {
            const raw: unknown = JSON.parse(text)
            return raw === null ? { kind: 'missing' } : { kind: 'ok', raw, key: canonicalJson(raw) }
        } catch {
            return { kind: 'unreadable', conflict: /^<{7}( |$)/m.test(text) }
        }
    }

    private migrate(rawData: unknown): PluginData {
        if (!rawData || typeof rawData !== 'object') {
            return { version: CURRENT_DATA_VERSION, settings: { ...PomodoroSettings.DEFAULT_SETTINGS }, gamification: freshGamificationData() }
        }
        const raw = rawData as RawPluginData

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
        const migrated: PluginData = { version: CURRENT_DATA_VERSION, settings: { ...PomodoroSettings.DEFAULT_SETTINGS }, gamification: freshGamificationData() }

        // Check if raw contains settings keys
        if (typeof raw.workLen === 'number') {
            migrated.settings = {
                ...PomodoroSettings.DEFAULT_SETTINGS,
                ...(rawData as Partial<Settings>),
            }
        }

        // Check if raw contains old pointsData or old forest
        if (raw.pointsData) {
            migrated.gamification.sunlight = raw.pointsData.total || 150
            migrated.gamification.coins = Math.floor((raw.pointsData.total || 0) / 10)
        }

        if (Array.isArray(raw.forest) && raw.forest.length > 0) {
            raw.forest.forEach((oldPlant, idx) => {
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
    private normalizeGamification(raw: Partial<GamificationData>, fromVersion: number): GamificationData {
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
