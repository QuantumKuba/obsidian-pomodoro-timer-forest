import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { makeEngine, placed } from './helpers'
import StorageManager from '../src/services/StorageManager'
import { CHARTER_CHAPTERS, CHARTER_RANKS, charterStatus } from '../src/services/Charter'
import { HOMESTEAD_BUILDINGS, charterLandmark } from '../src/assets/floraCatalog'
import { villageCharm } from '../src/services/Progression'
import type { GamificationData } from '../src/types/forest'

/** A long-time player from before the charter existed: lots of history, charter at its default. */
function veteran(g: GamificationData) {
    g.landSize = 8
    g.streak = { current: 12, longest: 31, lastCheckInDate: '', shieldMonth: '', shieldsUsed: 0 }
    g.lifetimeStats = {
        ...g.lifetimeStats,
        totalFocusMinutes: 4380, totalPomodoros: 171, treesGrown: 168, tasksCompleted: 142,
        questsCompleted: 61, chestsOpened: 24, cropsHarvested: 37,
    }
    g.homestead = [
        placed('building', 'campfire', 2, 2, { id: 'init_campfire' }),
        placed('building', 'stone_well', 4, 2, { level: 3 }),
        placed('building', 'cabin', 1, 4, { level: 3 }),
        ...[0, 1, 3, 5, 6, 7].map((x) => placed('tree', 'ancient_oak', x, 0, { level: 3 })),
        ...[0, 1, 3, 5, 6, 7].map((x) => placed('tree', 'sakura', x, 7, { level: 3 })),
    ]
}

test('a new village is a Clearing working on its first chapter', () => {
    const t = makeEngine()
    t.engine.ensureToday()
    const status = charterStatus(t.g)
    assert.equal(status.rankName, 'Clearing')
    assert.equal(status.chapter?.title, CHARTER_CHAPTERS[0].title)
    assert.equal(status.done, 0)
    assert.ok(!t.events.some((e) => e.kind === 'rank'))
})

test('every rank after the first has a landmark that cannot be bought', () => {
    for (let rank = 1; rank < CHARTER_RANKS.length; rank++) {
        const landmark = charterLandmark(rank)
        assert.ok(landmark, `rank ${rank} has a landmark`)
        assert.ok(landmark.unique)
    }
    assert.equal(HOMESTEAD_BUILDINGS.filter((b) => b.charterRank).length, CHARTER_CHAPTERS.length)
    const t = makeEngine((g) => (g.sunlight = 99999))
    assert.equal(t.engine.buyBuilding('clock_tower'), false)
    assert.equal(t.g.inventory['building:clock_tower'], undefined)
})

test('an existing player is credited with the chapters their history already meets, in one celebration', () => {
    const t = makeEngine(veteran)
    assert.ok(villageCharm(t.g.homestead) >= 30)
    t.engine.ensureToday()

    // Chapters 1–3 are met by lifetime stats; chapter 4 also needs neighbours' requests
    assert.equal(t.g.charter.rank, 3)
    assert.equal(charterStatus(t.g).rankName, 'Market Town')
    const ranks = t.events.filter((e) => e.kind === 'rank')
    assert.equal(ranks.length, 1, 'one card, not three')
    assert.equal(ranks[0].rank, 'Market Town')
    for (const id of ['hamlet_signpost', 'notice_board', 'market_stall']) {
        assert.equal(t.g.inventory[`building:${id}`], 1, `${id} waits in the inventory`)
        assert.ok(t.g.unlockedBuildings.includes(id))
    }
    // The rollover is not saved by itself, but a rank-up must be, so it is celebrated once
    assert.ok(t.saves > 0)

    const goals = charterStatus(t.g).goals
    assert.deepEqual(goals.filter((s) => !s.done).map((s) => s.goal.id), ['lamps_requests'])

    // A second look the same day does not celebrate again
    const before = t.events.length
    t.engine.ensureToday()
    assert.equal(t.events.length, before)
})

test('a goal once met stays met, and finishing the chapter ranks the village up', () => {
    const t = makeEngine((g) => {
        g.lifetimeStats.treesGrown = 4
        g.lifetimeStats.tasksCompleted = 5
        g.homestead.push(placed('tree', 'classic_pine', 0, 0), placed('tree', 'classic_pine', 1, 0), placed('tree', 'classic_pine', 3, 0))
        g.inventory['building:stone_well'] = 1
    })
    assert.ok(t.engine.placeFromInventory('building:stone_well', 4, 4))
    assert.ok(t.g.charter.met.includes('roots_well'))
    assert.equal(t.g.charter.rank, 0, 'one tree short')

    // Stowing the well again does not un-tick it
    t.engine.stowHomesteadItem(t.g.homestead.find((i) => i.itemId === 'stone_well')?.id ?? '')
    assert.ok(!t.g.homestead.some((i) => i.itemId === 'stone_well'))
    assert.ok(charterStatus(t.g).goals.find((s) => s.goal.id === 'roots_well')?.done)

    t.engine.startSession(25)
    t.engine.completeSession(25)
    assert.equal(t.g.charter.rank, 1)
    assert.equal(t.g.charter.met.length, 0, 'the next chapter starts with a clean slate')
    assert.ok(t.g.charter.reachedOn['1'])
    const rank = t.events.find((e) => e.kind === 'rank')
    assert.equal(rank?.rank, 'Hamlet')
    assert.equal(rank?.buildingId, 'hamlet_signpost')
    assert.ok(rank?.lines.some((l) => l.label.includes('Maren')), 'a new resident moves in')
    assert.equal(t.g.inventory['building:hamlet_signpost'], 1)
})

test('a landmark that is already owned is not handed out twice', () => {
    const t = makeEngine((g) => {
        veteran(g)
        g.homestead.push(placed('building', 'hamlet_signpost', 2, 5))
    })
    t.engine.ensureToday()
    assert.equal(t.g.inventory['building:hamlet_signpost'], undefined)
    assert.equal(t.g.homestead.filter((i) => i.itemId === 'hamlet_signpost').length, 1)
})

test('old saves load with an empty charter and no requests; ranks on disk are kept', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storage = new StorageManager({} as any) as any
    const old = storage.migrate({ version: 3, settings: {}, gamification: { xp: 900, coins: 40, lifetimeStats: { treesGrown: 12 } } })
    assert.deepEqual(old.gamification.charter, { rank: 0, met: [], reachedOn: {} })
    assert.deepEqual(old.gamification.requests, [])
    assert.deepEqual(old.gamification.friendship, {})
    assert.equal(old.gamification.lifetimeStats.requestsFulfilled, 0)
    assert.equal(old.gamification.lifetimeStats.treesGrown, 12)

    const later = storage.migrate({
        version: 3, settings: {},
        gamification: {
            charter: { rank: 99, met: ['x', 3], reachedOn: { 1: '2026-01-01' } },
            requests: [{ id: 'r', residentId: 'hollis', kind: 'tasks', target: 4, progress: '2' }, { nonsense: true }],
        },
    })
    assert.equal(later.gamification.charter.rank, CHARTER_CHAPTERS.length)
    assert.deepEqual(later.gamification.charter.met, ['x'])
    assert.equal(later.gamification.requests.length, 1)
    assert.equal(later.gamification.requests[0].progress, 2)
    assert.ok(later.gamification.requests[0].reward.coins > 0)
})

test('a complete charter has no chapter left and nothing more to do', () => {
    const t = makeEngine((g) => (g.charter = { rank: CHARTER_CHAPTERS.length, met: [], reachedOn: {} }))
    t.engine.startSession(25)
    t.engine.completeSession(25)
    const status = charterStatus(t.g)
    assert.equal(status.chapter, null)
    assert.equal(status.rankName, 'City')
    assert.equal(status.nextRankName, null)
})
