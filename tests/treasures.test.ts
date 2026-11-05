import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { makeEngine, placed } from './helpers'
import StorageManager from '../src/services/StorageManager'
import { addDays, dateKey } from '../src/services/Progression'
import { requestReward } from '../src/services/Neighbours'
import { CHEST_PITY, VISIBLE_PICKUPS, chestTreasure, makePickup, pickupSpots, questCareItem, visiblePickups } from '../src/services/Treasures'
import { HEART_BLESSING_PCT, HEART_STAGES, heartNeed, heartStage } from '../src/services/HeartTree'
import {
    CARE_FOR, CHARTER_ORNAMENTS, CHEST_CARE, CHEST_ORNAMENTS, ORNAMENTS, RESIDENT_TREASURES, TREASURES, isOrnament,
} from '../src/assets/treasureCatalog'
import { FLORA_SPECIES, HOMESTEAD_BUILDINGS } from '../src/assets/floraCatalog'
import { renderVillage } from '../src/render/VillageScene'
import type { DailyQuest, DailyQuestBoard, GamificationData, HeartTreeState, VillagerRequest } from '../src/types/forest'

const today = dateKey()
const OAK = 'oak_heart'

/** A village with an oak in it, quests set for today, and nothing new to be pinned. */
function village(more: (g: GamificationData) => void = () => {}) {
    return makeEngine((g) => {
        g.homestead.push(placed('tree', 'ancient_oak', 0, 0, { id: OAK }), placed('tree', 'classic_pine', 4, 4, { id: 'pine' }))
        g.lastVisitDate = today
        g.lastRequestDate = today
        g.questBoard = { date: today, quests: [quest('q1'), quest('q2'), quest('q3')], chestClaimed: false }
        more(g)
    })
}

function quest(id: string, extra: Partial<DailyQuest> = {}): DailyQuest {
    return { id, kind: 'break', title: `Quest ${id}`, target: 1, progress: 0, rewardSunlight: 10, rewardCoins: 1, rewardXp: 5, claimed: false, ...extra }
}

const needed = () => CARE_FOR[heartNeed(today)]
/** Today's quest board and the Heart Tree, which these tests always set up. */
const board = (g: GamificationData) => g.questBoard as DailyQuestBoard
const heart = (g: GamificationData) => g.heartTree as HeartTreeState

test('only missions hand out treasures: nothing in the market shares an id with one', () => {
    const sold = new Set([...FLORA_SPECIES.map((s) => s.id), ...HOMESTEAD_BUILDINGS.map((b) => b.id)])
    for (const t of TREASURES) assert.ok(!sold.has(t.id), `${t.id} is not for sale`)
    assert.equal(ORNAMENTS.length, 12)
    // Every ornament has exactly one source
    const sources = [...CHARTER_ORNAMENTS, ...Object.values(RESIDENT_TREASURES).map((r) => r.ornament), ...CHEST_ORNAMENTS]
    assert.deepEqual([...sources].sort(), ORNAMENTS.map((o) => o.id).sort())
})

test('each finished quest leaves a care item in the village, today’s need first', () => {
    const t = village((g) => {
        g.heartTree = { itemId: OAK, speciesId: 'ancient_oak', bond: 0, tendedOn: '', blessing: false, hung: [], chosenOn: today }
    })
    t.engine.completeBreak()
    assert.equal(t.g.pickups.length, 3, 'all three break quests')
    assert.equal(t.g.pickups[0].itemId, needed(), 'the first brings what the tree needs today')
    assert.equal(t.g.pickups[0].source, 'quest')
    assert.equal(new Set(t.g.pickups.map((p) => p.itemId)).size, 3, 'then whatever is running lowest')
    assert.deepEqual(t.g.satchel, {}, 'nothing lands in the satchel by itself')
    const card = t.events.find((e) => e.kind === 'quest')
    assert.ok(card?.lines.some((l) => l.label.includes('waiting by your Heart Tree')), 'the quest card mentions the find')
})

test('without a Heart Tree, quests still bring care items, spread evenly', () => {
    const t = village()
    assert.equal(questCareItem(t.g, today), 'spring_water')
    t.g.satchel = { spring_water: 2, leaf_mould: 1, pruning_twine: 3 }
    assert.equal(questCareItem(t.g, today), 'leaf_mould')
})

test('the daily chest holds an ornament within a few chests, never twice the same, then the salve', () => {
    const t = village((g) => board(g).quests.forEach((q) => (q.claimed = true)))
    let dry = 0
    let longestDry = 0
    for (let day = 0; day < 20; day++) {
        board(t.g).chestClaimed = false
        t.engine.openDailyChest()
        const find = t.g.pickups[t.g.pickups.length - 1]
        if (isOrnament(find.itemId)) dry = 0
        else longestDry = Math.max(longestDry, ++dry)
        t.engine.collectPickups()
        if (CHEST_ORNAMENTS.every((id) => t.g.ornaments.includes(id))) break
    }
    assert.deepEqual([...t.g.ornaments].sort(), [...CHEST_ORNAMENTS].sort())
    assert.ok(longestDry < CHEST_PITY, `at most ${CHEST_PITY - 1} chests in a row without one (was ${longestDry})`)
    // Once both are found the chest holds the salve
    board(t.g).chestClaimed = false
    t.engine.openDailyChest()
    assert.equal(t.g.pickups[0].itemId, CHEST_CARE)
    assert.equal(t.g.ornaments.length, CHEST_ORNAMENTS.length, 'no duplicates')
})

test('chest pity: after two chests without one, the third always holds an ornament', () => {
    const t = village()
    for (let n = 0; n < 30; n++) {
        t.g.lifetimeStats.chestsOpened = n
        t.g.chestPity = CHEST_PITY - 1
        assert.ok(chestTreasure(t.g, addDays(today, n)).ornament)
    }
    t.g.ornaments = [...CHEST_ORNAMENTS]
    t.g.chestPity = 99
    assert.deepEqual(chestTreasure(t.g, today), { itemId: CHEST_CARE, ornament: false })
})

test('a fulfilled request leaves the resident’s care item, and their ornament once, at two hearts', () => {
    const ask = (): VillagerRequest => ({
        id: `req_${Math.random()}`, residentId: 'hollis', kind: 'tasks', title: 'Tick off 1 task', quote: 'Go on.',
        target: 1, progress: 0, postedOn: today, reward: requestReward('tasks'),
    })
    const t = village((g) => (g.requests = [ask()]))
    t.engine.onTaskCompleted('a', 'A task', false)
    assert.deepEqual(t.g.pickups.map((p) => p.itemId), ['leaf_mould'])
    assert.equal(t.g.pickups[0].residentId, 'hollis')

    t.g.requests = [ask()]
    t.engine.onTaskCompleted('b', 'Another task', false)
    assert.deepEqual(t.g.pickups.map((p) => p.itemId), ['leaf_mould', 'leaf_mould', 'birdhouse'], '♥♥ brings the birdhouse')
    const card = t.events.filter((e) => e.kind === 'request').pop()
    assert.ok(card?.lines.some((l) => l.label.includes('Birdhouse from Hollis')))

    t.engine.collectPickups()
    t.g.requests = [ask()]
    t.engine.onTaskCompleted('c', 'A third task', false)
    assert.deepEqual(t.g.pickups.map((p) => p.itemId), ['leaf_mould'], 'never a second birdhouse')
})

test('each charter chapter brings its rare ornament, and older saves get theirs once', () => {
    // A veteran whose village signed three chapters before ornaments existed
    const vet = village((g) => (g.charter.rank = 3))
    vet.engine.ensureToday()
    assert.deepEqual(vet.g.pickups.map((p) => p.itemId), CHARTER_ORNAMENTS.slice(0, 3))
    vet.engine.ensureToday()
    vet.engine.completeBreak()
    assert.equal(vet.g.pickups.filter((p) => p.source === 'charter').length, 3, 'only once')
    vet.engine.collectPickups()
    vet.engine.completeBreak()
    assert.equal(vet.g.pickups.filter((p) => p.source === 'charter').length, 0, 'not again once found')

    // Signing a chapter now: the rank card mentions it
    const t = village((g) => {
        g.lifetimeStats.treesGrown = 5
        g.lifetimeStats.tasksCompleted = 5
        g.homestead.push(placed('tree', 'sakura', 1, 0), placed('tree', 'sakura', 2, 0), placed('building', 'stone_well', 3, 0))
    })
    t.engine.completeBreak()
    assert.equal(t.g.charter.rank, 1)
    assert.ok(t.g.pickups.some((p) => p.itemId === CHARTER_ORNAMENTS[0]))
    assert.ok(t.events.find((e) => e.kind === 'rank')?.lines.some((l) => l.label.includes('Carved Heart')))
})

test('finds wait in the village: a handful shown, the rest queued, each on its own free tile', () => {
    const t = village((g) => {
        for (let i = 0; i < 7; i++) g.pickups.push(makePickup('spring_water', 'quest', today, { id: `p${i}` }))
    })
    assert.equal(visiblePickups(t.g).length, VISIBLE_PICKUPS)
    const spots = pickupSpots(t.g)
    assert.equal(spots.length, VISIBLE_PICKUPS)
    assert.equal(new Set(spots.map((s) => `${s.x},${s.y}`)).size, spots.length, 'never two on one tile')
    for (const s of spots) assert.ok(!t.g.homestead.some((i) => i.gridX === s.x && i.gridY === s.y), 'never on something built')
    const html = renderVillage(t.g, { pickups: true, interactive: true })
    assert.equal(html.match(/data-pickup=/g)?.length, VISIBLE_PICKUPS)
    assert.ok(!renderVillage(t.g).includes('data-pickup='), 'only the interactive village draws them')

    const got = t.engine.collectPickups(['p0'])
    assert.deepEqual(got.map((p) => p.id), ['p0'])
    assert.equal(t.g.satchel.spring_water, 1)
    assert.equal(t.g.pickups.length, 6)
    assert.equal(t.events[t.events.length - 1].minor, true, 'a care item is a passing toast')
    t.engine.collectPickups()
    assert.equal(t.g.satchel.spring_water, 7)
    assert.equal(t.g.pickups.length, 0)
    assert.deepEqual(t.engine.collectPickups(), [])
})

test('picking up a new ornament adds it to the collection with a card', () => {
    const t = village((g) => (g.pickups = [makePickup('wind_chime', 'request', today, { residentId: 'ida' })]))
    t.engine.collectPickups()
    assert.deepEqual(t.g.ornaments, ['wind_chime'])
    const card = t.events.find((e) => e.kind === 'treasure')
    assert.equal(card?.minor, undefined)
    assert.equal(card?.treasureId, 'wind_chime')
    assert.ok(card?.subtitle?.includes(`1 of ${ORNAMENTS.length}`))
})

test('choosing a Heart Tree, and tending it once a day for bond and a blessing', () => {
    const t = village()
    assert.ok(t.g.heartTree === null, 'nobody has one until they choose')
    assert.equal(t.engine.chooseHeartTree('not_a_tree'), false)
    assert.ok(t.engine.chooseHeartTree(OAK))
    assert.equal(heart(t.g).itemId, OAK)
    assert.equal(heart(t.g).bond, 0)
    assert.ok(t.events.some((e) => e.kind === 'heart'))

    assert.equal(t.engine.tendHeartTree(), false, 'nothing in the satchel yet')
    t.g.satchel = { [needed()]: 2 }
    assert.ok(t.engine.tendHeartTree())
    assert.equal(heart(t.g).bond, 1)
    assert.equal(heart(t.g).tendedOn, today)
    assert.equal(heart(t.g).blessing, true)
    assert.equal(t.g.satchel[needed()], 1)
    assert.equal(t.engine.tendHeartTree(), false, 'once a day')
    assert.equal(heart(t.g).bond, 1)

    // The blessing goes into the next session, then it is spent
    t.engine.startSession(25)
    t.engine.completeSession(25)
    const harvest = t.events.filter((e) => e.kind === 'harvest').pop()
    assert.ok(harvest?.lines.some((l) => l.label.includes('blessing') && l.label.includes(`+${HEART_BLESSING_PCT}%`)))
    assert.ok(harvest?.lines.some((l) => l.label.startsWith('🌳 Heart Tree')), 'and the stage perk')
    assert.equal(heart(t.g).blessing, false)
})

test('the salve meets any need; the tree grows through its stages with the bond', () => {
    const t = village((g) => {
        g.heartTree = { itemId: OAK, speciesId: 'ancient_oak', bond: HEART_STAGES[1].bond - 1, tendedOn: '', blessing: false, hung: [], chosenOn: '' }
        g.satchel = { beeswax_salve: 1 }
    })
    assert.equal(heartStage(t.g).name, 'Young')
    assert.ok(t.engine.tendHeartTree())
    assert.equal(heartStage(t.g).name, 'Rooted')
    const card = t.events.filter((e) => e.kind === 'heart').pop()
    assert.ok(card && !card.minor, 'a new stage gets a card')
    assert.ok(t.g.achievements.includes('heart_rooted'))
    // Bigger in the village at later stages
    const scaleOf = (g: GamificationData) => Number(/class="pf-item pf-heart"[^>]*>(?:<[^>]*>)*?<svg x="[\d.-]+" y="[\d.-]+" width="([\d.]+)"/.exec(renderVillage(g))?.[1])
    const before = scaleOf({ ...t.g, heartTree: { ...heart(t.g), bond: 0 } })
    const after = scaleOf({ ...t.g, heartTree: { ...heart(t.g), bond: HEART_STAGES[4].bond } })
    assert.ok(after > before, `${after} > ${before}`)
})

test('ornaments hang in the slots the stage allows', () => {
    const t = village((g) => {
        g.ornaments = ['owl', 'birdhouse', 'wind_chime']
        g.heartTree = { itemId: OAK, speciesId: 'ancient_oak', bond: 0, tendedOn: '', blessing: false, hung: [], chosenOn: '' }
    })
    assert.equal(t.engine.toggleOrnament('paper_cranes'), false, 'only ornaments found')
    assert.ok(t.engine.toggleOrnament('owl'))
    assert.equal(t.engine.toggleOrnament('birdhouse'), false, 'a young tree has one place')
    heart(t.g).bond = HEART_STAGES[1].bond
    assert.ok(t.engine.toggleOrnament('birdhouse'))
    assert.deepEqual(heart(t.g).hung, ['owl', 'birdhouse'])
    assert.ok(renderVillage(t.g).includes('pf-ornaments'))
    assert.ok(t.engine.toggleOrnament('owl'), 'taken down again')
    assert.deepEqual(heart(t.g).hung, ['birdhouse'])
})

test('choosing another tree keeps every bit of progress, and cannot tend twice in a day', () => {
    const t = village((g) => {
        g.ornaments = ['owl']
        g.heartTree = { itemId: OAK, speciesId: 'ancient_oak', bond: 17, tendedOn: '', blessing: false, hung: ['owl'], chosenOn: '' }
        g.satchel = { spring_water: 3, leaf_mould: 3, pruning_twine: 3 }
    })
    assert.ok(t.engine.tendHeartTree())
    assert.ok(t.engine.chooseHeartTree('pine'))
    assert.equal(heart(t.g).itemId, 'pine')
    assert.equal(heart(t.g).speciesId, 'classic_pine')
    assert.equal(heart(t.g).bond, 18)
    assert.deepEqual(heart(t.g).hung, ['owl'])
    assert.equal(t.engine.tendHeartTree(), false, 'today’s care came along too')
})

test('missed days never cost a thing: no lost bond, no wilting, the blessing waits', () => {
    const t = makeEngine((g) => {
        g.homestead.push(placed('tree', 'ancient_oak', 0, 0, { id: OAK }))
        g.heartTree = { itemId: OAK, speciesId: 'ancient_oak', bond: 31, tendedOn: addDays(today, -40), blessing: true, hung: [], chosenOn: '' }
        g.lastVisitDate = addDays(today, -40)
        g.vitality = 20
    })
    t.engine.ensureToday()
    assert.equal(heart(t.g).bond, 31)
    assert.equal(heartStage(t.g).name, 'Ancient')
    assert.equal(heart(t.g).blessing, true)
    assert.ok(renderVillage(t.g).includes('pf-aura'), 'still glowing')
})

test('stowing the Heart Tree keeps it; planting it again brings it back', () => {
    const t = village((g) => {
        g.heartTree = { itemId: OAK, speciesId: 'ancient_oak', bond: 9, tendedOn: '', blessing: false, hung: [], chosenOn: '' }
    })
    t.engine.stowHomesteadItem(OAK)
    assert.equal(heart(t.g).itemId, null)
    assert.equal(heart(t.g).bond, 9)
    assert.ok(t.engine.placeFromInventory('tree:ancient_oak', 1, 3))
    const oak = t.g.homestead.find((i) => i.itemId === 'ancient_oak')
    assert.equal(heart(t.g).itemId, oak?.id)
})

test('an old save loads with an empty satchel and no Heart Tree; bad data is cleaned up', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storage = new StorageManager({} as any) as any
    const old = storage.migrate({ version: 3, settings: {}, gamification: { xp: 900, coins: 40, lifetimeStats: { treesGrown: 12 } } })
    const g: GamificationData = old.gamification
    assert.deepEqual(g.satchel, {})
    assert.deepEqual(g.ornaments, [])
    assert.deepEqual(g.pickups, [])
    assert.equal(g.heartTree, null)
    assert.equal(g.chestPity, 0)

    const odd = storage.migrate({
        version: 3, settings: {},
        gamification: {
            homestead: [placed('tree', 'sakura', 1, 1, { id: 'kept' })],
            satchel: { spring_water: 2.7, leaf_mould: -3, mystery: 5 },
            ornaments: ['owl', 'owl', 'unicorn'],
            pickups: [
                { id: 'a', itemId: 'owl', source: 'charter', on: today },
                { id: 'b', itemId: 'birdhouse', source: 'request', on: today },
                { id: 'c', itemId: 'birdhouse', source: 'request', on: today },
                { id: 'd', itemId: 'nonsense', source: 'quest', on: today },
            ],
            heartTree: { itemId: 'gone', speciesId: 'ancient_oak', bond: '12', hung: ['owl', 'wind_chime'], blessing: 1 },
            chestPity: 'x',
        },
    }).gamification as GamificationData
    assert.deepEqual(odd.satchel, { spring_water: 2 })
    assert.deepEqual(odd.ornaments, ['owl'])
    assert.deepEqual(odd.pickups.map((p) => p.id), ['b'], 'no ornament twice, nothing unknown')
    assert.equal(odd.heartTree?.itemId, null, 'a tree that is gone leaves the record waiting')
    assert.equal(odd.heartTree?.bond, 12)
    assert.deepEqual(odd.heartTree?.hung, ['owl'], 'only ornaments actually found')
    assert.equal(odd.chestPity, 0)
})
