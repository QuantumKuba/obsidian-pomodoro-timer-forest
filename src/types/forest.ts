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

export interface BuildingPerk {
    kind: PerkKind
    base: number
    perLevel: number
}

export interface HomesteadBuilding {
    id: string
    name: string
    description: string
    category: 'building' | 'landmark' | 'decoration' | 'path'
    sunlightCost: number
    coinsCost: number
    unlockLevel: number
    /** Buildings/landmarks are unique, decorations/paths can be bought many times. */
    unique: boolean
    maxLevel: number
    charm: number
    perk?: BuildingPerk
    iconSvg: string
}

export interface PlantedTree {
    id: string
    speciesId: string
    plantedAt: string // ISO string
    durationMinutes: number
    status: 'mature' | 'withered'
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
}

export interface DailyForestLog {
    date: string // YYYY-MM-DD
    trees: PlantedTree[]
    totalMinutes: number
    completedPomodoros: number
    tasksCompleted?: number
    breaksCompleted?: number
}

export type QuestKind =
    | 'sessions'
    | 'minutes'
    | 'tasks'
    | 'break'
    | 'linked_task'
    | 'village_action'
    | 'tagged_session'

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
    tagMappings: TagFloraMapping[]
    ambientSound: 'none' | 'rain' | 'forest_stream' | 'breeze'
    ambientVolume: number
    lifetimeStats: {
        totalFocusMinutes: number
        totalPomodoros: number
        treesGrown: number
        treesWithered: number
        tasksCompleted: number
        breaksCompleted: number
        questsCompleted: number
        chestsOpened: number
    }
    preferences: {
        hardcoreMode: boolean // withers tree if aborted
        enableCelebrationParticles: boolean
        ambientForestSounds: boolean
        logToDailyNoteWithDataview: boolean
    }
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
    kind: 'harvest' | 'wither' | 'task' | 'break' | 'quest' | 'chest' | 'achievement' | 'levelup'
    title: string
    subtitle?: string
    speciesId?: string
    sunlight: number
    coins: number
    xp: number
    lines: RewardLine[]
    levelUp?: number
    at: number
}
