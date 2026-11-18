import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { placed } from './helpers'
import {
    BIOME_PALETTES, VILLAGER_HEIGHT, homesteadItemScale, renderGrove, renderVillage, sceneLayout, sceneViewBox, tileAtPoint, type SceneLink,
} from '../src/render/VillageScene'
import { bridgeAxis, bridgeLayout, buildGrid, isWater, waterEdges, waterSides } from '../src/render/villageGrid'
import { BUILDING_SVGS, SPECIES_SVGS, bridgeDeckRise, bridgeSpanSvg } from '../src/assets/floraAssets'
import { FLORA_SPECIES, HOMESTEAD_BUILDINGS } from '../src/assets/floraCatalog'
import { freshGamificationData } from '../src/services/StorageManager'
import type { BiomeType, GamificationData, PlacedHomesteadItem } from '../src/types/forest'

function village(homestead: PlacedHomesteadItem[], landSize = 6, more: Partial<GamificationData> = {}): GamificationData {
    return { ...freshGamificationData(), landSize, vitality: 90, homestead, ...more }
}
const brook = (x: number, y: number) => placed('building', 'water_stream', x, y)
const bridge = (x: number, y: number) => placed('building', 'bridge', x, y)

// ---------------------------------------------------------------------------
// Bridges
// ---------------------------------------------------------------------------

test('a bridge spans the water between its two banks, whichever way the brook runs', () => {
    // brook along x (the row y = 2): the banks are at y = 1 and y = 3
    const alongX = buildGrid([...[0, 1, 3, 4].map((x) => brook(x, 2)), bridge(2, 2)], 5)
    assert.equal(bridgeAxis(alongX, 2, 2), 'y')
    // brook along y (the column x = 2): the banks are at x = 1 and x = 3
    const alongY = buildGrid([...[0, 1, 3, 4].map((y) => brook(2, y)), bridge(2, 2)], 5)
    assert.equal(bridgeAxis(alongY, 2, 2), 'x')
})

test('bridges across a wide river line up in one straight run', () => {
    // a river three tiles wide (rows 1–3), crossed at x = 2
    const river = [0, 1, 2, 3, 4].flatMap((x) => [1, 2, 3].map((y) => (x === 2 ? bridge(x, y) : brook(x, y))))
    const grid = buildGrid(river, 5)
    assert.deepEqual([1, 2, 3].map((y) => bridgeLayout(grid, 2, y)), [
        { axis: 'y', span: 'start' },
        { axis: 'y', span: 'mid' },
        { axis: 'y', span: 'end' },
    ])
})

test('bridges laid side by side over a brook each cross it', () => {
    // two bridges next to each other on a brook running along x: both go bank to bank
    const grid = buildGrid([brook(0, 2), bridge(1, 2), bridge(2, 2), brook(3, 2), brook(4, 2)], 5)
    for (const x of [1, 2]) assert.deepEqual(bridgeLayout(grid, x, 2), { axis: 'y', span: 'single' })
})

test('a bridge with one bank still reaches for it, and one with none crosses the stream', () => {
    // on the island's edge: land behind it, nothing in front
    const edge = buildGrid([brook(0, 4), brook(1, 4), bridge(2, 4), brook(3, 4), brook(4, 4)], 5)
    assert.equal(bridgeAxis(edge, 2, 4), 'y')
    // in the middle of a pond there is no bank either way: any axis will do
    const pond = buildGrid([0, 1, 2, 3, 4].flatMap((x) => [1, 2, 3].map((y) => (x === 2 && y === 2 ? bridge(x, y) : brook(x, y)))), 5)
    assert.ok(['x', 'y'].includes(bridgeAxis(pond, 2, 2)))
    // alone on dry land it has four banks: any way will do, and it never throws
    assert.equal(bridgeAxis(buildGrid([bridge(2, 2)], 5), 2, 2), 'x')
})

test('the two bridge drawings are mirror images, and a run is level in the middle', () => {
    const x = bridgeSpanSvg('x')
    const y = bridgeSpanSvg('y')
    assert.notEqual(x, y)
    assert.notEqual(bridgeSpanSvg('x', 'mid'), x)
    assert.equal(bridgeDeckRise('single', 0), 0)
    assert.equal(bridgeDeckRise('start', 0), 0)
    assert.equal(bridgeDeckRise('end', 1), 0)
    assert.equal(bridgeDeckRise('start', 1), bridgeDeckRise('mid', 0.3))
    assert.equal(bridgeDeckRise('end', 0), bridgeDeckRise('mid', 0.9))
    assert.ok(bridgeDeckRise('single', 0.5) > 4)
})

test('the scene draws each bridge the way it points', () => {
    const across = renderVillage(village([...[0, 1, 3, 4, 5].map((x) => brook(x, 2)), bridge(2, 2)]), { idPrefix: 'a' })
    const along = renderVillage(village([...[0, 1, 3, 4, 5].map((y) => brook(2, y)), bridge(2, 2)]), { idPrefix: 'a' })
    assert.notEqual(across, along)
    const sprite = (svg: string) => svg.slice(svg.indexOf('data-item="bridge_2_2"')).split('</g></svg>')[0]
    assert.notEqual(sprite(across), sprite(along))
    // the market's icon is not what stands in the village
    assert.ok(!across.includes(BUILDING_SVGS.bridge.slice(60, 200)))
})

// ---------------------------------------------------------------------------
// Water
// ---------------------------------------------------------------------------

test('water joins water, banks against land, and runs off at the edge', () => {
    const grid = buildGrid([brook(0, 2), brook(1, 2), bridge(2, 2), brook(2, 3)], 5)
    assert.deepEqual(waterSides(grid, 0, 2), { nw: 'edge', ne: 'bank', se: 'water', sw: 'bank' })
    assert.deepEqual(waterSides(grid, 1, 2), { nw: 'water', ne: 'bank', se: 'water', sw: 'bank' })
    // a bridge has water under it
    assert.equal(isWater(grid, 2, 2), true)
    assert.deepEqual(waterSides(grid, 2, 3), { nw: 'bank', ne: 'water', se: 'bank', sw: 'bank' })
})

test('water pours over every edge it reaches: in full view at the front, hinted at the back', () => {
    const grid = buildGrid([...[0, 1, 2, 3, 4].map((x) => (x === 4 ? bridge(x, 2) : brook(x, 2))), brook(1, 4), brook(0, 0), brook(2, 1)], 5)
    assert.deepEqual(waterEdges(grid), [
        { x: 0, y: 0, side: 'nw', front: false },
        { x: 0, y: 0, side: 'ne', front: false },
        { x: 0, y: 2, side: 'nw', front: false },
        { x: 1, y: 4, side: 'sw', front: true },
        { x: 4, y: 2, side: 'se', front: true },
    ])
    assert.deepEqual(waterEdges(buildGrid([brook(2, 2), placed('tree', 'classic_pine', 4, 4)], 5)), [])
    // the corner tile at the very front falls both ways
    assert.deepEqual(waterEdges(buildGrid([brook(4, 4)], 5)).map((e) => e.side), ['se', 'sw'])
})

test('a brook that reaches the front edge gets a waterfall; one that stays inland does not', () => {
    const falls = renderVillage(village([0, 1, 2, 3, 4, 5].map((x) => brook(x, 2))), { idPrefix: 'w' })
    assert.equal((falls.match(/class="pf-fall"/g) || []).length, 1)
    assert.equal((falls.match(/class="pf-fall-back"/g) || []).length, 1)
    assert.ok(falls.includes('pf-falling'))
    const inland = renderVillage(village([1, 2, 3, 4].map((x) => brook(x, 2))), { idPrefix: 'w' })
    assert.ok(!inland.includes('pf-fall'))
    // the grove has no water at all
    assert.ok(!renderGrove([], 'meadow', { idPrefix: 'g' }).includes('pf-fall'))
})

// ---------------------------------------------------------------------------
// The island and its neighbours
// ---------------------------------------------------------------------------

test('the same village always floats on the same rock, in every biome', () => {
    const g = village([placed('building', 'campfire', 2, 2)])
    const date = new Date(2026, 9, 5, 12)
    const body = (svg: string) => svg.slice(svg.indexOf('class="pf-island"'), svg.indexOf('class="pf-ground"'))
    assert.equal(body(renderVillage(g, { date, idPrefix: 'one' })), body(renderVillage(g, { date, idPrefix: 'two' })))
    assert.notEqual(body(renderVillage(g, { date, seed: 'isle_a' })), body(renderVillage(g, { date, seed: 'isle_b' })))
    for (const biome of Object.keys(BIOME_PALETTES) as BiomeType[]) {
        const svg = renderVillage({ ...g, activeBiome: biome }, { date, idPrefix: 'b' })
        assert.ok(!/NaN|undefined/.test(svg), biome)
        assert.ok(svg.includes('class="pf-island"'), biome)
    }
})

test('the island hangs inside the scene, and tiles stay where the layout says', () => {
    for (const size of [3, 5, 8]) {
        const L = sceneLayout(size)
        const svg = renderVillage(village([], size), { idPrefix: 's' })
        assert.ok(svg.includes(`viewBox="0 0 ${L.width} ${L.height}"`))
        const island = svg.slice(svg.indexOf('class="pf-island"'), svg.indexOf('class="pf-ground"'))
        const ys = [...island.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[2]))
        assert.ok(Math.max(...ys) < L.height - 10, `rock ends above the clouds at size ${size}`)
        assert.ok(Math.max(...ys) > L.top + size * 32 + 40, `a real depth of rock at size ${size}`)
        const corner = L.tile(size - 1, size - 1)
        assert.deepEqual(tileAtPoint(L, corner.cx, corner.cy), { x: size - 1, y: size - 1 })
    }
})

test('bridges to neighbouring islands widen the scene without moving a tile', () => {
    const g = village([placed('building', 'campfire', 2, 2)], 5)
    const L = sceneLayout(5)
    const links: SceneLink[] = [
        { side: 'nw', progress: 1, biome: 'sakura_garden', label: 'Study Isle', key: 'isle_1' },
        { side: 'ne', progress: 0.4, biome: 'alpine_frost', label: 'A <b>very</b> long name that will not fit', key: 'isle_2' },
        { side: 'se', progress: 0, biome: 'coral_lagoon', key: 'isle_3' },
        { side: 'sw', progress: 0.75, biome: 'ember_highlands' },
    ]
    const plain = renderVillage(g, { idPrefix: 'p' })
    const linked = renderVillage(g, { idPrefix: 'p', links })
    assert.ok(plain.includes(`viewBox="${sceneViewBox(L)}"`))
    assert.ok(linked.includes(`viewBox="${sceneViewBox(L, true)}"`))
    assert.notEqual(sceneViewBox(L), sceneViewBox(L, true))
    const [x, , w] = sceneViewBox(L, true).split(' ').map(Number)
    assert.ok(x < 0 && w > L.width)
    assert.equal(x + w / 2, L.width / 2, 'the island stays centred')

    for (const key of ['isle_1', 'isle_2', 'isle_3']) assert.ok(linked.includes(`data-link="${key}"`))
    assert.equal((linked.match(/class="pf-link[ "]/g) || []).length, 4)
    assert.equal((linked.match(/pf-link-open/g) || []).length, 1, 'only the finished bridge is open')
    assert.ok(linked.includes('>Study Isle</text>'))
    assert.ok(!linked.includes('<b>'), 'labels are escaped')
    assert.ok(linked.includes('…'), 'long labels are cut short')
    // back bridges are drawn behind the island, front ones over it
    const island = linked.indexOf('class="pf-island"')
    const ground = linked.indexOf('class="pf-ground"')
    const objects = linked.indexOf('class="pf-objects"')
    assert.ok(linked.indexOf('data-link="isle_1"') > island && linked.indexOf('data-link="isle_1"') < ground)
    assert.ok(linked.indexOf('data-link="isle_3"') > objects)
    // every link stays inside the widened scene
    const xs = [...linked.matchAll(/class="pf-link-label" x="(-?[\d.]+)"/g)].map((m) => Number(m[1]))
    for (const lx of xs) assert.ok(lx > x + 20 && lx < x + w - 20)
    assert.ok(!plain.includes('pf-link'))
})

// ---------------------------------------------------------------------------
// Scale
// ---------------------------------------------------------------------------

const scaleOf = (id: string) => homesteadItemScale({ itemType: 'building', itemId: id, level: 1 })
const treeScale = (id: string, level = 1) => homesteadItemScale({ itemType: 'tree', itemId: id, level })

test('everything in the village is sized against a villager', () => {
    // sprite heights measured from the art (units of the 64-box, ground to top)
    const height = (sprite: number, scale: number) => (sprite * scale) / VILLAGER_HEIGHT
    const scarecrow = height(46.8, scaleOf('scarecrow'))
    assert.ok(scarecrow > 1.1 && scarecrow < 1.6, `scarecrow is a little taller than a villager (${scarecrow.toFixed(2)})`)
    const bench = height(30, scaleOf('bench'))
    assert.ok(bench > 0.7 && bench < 1.05, `a bench comes up to the waist and back (${bench.toFixed(2)})`)
    const sunflower = height(51.2, treeScale('sunflower'))
    assert.ok(sunflower > 1 && sunflower < 1.6, `a sunflower is about head height (${sunflower.toFixed(2)})`)
    const bamboo = height(56.6, treeScale('bamboo'))
    assert.ok(bamboo > 1.8 && bamboo < 2.5, `bamboo is about two villagers (${bamboo.toFixed(2)})`)
    const cabin = height(48.4, scaleOf('cabin'))
    assert.ok(cabin > 2.4 && cabin < 3.2, `a cabin is a little under three (${cabin.toFixed(2)})`)
    const lantern = height(47, scaleOf('lantern'))
    assert.ok(lantern > 1.3 && lantern < 1.9)

    // order of size: the things people stand next to, then homes, then the tall landmarks
    assert.ok(scaleOf('scarecrow') < scaleOf('chicken_coop') && scaleOf('chicken_coop') < scaleOf('cabin'))
    assert.ok(height(48.4, scaleOf('cabin')) < height(53.6, scaleOf('windmill')))
    assert.ok(height(53.6, scaleOf('windmill')) < height(55.4, scaleOf('clock_tower')))
    assert.ok(height(51.2, treeScale('sunflower')) < height(56.6, treeScale('bamboo')))
    assert.ok(height(56.6, treeScale('bamboo')) < height(51.5, treeScale('classic_pine')) + 0.4)
})

test('every item has a deliberate size, and trees still grow with their level', () => {
    const ground = ['cobblestone_path', 'water_stream', 'garden_plot', 'bridge']
    for (const b of HOMESTEAD_BUILDINGS) {
        assert.ok(BUILDING_SVGS[b.id], b.id)
        if (ground.includes(b.id)) assert.equal(scaleOf(b.id), 1, `${b.id} lies on its tile`)
        else assert.ok(b.sceneScale && b.sceneScale >= 0.6 && b.sceneScale <= 1.5, `${b.id} has a sceneScale`)
    }
    for (const sp of FLORA_SPECIES) {
        assert.ok(SPECIES_SVGS[sp.id], sp.id)
        assert.ok(treeScale(sp.id, 2) > treeScale(sp.id, 1) && treeScale(sp.id, 3) > treeScale(sp.id, 2), sp.id)
        if (sp.category === 'flower') assert.ok(treeScale(sp.id) < treeScale('classic_pine') * 0.7, `${sp.id} stands lower than a tree`)
    }
    // the Heart Tree's stage scales it on top of its level
    assert.ok(homesteadItemScale({ itemType: 'tree', itemId: 'ancient_oak', level: 2 }, 1.28) > treeScale('ancient_oak', 3))
    // an unknown building falls back to tile size instead of vanishing
    assert.equal(scaleOf('no_such_thing'), 1)
})
