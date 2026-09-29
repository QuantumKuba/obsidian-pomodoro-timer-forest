/**
 * Pure game-rule helpers: levels, perks, quests, achievements, vitality and dates.
 * Nothing in here touches Obsidian or the stores, so it can be reused by the
 * HTML export and reasoned about in isolation.
 */
import type {
    DailyQuest,
    DailyQuestBoard,
    GamificationData,
    HomesteadBuilding,
    PerkKind,
    PlacedHomesteadItem,
    QuestKind,
} from '../types/forest'
import { FLORA_SPECIES, getBuilding, getSpecies } from '../assets/floraCatalog'

// ---------------------------------------------------------------------------
// Dates (always local time — `new Date('YYYY-MM-DD')` parses as UTC, avoid it)
// ---------------------------------------------------------------------------

export function dateKey(d: Date = new Date()): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function parseDateKey(key: string): Date {
    const [y, m, d] = key.split('-').map((n) => parseInt(n, 10))
    return new Date(y, (m || 1) - 1, d || 1)
}

export function addDays(key: string, days: number): string {
    const d = parseDateKey(key)
    d.setDate(d.getDate() + days)
    return dateKey(d)
}

export function daysBetween(fromKey: string, toKey: string): number {
    const ms = parseDateKey(toKey).getTime() - parseDateKey(fromKey).getTime()
    return Math.round(ms / 86400000)
}

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

/** Total XP needed to reach `level` (level 1 = 0 XP). */
export function xpForLevel(level: number): number {
    return 50 * (level - 1) * level
}

export function levelFromXp(xp: number): number {
    let level = 1
    while (xpForLevel(level + 1) <= xp) level++
    return level
}

export function levelProgress(xp: number): { level: number; into: number; needed: number; ratio: number } {
    const level = levelFromXp(xp)
    const base = xpForLevel(level)
    const next = xpForLevel(level + 1)
    const into = xp - base
    const needed = next - base
    return { level, into, needed, ratio: needed > 0 ? into / needed : 1 }
}

const TITLES: [number, string][] = [
    [1, 'Seedling Settler'],
    [3, 'Grove Keeper'],
    [5, 'Hamlet Warden'],
    [8, 'Village Elder'],
    [12, 'Forest Sage'],
    [16, 'Homestead Legend'],
]

export function levelTitle(level: number): string {
    let title = TITLES[0][1]
    for (const [lvl, name] of TITLES) if (level >= lvl) title = name
    return title
}

// ---------------------------------------------------------------------------
// Perks
// ---------------------------------------------------------------------------

export function perkAmount(building: HomesteadBuilding, level: number): number {
    if (!building.perk) return 0
    return building.perk.base + building.perk.perLevel * (Math.max(1, level) - 1)
}

/** Strongest placed instance of any building granting `kind` (repeat copies don't stack). */
export function perkValue(homestead: PlacedHomesteadItem[], kind: PerkKind): number {
    let best = 0
    for (const item of homestead) {
        if (item.itemType !== 'building') continue
        const b = getBuilding(item.itemId)
        if (b?.perk?.kind === kind) best = Math.max(best, perkAmount(b, item.level))
    }
    return best
}

export function perkText(building: HomesteadBuilding, level = 1): string {
    const p = building.perk
    if (!p) return ''
    const v = perkAmount(building, level)
    switch (p.kind) {
        case 'sunlight_pct':
            return `+${v}% Sunlight from every focus session`
        case 'coins_pct':
            return `+${v}% Coins from every focus session`
        case 'long_session_sunlight_pct':
            return `+${v}% Sunlight on sessions of 45m or more`
        case 'streak_shield':
            return `${v} streak shield${v > 1 ? 's' : ''} per month for days you rest`
        case 'xp_pct':
            return `+${v}% XP from everything`
        case 'quest_bonus_pct':
            return `+${v}% daily quest rewards`
        case 'break_sunlight':
            return `+${v} Sunlight for every finished break`
        case 'vitality_keep_pct':
            return `Village fades ${v}% slower on days off`
        case 'task_coins':
            return `+${v} Coin${v > 1 ? 's' : ''} per checked-off task`
        case 'night_sunlight_pct':
            return `+${v}% Sunlight for evening sessions (19:00–05:00)`
    }
}

export function upgradeCost(building: HomesteadBuilding, currentLevel: number): { sunlight: number; coins: number } {
    return {
        sunlight: Math.max(20, Math.round(building.sunlightCost * 0.6 * currentLevel)),
        coins: Math.max(2, Math.round(building.coinsCost * 0.6 * currentLevel)),
    }
}

// ---------------------------------------------------------------------------
// Charm & vitality
// ---------------------------------------------------------------------------

export function villageCharm(homestead: PlacedHomesteadItem[]): number {
    let charm = 0
    for (const item of homestead) {
        const base = item.itemType === 'tree' ? getSpecies(item.itemId)?.charm ?? 1 : getBuilding(item.itemId)?.charm ?? 1
        charm += base + (item.level - 1)
    }
    return charm
}

export const VITALITY_FLOOR = 10
export const VITALITY_DAILY_FADE = 15

export function vitalityState(v: number): { label: string; mood: 'thriving' | 'healthy' | 'sleepy' | 'dormant'; blurb: string } {
    if (v >= 75) return { label: 'Thriving', mood: 'thriving', blurb: 'Villagers are out and about, fireflies dance at dusk.' }
    if (v >= 45) return { label: 'Healthy', mood: 'healthy', blurb: 'A calm, content village humming along.' }
    if (v >= 20) return { label: 'Sleepy', mood: 'sleepy', blurb: 'The village is resting — a focus session will wake it up.' }
    return { label: 'Dormant', mood: 'dormant', blurb: 'Quiet and misty. Nothing is lost; one session brings it back to life.' }
}

// ---------------------------------------------------------------------------
// Daily quests
// ---------------------------------------------------------------------------

function seededRandom(seed: string): () => number {
    let h = 2166136261
    for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i)
        h = Math.imul(h, 16777619)
    }
    return () => {
        h += 0x6d2b79f5
        let t = h
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

interface QuestTemplate {
    kind: QuestKind
    make: (goal: number, workLen: number) => { title: string; target: number }
}

const QUEST_POOL: QuestTemplate[] = [
    { kind: 'sessions', make: (goal) => ({ title: `Grow ${Math.max(2, goal - 1)} trees`, target: Math.max(2, goal - 1) }) },
    {
        kind: 'minutes',
        make: (goal, workLen) => {
            const target = Math.max(30, Math.round((workLen * Math.max(2, goal - 1)) / 5) * 5)
            return { title: `Focus for ${target} minutes`, target }
        },
    },
    { kind: 'tasks', make: () => ({ title: 'Check off 3 tasks', target: 3 }) },
    { kind: 'break', make: () => ({ title: 'Take a proper break', target: 1 }) },
    { kind: 'linked_task', make: () => ({ title: 'Focus on a specific task', target: 1 }) },
    { kind: 'village_action', make: () => ({ title: 'Tend your village (plant, build or upgrade)', target: 1 }) },
    { kind: 'tagged_session', make: () => ({ title: 'Grow a tree from a #tagged note or task', target: 1 }) },
]

export function generateQuestBoard(date: string, dailyGoal: number, workLen: number): DailyQuestBoard {
    const rand = seededRandom(`quests-${date}`)
    // Always one "core" focus quest, then two others drawn from the rest.
    const core = rand() < 0.5 ? QUEST_POOL[0] : QUEST_POOL[1]
    const others = QUEST_POOL.filter((q) => q !== QUEST_POOL[0] && q !== QUEST_POOL[1])
    const picked: QuestTemplate[] = [core]
    while (picked.length < 3 && others.length) {
        picked.push(others.splice(Math.floor(rand() * others.length), 1)[0])
    }
    const quests: DailyQuest[] = picked.map((tpl, i) => {
        const { title, target } = tpl.make(dailyGoal, workLen)
        const big = tpl.kind === 'sessions' || tpl.kind === 'minutes'
        return {
            id: `${date}-${i}-${tpl.kind}`,
            kind: tpl.kind,
            title,
            target,
            progress: 0,
            rewardSunlight: big ? 35 : 20,
            rewardCoins: big ? 4 : 3,
            rewardXp: big ? 25 : 15,
            claimed: false,
        }
    })
    return { date, quests, chestClaimed: false }
}

export const CHEST_REWARD = { sunlight: 60, coins: 10, xp: 40 }

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

export interface AchievementDef {
    id: string
    icon: string
    title: string
    description: string
    reward: { sunlight: number; coins: number; xp: number }
    check: (g: GamificationData) => boolean
    progress?: (g: GamificationData) => [number, number]
}

const s = (g: GamificationData) => g.lifetimeStats

export const ACHIEVEMENTS: AchievementDef[] = [
    {
        id: 'first_tree', icon: '🌱', title: 'First Roots', description: 'Grow your very first tree.',
        reward: { sunlight: 20, coins: 2, xp: 10 }, check: (g) => s(g).treesGrown >= 1, progress: (g) => [s(g).treesGrown, 1],
    },
    {
        id: 'trees_10', icon: '🌲', title: 'Little Copse', description: 'Grow 10 trees.',
        reward: { sunlight: 50, coins: 5, xp: 30 }, check: (g) => s(g).treesGrown >= 10, progress: (g) => [s(g).treesGrown, 10],
    },
    {
        id: 'trees_50', icon: '🌳', title: 'Woodland', description: 'Grow 50 trees.',
        reward: { sunlight: 150, coins: 15, xp: 80 }, check: (g) => s(g).treesGrown >= 50, progress: (g) => [s(g).treesGrown, 50],
    },
    {
        id: 'trees_200', icon: '🏞️', title: 'Ancient Forest', description: 'Grow 200 trees.',
        reward: { sunlight: 400, coins: 40, xp: 200 }, check: (g) => s(g).treesGrown >= 200, progress: (g) => [s(g).treesGrown, 200],
    },
    {
        id: 'streak_3', icon: '🔥', title: 'Kindling', description: 'Focus 3 days in a row.',
        reward: { sunlight: 40, coins: 4, xp: 25 }, check: (g) => g.streak.longest >= 3, progress: (g) => [g.streak.longest, 3],
    },
    {
        id: 'streak_7', icon: '🔥', title: 'Steady Flame', description: 'Focus 7 days in a row.',
        reward: { sunlight: 100, coins: 10, xp: 60 }, check: (g) => g.streak.longest >= 7, progress: (g) => [g.streak.longest, 7],
    },
    {
        id: 'streak_30', icon: '☄️', title: 'Eternal Hearth', description: 'Focus 30 days in a row.',
        reward: { sunlight: 500, coins: 50, xp: 250 }, check: (g) => g.streak.longest >= 30, progress: (g) => [g.streak.longest, 30],
    },
    {
        id: 'hours_10', icon: '⏳', title: 'Deep Diver', description: 'Log 10 hours of focus.',
        reward: { sunlight: 80, coins: 8, xp: 50 }, check: (g) => s(g).totalFocusMinutes >= 600, progress: (g) => [Math.floor(s(g).totalFocusMinutes / 60), 10],
    },
    {
        id: 'hours_100', icon: '🌌', title: 'Flow Master', description: 'Log 100 hours of focus.',
        reward: { sunlight: 600, coins: 60, xp: 300 }, check: (g) => s(g).totalFocusMinutes >= 6000, progress: (g) => [Math.floor(s(g).totalFocusMinutes / 60), 100],
    },
    {
        id: 'tasks_10', icon: '✅', title: 'Getting Things Done', description: 'Check off 10 tasks.',
        reward: { sunlight: 40, coins: 6, xp: 25 }, check: (g) => s(g).tasksCompleted >= 10, progress: (g) => [s(g).tasksCompleted, 10],
    },
    {
        id: 'tasks_100', icon: '📜', title: 'List Slayer', description: 'Check off 100 tasks.',
        reward: { sunlight: 200, coins: 30, xp: 120 }, check: (g) => s(g).tasksCompleted >= 100, progress: (g) => [s(g).tasksCompleted, 100],
    },
    {
        id: 'breaks_10', icon: '🍵', title: 'Mindful Rest', description: 'Finish 10 breaks — rest is part of the work.',
        reward: { sunlight: 40, coins: 4, xp: 25 }, check: (g) => s(g).breaksCompleted >= 10, progress: (g) => [s(g).breaksCompleted, 10],
    },
    {
        id: 'first_building', icon: '🏡', title: 'Homesteader', description: 'Build your first structure.',
        reward: { sunlight: 30, coins: 3, xp: 20 },
        check: (g) => g.homestead.some((i) => i.itemType === 'building' && i.id !== 'init_campfire'),
    },
    {
        id: 'charm_50', icon: '💐', title: 'Picturesque', description: 'Reach 50 village charm.',
        reward: { sunlight: 120, coins: 12, xp: 60 }, check: (g) => villageCharm(g.homestead) >= 50, progress: (g) => [villageCharm(g.homestead), 50],
    },
    {
        id: 'quests_20', icon: '📯', title: 'Errand Runner', description: 'Complete 20 daily quests.',
        reward: { sunlight: 100, coins: 10, xp: 60 }, check: (g) => s(g).questsCompleted >= 20, progress: (g) => [s(g).questsCompleted, 20],
    },
    {
        id: 'rare_tree', icon: '✨', title: 'Myth Grower', description: 'Grow a Fairy Ring or Celestial Gold Tree.',
        reward: { sunlight: 150, coins: 15, xp: 80 },
        check: (g) =>
            Object.values(g.dailyLogs).some((log) =>
                log.trees.some((t) => t.status === 'mature' && (t.speciesId === 'mushroom_circle' || t.speciesId === 'golden_tree')),
            ),
    },
    {
        id: 'full_plot', icon: '🗺️', title: 'No Vacancy', description: 'Fill every tile of your village plot.',
        reward: { sunlight: 200, coins: 20, xp: 100 },
        check: (g) => g.homestead.filter((i) => i.gridX < g.landSize && i.gridY < g.landSize).length >= g.landSize * g.landSize,
    },
    {
        id: 'collector', icon: '📚', title: 'Botanist', description: 'Unlock every flora species.',
        reward: { sunlight: 300, coins: 30, xp: 150 },
        check: (g) => FLORA_SPECIES.every((sp) => g.unlockedSpecies.includes(sp.id)),
        progress: (g) => [g.unlockedSpecies.length, FLORA_SPECIES.length],
    },
]
