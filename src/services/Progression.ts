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
    RewardLine,
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
        case 'crop_growth_pct':
            return `Crops grow ${v}% faster`
        case 'first_tree_coins':
            return `+${v} Coins with your first tree of the day`
    }
}

export function upgradeCost(building: HomesteadBuilding, currentLevel: number): { sunlight: number; coins: number } {
    return {
        sunlight: Math.max(20, Math.round(building.sunlightCost * 0.6 * currentLevel)),
        coins: Math.max(2, Math.round(building.coinsCost * 0.6 * currentLevel)),
    }
}

// ---------------------------------------------------------------------------
// Session rewards
// ---------------------------------------------------------------------------

export type BaseReward = { sunlight: number; coins: number; xp: number }

/** What a fully grown tree pays before streak and building bonuses. */
export function sessionBaseReward(minutes: number): BaseReward {
    return {
        sunlight: Math.max(5, Math.round(minutes * 1.2)),
        coins: Math.max(1, Math.floor(minutes / 10)),
        xp: minutes,
    }
}

/**
 * Share of the per-minute session reward paid when the focused task is done and the session
 * is harvested before the timer ends. Below 1, so for every minute on the clock finishing the
 * session always pays more: harvesting early can't be used to farm rewards with short tasks.
 */
export const EARLY_HARVEST_RATE = 0.75

/** Focus needed before an early harvest grows anything: 5 minutes, or half of a shorter session. */
export function earlyHarvestMinMinutes(sessionMinutes: number): number {
    return Math.min(5, sessionMinutes / 2)
}

/** What an early harvest pays for the minutes actually focused, before streak and building bonuses. */
export function earlyHarvestBaseReward(focusedMinutes: number): BaseReward {
    const m = Math.max(0, focusedMinutes)
    return {
        sunlight: Math.round(m * 1.2 * EARLY_HARVEST_RATE),
        coins: Math.floor((m / 10) * EARLY_HARVEST_RATE),
        xp: Math.round(m * EARLY_HARVEST_RATE),
    }
}

/** Every checked-off task waters the garden: its crops grow as if this many minutes were focused. */
export const TASK_WATERING_MINUTES = 5

// ---------------------------------------------------------------------------
// Kanban boards
// ---------------------------------------------------------------------------

/**
 * A finished card was planned well when its pomodoros came within a quarter of the estimate
 * (at least one either way). Rewards planning honestly, not planning big.
 */
export function estimateOnTarget(actual: number, expected: number): boolean {
    if (expected <= 0 || actual <= 0) return false
    return Math.abs(actual - expected) <= Math.max(1, Math.round(expected * 0.25))
}

export interface CardCompletion {
    /** Pomodoros counted on the card, and the estimate. */
    actual: number
    expected: number
    /** `YYYY-MM-DD`, or '' without a due date. */
    due: string
    /** The timer was focused on the card while it was finished. */
    focused: boolean
    /** Every limited lane of the board is within its limit; null when no lane has one. */
    withinWip: boolean | null
    today: string
}

/**
 * What finishing a card pays before building perks. A card is a task with more behind it, so
 * it pays a little more, and most of that comes from the work done on it, not from the move.
 */
export function cardReward(c: CardCompletion): { coins: number; xp: number; lines: RewardLine[] } {
    let coins = 3
    let xp = 6
    const lines: RewardLine[] = [{ label: 'Card finished', coins: 3, xp: 6 }]
    if (c.actual > 0) {
        const bonus = Math.min(c.actual, 8) * 2
        coins += 2
        xp += bonus
        lines.push({ label: `🍅 ${c.actual} pomodoro${c.actual === 1 ? '' : 's'} of focus behind it`, coins: 2, xp: bonus })
    } else if (c.focused) {
        coins += 2
        lines.push({ label: '🍅 Finished while focusing on it', coins: 2 })
    }
    if (estimateOnTarget(c.actual, c.expected)) {
        xp += 4
        lines.push({ label: `🎯 Estimate on target (${c.actual}/${c.expected})`, xp: 4 })
    }
    if (c.due && c.today <= c.due) {
        coins += 2
        lines.push({ label: '📅 Done on time', coins: 2 })
    }
    if (c.withinWip) {
        xp += 2
        lines.push({ label: '🌊 Lanes within their limits', xp: 2 })
    }
    return { coins, xp, lines }
}

/** Cards finished on one board that are celebrated, and what each pays. */
export const BOARD_MILESTONES = [10, 25, 50, 100, 250, 500]

export function boardMilestoneReward(cards: number): BaseReward {
    return { sunlight: cards * 2, coins: Math.ceil(cards / 5), xp: cards }
}

/** Finishing every card on a board of at least this many cards counts as clearing it. */
export const BOARD_CLEAR_MIN_CARDS = 5
export const BOARD_CLEAR_REWARD: BaseReward = { sunlight: 30, coins: 4, xp: 25 }

/** How many finished cards the board statistics remember. */
export const BOARD_HISTORY_LIMIT = 60

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

/** Only offered to players who use Kanban boards. */
const BOARD_QUESTS: QuestTemplate[] = [
    { kind: 'cards', make: () => ({ title: 'Finish 2 cards on a board', target: 2 }) },
    { kind: 'card_focus', make: () => ({ title: 'Finish a card you focused on', target: 1 }) },
]

export function generateQuestBoard(date: string, dailyGoal: number, workLen: number, opts: { boards?: boolean } = {}): DailyQuestBoard {
    const rand = seededRandom(`quests-${date}`)
    // Always one "core" focus quest, then two others drawn from the rest.
    const core = rand() < 0.5 ? QUEST_POOL[0] : QUEST_POOL[1]
    const others = QUEST_POOL.filter((q) => q !== QUEST_POOL[0] && q !== QUEST_POOL[1])
    if (opts.boards) others.push(...BOARD_QUESTS)
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
        id: 'cards_1', icon: '📌', title: 'Off the Board', description: 'Finish your first card on a Kanban board.',
        reward: { sunlight: 20, coins: 3, xp: 15 }, check: (g) => (s(g).cardsCompleted || 0) >= 1, progress: (g) => [s(g).cardsCompleted || 0, 1],
    },
    {
        id: 'cards_25', icon: '🌊', title: 'Momentum', description: 'Finish 25 cards on your boards.',
        reward: { sunlight: 80, coins: 10, xp: 50 }, check: (g) => (s(g).cardsCompleted || 0) >= 25, progress: (g) => [s(g).cardsCompleted || 0, 25],
    },
    {
        id: 'cards_100', icon: '🚀', title: 'Throughput', description: 'Finish 100 cards on your boards.',
        reward: { sunlight: 250, coins: 30, xp: 140 }, check: (g) => (s(g).cardsCompleted || 0) >= 100, progress: (g) => [s(g).cardsCompleted || 0, 100],
    },
    {
        id: 'estimates_10', icon: '🎯', title: 'Calibrated', description: 'Finish 10 cards within their pomodoro estimate.',
        reward: { sunlight: 100, coins: 12, xp: 60 }, check: (g) => (s(g).cardsOnEstimate || 0) >= 10, progress: (g) => [s(g).cardsOnEstimate || 0, 10],
    },
    {
        id: 'board_clear', icon: '🧹', title: 'Clean Slate', description: `Finish every card on a board of ${BOARD_CLEAR_MIN_CARDS} or more.`,
        reward: { sunlight: 60, coins: 6, xp: 40 }, check: (g) => (s(g).boardsCleared || 0) >= 1,
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
        id: 'first_harvest', icon: '🧺', title: 'Green Thumb', description: 'Harvest your first crop from a garden plot.',
        reward: { sunlight: 30, coins: 3, xp: 20 }, check: (g) => (s(g).cropsHarvested || 0) >= 1, progress: (g) => [s(g).cropsHarvested || 0, 1],
    },
    {
        id: 'harvest_30', icon: '🌾', title: 'Market Day', description: 'Harvest 30 crops.',
        reward: { sunlight: 120, coins: 12, xp: 60 }, check: (g) => (s(g).cropsHarvested || 0) >= 30, progress: (g) => [s(g).cropsHarvested || 0, 30],
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
