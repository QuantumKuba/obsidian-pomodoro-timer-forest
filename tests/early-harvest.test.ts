import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { makeEngine } from './helpers'
import { earlyHarvestBaseReward, earlyHarvestMinMinutes, sessionBaseReward } from '../src/services/Progression'

test('the early harvest minimum is 5 minutes, or half of a shorter session', () => {
    assert.equal(earlyHarvestMinMinutes(25), 5)
    assert.equal(earlyHarvestMinMinutes(6), 3)
})

test('an early harvest never pays more than finishing the same minutes', () => {
    for (let m = 1; m <= 120; m++) {
        const early = earlyHarvestBaseReward(m)
        const full = sessionBaseReward(m)
        assert.ok(early.sunlight < full.sunlight, `sunlight at ${m}m`)
        assert.ok(early.coins <= full.coins, `coins at ${m}m`)
        // XP is whole points, so at 1–2 minutes both round to the same amount
        assert.ok(early.xp <= full.xp, `xp at ${m}m`)
        if (m >= 3) assert.ok(early.xp < full.xp, `xp at ${m}m`)
    }
})

test('an early harvest grows a young tree but no sapling and no finished pomodoro', () => {
    const t = makeEngine()
    const inventory = { ...t.g.inventory }
    t.engine.startSession(25)
    const result = t.engine.harvestEarly(12, 25, { taskText: 'Reply to the email' })
    assert.equal(result?.tree.status, 'young')
    assert.deepEqual(t.g.inventory, inventory)
    assert.equal(t.today().completedPomodoros, 0)
    assert.equal(t.today().earlyHarvests, 1)
    assert.equal(t.today().totalMinutes, 12)
    assert.equal(t.g.streak.current, 1, 'real focus keeps the streak')
})

test('ending before the minimum grows nothing', () => {
    const t = makeEngine()
    t.engine.startSession(25)
    assert.equal(t.engine.harvestEarly(3, 25), null)
    assert.equal(t.today(), undefined)
})

test('a session whose task was done never withers', () => {
    const t = makeEngine()
    t.engine.startSession(25)
    assert.equal(t.engine.abortSession(10, {}, true), null)
    assert.equal(t.g.lifetimeStats.treesWithered, 0)

    t.engine.startSession(25)
    assert.equal(t.engine.abortSession(10, {})?.status, 'withered')
    assert.equal(t.g.lifetimeStats.treesWithered, 1)
})
