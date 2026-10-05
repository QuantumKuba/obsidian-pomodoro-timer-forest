import ForestEngine from '../src/services/ForestEngine'
import { freshGamificationData } from '../src/services/StorageManager'
import { dateKey, xpForLevel } from '../src/services/Progression'
import type { GamificationData, PlacedHomesteadItem, RewardEvent } from '../src/types/forest'

/** A ForestEngine on in-memory game state, with no Obsidian behind it. */
export function makeEngine(setup: (g: GamificationData) => void = () => {}, settings: Record<string, unknown> = {}) {
    let g = freshGamificationData()
    g.xp = xpForLevel(4)
    g.sunlight = 5000
    g.coins = 500
    setup(g)
    const storage = {
        getGamification: () => g,
        updateGamification: (fn: (s: GamificationData) => GamificationData) => {
            g = fn(g)
        },
        markChanged() {},
    }
    const plugin = {
        getSettings: () => ({
            dailyGoal: 4,
            workLen: 25,
            forestSounds: false,
            rewardTaskCompletion: true,
            enableCelebrationParticles: false,
            logForestToDailyNote: false,
            hardcoreMode: true,
            ...settings,
        }),
        hasVisibleForestView: () => true,
        app: {},
        manifest: { version: 'test' },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const engine = new ForestEngine(plugin as any, storage as any)
    let events: RewardEvent[] = []
    engine.rewardEvents.subscribe((e) => (events = e))
    return {
        engine,
        get g() {
            return g
        },
        get events() {
            return events
        },
        today: () => g.dailyLogs[dateKey()],
    }
}

export function placed(itemType: 'tree' | 'building', itemId: string, gridX: number, gridY: number, extra: Partial<PlacedHomesteadItem> = {}): PlacedHomesteadItem {
    return { id: `${itemId}_${gridX}_${gridY}`, itemType, itemId, gridX, gridY, level: 1, ...extra }
}
