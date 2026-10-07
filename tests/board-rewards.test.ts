import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { TFile } from 'obsidian'
import { makeEngine } from './helpers'
import BoardWatcher from '../src/board/BoardWatcher'
import { BOARD_CLEAR_MIN_CARDS, cardReward, dateKey, addDays, estimateOnTarget, generateQuestBoard } from '../src/services/Progression'

const today = dateKey()

/** A board note with these lanes; a lane title ending in * gets the Complete marker. */
function board(lanes: Record<string, string[]>): string {
    const out = ['---', 'kanban-plugin: board', '---', '']
    for (const [title, cards] of Object.entries(lanes)) {
        out.push(`## ${title.replace(/\*$/, '')}`, '')
        if (title.endsWith('*')) out.push('**Complete**')
        out.push(...cards.map((c) => (c.startsWith('- ') ? c : `- [ ] ${c}`)), '', '')
    }
    return out.join('\n')
}

/** A BoardWatcher on a fake vault, with a real game engine behind it. */
function setup(settings: Record<string, unknown> = {}) {
    const t = makeEngine(() => {}, settings)
    const handlers: Record<string, ((...a: unknown[]) => void)[]> = {}
    const on = (name: string, fn: (...a: unknown[]) => void) => {
        ;(handlers[name] ??= []).push(fn)
        return { name }
    }
    const file = Object.assign(new TFile(), { path: 'Projects/Launch.md', basename: 'Launch', extension: 'md' })
    const calls = { done: 0, forget: 0 }
    const timerState = { inSession: false, mode: 'WORK' }
    const plugin = {
        app: {
            metadataCache: { on, getFileCache: () => ({ frontmatter: { 'kanban-plugin': 'board' } }) },
            workspace: { on, onLayoutReady() {}, getActiveFile: () => null },
            vault: { on, cachedRead: async () => '' },
        },
        registerEvent() {},
        storageManager: { getGamification: () => t.g },
        forestEngine: t.engine,
        tracker: { task: undefined as undefined | { path: string; blockLink: string } },
        timer: {
            subscribe(fn: (v: unknown) => void) {
                fn(timerState)
                return () => {}
            },
            markTaskDone: () => calls.done++,
            forgetTaskDone: () => calls.forget++,
        },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const watcher = new BoardWatcher(plugin as any)
    const change = (text: string) => handlers.changed.forEach((fn) => fn(file, text, { frontmatter: { 'kanban-plugin': 'board' } }))
    return { t, watcher, file, change, plugin, calls, timerState }
}

const cardEvents = (t: ReturnType<typeof makeEngine>) => t.events.filter((e) => e.kind === 'task' && e.ref)

test('moving a card into a done lane finishes it, once a day', () => {
    const { t, watcher, file, change } = setup()
    const start = board({ 'To do': ['Write the brief', 'Call the venue'], Done: [] })
    watcher.observe(file, start)
    change(board({ 'To do': ['Call the venue'], Done: ['Write the brief'] }))
    assert.equal(cardEvents(t).length, 1)
    assert.equal(cardEvents(t)[0].ref, 'Projects/Launch.md::Write the brief')
    assert.equal(t.g.lifetimeStats.cardsCompleted, 1)
    assert.equal(t.g.lifetimeStats.tasksCompleted, 1, 'a card counts as a task')
    assert.equal(t.today().cardsCompleted, 1)
    assert.equal(t.g.boards['Projects/Launch.md'].shipped, 1)

    // Back and forth again: nothing more today
    change(board({ 'To do': ['Call the venue', 'Write the brief'], Done: [] }))
    change(board({ 'To do': ['Call the venue'], Done: ['Write the brief'] }))
    assert.equal(cardEvents(t).length, 1)
    assert.equal(t.g.boards['Projects/Launch.md'].shipped, 1)
})

test('ticking a card off where it is finishes it too', () => {
    const { t, watcher, file, change } = setup()
    watcher.observe(file, board({ 'To do': ['Write the brief'] }))
    change(board({ 'To do': ['- [x] Write the brief'] }))
    assert.equal(cardEvents(t).length, 1)
})

test('cards added straight into a done lane, or a lane that becomes done, earn nothing', () => {
    const { t, watcher, file, change } = setup()
    watcher.observe(file, board({ 'To do': ['A'], Waiting: ['B', 'C'] }))
    change(board({ 'To do': ['A'], Waiting: ['B', 'C'], 'Done*': ['- [x] Pasted in'] }))
    assert.equal(cardEvents(t).length, 0)
    change(board({ 'To do': ['A'], 'Waiting*': ['B', 'C'], 'Done*': ['- [x] Pasted in'] }))
    assert.equal(cardEvents(t).length, 0)
    assert.equal(t.g.lifetimeStats.cardsCompleted, 0)
})

test('pomodoros, a good estimate and a met due date add to the reward', () => {
    const { t, watcher, file, change } = setup()
    const card = `Draft the deck [🍅:: 3/3] @{${addDays(today, 1)}}`
    watcher.observe(file, board({ Doing: [card], Done: [] }))
    change(board({ Doing: [], Done: [card] }))
    const [e] = cardEvents(t)
    assert.equal(e.coins, 3 + 2 + 2)
    assert.equal(e.xp, 6 + 6 + 4)
    assert.deepEqual(
        e.lines.map((l) => l.label.replace(/[^\w ]/gu, '').trim()),
        ['Card finished', '3 pomodoros of focus behind it', 'Estimate on target 33', 'Done on time'],
    )
    assert.equal(t.g.lifetimeStats.cardsOnEstimate, 1)
    assert.equal(t.g.boards['Projects/Launch.md'].history[0].onTime, true)
})

test('keeping lanes within their limits is noticed', () => {
    const r = cardReward({ actual: 0, expected: 0, due: '', focused: false, withinWip: true, today })
    assert.equal(r.xp, 8)
    assert.equal(cardReward({ actual: 0, expected: 0, due: '', focused: false, withinWip: false, today }).xp, 6)
    const { t, watcher, file, change } = setup()
    watcher.observe(file, board({ 'Doing (2)': ['A', 'B'], Done: [] }))
    change(board({ 'Doing (2)': ['B'], Done: ['A'] }))
    assert.equal(cardEvents(t)[0].xp, 8)
})

test('estimates count as on target within a quarter, at least one pomodoro either way', () => {
    assert.equal(estimateOnTarget(4, 4), true)
    assert.equal(estimateOnTarget(5, 4), true)
    assert.equal(estimateOnTarget(6, 4), false)
    assert.equal(estimateOnTarget(10, 8), true)
    assert.equal(estimateOnTarget(11, 8), false)
    assert.equal(estimateOnTarget(0, 3), false)
    assert.equal(estimateOnTarget(2, 0), false)
})

test('the card the timer is focused on can end its session early, and pays the focus bonus', () => {
    const { t, watcher, file, change, plugin, calls, timerState } = setup()
    plugin.tracker.task = { path: file.path, blockLink: ' ^k1' }
    timerState.inSession = true
    watcher.observe(file, board({ Doing: ['Fix the bug ^k1'], Done: [] }))
    change(board({ Doing: [], Done: ['Fix the bug ^k1'] }))
    assert.equal(calls.done, 1)
    assert.ok(cardEvents(t)[0].lines.some((l) => l.label.includes('Finished while focusing')))
    change(board({ Doing: ['Fix the bug ^k1'], Done: [] }))
    assert.equal(calls.forget, 1)
})

test('the board remembers when cards started, for cycle times', () => {
    const { t, watcher, file, change } = setup()
    watcher.observe(file, board({ 'To do': ['Plan'], Doing: [], Done: [] }))
    change(board({ 'To do': [], Doing: ['Plan'], Done: [] }))
    const memory = t.g.boards['Projects/Launch.md']
    assert.equal(memory.cards['Plan'].lane, 'Doing')
    assert.equal(memory.cards['Plan'].started, today)
    change(board({ 'To do': [], Doing: [], Done: ['Plan'] }))
    assert.equal(t.g.boards['Projects/Launch.md'].history[0].days, 0)
    assert.equal(t.g.boards['Projects/Launch.md'].cards['Plan'].lane, 'Done')
})

test('a card whose text changed keeps what the board knew about it', () => {
    const { t, watcher, file, change } = setup()
    watcher.observe(file, board({ Doing: ['Plan the launch'] }))
    t.engine.syncBoard(file.path, 'Launch', [{ key: 'Plan the launch', lane: 'Doing', role: 'active' }])
    const seen = t.g.boards[file.path].cards['Plan the launch']
    change(board({ Doing: ['Plan the launch party'] }))
    assert.deepEqual(t.g.boards[file.path].cards['Plan the launch party'], seen)
    assert.equal(t.g.boards[file.path].cards['Plan the launch'], undefined)
})

test('the board memory is only saved when something changed', () => {
    const { t } = setup()
    let writes = 0
    const engine = t.engine as unknown as { storage: { updateGamification: (...a: unknown[]) => void } }
    const original = engine.storage.updateGamification
    engine.storage.updateGamification = (...a: unknown[]) => {
        writes++
        original(...a)
    }
    const cards = [{ key: 'A', lane: 'To do', role: 'backlog' as const }]
    t.engine.syncBoard('B.md', 'B', cards)
    t.engine.syncBoard('B.md', 'B', cards)
    assert.equal(writes, 1)
})

test('finishing every card on a board of five or more clears it, once a day', () => {
    const { t, watcher, file, change } = setup()
    const cards = Array.from({ length: BOARD_CLEAR_MIN_CARDS }, (_, i) => `Card ${i + 1}`)
    watcher.observe(file, board({ 'To do': cards, Done: [] }))
    change(board({ 'To do': [], Done: cards }))
    const cleared = t.events.filter((e) => e.kind === 'achievement' && e.title.includes('is clear'))
    assert.equal(cleared.length, 1)
    assert.equal(t.g.lifetimeStats.boardsCleared, 1)
    assert.ok(t.g.achievements.includes('board_clear'))
    change(board({ 'To do': cards, Done: [] }))
    change(board({ 'To do': [], Done: cards }))
    assert.equal(t.g.lifetimeStats.boardsCleared, 1)
})

test('a small board is not cleared', () => {
    const { t, watcher, file, change } = setup()
    watcher.observe(file, board({ 'To do': ['A', 'B'], Done: [] }))
    change(board({ 'To do': [], Done: ['A', 'B'] }))
    assert.equal(t.g.lifetimeStats.boardsCleared, 0)
})

test('milestones are celebrated once per board', () => {
    const { t, watcher, file, change } = setup()
    t.engine.syncBoard(file.path, 'Launch', [])
    t.g.boards[file.path].shipped = 9
    watcher.observe(file, board({ 'To do': ['Tenth'], Done: [] }))
    change(board({ 'To do': [], Done: ['Tenth'] }))
    const milestone = t.events.find((e) => e.title.startsWith('10 cards finished'))
    assert.ok(milestone)
    assert.equal(milestone!.xp, 10)
    assert.deepEqual(t.g.boards[file.path].milestones, [10])
})

test('cards share the daily cap with tasks but still count on the board', () => {
    const { t, watcher, file, change } = setup()
    t.g.rewardedTaskKeys = { date: today, keys: Array.from({ length: 30 }, (_, i) => `x${i}`) }
    watcher.observe(file, board({ 'To do': ['Late card'], Done: [] }))
    change(board({ 'To do': [], Done: ['Late card'] }))
    assert.equal(cardEvents(t).length, 0)
    assert.equal(t.g.boards[file.path].shipped, 1)
    assert.equal(t.g.lifetimeStats.cardsCompleted, 1)
})

test('no rewards with task rewards turned off, but the board still keeps count', () => {
    const { t, watcher, file, change } = setup({ rewardTaskCompletion: false })
    watcher.observe(file, board({ 'To do': ['A'], Done: [] }))
    change(board({ 'To do': [], Done: ['A'] }))
    assert.equal(cardEvents(t).length, 0)
    assert.equal(t.g.coins, 500)
    assert.equal(t.g.boards[file.path].shipped, 1)
})

test('board quests are only offered to players with boards', () => {
    const days = Array.from({ length: 60 }, (_, i) => addDays('2026-01-01', i))
    const kinds = (boards: boolean) => days.flatMap((d) => generateQuestBoard(d, 4, 25, { boards }).quests.map((q) => q.kind))
    assert.ok(!kinds(false).some((k) => k === 'cards' || k === 'card_focus'))
    assert.ok(kinds(true).includes('cards'))
    assert.ok(kinds(true).includes('card_focus'))
    // Players without boards keep exactly the quests they had
    for (const d of days) assert.deepEqual(generateQuestBoard(d, 4, 25), generateQuestBoard(d, 4, 25, { boards: false }))
})

test('lane roles chosen by hand change what counts as done', () => {
    const { t, watcher, file, change } = setup()
    t.engine.setLaneRole(file.path, 'Launch', 'Shipped to client', 'done')
    watcher.observe(file, board({ 'To do': ['A'], 'Shipped to client': [] }))
    change(board({ 'To do': [], 'Shipped to client': ['A'] }))
    assert.equal(cardEvents(t).length, 1)
})
