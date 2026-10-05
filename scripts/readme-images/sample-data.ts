/**
 * Hand-built sample state used only to render the README screenshots.
 * It represents a happy level-14 player a few weeks in.
 */
import { freshGamificationData } from '../../src/services/StorageManager'
import { ACHIEVEMENTS, addDays, dateKey, generateQuestBoard, xpForLevel } from '../../src/services/Progression'
import type { GamificationData, PlacedHomesteadItem, PlantedTree } from '../../src/types/forest'

type Row = [type: 'tree' | 'building', id: string, x: number, y: number, level?: number, crop?: [id: string, minutes: number]]

/** (x, y): x runs down-right, y runs down-left; higher x+y is closer to the viewer. */
export const VILLAGE: Row[] = [
    // back edge: tall things live here so they never hide anything
    ['tree', 'sakura', 1, 0, 3],
    ['tree', 'ancient_oak', 3, 0, 3],
    ['tree', 'classic_pine', 5, 0, 2],
    ['building', 'windmill', 6, 0, 4],
    ['tree', 'autumn_maple', 0, 1, 3],
    ['building', 'greenhouse', 2, 1, 3],
    ['tree', 'classic_pine', 7, 1, 3],
    // kitchen garden behind the windmill, watched by a scarecrow
    ['building', 'scarecrow', 4, 1, 2],
    ['building', 'garden_plot', 5, 1, 1, ['carrot', 50]],
    ['building', 'garden_plot', 6, 1, 1, ['tomato', 70]],
    ['building', 'garden_plot', 5, 2, 1, ['wheat', 130]],
    ['building', 'garden_plot', 6, 2, 1, ['pumpkin', 250]],
    // village core
    ['building', 'cabin', 1, 2, 4],
    ['building', 'stone_well', 4, 2, 3],
    ['tree', 'golden_tree', 7, 2, 2],
    ['tree', 'lavender', 0, 3, 2],
    ['building', 'bench', 2, 3, 2],
    ['tree', 'willow', 5, 3, 2],
    ['tree', 'bamboo', 6, 3, 2],
    ['tree', 'sunflower', 1, 4, 1],
    ['building', 'chicken_coop', 0, 4, 2],
    ['building', 'hay_bale', 7, 4],
    ['building', 'lantern', 2, 4, 2],
    ['building', 'campfire', 4, 4, 3],
    ['building', 'watermill', 5, 4, 3],
    // cobblestone spine from the greenhouse to the torii gate
    ['building', 'cobblestone_path', 3, 1],
    ['building', 'cobblestone_path', 3, 2],
    ['building', 'cobblestone_path', 3, 3],
    ['building', 'cobblestone_path', 4, 3],
    ['building', 'cobblestone_path', 3, 4],
    // river across the front with a footbridge
    ['building', 'water_stream', 0, 5],
    ['building', 'water_stream', 1, 5],
    ['building', 'water_stream', 2, 5],
    ['building', 'bridge', 3, 5],
    ['building', 'water_stream', 4, 5],
    ['building', 'water_stream', 5, 5],
    ['building', 'water_stream', 6, 5],
    ['building', 'water_stream', 7, 5],
    // front bank
    ['building', 'cobblestone_path', 3, 6],
    ['tree', 'mushroom_circle', 1, 6, 2],
    ['building', 'gazebo', 5, 6, 3],
    ['tree', 'autumn_maple', 7, 6, 3],
    ['building', 'torii_gate', 3, 7, 3],
    ['tree', 'sakura', 0, 7, 3],
    ['tree', 'lavender', 2, 6, 2],
    ['tree', 'sunflower', 4, 7, 1],
    ['tree', 'classic_pine', 6, 7, 2],
]

export function village(overrides: Partial<GamificationData> = {}): GamificationData {
    const g = freshGamificationData()
    g.landSize = 8
    g.xp = xpForLevel(14) + 260
    g.sunlight = 1840
    g.coins = 212
    g.vitality = 92
    g.streak = { current: 23, longest: 31, lastCheckInDate: dateKey(), shieldMonth: '', shieldsUsed: 0 }
    g.unlockedBiomes = ['meadow', 'sakura_garden', 'autumn_valley', 'alpine_frost', 'twilight_moss']
    g.unlockedSpecies = ['classic_pine', 'sunflower', 'ancient_oak', 'lavender', 'autumn_maple', 'sakura', 'willow', 'bamboo', 'bonsai', 'mushroom_circle']
    g.selectedSpeciesId = 'sakura'
    g.homestead = VILLAGE.map(([itemType, itemId, gridX, gridY, level, crop], i): PlacedHomesteadItem => ({
        id: `s${i}`, itemType, itemId, gridX, gridY, level: level ?? 1,
        ...(crop ? { cropId: crop[0], cropGrowth: crop[1] } : {}),
    }))
    g.unlockedBuildings = Array.from(new Set(g.homestead.filter((i) => i.itemType === 'building').map((i) => i.itemId)))
    g.inventory = { 'tree:sakura': 2, 'tree:ancient_oak': 1, 'building:lantern': 1 }
    g.achievements = ACHIEVEMENTS.map((a) => a.id).filter((id) => !['trees_200', 'streak_30', 'hours_100', 'tasks_100', 'collector'].includes(id))
    g.lifetimeStats = {
        totalFocusMinutes: 4380, totalPomodoros: 171, treesGrown: 168, treesWithered: 9, earlyHarvests: 12,
        tasksCompleted: 142, breaksCompleted: 133, questsCompleted: 61, chestsOpened: 24, cropsHarvested: 37,
    }

    // A believable last five weeks of activity for the grove heat-map
    const today = dateKey()
    const pattern = [4, 5, 3, 0, 4, 6, 2, 4, 4, 5, 4, 3, 0, 4, 5, 4, 6, 4, 3, 4, 4, 5, 2, 4, 5, 4, 4, 3, 0, 4, 5, 4, 4, 2, 3]
    const species = ['classic_pine', 'sakura', 'ancient_oak', 'autumn_maple', 'bonsai', 'lavender', 'sunflower']
    const notes = ['Write chapter 3 draft', 'Review pull request', 'Read: Deep Work ch. 4', 'Plan the week', 'Fix login bug', 'Research notes', 'Inbox zero']
    pattern.forEach((count, i) => {
        const date = addDays(today, i - (pattern.length - 1))
        if (!count) return
        const trees: PlantedTree[] = Array.from({ length: count }, (_, k) => ({
            id: `${date}-${k}`,
            speciesId: species[(i + k * 2) % species.length],
            plantedAt: new Date(new Date(`${date}T09:00:00`).getTime() + k * 55 * 60000).toISOString(),
            durationMinutes: k === 2 ? 45 : 25,
            status: 'mature',
            taskText: notes[(i + k) % notes.length],
            notePath: k % 2 ? 'Projects/Thesis.md' : undefined,
        }))
        g.dailyLogs[date] = {
            date, trees, completedPomodoros: count, tasksCompleted: count + 1, breaksCompleted: count,
            totalMinutes: trees.reduce((a, t) => a + t.durationMinutes, 0),
        }
    })

    // Today, mid-progress: one quest still open
    const board = generateQuestBoard(today, 4, 25)
    board.quests[0].progress = board.quests[0].target; board.quests[0].claimed = true
    board.quests[1].progress = Math.max(1, board.quests[1].target - 1)
    board.quests[2].progress = 0
    g.questBoard = board
    return { ...g, ...overrides }
}
