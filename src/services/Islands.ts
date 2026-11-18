/**
 * The archipelago: islands beyond the home village, each standing for a part of the vault.
 *
 * An island is sighted, then charted (given a focus: a tag, a folder, a hub note, or simply
 * "any focus"), and then reached by a bridge that is built only by focusing on that subject.
 * Once reached it is land to build on, and it keeps growing with the minutes spent on its
 * subject (its mastery) and with the notes written about it (its library). There is always one
 * island on the horizon and no last island, so the game has no end to run into.
 *
 * Pure rules, like Progression: nothing here touches Obsidian or the stores.
 */
import type { BiomeType, GamificationData, Island, IslandFocus, PlacedHomesteadItem } from '../types/forest'
import { levelFromXp, type BaseReward } from './Progression'

// ---------------------------------------------------------------------------
// Sighting, bridges and mastery
// ---------------------------------------------------------------------------

/** The first island comes into view at this village level; each later one once the last is reached. */
export const ISLAND_SIGHT_LEVEL = 2

/** Focus minutes a bridge takes. Each is longer than the last, up to a ceiling that stays reachable. */
export function bridgeTarget(index: number): number {
    const n = Math.max(1, Math.floor(index))
    return Math.min(3000, Math.round((60 * n + 20 * n * n) / 25) * 25)
}

/** Total focus minutes on an island's subject to hold mastery `level`. No last level. */
export function masteryMinutes(level: number): number {
    return 30 * level * (level + 1)
}

export function masteryLevel(minutes: number): number {
    let level = 0
    while (masteryMinutes(level + 1) <= minutes) level++
    return level
}

export function masteryProgress(minutes: number): { level: number; into: number; needed: number; ratio: number } {
    const level = masteryLevel(minutes)
    const base = masteryMinutes(level)
    const needed = masteryMinutes(level + 1) - base
    const into = Math.max(0, minutes - base)
    return { level, into, needed, ratio: Math.min(1, into / needed) }
}

const MASTERY_TITLES = ['Landing', 'Foothold', 'Trailhead', 'Settlement', 'Haven', 'Stronghold', 'Sanctuary', 'Wonder']

/** A name for a mastery level; past the named ones it keeps counting. */
export function masteryTitle(level: number): string {
    return level < MASTERY_TITLES.length ? MASTERY_TITLES[level] : `${MASTERY_TITLES[MASTERY_TITLES.length - 1]} ${level - MASTERY_TITLES.length + 2}`
}

export const ISLAND_BASE_LAND = 4
export const ISLAND_MAX_LAND = 8
/** Mastery levels at which an island's land grows by a row and a column. */
export const ISLAND_LAND_LEVELS = [1, 3, 5, 8]

/** An island's land is not bought: it grows with the mastery of its subject. */
export function islandLandSize(level: number): number {
    return Math.min(ISLAND_MAX_LAND, ISLAND_BASE_LAND + ISLAND_LAND_LEVELS.filter((l) => level >= l).length)
}

/** Sunlight bonus (%) on sessions spent on a reached island's subject. Grows with mastery, gently capped. */
export function islandBoonPct(level: number): number {
    return Math.min(25, 5 + 2 * level)
}

export function reachReward(index: number): BaseReward {
    const n = Math.max(1, index)
    return { sunlight: Math.min(600, 80 + 40 * n), coins: Math.min(60, 8 + 4 * n), xp: Math.min(400, 60 + 30 * n) }
}

export function masteryReward(level: number): BaseReward {
    return { sunlight: Math.min(400, 30 * level), coins: Math.min(40, 3 * level), xp: Math.min(300, 20 * level) }
}

// ---------------------------------------------------------------------------
// The library: notes written about an island's subject
// ---------------------------------------------------------------------------

const LIBRARY_STEPS = [5, 10, 25, 50, 100, 200, 350, 500, 750, 1000]

/** The largest milestone at or below `notes` (0 before the first). Past 1000 there is one every 500. */
export function libraryMilestone(notes: number): number {
    if (notes >= 1000) return Math.floor(notes / 500) * 500
    let mark = 0
    for (const step of LIBRARY_STEPS) if (notes >= step) mark = step
    return mark
}

export function nextLibraryMilestone(mark: number): number {
    return LIBRARY_STEPS.find((step) => step > mark) ?? (Math.floor(mark / 500) + 1) * 500
}

export function libraryReward(milestone: number): BaseReward {
    return { sunlight: Math.min(300, 15 + milestone), coins: Math.min(30, 2 + Math.round(milestone / 10)), xp: Math.min(200, 10 + Math.round(milestone / 2)) }
}

// ---------------------------------------------------------------------------
// The map: where each island lies, and which biome it brings
// ---------------------------------------------------------------------------

/** An island edge, as seen on screen: lower-right, lower-left, upper-right, upper-left. */
export type IslandSide = 'se' | 'sw' | 'ne' | 'nw'

const SIDES: IslandSide[] = ['se', 'sw', 'ne', 'nw']
const OPPOSITE: Record<IslandSide, IslandSide> = { se: 'nw', sw: 'ne', ne: 'sw', nw: 'se' }
const SIDE_VECTOR: Record<IslandSide, [number, number]> = { se: [1, 0.5], sw: [-1, 0.5], ne: [1, -0.5], nw: [-1, -0.5] }

/** Islands lie on four arms reaching out from home; this is the arm (and the edge of home it leaves from). */
export function islandSide(index: number): IslandSide {
    return SIDES[(Math.max(1, index) - 1) % SIDES.length]
}

/** How far out along its arm an island lies: 1 for the four nearest. */
export function islandRing(index: number): number {
    return Math.ceil(Math.max(1, index) / SIDES.length)
}

/** The index of the island its bridge starts from; 0 for home. */
export function islandParent(index: number): number {
    return Math.max(0, index - SIDES.length)
}

/** Where an island lies on the map, in island-spacings from home (x right, y down). */
export function islandMapPosition(index: number): { x: number; y: number } {
    if (index <= 0) return { x: 0, y: 0 }
    const [dx, dy] = SIDE_VECTOR[islandSide(index)]
    const ring = islandRing(index)
    return { x: dx * ring, y: dy * ring }
}

/** New ground first: every other island brings a biome no village level unlocks. */
const BIOME_ORDER: BiomeType[] = ['coral_lagoon', 'sakura_garden', 'ember_highlands', 'autumn_valley', 'jade_marsh', 'alpine_frost', 'twilight_moss', 'meadow']

export function islandBiome(index: number): BiomeType {
    return BIOME_ORDER[(Math.max(1, index) - 1) % BIOME_ORDER.length]
}

// ---------------------------------------------------------------------------
// Focus: what an island stands for
// ---------------------------------------------------------------------------

/** `#Study/` → `#study`. Empty when nothing is left. */
export function cleanTag(raw: string): string {
    const tag = raw.trim().toLowerCase().replace(/^#+/, '').replace(/\/+$/, '').replace(/\s+/g, '-')
    return tag ? `#${tag}` : ''
}

/** `/Projects/Thesis/` → `Projects/Thesis`. */
export function cleanFolder(raw: string): string {
    return raw.trim().replace(/^\/+|\/+$/g, '')
}

/** One string per focus, to tell two of them apart. */
export function focusKey(focus: IslandFocus | null): string {
    if (!focus) return ''
    return focus.kind === 'any' ? 'any' : `${focus.kind}:${focus.kind === 'tag' ? focus.value.toLowerCase() : focus.value}`
}

const baseName = (path: string) => (path.split('/').pop() || path).replace(/\.md$/i, '')

/** How a focus reads in a sentence: `#study`, `Projects/Thesis`, `Health` (a note), `any focus`. */
export function focusLabel(focus: IslandFocus | null): string {
    if (!focus) return 'nothing yet'
    if (focus.kind === 'any') return 'any focus'
    if (focus.kind === 'note') return baseName(focus.value)
    return focus.value || 'the whole vault'
}

/** How to feed it, in a few words, for hints in the UI. */
export function focusHowTo(focus: IslandFocus | null): string {
    if (!focus) return 'Choose what this island stands for.'
    switch (focus.kind) {
        case 'tag':
            return `Start the timer on a task or note tagged ${focus.value}.`
        case 'folder':
            return `Start the timer on a note in ${focus.value || 'your vault'} (or on a task in one).`
        case 'note':
            return `Start the timer on ${baseName(focus.value)}, or on any note that links to it.`
        case 'any':
            return 'Every focus session counts, at half pace.'
    }
}

const OPEN_SEA_NAMES = ['Driftwood Isle', 'Lantern Rock', 'Heron Isle', 'Quiet Cove', 'Tidewater Isle', 'Skylark Rock', 'Amber Isle', 'Stillwater Isle']

const titleCase = (s: string) =>
    s.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/(^|\s)\S/g, (c) => c.toUpperCase())

/** A name made from what the island stands for: `#study/maths` → "Maths Isle". */
export function defaultIslandName(focus: IslandFocus | null, index: number): string {
    if (!focus) return 'Uncharted isle'
    if (focus.kind === 'any') return OPEN_SEA_NAMES[(Math.max(1, index) - 1) % OPEN_SEA_NAMES.length]
    const raw = focus.kind === 'tag' ? focus.value.replace(/^#/, '').split('/').pop() || '' : baseName(focus.value)
    const name = titleCase(raw).slice(0, 28)
    return name ? `${name} Isle` : OPEN_SEA_NAMES[(Math.max(1, index) - 1) % OPEN_SEA_NAMES.length]
}

export function islandName(island: Island): string {
    return island.name.trim() || defaultIslandName(island.focus, island.index)
}

/** What a focus session was about. */
export interface SessionContext {
    /** Lower case, with `#`. */
    tags: string[]
    notePath?: string
    /** Notes the session's note links to (resolved paths). */
    linked?: string[]
}

/** How much of a session counts for a focus: 1 on its subject, 0.5 for "any focus", 0 otherwise. */
export function focusRate(focus: IslandFocus | null, ctx: SessionContext): number {
    if (!focus) return 0
    switch (focus.kind) {
        case 'any':
            return 0.5
        case 'tag': {
            const want = focus.value.toLowerCase()
            return ctx.tags.some((t) => t === want || t.startsWith(`${want}/`)) ? 1 : 0
        }
        case 'folder': {
            if (!ctx.notePath) return 0
            return !focus.value || ctx.notePath.startsWith(`${focus.value}/`) ? 1 : 0
        }
        case 'note':
            return !!ctx.notePath && (ctx.notePath === focus.value || !!ctx.linked?.includes(focus.value)) ? 1 : 0
    }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export const isReached = (island: Island) => !!island.reachedOn

export function getIsland(g: Pick<GamificationData, 'islands'>, id: string | null | undefined): Island | undefined {
    return id ? g.islands?.find((i) => i.id === id) : undefined
}

export function reachedIslands(g: Pick<GamificationData, 'islands'>): Island[] {
    return (g.islands || []).filter(isReached)
}

/** The island on the horizon: sighted, and not reached yet. There is at most one. */
export function frontier(g: Pick<GamificationData, 'islands'>): Island | undefined {
    return (g.islands || []).find((i) => !isReached(i))
}

/** A new island comes into view when nothing is on the horizon and the village is old enough. */
export function shouldSight(g: Pick<GamificationData, 'islands' | 'xp'>): boolean {
    return !frontier(g) && levelFromXp(g.xp) >= ISLAND_SIGHT_LEVEL
}

/** The next island to sight. Everything about it follows from its index, so every device agrees. */
export function newIsland(g: Pick<GamificationData, 'islands'>, today: string): Island {
    const index = (g.islands || []).reduce((max, i) => Math.max(max, i.index), 0) + 1
    return { id: `isle_${index}`, index, name: '', biome: islandBiome(index), focus: null, bridge: 0, sightedOn: today, minutes: 0, level: 0, notes: 0, notesMark: 0 }
}

export function bridgeProgress(island: Island): { laid: number; target: number; ratio: number } {
    const target = bridgeTarget(island.index)
    const laid = isReached(island) ? target : Math.min(target, island.bridge)
    return { laid, target, ratio: target > 0 ? laid / target : 1 }
}

/** What stands on an island; the home village for `null`. */
export function itemsOn(g: Pick<GamificationData, 'homestead'>, id: string | null): PlacedHomesteadItem[] {
    return g.homestead.filter((i) => (i.island || null) === id)
}

export function landSizeOf(g: Pick<GamificationData, 'islands' | 'landSize'>, id: string | null): number {
    const island = getIsland(g, id)
    return island ? islandLandSize(island.level) : g.landSize
}

/**
 * The game as seen from one island: its own land, ground and items, everything else shared.
 * The scene renderer and the village tab work on this, so they need to know nothing of islands.
 */
export function islandView(g: GamificationData, id: string | null): GamificationData {
    const island = getIsland(g, id)
    if (!island || !isReached(island)) return { ...g, homestead: itemsOn(g, null) }
    return { ...g, homestead: itemsOn(g, island.id), landSize: islandLandSize(island.level), activeBiome: island.biome }
}

export interface IslandStep {
    island: Island
    /** Minutes that counted (after the focus rate). */
    added: number
    /** The bridge was finished by this step. */
    reached: boolean
    /** Mastery levels gained by this step, lowest first. */
    levels: number[]
}

/**
 * Lays focus minutes into the bridge being built and into the mastery of every reached island
 * the session was about. Changes `g.islands` and reports what happened, for the engine to
 * reward and celebrate.
 */
export function addIslandFocus(g: Pick<GamificationData, 'islands'>, minutes: number, ctx: SessionContext, today: string): IslandStep[] {
    const steps: IslandStep[] = []
    if (!(minutes > 0)) return steps
    for (const island of g.islands || []) {
        const rate = focusRate(island.focus, ctx)
        if (!rate) continue
        const added = Math.round(minutes * rate * 10) / 10
        if (!isReached(island)) {
            const target = bridgeTarget(island.index)
            island.bridge = Math.min(target, Math.round((island.bridge + added) * 10) / 10)
            const reached = island.bridge >= target
            if (reached) island.reachedOn = today
            steps.push({ island, added, reached, levels: [] })
            continue
        }
        island.minutes = Math.round((island.minutes + added) * 10) / 10
        const level = masteryLevel(island.minutes)
        const levels: number[] = []
        for (let l = island.level + 1; l <= level; l++) levels.push(l)
        island.level = Math.max(island.level, level)
        steps.push({ island, added, reached: false, levels })
    }
    return steps
}

/** The strongest sunlight boon a session earns from the reached islands it was about. */
export function islandBoon(g: Pick<GamificationData, 'islands'>, ctx: SessionContext): { island: Island; pct: number } | null {
    let best: { island: Island; pct: number } | null = null
    for (const island of reachedIslands(g)) {
        const pct = Math.round(islandBoonPct(island.level) * focusRate(island.focus, ctx))
        if (pct > 0 && (!best || pct > best.pct)) best = { island, pct }
    }
    return best
}

// ---------------------------------------------------------------------------
// Bridges as the scene draws them
// ---------------------------------------------------------------------------

/** A bridge leaving the island on screen (the shape the scene renderer's `links` take). */
export interface IslandLink {
    side: IslandSide
    progress: number
    biome: BiomeType
    label: string
    /** The island at the far end; `home` for the village. */
    key: string
}

/** The bridges that leave an island (the home village for `null`): to where it was reached from, and onward. */
export function islandLinks(g: GamificationData, id: string | null): IslandLink[] {
    const here = getIsland(g, id)
    const hereIndex = here ? here.index : 0
    const links: IslandLink[] = []
    if (here) {
        const parent = (g.islands || []).find((i) => i.index === islandParent(here.index))
        links.push({ side: OPPOSITE[islandSide(here.index)], progress: 1, biome: parent ? parent.biome : g.activeBiome, label: parent ? islandName(parent) : 'Home', key: parent ? parent.id : 'home' })
    }
    for (const island of g.islands || []) {
        if (islandParent(island.index) !== hereIndex) continue
        links.push({ side: islandSide(island.index), progress: bridgeProgress(island).ratio, biome: island.biome, label: islandName(island), key: island.id })
    }
    return links
}

// ---------------------------------------------------------------------------
// Suggestions: what the vault and the focus history say an island could stand for
// ---------------------------------------------------------------------------

/** Notes per tag and per folder (a note counts for every folder above it). */
export interface VaultSurvey {
    tags: Record<string, number>
    folders: Record<string, number>
    total: number
}

export interface FocusSuggestion {
    focus: IslandFocus
    label: string
    /** Focus minutes spent there lately, and notes it holds. */
    minutes: number
    notes: number
}

const foldersAbove = (path: string): string[] => {
    const parts = path.split('/').slice(0, -1)
    return parts.map((_, i) => parts.slice(0, i + 1).join('/'))
}

/** Focus minutes per tag and per folder over the last `days` days, from the trees grown. */
export function focusHistory(g: Pick<GamificationData, 'dailyLogs'>, today: string, days = 60): { tags: Record<string, number>; folders: Record<string, number> } {
    const tags: Record<string, number> = {}
    const folders: Record<string, number> = {}
    const dates = Object.keys(g.dailyLogs || {}).filter((d) => d <= today).sort().slice(-days)
    for (const date of dates) {
        for (const tree of g.dailyLogs[date].trees || []) {
            if (tree.status === 'withered') continue
            for (const tag of tree.tags || []) tags[tag.toLowerCase()] = (tags[tag.toLowerCase()] || 0) + tree.durationMinutes
            if (tree.notePath) for (const folder of foldersAbove(tree.notePath)) folders[folder] = (folders[folder] || 0) + tree.durationMinutes
        }
    }
    return { tags, folders }
}

/**
 * What an island could stand for, best first: where the focus has gone lately counts most,
 * then where the notes are. Subjects that already have an island are left out.
 */
export function suggestFocuses(g: Pick<GamificationData, 'dailyLogs' | 'islands'>, survey: VaultSurvey, today: string, limit = 6): FocusSuggestion[] {
    const history = focusHistory(g, today)
    const taken = new Set((g.islands || []).map((i) => focusKey(i.focus)))
    const scored: (FocusSuggestion & { score: number })[] = []
    const consider = (focus: IslandFocus, minutes: number, notes: number) => {
        if (taken.has(focusKey(focus)) || (minutes < 20 && notes < 3)) return
        scored.push({ focus, label: focusLabel(focus), minutes, notes, score: minutes * 2 + Math.min(notes, 200) })
    }
    for (const tag of new Set([...Object.keys(history.tags), ...Object.keys(survey.tags)])) {
        consider({ kind: 'tag', value: tag }, history.tags[tag] || 0, survey.tags[tag] || 0)
    }
    for (const folder of new Set([...Object.keys(history.folders), ...Object.keys(survey.folders)])) {
        if (folder) consider({ kind: 'folder', value: folder }, history.folders[folder] || 0, survey.folders[folder] || 0)
    }
    scored.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    // A folder and the folders inside it say the same thing: keep the best of each family
    const out: FocusSuggestion[] = []
    for (const s of scored) {
        if (out.length >= limit) break
        const nested = out.some(
            (o) => o.focus.kind === s.focus.kind && o.focus.kind !== 'any' && s.focus.kind !== 'any' && (o.focus.value.startsWith(`${s.focus.value}/`) || s.focus.value.startsWith(`${o.focus.value}/`)),
        )
        if (!nested) out.push({ focus: s.focus, label: s.label, minutes: s.minutes, notes: s.notes })
    }
    return out
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

function normalizeFocus(raw: unknown): IslandFocus | null {
    const f = raw as { kind?: unknown; value?: unknown } | null
    if (!f || typeof f !== 'object') return null
    if (f.kind === 'any') return { kind: 'any' }
    if (typeof f.value !== 'string') return null
    if (f.kind === 'tag') return cleanTag(f.value) ? { kind: 'tag', value: cleanTag(f.value) } : null
    if (f.kind === 'folder') return { kind: 'folder', value: cleanFolder(f.value) }
    if (f.kind === 'note') return f.value ? { kind: 'note', value: f.value } : null
    return null
}

/** Islands from disk. Progress is only ever kept; anything that is not an island is dropped. */
export function normalizeIslands(raw: unknown): Island[] {
    if (!Array.isArray(raw)) return []
    const seen = new Set<number>()
    const out: Island[] = []
    for (const r of raw as Partial<Island>[]) {
        const index = Math.floor(Number(r?.index))
        if (!r || typeof r !== 'object' || !(index >= 1) || seen.has(index)) continue
        seen.add(index)
        const minutes = Math.max(0, Number(r.minutes) || 0)
        const reachedOn = typeof r.reachedOn === 'string' && r.reachedOn ? r.reachedOn : undefined
        out.push({
            id: `isle_${index}`,
            index,
            name: typeof r.name === 'string' ? r.name.slice(0, 40) : '',
            biome: islandBiome(index),
            focus: normalizeFocus(r.focus),
            bridge: Math.max(0, Math.min(bridgeTarget(index), Number(r.bridge) || 0)),
            sightedOn: typeof r.sightedOn === 'string' ? r.sightedOn : '',
            ...(reachedOn ? { reachedOn } : {}),
            minutes,
            level: reachedOn ? Math.max(masteryLevel(minutes), Math.floor(Number(r.level) || 0)) : 0,
            notes: Math.max(0, Math.floor(Number(r.notes) || 0)),
            notesMark: Math.max(0, Math.floor(Number(r.notesMark) || 0)),
        })
    }
    return out.sort((a, b) => a.index - b.index)
}
