/**
 * Where mission-only finds come from, and where they lie in the village until picked up.
 *
 * Every find piggybacks on a mission that is already capped: each daily quest brings a care
 * item, the daily chest a care item or (with a pity counter) an ornament, each fulfilled
 * neighbour's request the resident's own care item and, once, their ornament, and each chapter
 * of the charter a rare ornament. There is no other source, so nothing here can be farmed.
 * A find never expires and no ornament ever arrives twice. Pure rules, like Progression.
 */
import type { GamificationData, Pickup, TreasureSource } from '../types/forest'
import {
    CARE_FOR,
    CHARTER_ORNAMENTS,
    CHEST_CARE,
    CHEST_ORNAMENTS,
    RESIDENT_ORNAMENT_HEARTS,
    RESIDENT_TREASURES,
    isCareItem,
} from '../assets/treasureCatalog'
import { buildGrid, kindAt, walkableTiles, type Tile } from '../render/villageGrid'
import { seededRandom } from './Progression'
import { heartNeed, heartTreeItem } from './HeartTree'

/** Finds shown lying in the village at once; the rest wait their turn (and are listed in the Journey). */
export const VISIBLE_PICKUPS = 4
/** The chance a daily chest holds an ornament... */
export const CHEST_ORNAMENT_CHANCE = 0.35
/** ...and the chest that always does, counting since the last one that did. */
export const CHEST_PITY = 3

/** Found already, or lying in the village waiting to be picked up. */
export function hasOrWaiting(g: Pick<GamificationData, 'ornaments' | 'pickups'>, itemId: string): boolean {
    return (g.ornaments ?? []).includes(itemId) || (g.pickups ?? []).some((p) => p.itemId === itemId)
}

/** Care items of a kind in the satchel plus those still waiting to be picked up. */
export function careHeld(g: Pick<GamificationData, 'satchel' | 'pickups'>, itemId: string): number {
    return (g.satchel?.[itemId] || 0) + (g.pickups ?? []).filter((p) => p.itemId === itemId).length
}

/**
 * The care item a finished quest brings: what the Heart Tree needs today when nothing for it is
 * held yet, otherwise whichever of the everyday items is running lowest.
 */
export function questCareItem(g: GamificationData, today: string): string {
    const needed = CARE_FOR[heartNeed(today)]
    if (g.heartTree && careHeld(g, needed) === 0) return needed
    const everyday = Object.values(CARE_FOR)
    return everyday.reduce((low, id) => (careHeld(g, id) < careHeld(g, low) ? id : low), everyday[0])
}

/**
 * What the daily chest holds: an ornament not found yet, by chance or by pity, and the salve
 * otherwise. Picked from the date and the chests opened, so it is the same on every device.
 */
export function chestTreasure(g: GamificationData, today: string): { itemId: string; ornament: boolean } {
    const pool = CHEST_ORNAMENTS.filter((id) => !hasOrWaiting(g, id))
    if (!pool.length) return { itemId: CHEST_CARE, ornament: false }
    const rand = seededRandom(`chest-${today}-${g.lifetimeStats.chestsOpened || 0}`)
    const lucky = rand() < CHEST_ORNAMENT_CHANCE
    if (!lucky && (g.chestPity || 0) < CHEST_PITY - 1) return { itemId: CHEST_CARE, ornament: false }
    return { itemId: pool[Math.floor(rand() * pool.length)], ornament: true }
}

/** What a resident leaves for a fulfilled request: their care item, and once, at ♥♥, their ornament. */
export function residentTreasures(g: GamificationData, residentId: string, heartsNow: number): string[] {
    const own = RESIDENT_TREASURES[residentId]
    if (!own) return []
    return heartsNow >= RESIDENT_ORNAMENT_HEARTS && !hasOrWaiting(g, own.ornament) ? [own.care, own.ornament] : [own.care]
}

/** Ornaments of chapters already signed that are neither found nor waiting (e.g. a save from before them). */
export function charterOrnamentsDue(g: GamificationData): string[] {
    const rank = Math.max(0, Math.floor(g.charter?.rank || 0))
    return CHARTER_ORNAMENTS.slice(0, rank).filter((id) => !hasOrWaiting(g, id))
}

export function makePickup(itemId: string, source: TreasureSource, today: string, extra: { residentId?: string; note?: string; id?: string } = {}): Pickup {
    const { id, ...rest } = extra
    return { id: id ?? `pk_${today}_${Math.random().toString(36).slice(2, 8)}`, itemId, source, on: today, ...rest }
}

export function visiblePickups(g: Pick<GamificationData, 'pickups'>): Pickup[] {
    return (g.pickups ?? []).slice(0, VISIBLE_PICKUPS)
}

/** Where each resident is usually found, so what they leave lies near it. */
const HAUNTS: Record<string, string[]> = {
    hollis: ['chicken_coop', 'garden_plot', 'hay_bale', 'scarecrow'],
    maren: ['greenhouse', 'garden_plot', 'gazebo'],
    ash: ['cabin', 'windmill', 'watermill', 'bench'],
    ida: ['gazebo', 'bench', 'stone_well', 'lantern'],
}

/**
 * The free tile each visible find lies on: on grass or a path, near the Heart Tree (or near
 * the resident who left it), never two on one tile. Worked out from the village each time, so
 * a find simply moves aside when something is built where it lay.
 */
export function pickupSpots(g: GamificationData): { pickup: Pickup; x: number; y: number }[] {
    const size = g.landSize
    const grid = buildGrid(g.homestead, size)
    const free = walkableTiles(grid).filter((t) => kindAt(grid, t.x, t.y) !== 'bridge')
    const placed = (ids: string[]) => {
        for (const id of ids) {
            const item = g.homestead.find((i) => i.itemType === 'building' && i.itemId === id && i.gridX < size && i.gridY < size)
            if (item) return { x: item.gridX, y: item.gridY }
        }
        return undefined
    }
    const heart = heartTreeItem(g)
    const home: Tile = heart ? { x: heart.gridX, y: heart.gridY } : placed(['campfire']) ?? { x: (size - 1) / 2, y: (size - 1) / 2 }
    const used = new Set<string>()
    const out: { pickup: Pickup; x: number; y: number }[] = []
    for (const pickup of visiblePickups(g)) {
        const anchor = (pickup.residentId && placed(HAUNTS[pickup.residentId] ?? [])) || home
        let best: Tile | null = null
        let bestScore = Infinity
        for (const t of free) {
            if (used.has(`${t.x},${t.y}`)) continue
            const score = (t.x - anchor.x) ** 2 + (t.y - anchor.y) ** 2 + seededRandom(`${pickup.id}|${t.x}|${t.y}`)() * 0.9
            if (score < bestScore) {
                best = t
                bestScore = score
            }
        }
        if (!best) break
        used.add(`${best.x},${best.y}`)
        out.push({ pickup, x: best.x, y: best.y })
    }
    return out
}

/** Satchel counts kept to known care items and whole, non-negative numbers. */
export function cleanSatchel(raw: unknown): Record<string, number> {
    const out: Record<string, number> = {}
    if (!raw || typeof raw !== 'object') return out
    for (const [id, n] of Object.entries(raw as Record<string, unknown>)) {
        const count = Math.floor(Number(n) || 0)
        if (isCareItem(id) && count > 0) out[id] = count
    }
    return out
}
