/**
 * The village's residents and the small personal requests they pin up.
 *
 * Every request is met by real work (focus minutes, finished trees, ticked tasks, breaks,
 * harvests), counted only from the day it was pinned. At most one new request arrives per day,
 * only after a finished session, and only while there is a free slot, so declining one or
 * leaving it be never costs anything: nothing expires. Each fulfilled request earns a heart
 * with that resident; hearts bring a lasting keepsake and, at the end, a gift.
 * Pure rules, like Progression.
 */
import type { GamificationData, PerkKind, RequestKind, VillagerRequest } from '../types/forest'
import { GARDEN_PLOT_ID, getSpecies } from '../assets/floraCatalog'
import { addDays, perkValue, seededRandom, type BaseReward } from './Progression'

export interface Keepsake {
    kind: PerkKind
    value: number
    /** How it shows on a reward card. */
    label: string
    /** What it does, in a sentence. */
    text: string
}

export interface Resident {
    id: string
    name: string
    role: string
    /** The villager sprite that is this resident in the village scene. */
    variant: number
    /** The charter rank at which they move in. */
    joinsAtRank: number
    kinds: RequestKind[]
    /** A species they like, and give as a sapling once you are dear friends. */
    favourite: string
    keepsake: Keepsake
}

export const RESIDENTS: Resident[] = [
    {
        id: 'hollis', name: 'Hollis', role: 'the farmer', variant: 0, joinsAtRank: 0,
        kinds: ['harvest', 'trees', 'minutes', 'tasks'], favourite: 'sunflower',
        keepsake: { kind: 'first_tree_coins', value: 2, label: '🍎 Apples from Hollis', text: '+2 Coins with your first tree of the day' },
    },
    {
        id: 'maren', name: 'Maren', role: 'the gardener', variant: 1, joinsAtRank: 1,
        kinds: ['species', 'tag', 'trees', 'harvest'], favourite: 'sakura',
        keepsake: { kind: 'crop_growth_pct', value: 10, label: '🪴 Maren’s watering', text: 'Crops grow 10% faster' },
    },
    {
        id: 'ash', name: 'Ash', role: 'the woodsman', variant: 2, joinsAtRank: 2,
        kinds: ['long', 'minutes', 'species', 'cards'], favourite: 'ancient_oak',
        keepsake: { kind: 'long_session_sunlight_pct', value: 10, label: '🪓 Ash’s know-how (long session)', text: '+10% Sunlight on sessions of 45m or more' },
    },
    {
        id: 'ida', name: 'Ida', role: 'the elder', variant: 3, joinsAtRank: 3,
        kinds: ['breaks', 'tag', 'tasks', 'long'], favourite: 'bonsai',
        keepsake: { kind: 'break_sunlight', value: 3, label: '🫖 Tea with Ida', text: '+3 Sunlight for every finished break' },
    },
]

export function getResident(id: string): Resident | undefined {
    return RESIDENTS.find((r) => r.id === id)
}

export const MAX_HEARTS = 5
/** Hearts at which a resident's keepsake starts to work. */
export const KEEPSAKE_HEARTS = 3
/** What a resident gives when you become dear friends (MAX_HEARTS). */
export const FRIEND_GIFT = { coins: 30, saplings: 2 }
/** Requests that can be open at once, before the Notice Board. */
export const BASE_REQUEST_SLOTS = 2

export function hearts(g: GamificationData, residentId: string): number {
    return Math.min(MAX_HEARTS, Math.max(0, Math.floor(g.friendship?.[residentId] || 0)))
}

/** Residents living in the village: one more moves in with each of the first charter ranks. */
export function residentsPresent(g: GamificationData): Resident[] {
    const rank = Math.max(0, Math.floor(g.charter?.rank || 0))
    return RESIDENTS.filter((r) => r.joinsAtRank <= rank)
}

/** The extra a perk gets from the keepsakes of residents you are close to. */
export function keepsakeValue(g: GamificationData, kind: PerkKind): number {
    return RESIDENTS.filter((r) => r.keepsake.kind === kind && hearts(g, r.id) >= KEEPSAKE_HEARTS).reduce((sum, r) => sum + r.keepsake.value, 0)
}

export function requestSlots(g: GamificationData): number {
    return BASE_REQUEST_SLOTS + perkValue(g.homestead, 'request_slots')
}

/** A plain request pays a little more than a daily quest; a request for longer focus a little more. */
export function requestReward(kind: RequestKind): BaseReward {
    return kind === 'minutes' || kind === 'long' || kind === 'tag' || kind === 'trees' ? { sunlight: 55, coins: 8, xp: 35 } : { sunlight: 40, coins: 6, xp: 25 }
}

/** Tags of trees grown in the last month, most used first. */
export function recentTags(g: GamificationData, today: string, days = 30): string[] {
    const counts = new Map<string, number>()
    for (let i = 0; i < days; i++) {
        for (const tree of g.dailyLogs[addDays(today, -i)]?.trees ?? []) {
            if (tree.status === 'withered') continue
            for (const tag of tree.tags ?? []) {
                const t = (tag.startsWith('#') ? tag : `#${tag}`).toLowerCase()
                counts.set(t, (counts.get(t) || 0) + 1)
            }
        }
    }
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t)
}

interface Params {
    target: number
    speciesName: string
    tag: string
    minMinutes: number
}

/** "a Cherry Blossom", "an Ancient Oak". */
const withArticle = (name: string) => `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`

const TITLES: Record<RequestKind, (p: Params) => string> = {
    species: (p) => `Grow ${withArticle(p.speciesName)}`,
    minutes: (p) => `Focus for ${p.target} minutes`,
    long: (p) => `One session of ${p.minMinutes}m or more`,
    tag: (p) => `Focus ${p.target} minutes on ${p.tag}`,
    tasks: (p) => `Check off ${p.target} tasks`,
    breaks: (p) => `Take ${p.target} proper breaks`,
    harvest: (p) => `Harvest ${p.target} crops`,
    cards: (p) => `Finish ${p.target} board cards`,
    trees: (p) => `Grow ${p.target} trees`,
}

/** How each resident puts it. */
const QUOTES: Record<string, Partial<Record<RequestKind, (p: Params) => string>>> = {
    hollis: {
        harvest: (p) => `Could you bring in ${p.target} crops from the plots? Market day is coming.`,
        trees: (p) => `${p.target} more trees for the orchard row, if you can spare the time.`,
        minutes: (p) => `Put in ${p.target} minutes of honest work and I’ll put the kettle on.`,
        tasks: (p) => `${p.target} small jobs off your list. Small jobs add up.`,
    },
    maren: {
        species: (p) => `Could you grow ${withArticle(p.speciesName)} for the square?`,
        tag: (p) => `Spend ${p.target} minutes on something ${p.tag}. I love hearing what you’re working on.`,
        trees: (p) => `${p.target} new trees would brighten up the lane.`,
        harvest: (p) => `Help me pick ${p.target} crops? The plots are heavy this year.`,
    },
    ash: {
        long: (p) => `One long, unbroken session: ${p.minMinutes} minutes or more. Like felling an oak.`,
        minutes: (p) => `${p.target} minutes of focus, any way you like. Steady strokes.`,
        species: (p) => `I’d like ${withArticle(p.speciesName)} by the path. Grow me one?`,
        cards: (p) => `Finish ${p.target} cards on your board. Clear the woodpile.`,
    },
    ida: {
        breaks: (p) => `Take ${p.target} proper breaks for me. Rest is part of the work.`,
        tag: (p) => `${p.target} minutes on something ${p.tag}, then come and tell me about it.`,
        tasks: (p) => `Tick off ${p.target} things, then sit with me a while.`,
        long: (p) => `Stay with one thing for ${p.minMinutes} minutes. The world can wait.`,
    },
}

const roundTo5 = (n: number) => Math.round(n / 5) * 5

/**
 * A new request from a resident who has none open, or null when nobody is free to ask.
 * Picked from the date and the requests so far, so it is the same on every device.
 */
export function makeRequest(g: GamificationData, today: string, workLen = 25): VillagerRequest | null {
    const free = residentsPresent(g).filter((r) => !g.requests.some((q) => q.residentId === r.id))
    if (!free.length) return null
    const rand = seededRandom(`request-${today}-${g.lifetimeStats.requestsFulfilled || 0}-${g.requests.length}`)
    const resident = free[Math.floor(rand() * free.length)]

    const species = g.unlockedSpecies.filter((id) => id !== g.selectedSpeciesId && getSpecies(id))
    const tags = recentTags(g, today)
    const available: Record<RequestKind, boolean> = {
        species: species.length > 0,
        tag: tags.length > 0,
        harvest: g.homestead.some((i) => i.itemType === 'building' && i.itemId === GARDEN_PLOT_ID),
        cards: Object.keys(g.boards || {}).length > 0,
        minutes: true, long: true, tasks: true, breaks: true, trees: true,
    }
    const kinds = resident.kinds.filter((k) => available[k])
    const kind = kinds.length ? kinds[Math.floor(rand() * kinds.length)] : 'minutes'

    const work = Math.max(5, workLen || 25)
    const speciesId =
        kind === 'species'
            ? species.includes(resident.favourite) && rand() < 0.5
                ? resident.favourite
                : species[Math.floor(rand() * species.length)]
            : undefined
    const tag = kind === 'tag' ? tags[Math.floor(rand() * Math.min(3, tags.length))] : undefined
    const targets: Record<RequestKind, number> = {
        species: 1,
        minutes: roundTo5(Math.max(60, work * 3)),
        long: 1,
        tag: roundTo5(Math.max(40, work * 2)),
        tasks: 4,
        breaks: 2,
        harvest: 3,
        cards: 2,
        trees: 3,
    }
    const p: Params = { target: targets[kind], speciesName: speciesId ? getSpecies(speciesId)?.name ?? speciesId : '', tag: tag ?? '', minMinutes: 45 }
    const quote = QUOTES[resident.id]?.[kind]?.(p) ?? `${TITLES[kind](p)}, if you have a moment?`
    return {
        id: `req_${today}_${resident.id}`,
        residentId: resident.id,
        kind,
        title: TITLES[kind](p),
        quote,
        target: p.target,
        progress: 0,
        ...(speciesId ? { speciesId } : {}),
        ...(tag ? { tag } : {}),
        ...(kind === 'long' ? { minMinutes: p.minMinutes } : {}),
        postedOn: today,
        reward: requestReward(kind),
    }
}
