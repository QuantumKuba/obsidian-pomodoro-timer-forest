/**
 * The Heart Tree: one planted tree the player chooses to look after.
 *
 * Each day it has one small need (water, nourish or tend), met with a care item from the
 * satchel. Meeting it adds a point of bond and leaves a blessing on the next session. The
 * bond grows the tree through five stages; it never goes down, and a day without care is
 * simply a day it waits. The progress belongs to the player, not to the tree: choosing
 * another tree takes the bond, the stage and the ornaments along. Pure rules, like Progression.
 */
import type { CareNeed, GamificationData, HeartTreeState, PlacedHomesteadItem } from '../types/forest'
import { CARE_FOR, CARE_ITEMS } from '../assets/treasureCatalog'

export interface HeartStage {
    name: string
    /** Bond needed to reach it. */
    bond: number
    /** How much larger the tree stands in the village. */
    scale: number
    /** Ornaments it can carry. */
    slots: number
    /** +% Sunlight on every session while it stands in the village. */
    sunlightPct: number
    /** A soft light about it. */
    aura: boolean
    blurb: string
}

export const HEART_STAGES: HeartStage[] = [
    { name: 'Young', bond: 0, scale: 1, slots: 1, sunlightPct: 2, aura: false, blurb: 'Newly chosen. It already knows your step.' },
    { name: 'Rooted', bond: 5, scale: 1.07, slots: 2, sunlightPct: 4, aura: false, blurb: 'Roots down, branches out. It has settled in.' },
    { name: 'Venerable', bond: 14, scale: 1.14, slots: 3, sunlightPct: 6, aura: false, blurb: 'People slow down as they pass it.' },
    { name: 'Ancient', bond: 30, scale: 1.21, slots: 4, sunlightPct: 8, aura: true, blurb: 'It seems to hold the light a little longer than the rest.' },
    { name: 'Elder', bond: 50, scale: 1.28, slots: 5, sunlightPct: 10, aura: true, blurb: 'The heart of the village, and of the work done in it.' },
]

/** +% Sunlight a met need leaves on the next session. */
export const HEART_BLESSING_PCT = 10

export const NEEDS: Record<CareNeed, { label: string; ask: string; done: string }> = {
    water: { label: 'Water', ask: 'a drink of Spring Water', done: 'drank deeply' },
    nourish: { label: 'Nourish', ask: 'some Leaf-mould at its roots', done: 'is well fed' },
    tend: { label: 'Tend', ask: 'a wandering branch tied in', done: 'is neatly tended' },
}

const NEED_ORDER: CareNeed[] = ['water', 'nourish', 'tend']

/** The day's need, picked from the date so it is the same on every device. */
export function heartNeed(day: string): CareNeed {
    let h = 2166136261
    for (let i = 0; i < day.length; i++) {
        h ^= day.charCodeAt(i)
        h = Math.imul(h, 16777619)
    }
    h ^= h >>> 13
    h = Math.imul(h, 0x5bd1e995)
    h ^= h >>> 15
    return NEED_ORDER[(h >>> 0) % NEED_ORDER.length]
}

export function heartStageIndex(bond: number): number {
    let index = 0
    HEART_STAGES.forEach((s, i) => {
        if (bond >= s.bond) index = i
    })
    return index
}

export function heartStage(g: Pick<GamificationData, 'heartTree'>): HeartStage {
    return HEART_STAGES[heartStageIndex(g.heartTree?.bond ?? 0)]
}

export function nextHeartStage(bond: number): HeartStage | null {
    return HEART_STAGES[heartStageIndex(bond) + 1] ?? null
}

/** The Heart Tree as it stands in the village, or undefined while none is chosen or it is stowed. */
export function heartTreeItem(g: Pick<GamificationData, 'heartTree' | 'homestead' | 'landSize'>): PlacedHomesteadItem | undefined {
    const id = g.heartTree?.itemId
    if (!id) return undefined
    return g.homestead.find((i) => i.id === id && i.itemType === 'tree' && i.gridX < g.landSize && i.gridY < g.landSize)
}

export function tendedToday(g: Pick<GamificationData, 'heartTree'>, today: string): boolean {
    return g.heartTree?.tendedOn === today
}

/** The satchel item that would meet `need`: its own care item first, the salve otherwise. */
export function careFor(g: Pick<GamificationData, 'satchel'>, need: CareNeed): string | null {
    if ((g.satchel?.[CARE_FOR[need]] || 0) > 0) return CARE_FOR[need]
    const any = CARE_ITEMS.find((c) => c.meets === 'any' && (g.satchel?.[c.id] || 0) > 0)
    return any ? any.id : null
}

/** +% Sunlight on every session: the stage's perk, while the tree stands in the village. */
export function heartPerkPct(g: GamificationData): number {
    return heartTreeItem(g) ? heartStage(g).sunlightPct : 0
}

export function heartSlots(g: Pick<GamificationData, 'heartTree'>): number {
    return g.heartTree ? heartStage(g).slots : 0
}

export function newHeartTree(item: PlacedHomesteadItem, today: string): HeartTreeState {
    return { itemId: item.id, speciesId: item.itemId, bond: 0, tendedOn: '', blessing: false, hung: [], chosenOn: today }
}
