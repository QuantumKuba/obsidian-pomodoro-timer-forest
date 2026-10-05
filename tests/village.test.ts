import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { placed } from './helpers'
import { renderVillage, sceneLayout } from '../src/render/VillageScene'
import { buildGrid, findPath, isWalkable, mainArea } from '../src/render/villageGrid'
import { freshGamificationData } from '../src/services/StorageManager'
import type { GamificationData, PlacedHomesteadItem } from '../src/types/forest'

function village(homestead: PlacedHomesteadItem[], vitality = 90, landSize = 6): GamificationData {
    const g = freshGamificationData()
    g.landSize = landSize
    g.vitality = vitality
    g.homestead = homestead
    return g
}

/** A busy village: trees, buildings, a brook with a bridge, a path, plots and a coop. */
const BUSY = [
    placed('building', 'campfire', 2, 2),
    placed('tree', 'classic_pine', 0, 0),
    placed('tree', 'ancient_oak', 5, 0),
    placed('tree', 'classic_pine', 1, 3),
    placed('building', 'garden_plot', 3, 0, { cropId: 'carrot', cropGrowth: 10 }),
    placed('building', 'garden_plot', 4, 3, { cropId: 'carrot', cropGrowth: 50 }),
    placed('building', 'scarecrow', 5, 2),
    placed('building', 'chicken_coop', 0, 5, { level: 2 }),
    placed('building', 'bench', 0, 2),
    placed('building', 'cobblestone_path', 2, 3),
    placed('building', 'cobblestone_path', 2, 4),
    ...[0, 2, 3, 4, 5].map((x) => placed('building', 'water_stream', x, 1)),
    placed('building', 'bridge', 1, 1),
]

test('only grass, paths and bridges can be walked on', () => {
    const grid = buildGrid(BUSY, 6)
    assert.equal(isWalkable(grid, 1, 1), true, 'bridge')
    assert.equal(isWalkable(grid, 2, 3), true, 'path')
    assert.equal(isWalkable(grid, 1, 0), true, 'grass')
    assert.equal(isWalkable(grid, 2, 2), false, 'campfire')
    assert.equal(isWalkable(grid, 0, 0), false, 'tree')
    assert.equal(isWalkable(grid, 2, 1), false, 'water')
    assert.equal(isWalkable(grid, 3, 0), false, 'garden plot')
    assert.equal(isWalkable(grid, 6, 0), false, 'off the island')
})

function walk(grid: ReturnType<typeof buildGrid>, from: { x: number; y: number }, to: { x: number; y: number }) {
    const route = findPath(grid, from, to) || []
    assert.ok(route.length > 0, `no route from ${from.x},${from.y} to ${to.x},${to.y}`)
    let at = from
    for (const step of route) {
        assert.equal(Math.abs(step.x - at.x) + Math.abs(step.y - at.y), 1, 'one tile per step')
        assert.ok(isWalkable(grid, step.x, step.y), `stepped onto ${step.x},${step.y}`)
        at = step
    }
    assert.deepEqual(at, to)
    return route
}

test('routes go around obstacles, one side-by-side tile at a time', () => {
    // A row of trees and a campfire between the two tiles; the way round is through the gap
    const wall = [placed('tree', 'classic_pine', 2, 0), placed('tree', 'classic_pine', 2, 1), placed('building', 'campfire', 2, 2), placed('tree', 'ancient_oak', 2, 3)]
    const route = walk(buildGrid(wall, 5), { x: 0, y: 1 }, { x: 4, y: 1 })
    assert.ok(route.some((t) => t.x === 2 && t.y === 4), 'goes through the only gap')
})

test('the brook is crossed by the bridge', () => {
    const route = walk(buildGrid(BUSY, 6), { x: 1, y: 0 }, { x: 1, y: 2 })
    assert.deepEqual(route[0], { x: 1, y: 1 })
})

test('villagers prefer a path when it is no longer than the grass', () => {
    const paved = [placed('building', 'cobblestone_path', 1, 0), placed('building', 'cobblestone_path', 2, 0), placed('building', 'cobblestone_path', 2, 1), placed('building', 'cobblestone_path', 2, 2)]
    const route = findPath(buildGrid(paved, 5), { x: 0, y: 0 }, { x: 2, y: 2 })
    assert.deepEqual(route, [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }])
})

test('there is no route into a walled-off corner', () => {
    const walls = [placed('tree', 'classic_pine', 1, 0), placed('tree', 'classic_pine', 0, 1), placed('tree', 'classic_pine', 1, 1)]
    const grid = buildGrid(walls, 5)
    assert.equal(findPath(grid, { x: 4, y: 4 }, { x: 0, y: 0 }), null)
    assert.ok(!mainArea(grid).some((t) => t.x === 0 && t.y === 0))
})

/** Tile under each actor drawn in the scene, from its translate(). */
function actorTiles(svg: string, size: number) {
    const L = sceneLayout(size)
    const o = L.tile(0, 0)
    const ex = L.tile(1, 0)
    const ey = L.tile(0, 1)
    const det = (ex.cx - o.cx) * (ey.cy - o.cy) - (ey.cx - o.cx) * (ex.cy - o.cy)
    return [...svg.matchAll(/class="pf-actor [^"]*"[^>]*transform="translate\(([\d.-]+) ([\d.-]+)\)"/g)].map((m) => {
        const dx = Number(m[1]) - o.cx
        const dy = Number(m[2]) - o.cy
        const x = (dx * (ey.cy - o.cy) - dy * (ey.cx - o.cx)) / det
        const y = ((ex.cx - o.cx) * dy - (ex.cy - o.cy) * dx) / det
        return { x: Math.round(x), y: Math.round(y) }
    })
}

test('standing villagers and hens are only drawn on walkable tiles', () => {
    for (let day = 1; day <= 28; day++) {
        const date = new Date(2026, 9, day, 12)
        for (const seed of ['a', 'b', 'c']) {
            const svg = renderVillage(village(BUSY), { date, idPrefix: seed })
            const tiles = actorTiles(svg, 6)
            assert.ok(tiles.length > 0)
            const grid = buildGrid(BUSY, 6)
            for (const t of tiles) assert.ok(isWalkable(grid, t.x, t.y), `actor on ${t.x},${t.y} (day ${day}, ${seed})`)
        }
    }
})

test('objects and actors are drawn back to front', () => {
    const svg = renderVillage(village(BUSY), { idPrefix: 'order' })
    const objects = svg.slice(svg.indexOf('class="pf-objects"'))
    const depths = [...objects.matchAll(/data-depth="([\d.]+)"/g)].map((m) => Number(m[1]))
    assert.ok(depths.length > BUSY.length / 2)
    for (let i = 1; i < depths.length; i++) assert.ok(depths[i] >= depths[i - 1], `depth ${depths[i]} drawn after ${depths[i - 1]}`)
})

test('live scenes leave the actors to VillageLife', () => {
    const svg = renderVillage(village(BUSY), { idPrefix: 'live', liveActors: true })
    assert.ok(!svg.includes('pf-actor'))
})

test('a resting village gets soft mist, not solid white shapes', () => {
    for (const vitality of [10, 30]) {
        const svg = renderVillage(village(BUSY, vitality), { idPrefix: 'mist' })
        const mist = [...svg.matchAll(/<ellipse class="pf-mist"[^>]*>/g)].map((m) => m[0])
        assert.ok(mist.length > 0)
        for (const e of mist) assert.match(e, /fill="url\(#mist-mist\)"/)
    }
    assert.ok(!renderVillage(village(BUSY, 90), { idPrefix: 'mist' }).includes('pf-mist'))
})

test('ripe plots are marked, growing ones are not', () => {
    const ripe = renderVillage(village([placed('building', 'garden_plot', 1, 1, { cropId: 'carrot', cropGrowth: 50 })]), { idPrefix: 'r' })
    const growing = renderVillage(village([placed('building', 'garden_plot', 1, 1, { cropId: 'carrot', cropGrowth: 20 })]), { idPrefix: 'g' })
    assert.ok(ripe.includes('pf-ripe'))
    assert.ok(!growing.includes('pf-ripe'))
})
