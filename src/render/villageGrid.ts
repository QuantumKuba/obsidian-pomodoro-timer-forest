/**
 * What stands on each village tile, and how to walk between tiles without
 * crossing anything solid. Pure data: shared by the scene renderer (where the
 * villagers stand) and the live village (where they walk).
 */
import type { PlacedHomesteadItem } from '../types/forest'
import { GARDEN_PLOT_ID } from '../assets/floraCatalog'

export type TileKind = 'grass' | 'path' | 'bridge' | 'water' | 'soil' | 'object'

export interface Tile {
    x: number
    y: number
}

export interface VillageGrid {
    size: number
    /** Row-major: `kinds[y * size + x]`. */
    kinds: TileKind[]
}

function kindOf(item: PlacedHomesteadItem): TileKind {
    if (item.itemType === 'building') {
        if (item.itemId === 'cobblestone_path') return 'path'
        if (item.itemId === 'water_stream') return 'water'
        if (item.itemId === 'bridge') return 'bridge'
        if (item.itemId === GARDEN_PLOT_ID) return 'soil'
    }
    return 'object'
}

export function buildGrid(homestead: PlacedHomesteadItem[], size: number): VillageGrid {
    const kinds: TileKind[] = new Array<TileKind>(size * size).fill('grass')
    for (const item of homestead) {
        if (item.gridX < 0 || item.gridY < 0 || item.gridX >= size || item.gridY >= size) continue
        kinds[item.gridY * size + item.gridX] = kindOf(item)
    }
    return { size, kinds }
}

export function kindAt(grid: VillageGrid, x: number, y: number): TileKind | null {
    if (x < 0 || y < 0 || x >= grid.size || y >= grid.size) return null
    return grid.kinds[y * grid.size + x]
}

/** Villagers keep to grass, paths and bridges; everything else is walked around. */
export function isWalkable(grid: VillageGrid, x: number, y: number): boolean {
    const kind = kindAt(grid, x, y)
    return kind === 'grass' || kind === 'path' || kind === 'bridge'
}

export function walkableTiles(grid: VillageGrid): Tile[] {
    const tiles: Tile[] = []
    for (let y = 0; y < grid.size; y++) for (let x = 0; x < grid.size; x++) if (isWalkable(grid, x, y)) tiles.push({ x, y })
    return tiles
}

const STEPS: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]]

export function neighbours(grid: VillageGrid, tile: Tile): Tile[] {
    return STEPS.map(([dx, dy]) => ({ x: tile.x + dx, y: tile.y + dy })).filter((t) => isWalkable(grid, t.x, t.y))
}

/** Every tile that can be walked to from `from` (including `from` itself when it is walkable). */
export function reachableFrom(grid: VillageGrid, from: Tile): Tile[] {
    if (!isWalkable(grid, from.x, from.y)) return []
    const seen = new Set<number>([from.y * grid.size + from.x])
    const out: Tile[] = [from]
    for (let i = 0; i < out.length; i++) {
        for (const n of neighbours(grid, out[i])) {
            const key = n.y * grid.size + n.x
            if (seen.has(key)) continue
            seen.add(key)
            out.push(n)
        }
    }
    return out
}

/** Strolling on a path or bridge is preferred over cutting across the grass. */
function stepCost(grid: VillageGrid, tile: Tile): number {
    return kindAt(grid, tile.x, tile.y) === 'grass' ? 1.6 : 1
}

/**
 * Cheapest route of side-by-side tiles from `from` to `to`, without `from` and
 * ending with `to`. Null when there is no way through.
 */
export function findPath(grid: VillageGrid, from: Tile, to: Tile): Tile[] | null {
    if (!isWalkable(grid, from.x, from.y) || !isWalkable(grid, to.x, to.y)) return null
    const n = grid.size * grid.size
    const index = (t: Tile) => t.y * grid.size + t.x
    const cost: number[] = new Array<number>(n).fill(Infinity)
    const prev: number[] = new Array<number>(n).fill(-1)
    const done: boolean[] = new Array<boolean>(n).fill(false)
    cost[index(from)] = 0

    // The plot has at most 64 tiles, so a plain scan for the cheapest open tile is plenty
    for (;;) {
        let current = -1
        for (let i = 0; i < n; i++) if (!done[i] && cost[i] < Infinity && (current < 0 || cost[i] < cost[current])) current = i
        if (current < 0) return null
        if (current === index(to)) break
        done[current] = true
        const tile = { x: current % grid.size, y: Math.floor(current / grid.size) }
        for (const next of neighbours(grid, tile)) {
            const i = index(next)
            const c = cost[current] + stepCost(grid, next)
            if (c < cost[i]) {
                cost[i] = c
                prev[i] = current
            }
        }
    }

    const path: Tile[] = []
    for (let i = index(to); i !== index(from); i = prev[i]) path.unshift({ x: i % grid.size, y: Math.floor(i / grid.size) })
    return path
}

/** The walkable tile closest to `from`, for a villager whose tile was just built on. */
export function nearestWalkable(grid: VillageGrid, from: Tile): Tile | null {
    let best: Tile | null = null
    let bestDistance = Infinity
    for (const tile of walkableTiles(grid)) {
        const d = Math.abs(tile.x - from.x) + Math.abs(tile.y - from.y)
        if (d < bestDistance) {
            best = tile
            bestDistance = d
        }
    }
    return best
}

/** The largest connected walkable area: where villagers start out. */
export function mainArea(grid: VillageGrid): Tile[] {
    let best: Tile[] = []
    const seen = new Set<number>()
    for (const tile of walkableTiles(grid)) {
        if (seen.has(tile.y * grid.size + tile.x)) continue
        const area = reachableFrom(grid, tile)
        for (const t of area) seen.add(t.y * grid.size + t.x)
        if (area.length > best.length) best = area
    }
    return best
}

// ---------------------------------------------------------------------------
// Water: what a brook joins, where a bridge points, and where it leaves the island
// ---------------------------------------------------------------------------

/** A bridge has water under it, so brooks run straight through one. */
export function isWater(grid: VillageGrid, x: number, y: number): boolean {
    const kind = kindAt(grid, x, y)
    return kind === 'water' || kind === 'bridge'
}

/** Solid ground a bridge can land on: anything on the island that is not water. */
function isBank(grid: VillageGrid, x: number, y: number): boolean {
    return kindAt(grid, x, y) !== null && !isWater(grid, x, y)
}

/**
 * The four sides of a tile, named by where they are on screen: `nw` faces (x − 1, y),
 * `ne` faces (x, y − 1), `se` faces (x + 1, y) and `sw` faces (x, y + 1).
 */
export type TileSide = 'nw' | 'ne' | 'se' | 'sw'

export const SIDE_STEP: Record<TileSide, [number, number]> = { nw: [-1, 0], ne: [0, -1], se: [1, 0], sw: [0, 1] }

/** What lies past one side of a water tile: more water, a bank, or the island's edge. */
export type WaterSide = 'water' | 'bank' | 'edge'

/** A water tile's four sides, so a brook is drawn as one stream with banks only against land. */
export function waterSides(grid: VillageGrid, x: number, y: number): Record<TileSide, WaterSide> {
    const side = (s: TileSide): WaterSide => {
        const nx = x + SIDE_STEP[s][0]
        const ny = y + SIDE_STEP[s][1]
        return kindAt(grid, nx, ny) === null ? 'edge' : isWater(grid, nx, ny) ? 'water' : 'bank'
    }
    return { nw: side('nw'), ne: side('ne'), se: side('se'), sw: side('sw') }
}

/** `x`: the deck runs between the tile's nw and se sides. `y`: between its ne and sw sides. */
export type BridgeAxis = 'x' | 'y'

/** Where a bridge tile sits in a straight run of bridges: ramps at the ends, level in between. */
export type BridgeSpan = 'single' | 'start' | 'mid' | 'end'

export interface BridgeLayout {
    axis: BridgeAxis
    /** `start` is the end with the lower coordinate. */
    span: BridgeSpan
}

interface AxisScore {
    /** Ends of the bridge run that land on solid ground (0–2). */
    banks: number
    /** Sides of this tile that the stream runs through, across the deck (0–2). */
    crossing: number
    /** Bridge tiles in the straight run, this one included. */
    run: number
}

function scoreAxis(grid: VillageGrid, x: number, y: number, axis: BridgeAxis): AxisScore {
    const [dx, dy] = axis === 'x' ? [1, 0] : [0, 1]
    let banks = 0
    let run = 1
    for (const dir of [-1, 1]) {
        let step = 1
        while (kindAt(grid, x + dx * dir * step, y + dy * dir * step) === 'bridge') step++
        run += step - 1
        if (isBank(grid, x + dx * dir * step, y + dy * dir * step)) banks++
    }
    // The stream a bridge crosses flows along the other axis
    const crossing = [-1, 1].filter((dir) => isWater(grid, x + dy * dir, y + dx * dir)).length
    return { banks, crossing, run }
}

/**
 * The way a bridge points: along the axis whose two ends are banks, so it spans the water
 * between land. With nothing to choose between, it crosses the stream flowing past it, then
 * lines up with the bridges next to it.
 */
export function bridgeAxis(grid: VillageGrid, x: number, y: number): BridgeAxis {
    const a = scoreAxis(grid, x, y, 'x')
    const b = scoreAxis(grid, x, y, 'y')
    if (a.banks !== b.banks) return a.banks > b.banks ? 'x' : 'y'
    if (a.crossing !== b.crossing) return a.crossing > b.crossing ? 'x' : 'y'
    if (a.run !== b.run) return a.run > b.run ? 'x' : 'y'
    return 'x'
}

/** A bridge tile's axis, and its place among the bridges lined up with it. */
export function bridgeLayout(grid: VillageGrid, x: number, y: number): BridgeLayout {
    const axis = bridgeAxis(grid, x, y)
    const [dx, dy] = axis === 'x' ? [1, 0] : [0, 1]
    const continues = (dir: number) =>
        kindAt(grid, x + dx * dir, y + dy * dir) === 'bridge' && bridgeAxis(grid, x + dx * dir, y + dy * dir) === axis
    const before = continues(-1)
    const after = continues(1)
    return { axis, span: before && after ? 'mid' : before ? 'end' : after ? 'start' : 'single' }
}

export interface WaterEdge extends Tile {
    side: TileSide
    /** The two lower edges on screen (`se`, `sw`): the fall is in full view. */
    front: boolean
}

/** Every place water reaches the island's edge and pours over it, back edges first. */
export function waterEdges(grid: VillageGrid): WaterEdge[] {
    const last = grid.size - 1
    const edges: WaterEdge[] = []
    for (let y = 0; y < grid.size; y++) {
        for (let x = 0; x < grid.size; x++) {
            if (!isWater(grid, x, y)) continue
            if (x === 0) edges.push({ x, y, side: 'nw', front: false })
            if (y === 0) edges.push({ x, y, side: 'ne', front: false })
            if (x === last) edges.push({ x, y, side: 'se', front: true })
            if (y === last) edges.push({ x, y, side: 'sw', front: true })
        }
    }
    return edges.sort((a, b) => Number(a.front) - Number(b.front) || a.x + a.y - (b.x + b.y))
}
