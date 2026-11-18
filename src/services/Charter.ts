/**
 * The Village Charter: the long arc of the game. The settlement rises through named ranks,
 * and each rank is earned by a chapter of a few concrete goals drawn from what you already
 * do (trees, tasks, streaks, crops, neighbours' requests…).
 *
 * Goals read lifetime totals and the village as it stands, so a player who has done the work
 * before the charter existed gets the credit for it. A goal once met stays met, and a rank
 * once reached is never taken away. Pure rules, like Progression.
 */
import type { GamificationData } from '../types/forest'
import { villageCharm, type BaseReward } from './Progression'
import { MAX_HEARTS, RESIDENTS, hearts } from './Neighbours'
import { reachedIslands } from './Islands'

export interface CharterRank {
    name: string
    /** One line about what the settlement is like at this rank. */
    blurb: string
}

export const CHARTER_RANKS: CharterRank[] = [
    { name: 'Clearing', blurb: 'A campfire in the woods, and the start of something.' },
    { name: 'Hamlet', blurb: 'A handful of homes and a signpost pointing your way.' },
    { name: 'Village', blurb: 'Neighbours, a notice board, and a place people choose to stay.' },
    { name: 'Market Town', blurb: 'Market days, busy lanes and news from the road.' },
    { name: 'Town', blurb: 'A clock that keeps the hours you have put in.' },
    { name: 'Borough', blurb: 'A hall, a charter on the wall, and a name people know.' },
    { name: 'City', blurb: 'Everything here was grown one focused session at a time.' },
]

export interface CharterGoal {
    id: string
    label: string
    /** [where you are, where the goal is]. */
    progress: (g: GamificationData) => [number, number]
}

export interface CharterChapter {
    title: string
    story: string
    goals: CharterGoal[]
    reward: BaseReward
}

const stats = (g: GamificationData) => g.lifetimeStats

// Goal makers, so every chapter reads like a short list
const trees = (id: string, n: number): CharterGoal => ({ id, label: `Grow ${n} trees`, progress: (g) => [stats(g).treesGrown, n] })
const hours = (id: string, n: number): CharterGoal => ({
    id, label: `Focus for ${n} hours in all`, progress: (g) => [Math.floor(stats(g).totalFocusMinutes / 60), n],
})
const tasks = (id: string, n: number): CharterGoal => ({
    id, label: `Check off ${n} tasks (board cards count)`, progress: (g) => [stats(g).tasksCompleted, n],
})
const streak = (id: string, n: number): CharterGoal => ({
    id, label: `Focus ${n} days in a row, at any point`, progress: (g) => [g.streak.longest, n],
})
const crops = (id: string, n: number): CharterGoal => ({ id, label: `Harvest ${n} crops`, progress: (g) => [stats(g).cropsHarvested || 0, n] })
const charm = (id: string, n: number): CharterGoal => ({ id, label: `Reach ${n} village charm`, progress: (g) => [villageCharm(g.homestead), n] })
const requests = (id: string, n: number): CharterGoal => ({
    id, label: `Fulfil ${n} neighbours’ requests`, progress: (g) => [stats(g).requestsFulfilled || 0, n],
})
const placed = (g: GamificationData, itemType: 'tree' | 'building', itemId?: string) =>
    g.homestead.filter((i) => i.itemType === itemType && (!itemId || i.itemId === itemId) && (!!i.island || (i.gridX < g.landSize && i.gridY < g.landSize))).length

export const CHARTER_CHAPTERS: CharterChapter[] = [
    {
        title: 'Putting down roots',
        story: 'A fire, a few trees, and the first jobs done. Enough to call it a hamlet.',
        goals: [
            trees('roots_trees', 5),
            { id: 'roots_planted', label: 'Plant 3 trees in your village', progress: (g) => [placed(g, 'tree'), 3] },
            tasks('roots_tasks', 5),
            { id: 'roots_well', label: 'Build a Village Well', progress: (g) => [Math.min(1, placed(g, 'building', 'stone_well')), 1] },
        ],
        reward: { sunlight: 120, coins: 15, xp: 60 },
    },
    {
        title: 'A place to stay',
        story: 'Steady days, a first harvest, errands run. People start to settle.',
        goals: [
            trees('stay_trees', 20),
            streak('stay_streak', 3),
            crops('stay_crops', 5),
            { id: 'stay_quests', label: 'Complete 10 daily quests', progress: (g) => [stats(g).questsCompleted, 10] },
            charm('stay_charm', 30),
        ],
        reward: { sunlight: 200, coins: 25, xp: 100 },
    },
    {
        title: 'Market day',
        story: 'Real hours of work behind you, and land to spare. Traders begin to call.',
        goals: [
            hours('market_hours', 25),
            streak('market_streak', 7),
            tasks('market_tasks', 50),
            { id: 'market_chests', label: 'Open 10 daily chests', progress: (g) => [stats(g).chestsOpened, 10] },
            { id: 'market_land', label: 'Expand your land to 6×6', progress: (g) => [g.landSize >= 6 ? 1 : 0, 1] },
        ],
        reward: { sunlight: 300, coins: 40, xp: 150 },
    },
    {
        title: 'Lamps along the lane',
        story: 'A hundred trees, a well-kept village and neighbours who count on you.',
        goals: [
            trees('lamps_trees', 100),
            hours('lamps_hours', 50),
            crops('lamps_crops', 30),
            {
                id: 'lamps_upgrade', label: 'Upgrade a building to ★★★',
                progress: (g) => [Math.min(3, Math.max(0, ...g.homestead.filter((i) => i.itemType === 'building').map((i) => i.level))), 3],
            },
            requests('lamps_requests', 5),
        ],
        reward: { sunlight: 400, coins: 50, xp: 200 },
    },
    {
        title: 'A seat of the shire',
        story: 'Months of steady work. The town is ready to govern itself.',
        goals: [
            trees('shire_trees', 200),
            hours('shire_hours', 100),
            streak('shire_streak', 14),
            charm('shire_charm', 150),
            {
                id: 'shire_friend', label: `Become a dear friend of a neighbour (${'♥'.repeat(MAX_HEARTS)})`,
                progress: (g) => [Math.max(0, ...RESIDENTS.map((r) => hearts(g, r.id))), MAX_HEARTS],
            },
        ],
        reward: { sunlight: 500, coins: 60, xp: 250 },
    },
    {
        title: 'The grove city',
        story: 'The last chapter: a city grown entirely from focus.',
        goals: [
            hours('city_hours', 200),
            streak('city_streak', 30),
            tasks('city_tasks', 300),
            requests('city_requests', 25),
            { id: 'city_species', label: 'Unlock 10 flora species', progress: (g) => [g.unlockedSpecies.length, 10] },
        ],
        reward: { sunlight: 700, coins: 80, xp: 350 },
    },
]

// ---------------------------------------------------------------------------
// After the last rank: the charter goes on
// ---------------------------------------------------------------------------

const LEGACY_CHAPTERS: { title: string; story: string }[] = [
    { title: 'Roads over the water', story: 'The city is built. Now it reaches outward, one bridge at a time.' },
    { title: 'A name across the sea', story: 'Other shores know your city by the work that comes out of it.' },
    { title: 'The long season', story: 'No rush left in it: the same steady days, and more of them.' },
    { title: 'Keepers of the map', story: 'Every island on it stands for something you chose to get good at.' },
]

/**
 * The chapter that follows the `n` already signed past the last rank (from 0). Its goals are
 * the same lifetime totals as before, a step further each time, plus the archipelago: there is
 * always a next chapter, and each one is as reachable as the last.
 */
export function legacyChapter(n: number): CharterChapter {
    const k = n + 1
    const text = LEGACY_CHAPTERS[n % LEGACY_CHAPTERS.length]
    const isles = Math.ceil(k / 2)
    return {
        title: text.title,
        story: text.story,
        goals: [
            hours(`legacy${k}_hours`, 200 + 50 * k),
            tasks(`legacy${k}_tasks`, 300 + 75 * k),
            requests(`legacy${k}_requests`, 25 + 10 * k),
            { id: `legacy${k}_isles`, label: `Reach ${isles} island${isles === 1 ? '' : 's'} by bridge`, progress: (g) => [reachedIslands(g).length, isles] },
            {
                id: `legacy${k}_mastery`, label: `Hold ${2 * k} levels of island mastery in all`,
                progress: (g) => [reachedIslands(g).reduce((sum, i) => sum + i.level, 0), 2 * k],
            },
        ],
        reward: { sunlight: Math.min(1500, 700 + 50 * k), coins: Math.min(150, 80 + 5 * k), xp: Math.min(800, 350 + 25 * k) },
    }
}

/** Chapters signed past the last rank. */
export function charterLegacy(g: Pick<GamificationData, 'charter'>): number {
    return Math.max(0, Math.floor(g.charter?.legacy || 0))
}

/** The last rank with its stars: "City", "City ★2". */
export function legacyRankName(stars: number): string {
    const city = CHARTER_RANKS[CHARTER_RANKS.length - 1].name
    return stars > 0 ? `${city} ★${stars}` : city
}

/** The chapter being worked on. There always is one. */
export function currentChapter(g: GamificationData): CharterChapter {
    return CHARTER_CHAPTERS[charterRank(g)] ?? legacyChapter(charterLegacy(g))
}

export interface GoalStatus {
    goal: CharterGoal
    current: number
    target: number
    done: boolean
}

export interface CharterStatus {
    rank: number
    rankName: string
    /** The chapter being worked on. Past the last rank the chapters carry on (`legacy`). */
    chapter: CharterChapter
    nextRankName: string
    /** Past the last rank: the stars earned so far. Null while the ranks are still being climbed. */
    legacy: number | null
    /** The chapter's number, counting on past the last rank. */
    chapterNumber: number
    goals: GoalStatus[]
    done: number
    total: number
}

/** The rank the charter state holds, kept within the known ranks. */
export function charterRank(g: GamificationData): number {
    return Math.max(0, Math.min(CHARTER_CHAPTERS.length, Math.floor(g.charter?.rank || 0)))
}

export function goalStatus(g: GamificationData, goal: CharterGoal): GoalStatus {
    const [current, target] = goal.progress(g)
    const done = current >= target || !!g.charter?.met?.includes(goal.id)
    return { goal, current: done ? Math.max(current, target) : current, target, done }
}

export function charterStatus(g: GamificationData): CharterStatus {
    const rank = charterRank(g)
    const ranked = rank < CHARTER_CHAPTERS.length
    const stars = charterLegacy(g)
    const chapter = currentChapter(g)
    const goals = chapter.goals.map((goal) => goalStatus(g, goal))
    return {
        rank,
        rankName: ranked ? CHARTER_RANKS[rank].name : legacyRankName(stars),
        chapter,
        nextRankName: ranked ? CHARTER_RANKS[rank + 1].name : legacyRankName(stars + 1),
        legacy: ranked ? null : stars,
        chapterNumber: rank + (ranked ? 0 : stars) + 1,
        goals,
        done: goals.filter((s) => s.done).length,
        total: goals.length,
    }
}

/** Every goal of the current chapter is met: the village is ready to rank up. */
export function chapterComplete(g: GamificationData): boolean {
    const status = charterStatus(g)
    return status.done === status.total
}

/** The resident who moves in when the village reaches `rank`, if any. */
export function residentJoining(rank: number) {
    return RESIDENTS.find((r) => r.joinsAtRank === rank && rank > 0)
}

