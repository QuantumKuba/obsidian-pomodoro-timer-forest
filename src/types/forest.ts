import type { Settings } from '../Settings'

export type GrowthStage = 'seed' | 'sprout' | 'sapling' | 'mature' | 'withered'

export type BiomeType = 'meadow' | 'sakura_garden' | 'autumn_valley' | 'alpine_frost' | 'twilight_moss'

export interface TagFloraMapping {
    tag: string
    speciesId: string
}

export interface FloraSpecies {
    id: string
    name: string
    description: string
    category: 'tree' | 'flower' | 'rare' | 'zen'
    sunlightCost: number
    coinsCost: number
    unlockLevel: number
    recommendedDuration: number // minutes
    iconSvg: string
    color: string
    charm: number
}

export type PerkKind =
    | 'sunlight_pct' // +% sunlight on every focus session
    | 'coins_pct' // +% coins on every focus session
    | 'long_session_sunlight_pct' // +% sunlight on sessions >= 45m
    | 'streak_shield' // shields per month protecting the streak
    | 'xp_pct' // +% XP from all sources
    | 'quest_bonus_pct' // +% daily quest rewards
    | 'break_sunlight' // flat sunlight for finishing a break
    | 'vitality_keep_pct' // village fades % slower on missed days
    | 'task_coins' // flat extra coins per checked-off task
    | 'night_sunlight_pct' // +% sunlight for sessions finished 19:00–05:00
    | 'crop_growth_pct' // crops in garden plots grow % faster
    | 'first_tree_coins' // flat coins with the first tree of the day

export interface BuildingPerk {
    kind: PerkKind
    base: number
    perLevel: number
}

export interface HomesteadBuilding {
    id: string
    name: string
    description: string
    category: 'building' | 'landmark' | 'decoration' | 'path' | 'farm'
    sunlightCost: number
    coinsCost: number
    unlockLevel: number
    /** Buildings/landmarks are unique, decorations/paths can be bought many times. */
    unique: boolean
    /** Most copies of a repeatable item one village can own. */
    limit?: number
    maxLevel: number
    charm: number
    perk?: BuildingPerk
    iconSvg: string
}

/** Something to grow in a garden plot. Crops grow with focus minutes and never wither. */
export interface CropType {
    id: string
    name: string
    icon: string
    description: string
    /** Focus minutes from planting to harvest. */
    growMinutes: number
    coins: number
    xp: number
    unlockLevel: number
}

export interface PlantedTree {
    id: string
    speciesId: string
    plantedAt: string // ISO string
    durationMinutes: number
    /** `young`: harvested early because its task was done before the timer ended. */
    status: 'mature' | 'young' | 'withered'
    notePath?: string
    taskText?: string
    tags?: string[]
}

export interface PlacedHomesteadItem {
    id: string
    itemType: 'tree' | 'building'
    itemId: string // speciesId or buildingId
    gridX: number
    gridY: number
    level: number
    customName?: string
    /** Garden plots only: what is growing, and the focus minutes it has grown so far. */
    cropId?: string
    cropGrowth?: number
}

export interface DailyForestLog {
    date: string // YYYY-MM-DD
    trees: PlantedTree[]
    totalMinutes: number
    completedPomodoros: number
    tasksCompleted?: number
    breaksCompleted?: number
    /** Sessions ended early because their task was done; not counted in completedPomodoros. */
    earlyHarvests?: number
    /** Cards finished on Kanban boards (they count as tasks too). */
    cardsCompleted?: number
}

/** What a board lane is for: waiting, being worked on, or finished. */
export type BoardLaneRole = 'backlog' | 'active' | 'done'

/** What is remembered about a card on a board, to tell how long it has been waiting. */
export interface BoardCardMemory {
    /** The lane it is in, and the day it got there. */
    lane: string
    since: string
    /** The day it was first seen on the board. */
    seen: string
    /** The day it first entered an in-progress lane. */
    started?: string
}

/** A finished card, for the board's statistics. */
export interface BoardShipment {
    date: string
    /** Days from first in progress to done; null when it never sat in an in-progress lane. */
    days: number | null
    actual: number
    expected: number
    /** Finished by its due date; null without one. */
    onTime: boolean | null
}

/** Progress kept for one Kanban board, by the note's path. */
export interface BoardMemory {
    title: string
    cards: Record<string, BoardCardMemory>
    /** Cards finished on this board, ever. */
    shipped: number
    /** The most recent finished cards, oldest first. */
    history: BoardShipment[]
    /** Shipped-card milestones already celebrated. */
    milestones: number[]
    /** Lane roles chosen by hand, by lane title (otherwise read from the lane). */
    laneRoles?: Record<string, BoardLaneRole>
    /** The last day every card on the board was finished. */
    clearedOn?: string
}

export type QuestKind =
    | 'sessions'
    | 'minutes'
    | 'tasks'
    | 'break'
    | 'linked_task'
    | 'village_action'
    | 'tagged_session'
    | 'cards'
    | 'card_focus'

export interface DailyQuest {
    id: string
    kind: QuestKind
    title: string
    target: number
    progress: number
    rewardSunlight: number
    rewardCoins: number
    rewardXp: number
    claimed: boolean
}

export interface DailyQuestBoard {
    date: string
    quests: DailyQuest[]
    chestClaimed: boolean
}

export interface GamificationData {
    sunlight: number
    coins: number
    xp: number
    selectedSpeciesId: string
    activeBiome: BiomeType
    unlockedBiomes: BiomeType[]
    streak: {
        current: number
        longest: number
        lastCheckInDate: string // YYYY-MM-DD
        shieldMonth: string // YYYY-MM the shield counter belongs to
        shieldsUsed: number
    }
    unlockedSpecies: string[]
    unlockedBuildings: string[]
    /** Items waiting to be placed: `tree:<speciesId>` saplings and `building:<buildingId>` */
    inventory: Record<string, number>
    homestead: PlacedHomesteadItem[]
    landSize: number
    vitality: number
    lastVisitDate: string
    questBoard: DailyQuestBoard | null
    achievements: string[]
    rewardedTaskKeys: { date: string; keys: string[] }
    dailyLogs: Record<string, DailyForestLog>
    /** Kanban boards by note path. */
    boards: Record<string, BoardMemory>
    tagMappings: TagFloraMapping[]
    ambientSound: 'none' | 'rain' | 'forest_stream' | 'breeze'
    ambientVolume: number
    lifetimeStats: {
        totalFocusMinutes: number
        totalPomodoros: number
        treesGrown: number
        treesWithered: number
        earlyHarvests: number
        tasksCompleted: number
        breaksCompleted: number
        questsCompleted: number
        chestsOpened: number
        cropsHarvested: number
        cardsCompleted: number
        /** Cards finished within their pomodoro estimate. */
        cardsOnEstimate: number
        boardsCleared: number
    }
    preferences: {
        hardcoreMode: boolean // withers tree if aborted
        enableCelebrationParticles: boolean
        ambientForestSounds: boolean
        logToDailyNoteWithDataview: boolean
    }
}

/** JSON summary produced by the "copy dashboard JSON" export. */
export interface ForestExportPayload {
    $schema: string
    exportTimestamp: number
    pluginVersion: string
    village: {
        level: number
        xp: number
        landSize: number
        vitality: number
        activeBiome: BiomeType
    }
    activeBiome: BiomeType
    homestead: PlacedHomesteadItem[]
    streak: { current: number; longest: number; lastCheckInDate: string }
    lifetimeStats: GamificationData['lifetimeStats']
    achievements: string[]
    dailyLogsSummary: DailyForestLog[]
}

export interface PluginData {
    version: number
    settings: Settings
    gamification: GamificationData
}

export interface ActiveSessionPlant {
    speciesId: string
    startTime: number
    totalDurationMillis: number
    currentStage: GrowthStage
    progressRatio: number // 0.0 to 1.0
    taskText?: string
    notePath?: string
    /** Species was chosen by a #tag on the note or task */
    autoTagged?: boolean
}

export interface RewardLine {
    label: string
    sunlight?: number
    coins?: number
    xp?: number
}

/** A celebratory event shown in the UI (session harvest, task, quest, level-up…). */
export interface RewardEvent {
    id: string
    kind: 'harvest' | 'early' | 'wither' | 'task' | 'break' | 'crop' | 'quest' | 'chest' | 'achievement' | 'levelup'
    title: string
    subtitle?: string
    speciesId?: string
    sunlight: number
    coins: number
    xp: number
    lines: RewardLine[]
    levelUp?: number
    /** `<board path>::<card key>` when the event is about a card on a board. */
    ref?: string
    at: number
}
