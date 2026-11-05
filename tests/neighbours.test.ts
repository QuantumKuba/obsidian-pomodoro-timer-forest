import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { makeEngine, placed } from './helpers'
import { FRIEND_GIFT, MAX_HEARTS, RESIDENTS, hearts, makeRequest, requestReward, requestSlots, residentsPresent } from '../src/services/Neighbours'
import { GARDEN_PLOT_ID } from '../src/assets/floraCatalog'
import { dateKey } from '../src/services/Progression'
import type { GamificationData, RequestKind, VillagerRequest } from '../src/types/forest'

/** An open request pinned this morning. */
function request(kind: RequestKind, extra: Partial<VillagerRequest> = {}): VillagerRequest {
    const today = dateKey()
    return {
        id: `req_${today}_hollis`, residentId: 'hollis', kind, title: `A ${kind} request`, quote: 'Could you?',
        target: 1, progress: 0, postedOn: today, reward: requestReward(kind), ...extra,
    }
}

/** A village with one request open, and none due today, so nothing new is pinned meanwhile. */
const asking = (r: VillagerRequest, more: (g: GamificationData) => void = () => {}) =>
    makeEngine((g) => {
        g.requests = [r]
        g.lastRequestDate = dateKey()
        more(g)
    })

test('residents move in with the charter ranks', () => {
    const t = makeEngine()
    assert.deepEqual(residentsPresent(t.g).map((r) => r.id), ['hollis'])
    t.g.charter.rank = 3
    assert.equal(residentsPresent(t.g).length, RESIDENTS.length)
})

test('a finished session can bring one new request a day, never more than the slots', () => {
    const t = makeEngine((g) => (g.charter.rank = 3))
    t.engine.startSession(25)
    t.engine.completeSession(25)
    assert.equal(t.g.requests.length, 1)
    assert.equal(t.g.requests[0].progress, 0, 'the session that brought it does not count toward it')
    assert.equal(t.g.lastRequestDate, dateKey())
    const harvest = t.events.find((e) => e.kind === 'harvest')
    assert.ok(harvest?.lines.some((l) => l.label.startsWith('✉️')), 'the harvest card mentions it')

    t.engine.startSession(25)
    t.engine.completeSession(25)
    assert.equal(t.g.requests.length, 1, 'one a day')

    // A new day with every slot taken brings nothing
    const full = makeEngine((g) => {
        g.charter.rank = 3
        g.requests = [request('tasks', { id: 'a', residentId: 'hollis' }), request('tasks', { id: 'b', residentId: 'maren' })]
    })
    assert.equal(requestSlots(full.g), 2)
    full.engine.startSession(25)
    full.engine.completeSession(25)
    assert.equal(full.g.requests.length, 2)
})

test('the Notice Board makes room for one more request', () => {
    const t = makeEngine((g) => g.homestead.push(placed('building', 'notice_board', 0, 0)))
    assert.equal(requestSlots(t.g), 3)
})

test('only residents without an open request are asked, and the pick is the same on every device', () => {
    const t = makeEngine((g) => {
        g.charter.rank = 1
        g.requests = [request('tasks')]
    })
    const a = makeRequest(t.g, '2026-11-04')
    const b = makeRequest(t.g, '2026-11-04')
    assert.equal(a?.residentId, 'maren')
    assert.deepEqual(a, b)
    assert.ok(a)
    t.g.requests.push({ ...a })
    assert.equal(makeRequest(t.g, '2026-11-04'), null, 'everyone present already asked')
})

test('fulfilling a request pays, earns a heart and is celebrated', () => {
    const t = asking(request('minutes', { target: 40 }))
    t.engine.startSession(25)
    t.engine.completeSession(25)
    assert.equal(t.g.requests[0].progress, 25)
    const coins = t.g.coins
    t.engine.startSession(25)
    t.engine.completeSession(25)
    assert.equal(t.g.requests.length, 0)
    assert.equal(hearts(t.g, 'hollis'), 1)
    assert.equal(t.g.lifetimeStats.requestsFulfilled, 1)
    const card = t.events.find((e) => e.kind === 'request')
    assert.equal(card?.residentId, 'hollis')
    assert.equal(card?.coins, requestReward('minutes').coins)
    assert.ok(t.g.coins > coins + requestReward('minutes').coins)
})

test('a species request only counts that tree; a long one only long sessions', () => {
    const t = asking(request('species', { speciesId: 'ancient_oak' }), (g) => g.unlockedSpecies.push('ancient_oak'))
    t.engine.startSession(25)
    t.engine.completeSession(25)
    assert.equal(t.g.requests.length, 1, 'a pine is not an oak')
    t.engine.selectSpecies('ancient_oak')
    t.engine.startSession(25)
    t.engine.completeSession(25)
    assert.equal(t.g.requests.length, 0)

    const long = asking(request('long', { minMinutes: 45 }))
    long.engine.startSession(25)
    long.engine.completeSession(25)
    assert.equal(long.g.requests.length, 1)
    long.engine.startSession(50)
    long.engine.completeSession(50)
    assert.equal(long.g.requests.length, 0)
})

test('a tag request counts focus minutes on that tag, early harvests included', () => {
    const t = asking(request('tag', { tag: '#study', target: 50 }))
    t.engine.startSession(25)
    t.engine.completeSession(25, { taskText: 'Emails', tags: ['#admin'] })
    assert.equal(t.g.requests[0].progress, 0)
    t.engine.startSession(25, 'Read chapter 2 #study')
    t.engine.completeSession(25)
    assert.equal(t.g.requests[0].progress, 25)
    assert.deepEqual(t.today().trees.at(-1)?.tags, ['#study'], 'the tree remembers its tags')
    t.engine.startSession(25, 'Read chapter 3', undefined, ['#Study'])
    t.engine.harvestEarly(25, 30)
    assert.equal(t.g.requests.length, 0)
})

test('task requests only count tasks that pay, so the daily cap keeps them honest', () => {
    const today = dateKey()
    const t = asking(request('tasks', { target: 2 }), (g) => {
        g.rewardedTaskKeys = { date: today, keys: Array.from({ length: 30 }, (_, i) => `k${i}`) }
    })
    t.engine.onTaskCompleted('extra-1', 'Past the cap', false)
    assert.equal(t.g.requests[0].progress, 0)

    const fresh = asking(request('tasks', { target: 2 }))
    fresh.engine.onTaskCompleted('a', 'One', false)
    fresh.engine.onTaskCompleted('a', 'One again', false)
    assert.equal(fresh.g.requests[0].progress, 1, 'the same task twice counts once')
    fresh.engine.onTaskCompleted('b', 'Two', false)
    assert.equal(fresh.g.requests.length, 0)
})

test('breaks and harvests count for their requests', () => {
    const t = asking(request('breaks', { target: 2 }))
    t.engine.completeBreak()
    t.engine.completeBreak()
    assert.equal(t.g.requests.length, 0)

    const h = asking(request('harvest', { target: 1 }), (g) =>
        g.homestead.push(placed('building', GARDEN_PLOT_ID, 0, 0, { cropId: 'carrot', cropGrowth: 50 })),
    )
    h.engine.harvestCrops()
    assert.equal(h.g.requests.length, 0)
})

test('letting a request go costs nothing and brings no new one the same day', () => {
    const t = asking(request('tasks'))
    const before = { coins: t.g.coins, hearts: hearts(t.g, 'hollis') }
    t.engine.declineRequest(t.g.requests[0].id)
    assert.equal(t.g.requests.length, 0)
    assert.equal(t.g.coins, before.coins)
    assert.equal(hearts(t.g, 'hollis'), before.hearts)
    t.engine.startSession(25)
    t.engine.completeSession(25)
    assert.equal(t.g.requests.length, 0)
})

test('at three hearts a keepsake starts to work; at five there is a gift', () => {
    // Hollis's apples: coins with the first tree of the day
    const plain = makeEngine((g) => (g.lastRequestDate = dateKey()))
    const close = makeEngine((g) => {
        g.lastRequestDate = dateKey()
        g.friendship = { hollis: 3 }
    })
    for (const t of [plain, close]) {
        t.engine.startSession(25)
        t.engine.completeSession(25)
    }
    const line = close.events.find((e) => e.kind === 'harvest')?.lines.find((l) => l.label.includes('Hollis'))
    assert.equal(line?.coins, 2)
    assert.equal(close.g.coins - plain.g.coins, 2)

    const t = asking(request('breaks'), (g) => (g.friendship = { hollis: MAX_HEARTS - 1 }))
    t.engine.completeBreak()
    assert.equal(hearts(t.g, 'hollis'), MAX_HEARTS)
    assert.equal(t.g.inventory['tree:sunflower'], FRIEND_GIFT.saplings)
    assert.match(t.events.find((e) => e.kind === 'request')?.title ?? '', /dear friend/)
})

test('requests read naturally', () => {
    const t = makeEngine((g) => {
        g.charter.rank = 2
        g.unlockedSpecies = ['classic_pine', 'ancient_oak']
        g.requests = [request('tasks'), request('tasks', { id: 'm', residentId: 'maren' })]
    })
    for (let day = 1; day <= 28; day++) {
        const r = makeRequest(t.g, `2026-02-${String(day).padStart(2, '0')}`)
        assert.equal(r?.residentId, 'ash')
        assert.ok(!/\ba [AEIOU]/.test(`${r?.title} ${r?.quote}`), `${r?.title} / ${r?.quote}`)
        assert.ok((r?.target ?? 0) > 0)
    }
})
