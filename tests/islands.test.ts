import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { makeEngine, placed } from './helpers'
import StorageManager from '../src/services/StorageManager'
import { generateQuestBoard, perkValue, villageCharm, xpForLevel } from '../src/services/Progression'
import {
    ISLAND_SIGHT_LEVEL, bridgeProgress, bridgeTarget, defaultIslandName, focusRate, frontier, islandBoonPct, islandLandSize, islandLinks,
    islandMapPosition, islandView, isReached, itemsOn, libraryMilestone, masteryLevel, masteryMinutes, nextLibraryMilestone, suggestFocuses,
} from '../src/services/Islands'
import { renderArchipelago } from '../src/render/ArchipelagoMap'
import { renderVillage } from '../src/render/VillageScene'
import type { GamificationData, Island } from '../src/types/forest'

const TODAY = '2026-11-18'

function island(index: number, extra: Partial<Island> = {}): Island {
    return { id: `isle_${index}`, index, name: '', biome: 'coral_lagoon', focus: null, bridge: 0, sightedOn: TODAY, minutes: 0, level: 0, notes: 0, notesMark: 0, ...extra }
}

/** A finished 25-minute session on a note and its tags. */
function focus(t: ReturnType<typeof makeEngine>, minutes: number, ctx: { notePath?: string; tags?: string[]; taskText?: string } = {}) {
    t.engine.startSession(minutes, ctx.taskText, ctx.notePath, ctx.tags)
    return t.engine.completeSession(minutes, ctx)
}

test('bridges get longer with every island, up to a ceiling; mastery has no last level', () => {
    assert.equal(bridgeTarget(1), 75)
    for (let n = 2; n <= 40; n++) assert.ok(bridgeTarget(n) >= bridgeTarget(n - 1), `island ${n}`)
    assert.equal(bridgeTarget(40), 3000)
    assert.equal(masteryLevel(0), 0)
    assert.equal(masteryLevel(masteryMinutes(1)), 1)
    assert.equal(masteryLevel(masteryMinutes(7) - 1), 6)
    assert.ok(masteryLevel(1_000_000) > 100)
    assert.equal(islandLandSize(0), 4)
    assert.equal(islandLandSize(1), 5)
    assert.equal(islandLandSize(99), 8)
    assert.ok(islandBoonPct(99) <= 25)
})

test('a focus is matched by tag (nested too), by folder, by a hub note and its backlinks, or by anything at half pace', () => {
    const ctx = { tags: ['#study/maths', '#urgent'], notePath: 'Projects/Thesis/Chapter 2.md', linked: ['Maps/Thesis.md'] }
    assert.equal(focusRate({ kind: 'tag', value: '#study' }, ctx), 1)
    assert.equal(focusRate({ kind: 'tag', value: '#stud' }, ctx), 0)
    assert.equal(focusRate({ kind: 'folder', value: 'Projects' }, ctx), 1)
    assert.equal(focusRate({ kind: 'folder', value: 'Projects/Thesis' }, ctx), 1)
    assert.equal(focusRate({ kind: 'folder', value: 'Proj' }, ctx), 0)
    assert.equal(focusRate({ kind: 'note', value: 'Maps/Thesis.md' }, ctx), 1)
    assert.equal(focusRate({ kind: 'note', value: 'Projects/Thesis/Chapter 2.md' }, ctx), 1)
    assert.equal(focusRate({ kind: 'note', value: 'Maps/Health.md' }, ctx), 0)
    assert.equal(focusRate({ kind: 'any' }, { tags: [] }), 0.5)
    assert.equal(focusRate(null, ctx), 0)
    assert.equal(defaultIslandName({ kind: 'tag', value: '#study/deep-work' }, 1), 'Deep Work Isle')
    assert.equal(defaultIslandName({ kind: 'folder', value: 'Projects/Thesis' }, 1), 'Thesis Isle')
})

test('the first island is sighted at level 2, and there is only ever one on the horizon', () => {
    const young = makeEngine((g) => (g.xp = 0))
    young.engine.ensureToday()
    assert.deepEqual(young.g.islands, [])

    const t = makeEngine((g) => (g.xp = xpForLevel(ISLAND_SIGHT_LEVEL)))
    t.engine.ensureToday()
    assert.equal(t.g.islands.length, 1)
    assert.equal(frontier(t.g)?.id, 'isle_1')
    assert.equal(t.events.filter((e) => e.kind === 'island').length, 1)
    assert.ok(t.saves > 0, 'the sighting is saved, so it is announced once')
    focus(t, 25)
    t.engine.ensureToday()
    assert.equal(t.g.islands.length, 1, 'no second island while the first is not reached')
    assert.equal(t.g.islands[0].bridge, 0, 'an uncharted island takes no focus')
})

test('only focus on the island’s subject builds its bridge; tasks lay a plank too', () => {
    const t = makeEngine()
    t.engine.ensureToday()
    assert.ok(t.engine.chartIsland('isle_1', { kind: 'tag', value: 'Study' }))
    assert.deepEqual(t.g.islands[0].focus, { kind: 'tag', value: '#study' })

    focus(t, 25, { tags: ['#work'] })
    assert.equal(t.g.islands[0].bridge, 0)
    focus(t, 25, { tags: ['#study'] })
    assert.equal(t.g.islands[0].bridge, 25)
    const card = t.events.filter((e) => e.kind === 'harvest').pop()
    assert.ok(card?.lines.some((l) => l.label.includes('Bridge to Study Isle') && l.label.includes('25/75')))

    t.engine.onTaskCompleted('Notes/Reading.md::^t1', 'Summarise chapter 3 #study', false)
    assert.equal(t.g.islands[0].bridge, 30)
    t.engine.onTaskCompleted('Notes/Reading.md::^t2', 'Water the plants', false)
    assert.equal(t.g.islands[0].bridge, 30)

    t.engine.startSession(25, undefined, undefined, ['#study'])
    t.engine.harvestEarly(10, 25, { tags: ['#study'] })
    assert.equal(t.g.islands[0].bridge, 40)
    assert.equal(t.g.lifetimeStats.islandMinutes, 40)
})

test('an "any focus" island takes every session at half pace, and two islands cannot stand for the same thing', () => {
    const t = makeEngine((g) => (g.islands = [island(1, { focus: { kind: 'tag', value: '#study' }, bridge: 75, reachedOn: TODAY })]))
    t.engine.ensureToday()
    assert.equal(t.g.islands.length, 2)
    assert.equal(t.engine.chartIsland('isle_2', { kind: 'tag', value: '#STUDY' }), false)
    assert.ok(t.engine.chartIsland('isle_2', { kind: 'any' }))
    focus(t, 30)
    assert.equal(t.g.islands[1].bridge, 15)
})

test('finishing the bridge lands on the island: land, its biome at home, a boon, and the next island on the horizon', () => {
    const t = makeEngine((g) => (g.islands = [island(1, { focus: { kind: 'folder', value: 'Projects/Thesis' }, bridge: 60 })]))
    t.engine.ensureToday()
    assert.ok(!t.g.unlockedBiomes.includes('coral_lagoon'))
    focus(t, 25, { notePath: 'Projects/Thesis/Draft.md' })

    const first = t.g.islands[0]
    assert.ok(isReached(first))
    assert.equal(first.bridge, 75, 'no more than the bridge needs')
    assert.equal(bridgeProgress(first).ratio, 1)
    assert.ok(t.g.unlockedBiomes.includes('coral_lagoon'))
    assert.equal(t.g.lifetimeStats.islandsReached, 1)
    assert.ok(t.g.achievements.includes('island_1'))
    const landing = t.events.find((e) => e.kind === 'island' && e.title.includes('reached'))
    assert.ok(landing && landing.sunlight > 0)
    assert.equal(t.g.islands.length, 2, 'another island comes into view')
    assert.equal(frontier(t.g)?.id, 'isle_2')
    assert.notEqual(t.g.islands[1].biome, first.biome)

    // Focus on its subject now pays a little more and raises its mastery; other work does neither
    const boon = (e: { lines: { label: string; sunlight?: number }[] } | undefined) => e?.lines.find((l) => l.label.startsWith('🏝️ Thesis Isle'))
    focus(t, 60, { notePath: 'Projects/Thesis/Draft.md' })
    assert.ok((boon(t.events.filter((e) => e.kind === 'harvest').pop())?.sunlight ?? 0) > 0, 'the boon pays on its subject')
    focus(t, 60, { notePath: 'Inbox/Shopping.md' })
    assert.equal(boon(t.events.filter((e) => e.kind === 'harvest').pop()), undefined)
    assert.equal(t.g.islands[0].minutes, 60)
    assert.equal(t.g.islands[0].level, 1)
    assert.ok(t.events.some((e) => e.kind === 'island' && e.title.includes('Foothold')))
    assert.equal(islandLandSize(t.g.islands[0].level), 5, 'the island grew with its mastery')
})

test('each island is its own land: same tile on two islands, perks and charm count everywhere', () => {
    const t = makeEngine((g) => {
        g.islands = [island(1, { focus: { kind: 'tag', value: '#study' }, bridge: 75, reachedOn: TODAY }), island(2)]
        g.inventory = { 'tree:classic_pine': 3, 'building:cabin': 1 }
        g.unlockedBuildings.push('cabin')
    })
    t.engine.ensureToday()
    assert.ok(t.engine.placeFromInventory('tree:classic_pine', 2, 2) === false, 'the campfire stands there at home')
    assert.ok(t.engine.placeFromInventory('tree:classic_pine', 2, 2, 'isle_1'))
    assert.ok(t.engine.placeFromInventory('building:cabin', 3, 3, 'isle_1'))
    assert.equal(t.engine.placeFromInventory('tree:classic_pine', 2, 2, 'isle_1'), false, 'taken on the island now')
    assert.equal(t.engine.placeFromInventory('tree:classic_pine', 4, 4, 'isle_1'), false, 'beyond a 4×4 island')
    assert.equal(t.engine.placeFromInventory('tree:classic_pine', 0, 0, 'isle_2'), false, 'not reached yet')

    assert.equal(itemsOn(t.g, 'isle_1').length, 2)
    assert.equal(itemsOn(t.g, null).length, 1)
    const view = islandView(t.g, 'isle_1')
    assert.equal(view.landSize, 4)
    assert.equal(view.activeBiome, 'coral_lagoon')
    assert.deepEqual(view.homestead.map((i) => i.itemId).sort(), ['cabin', 'classic_pine'])
    assert.deepEqual(islandView(t.g, null).homestead.map((i) => i.itemId), ['campfire'])
    assert.deepEqual(islandView(t.g, 'isle_2').homestead.map((i) => i.itemId), ['campfire'], 'an island not reached shows home')

    assert.ok(perkValue(t.g.homestead, 'sunlight_pct') > 0, 'a cabin on an island still warms every session')
    assert.ok(villageCharm(t.g.homestead) > villageCharm(itemsOn(t.g, null)))

    // The scene draws one island at a time, whether it is handed the whole game or that island's view
    const cabin = itemsOn(t.g, 'isle_1').find((i) => i.itemId === 'cabin')!
    assert.ok(!renderVillage(t.g).includes(`data-item="${cabin.id}"`), 'home shows nothing from the island')
    assert.ok(renderVillage(t.g).includes('data-item="init_campfire"'))
    for (const scene of [renderVillage(t.g, { island: 'isle_1' }), renderVillage(view, { island: 'isle_1' })]) {
        assert.ok(scene.includes(`data-item="${cabin.id}"`) && !scene.includes('data-item="init_campfire"'))
    }

    const tree = itemsOn(t.g, 'isle_1').find((i) => i.itemType === 'tree')!
    assert.ok(t.engine.moveHomesteadItem(tree.id, 0, 0))
    assert.equal(t.engine.moveHomesteadItem(tree.id, 3, 3), false, 'the cabin is there')
    assert.equal(t.engine.moveHomesteadItem(tree.id, 4, 0), false, 'still off the island')
    t.engine.stowHomesteadItem(tree.id)
    assert.equal(itemsOn(t.g, 'isle_1').length, 1)
})

test('bridges are drawn from the island they leave: outward from home, and back from an island', () => {
    const g = makeEngine((d) => {
        d.islands = [island(1, { focus: { kind: 'tag', value: '#study' }, bridge: 75, reachedOn: TODAY }), island(2, { focus: { kind: 'any' }, bridge: 100 }), island(5)]
    }).g
    const home = islandLinks(g, null)
    assert.deepEqual(home.map((l) => [l.key, l.side, l.progress]), [['isle_1', 'se', 1], ['isle_2', 'sw', 0.5]])
    const there = islandLinks(g, 'isle_1')
    assert.deepEqual(there.map((l) => [l.key, l.side]), [['home', 'nw'], ['isle_5', 'se']])
    assert.deepEqual(islandMapPosition(5), { x: 2, y: 1 })

    const map = renderArchipelago(g, { selected: 'isle_2', idPrefix: 'm' })
    for (const id of ['home', 'isle_1', 'isle_2', 'isle_5']) assert.ok(map.includes(`data-island="${id}"`), id)
    assert.ok(map.includes('Study Isle') && map.includes('100/200 min') && map.includes('Uncharted isle'))
})

test('the library counts the notes on an island’s subject and celebrates the milestones passed after landing', () => {
    assert.equal(libraryMilestone(4), 0)
    assert.equal(libraryMilestone(27), 25)
    assert.equal(libraryMilestone(1700), 1500)
    assert.equal(nextLibraryMilestone(25), 50)
    assert.equal(nextLibraryMilestone(1000), 1500)

    let notes = 8
    const app = {
        vault: { getAbstractFileByPath: () => null, getMarkdownFiles: () => Array.from({ length: notes }, (_, i) => ({ path: `Projects/Thesis/Note ${i}.md` })).concat([{ path: 'Inbox/Other.md' }]) },
        metadataCache: { getFileCache: () => ({}), resolvedLinks: {} },
    }
    const t = makeEngine((g) => (g.islands = [island(1, { focus: { kind: 'folder', value: 'Projects/Thesis' }, bridge: 70 })]), {}, app)
    t.engine.ensureToday()
    focus(t, 25, { notePath: 'Projects/Thesis/Note 1.md' })
    assert.equal(t.g.islands[0].notes, 8)
    assert.equal(t.g.islands[0].notesMark, 5, 'what was already written is the starting point, not a reward')

    const sunlight = t.g.sunlight
    notes = 9
    t.engine.refreshIslandLibraries()
    assert.equal(t.g.islands[0].notes, 9)
    assert.equal(t.g.sunlight, sunlight)
    notes = 12
    t.engine.refreshIslandLibraries()
    assert.equal(t.g.islands[0].notesMark, 10)
    assert.ok(t.g.sunlight > sunlight)
    assert.ok(t.events.some((e) => e.kind === 'island' && e.title.includes('10 notes')))
    notes = 3
    t.engine.refreshIslandLibraries()
    assert.equal(t.g.islands[0].notesMark, 10, 'a milestone is never taken back')
})

test('suggestions come from where the focus went lately and where the notes are, leaving out what has an island', () => {
    const g = makeEngine((d) => {
        d.islands = [island(1, { focus: { kind: 'tag', value: '#work' } })]
        d.dailyLogs = {
            '2026-11-10': {
                date: '2026-11-10', totalMinutes: 150, completedPomodoros: 6,
                trees: [
                    { id: 'a', speciesId: 'classic_pine', plantedAt: '', durationMinutes: 100, status: 'mature', tags: ['#study'], notePath: 'Uni/Maths/Algebra.md' },
                    { id: 'b', speciesId: 'classic_pine', plantedAt: '', durationMinutes: 50, status: 'mature', tags: ['#work'] },
                    { id: 'c', speciesId: 'classic_pine', plantedAt: '', durationMinutes: 500, status: 'withered', tags: ['#gaming'] },
                ],
            },
        }
    }).g as GamificationData
    const out = suggestFocuses(g, { tags: { '#work': 80, '#recipes': 12, '#one-off': 1 }, folders: { Uni: 30, 'Uni/Maths': 20, Journal: 40 }, total: 200 }, TODAY)
    const labels = out.map((s) => s.label)
    assert.deepEqual(labels.slice(0, 2).sort(), ['#study', 'Uni'], 'recent focus counts most')
    assert.ok(!labels.includes('#work'), 'already an island')
    assert.ok(!labels.includes('#gaming') && !labels.includes('#one-off'))
    assert.ok(labels.includes('#recipes') && labels.includes('Journal'))
    assert.equal(labels.filter((l) => l.startsWith('Uni')).length, 1, 'a folder and the folder inside it are one suggestion')
})

test('a charted island adds a quest of its own to the pool', () => {
    const dates = Array.from({ length: 40 }, (_, i) => `2026-10-${String((i % 28) + 1).padStart(2, '0')}-${i}`)
    assert.ok(dates.every((d) => !generateQuestBoard(d, 4, 25).quests.some((q) => q.kind === 'island_focus')))
    const boards = dates.map((d) => generateQuestBoard(d, 4, 25, { island: 'Study Isle' }))
    const quest = boards.flatMap((b) => b.quests).find((q) => q.kind === 'island_focus')
    assert.ok(quest && quest.title.includes('Study Isle') && quest.target === 25)

    const t = makeEngine((g) => (g.islands = [island(1, { focus: { kind: 'tag', value: '#study' } })]))
    t.engine.ensureToday()
    t.g.questBoard!.quests[0] = { ...quest!, id: 'q', progress: 0, claimed: false }
    focus(t, 25, { tags: ['#study'] })
    assert.ok(t.g.questBoard!.quests[0].claimed)
})

test('saves from before the islands load with none; island data is kept, and anything on a missing island comes home', () => {
    const storage = Object.create(StorageManager.prototype) as { migrate(raw: unknown): { gamification: GamificationData } }
    const old = storage.migrate({ version: 3, settings: {}, gamification: { xp: 900 } })
    assert.deepEqual(old.gamification.islands, [])
    assert.equal(old.gamification.lifetimeStats.islandsReached, 0)

    const later = storage.migrate({
        version: 3, settings: {},
        gamification: {
            islands: [
                { index: 1, name: 'Deep Work', focus: { kind: 'tag', value: 'Study/' }, bridge: 9999, reachedOn: '2026-11-01', minutes: 400, level: 0, notes: 12, notesMark: 10 },
                { index: 2, focus: { kind: 'nonsense' }, bridge: -4 },
                { nonsense: true },
            ],
            homestead: [
                placed('building', 'campfire', 2, 2),
                placed('tree', 'sakura', 1, 1, { island: 'isle_1' }),
                placed('tree', 'sakura', 7, 7, { island: 'isle_1' }),
                placed('tree', 'willow', 0, 0, { island: 'isle_2' }),
                placed('tree', 'bamboo', 0, 0, { island: 'isle_9' }),
            ],
        },
    }).gamification
    assert.equal(later.islands.length, 2)
    assert.deepEqual(later.islands[0].focus, { kind: 'tag', value: '#study' })
    assert.equal(later.islands[0].bridge, 75)
    assert.equal(later.islands[0].level, masteryLevel(400), 'mastery follows from the minutes')
    assert.equal(later.islands[1].focus, null)
    assert.equal(later.islands[1].bridge, 0)
    assert.deepEqual(itemsOn(later, 'isle_1').map((i) => [i.gridX, i.gridY]), [[1, 1]])
    assert.deepEqual(itemsOn(later, null).map((i) => i.itemId), ['campfire'])
    assert.equal(later.inventory['tree:sakura'], 1, 'off the island’s land: back to the inventory')
    assert.equal(later.inventory['tree:willow'], 1, 'on an island not reached')
    assert.equal(later.inventory['tree:bamboo'], 1, 'on an island that is not there')
})
