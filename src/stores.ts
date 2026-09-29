import { writable, derived, readable, type Writable, type Readable } from 'svelte/store'
import type PomodoroTimerPlugin from './main'
import PomodoroSettings, { type Settings } from './Settings'
import type { GamificationData, ActiveSessionPlant, PlacedHomesteadItem } from './types/forest'
import { gamificationStore, freshGamificationData } from './services/StorageManager'
import { dateKey, levelProgress, levelTitle, villageCharm, vitalityState } from './services/Progression'

// Global reference to the plugin instance (set in onload)
export let pluginInstance: PomodoroTimerPlugin | null = null

export { gamificationStore }
export const settings: Writable<Settings> = PomodoroSettings.settings
export const activePlantStore: Writable<ActiveSessionPlant | null> = writable<ActiveSessionPlant | null>(null)

// Derived helpers
export const sunlight: Readable<number> = derived(gamificationStore, ($g) => $g.sunlight)
export const coins: Readable<number> = derived(gamificationStore, ($g) => $g.coins)
export const streak: Readable<GamificationData['streak']> = derived(gamificationStore, ($g) => $g.streak)
export const homestead: Readable<PlacedHomesteadItem[]> = derived(gamificationStore, ($g) => $g.homestead)
export const lifetimeStats: Readable<GamificationData['lifetimeStats']> = derived(gamificationStore, ($g) => $g.lifetimeStats)

export const levelInfo = derived(gamificationStore, ($g) => {
    const p = levelProgress($g.xp)
    return { ...p, title: levelTitle(p.level) }
})

export const charm: Readable<number> = derived(gamificationStore, ($g) => villageCharm($g.homestead))
export const vitality = derived(gamificationStore, ($g) => ({ value: $g.vitality, ...vitalityState($g.vitality) }))

/** Ticks every minute so time-of-day visuals and "today" rollovers stay current. */
export const clockMinute: Readable<Date> = readable(new Date(), (set) => {
    const id = window.setInterval(() => set(new Date()), 60_000)
    return () => window.clearInterval(id)
})

export const todayLog = derived([gamificationStore, clockMinute], ([$g, $now]) => {
    const key = dateKey($now)
    return $g.dailyLogs[key] || { date: key, trees: [], totalMinutes: 0, completedPomodoros: 0, tasksCompleted: 0, breaksCompleted: 0 }
})

export const questBoard = derived([gamificationStore, clockMinute], ([$g, $now]) =>
    $g.questBoard && $g.questBoard.date === dateKey($now) ? $g.questBoard : null,
)

export function setPlugin(plugin: PomodoroTimerPlugin): void {
    pluginInstance = plugin
}

export function resetStoresForDebug(): void {
    if (pluginInstance?.storageManager) {
        pluginInstance.storageManager.updateGamification(() => freshGamificationData())
        pluginInstance.forestEngine?.ensureToday()
        void pluginInstance.storageManager.forceSave()
    }
}
