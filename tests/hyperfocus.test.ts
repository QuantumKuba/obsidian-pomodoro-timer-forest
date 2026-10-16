import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { makeEngine } from './helpers'
import {
    HYPERFOCUS_MIN_MINUTES,
    HYPERFOCUS_FULL_RATE_MINUTES,
    hyperfocusStage,
    hyperfocusGrowthRatio,
    hyperfocusReward,
    pomodoroEquivalents,
    recoveryBreakMinutes,
    sessionBaseReward,
} from '../src/services/Progression'

test('hyperfocus growth stages follow absolute minutes focused', () => {
    assert.equal(hyperfocusStage(0), 'seed')
    assert.equal(hyperfocusStage(14), 'seed')
    assert.equal(hyperfocusStage(15), 'sprout')
    assert.equal(hyperfocusStage(29), 'sprout')
    assert.equal(hyperfocusStage(30), 'sapling')
    assert.equal(hyperfocusStage(59), 'sapling')
    assert.equal(hyperfocusStage(60), 'mature')
    assert.equal(hyperfocusStage(120), 'mature')
})

test('hyperfocus growth ratio reaches 1.0 at 90 minutes and never decreases', () => {
    assert.equal(hyperfocusGrowthRatio(0), 0)
    assert.equal(hyperfocusGrowthRatio(15), 0.25)
    assert.equal(hyperfocusGrowthRatio(30), 0.5)
    assert.equal(hyperfocusGrowthRatio(60), 0.75)
    assert.equal(hyperfocusGrowthRatio(HYPERFOCUS_FULL_RATE_MINUTES), 1)
    assert.equal(hyperfocusGrowthRatio(180), 1)

    let prev = 0
    for (let m = 1; m <= 240; m++) {
        const r = hyperfocusGrowthRatio(m)
        assert.ok(r >= prev, `monotonic at ${m}m`)
        prev = r
    }
})

test('hyperfocus reward matches full rate up to 90m and increases at half rate after', () => {
    // Under 90m matches sessionBaseReward
    for (let m = 10; m <= 90; m += 10) {
        const hReward = hyperfocusReward(m)
        const base = sessionBaseReward(m)
        assert.deepEqual(hReward, base, `matches base at ${m}m`)
    }

    // Beyond 90m, continues increasing monotonically
    let prev = hyperfocusReward(90)
    for (let m = 91; m <= 200; m += 10) {
        const cur = hyperfocusReward(m)
        assert.ok(cur.sunlight >= prev.sunlight, `sunlight at ${m}m`)
        assert.ok(cur.coins >= prev.coins, `coins at ${m}m`)
        assert.ok(cur.xp >= prev.xp, `xp at ${m}m`)
        prev = cur
    }
})

test('pomodoro equivalents award fair pomodoro count for focus time', () => {
    assert.equal(pomodoroEquivalents(10, 25), 1)
    assert.equal(pomodoroEquivalents(24, 25), 1)
    assert.equal(pomodoroEquivalents(25, 25), 1)
    assert.equal(pomodoroEquivalents(50, 25), 2)
    assert.equal(pomodoroEquivalents(75, 25), 3)
    assert.equal(pomodoroEquivalents(120, 25), 4)
})

test('recovery break scales with focus depth and is bounded', () => {
    assert.equal(recoveryBreakMinutes(15, 5), 5)
    assert.equal(recoveryBreakMinutes(45, 5), 9)
    assert.equal(recoveryBreakMinutes(60, 5), 12)
    assert.equal(recoveryBreakMinutes(100, 5), 20)
    assert.equal(recoveryBreakMinutes(200, 5), 20, 'caps at 20m')
})

test('ending before the hyperfocus minimum grows nothing and never withers', () => {
    const t = makeEngine()
    t.engine.startSession(180, 'Testing', undefined, undefined, true)
    const result = t.engine.landHyperfocus(HYPERFOCUS_MIN_MINUTES - 1)
    assert.equal(result, null)
    assert.equal(t.today(), undefined)
    assert.equal(t.g.lifetimeStats.treesWithered, 0)
})

test('landing a hyperfocus session awards sapling, pomodoros, and check-in bonus', () => {
    const t = makeEngine(undefined, { dailyGoal: 3 })
    const prevSaplings = t.g.inventory['tree:classic_pine'] || 0

    t.engine.startSession(180, 'Deep project', undefined, undefined, true)
    const result = t.engine.landHyperfocus(
        75,
        { taskText: 'Deep project' },
        { pomodoros: 3, checkInsAcked: 2 },
    )

    assert.ok(result)
    assert.equal(result.tree.status, 'mature')
    assert.equal(result.tree.hyperfocus, true)
    assert.equal(result.tree.durationMinutes, 75)

    // Sapling earned
    assert.equal(t.g.inventory['tree:classic_pine'], prevSaplings + 1)

    // 3 pomodoros counted towards today
    assert.equal(t.today().completedPomodoros, 3)
    assert.equal(t.today().totalMinutes, 75)

    // Lifetime stats updated
    assert.equal(t.g.lifetimeStats.hyperfocusSessions, 1)
    assert.equal(t.g.lifetimeStats.hyperfocusMinutes, 75)
    assert.equal(t.g.lifetimeStats.checkInsAcked, 2)
    assert.equal(t.g.lifetimeStats.totalPomodoros, 3)

    // Check-in bonus lines present in harvest event
    const harvestEvent = t.events.find((e) => e.kind === 'harvest')
    assert.ok(harvestEvent)
    assert.ok(harvestEvent.lines.some((l) => l.label.includes('Looked after yourself ×2')))
    assert.ok(harvestEvent.lines.some((l) => l.label.includes('Daily goal reached (3)')))

    // Achievement unlocked
    assert.ok(t.g.achievements.includes('hyperfocus_1'))
})

test('hyperfocus sessions never wither even if aborted', () => {
    const t = makeEngine()
    t.engine.startSession(180, 'Safe hyperfocus', undefined, undefined, true)
    const aborted = t.engine.abortSession(45, { taskText: 'Safe hyperfocus' })
    assert.equal(aborted, null)
    assert.equal(t.g.lifetimeStats.treesWithered, 0)
})
