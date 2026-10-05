import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { makeEngine } from './helpers'
import { CROPS, GARDEN_PLOT_ID, cropProgress, getBuilding } from '../src/assets/floraCatalog'
import { TASK_WATERING_MINUTES, xpForLevel } from '../src/services/Progression'

const plots = (g: { homestead: { itemId: string }[] }) => g.homestead.filter((i) => i.itemId === GARDEN_PLOT_ID) as ReturnType<typeof makeEngine>['g']['homestead']

function withPlots(n: number, settings: Record<string, unknown> = {}) {
    const t = makeEngine(undefined, settings)
    for (let i = 0; i < n; i++) {
        assert.ok(t.engine.buyBuilding(GARDEN_PLOT_ID))
        assert.ok(t.engine.placeFromInventory(`building:${GARDEN_PLOT_ID}`, i, 0))
    }
    return t
}

test('a village can own at most the garden plot limit', () => {
    const t = makeEngine()
    const limit = getBuilding(GARDEN_PLOT_ID)!.limit!
    for (let i = 0; i < limit; i++) assert.ok(t.engine.buyBuilding(GARDEN_PLOT_ID))
    assert.equal(t.engine.buyBuilding(GARDEN_PLOT_ID), false)
    assert.equal(t.g.inventory[`building:${GARDEN_PLOT_ID}`], limit)
})

test('a new plot is sown with the first crop', () => {
    const t = withPlots(1)
    assert.equal(plots(t.g)[0].cropId, CROPS[0].id)
    assert.equal(plots(t.g)[0].cropGrowth, 0)
})

test('crops grow with focus minutes and with ticked tasks, never past ripe', () => {
    const t = withPlots(2)
    t.engine.startSession(25)
    t.engine.completeSession(25)
    assert.deepEqual(plots(t.g).map((p) => p.cropGrowth), [25, 25])

    t.engine.onTaskCompleted('task-1', 'Write the tests', false)
    assert.deepEqual(plots(t.g).map((p) => p.cropGrowth), [25 + TASK_WATERING_MINUTES, 25 + TASK_WATERING_MINUTES])

    t.engine.startSession(60)
    t.engine.completeSession(60)
    const carrot = CROPS[0]
    assert.ok(plots(t.g).every((p) => p.cropGrowth === carrot.growMinutes))
    assert.ok(plots(t.g).every((p) => cropProgress(p) === 1))
})

test('an early harvest grows crops by the minutes focused', () => {
    const t = withPlots(1)
    t.engine.startSession(25)
    t.engine.harvestEarly(12, 25)
    assert.equal(plots(t.g)[0].cropGrowth, 12)
})

test('harvesting pays only ripe plots, re-sows them and counts toward achievements', () => {
    const t = withPlots(2)
    t.engine.startSession(25)
    t.engine.completeSession(25)
    assert.deepEqual(t.engine.harvestCrops(), [], 'nothing is ripe yet')

    plots(t.g)[0].cropGrowth = CROPS[0].growMinutes
    const coins = t.g.coins
    const picked = t.engine.harvestCrops()
    assert.equal(picked.length, 1)
    assert.equal(picked[0].coins, CROPS[0].coins)
    assert.ok(t.g.coins >= coins + CROPS[0].coins)
    assert.equal(plots(t.g)[0].cropGrowth, 0)
    assert.equal(plots(t.g)[0].cropId, CROPS[0].id)
    assert.equal(plots(t.g)[1].cropGrowth, 25, 'the unripe plot is left alone')
    assert.equal(t.g.lifetimeStats.cropsHarvested, 1)
    assert.ok(t.g.achievements.includes('first_harvest'))
    assert.ok(t.events.some((e) => e.kind === 'crop'))
})

test('locked crops cannot be planted, and switching crop keeps the minutes grown', () => {
    const t = withPlots(1)
    const plot = plots(t.g)[0]
    const locked = CROPS.find((c) => c.unlockLevel > 4)!
    const open = CROPS.find((c) => c.unlockLevel <= 4 && c.id !== CROPS[0].id)!
    assert.equal(t.engine.plantCrop(plot.id, locked.id), false)

    plot.cropGrowth = 30
    assert.ok(t.engine.plantCrop(plot.id, open.id))
    assert.equal(plots(t.g)[0].cropId, open.id)
    assert.equal(plots(t.g)[0].cropGrowth, 30)
})

test('a scarecrow makes crops grow faster', () => {
    const t = withPlots(1)
    assert.ok(t.engine.buyBuilding('scarecrow'))
    assert.ok(t.engine.placeFromInventory('building:scarecrow', 3, 3))
    t.engine.startSession(20)
    t.engine.completeSession(20)
    assert.equal(plots(t.g)[0].cropGrowth, 23) // +15% at level 1
})

test('stowing a plot with a ripe crop harvests it first', () => {
    const t = withPlots(1)
    const plot = plots(t.g)[0]
    plot.cropGrowth = CROPS[0].growMinutes
    t.engine.stowHomesteadItem(plot.id)
    assert.equal(t.g.lifetimeStats.cropsHarvested, 1)
    assert.equal(plots(t.g).length, 0)
    assert.equal(t.g.inventory[`building:${GARDEN_PLOT_ID}`], 1)
})

test('a chicken coop pays fresh eggs with the first tree of the day only', () => {
    const t = makeEngine((g) => (g.xp = xpForLevel(5)))
    assert.ok(t.engine.buyBuilding('chicken_coop'))
    assert.ok(t.engine.placeFromInventory('building:chicken_coop', 4, 4))
    t.engine.startSession(25)
    t.engine.completeSession(25)
    const eggs = (n: number) => t.events.filter((e) => e.kind === 'harvest')[n]?.lines.some((l) => l.label.includes('eggs'))
    assert.equal(eggs(0), true)
    t.engine.startSession(25)
    t.engine.completeSession(25)
    assert.equal(eggs(1), false)
})

test('slower crops pay a little more per minute, but a plot never out-earns a session', () => {
    const perMinute = CROPS.map((c) => c.coins / c.growMinutes)
    for (let i = 1; i < perMinute.length; i++) assert.ok(perMinute[i] >= perMinute[i - 1], `${CROPS[i].id} pays less per minute`)
    // A 25-minute session pays at least 2 coins, i.e. 0.08 per minute
    for (const rate of perMinute) assert.ok(rate < 0.08)
})
