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
    const kinds: TileKind[] = new Array(size * size).fill('grass')
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
    const cost: number[] = new Array(n).fill(Infinity)
    const prev: number[] = new Array(n).fill(-1)
    const done: boolean[] = new Array(n).fill(false)
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
