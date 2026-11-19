import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { TFile } from 'obsidian'
import {
    duplicateCard,
    newBoardText,
    parseBoard,
    setBoardDedication,
} from '../src/board/BoardModel'
import { cardToTask } from '../src/board/cards'
import {
    addTagToCardText,
    applyTagCompletion,
    extractTagTrigger,
    normalizeTag,
    rankTagSuggestions,
    removeTagFromCardText,
    toggleTagInCardText,
    withPriority,
    type TagSuggestion,
} from '../src/board/tags'
import { focusTags } from '../src/tasks/hierarchy'
import { resolveTasks } from '../src/Tasks'
import BoardWatcher from '../src/board/BoardWatcher'
import { makeEngine } from './helpers'
import { dateKey, TASK_WATERING_MINUTES } from '../src/services/Progression'

const TODAY = dateKey()

test('parses and updates board frontmatter tags and project without disturbing other fields', () => {
    const inlineDoc = parseBoard([
        '---',
        'kanban-plugin: board',
        'custom: keep-me',
        'project: "Website Relaunch"',
        'tags: [launch, "#Design", launch]',
        '---',
        '',
        '## To do',
        '',
        '- [ ] Ship landing page',
    ].join('\n'))

    assert.equal(inlineDoc.project, 'Website Relaunch')
    assert.deepEqual(inlineDoc.tags, ['#launch', '#Design'])

    const updated = setBoardDedication(inlineDoc, {
        project: 'Launch v2',
        tags: ['launch', 'launch/frontend', '#launch'],
    })
    const reparsed = parseBoard(updated)
    assert.equal(reparsed.project, 'Launch v2')
    assert.deepEqual(reparsed.tags, ['#launch', '#launch/frontend'])
    assert.ok(updated.includes('custom: keep-me'))
    assert.equal(reparsed.lanes[0].cards[0].text, 'Ship landing page')

    // Clearing dedication removes tags and project cleanly
    const cleared = setBoardDedication(reparsed, { project: null, tags: [] })
    const emptyDoc = parseBoard(cleared)
    assert.equal(emptyDoc.project, '')
    assert.deepEqual(emptyDoc.tags, [])
    assert.ok(cleared.includes('custom: keep-me'))
    assert.ok(!cleared.includes('project:'))
    assert.ok(!cleared.includes('tags:'))
})

test('newBoardText can initialize a dedicated board with tags and project', () => {
    const md = newBoardText([{ title: 'To do' }, { title: 'Done', complete: true }], 'en', {
        project: 'Thesis',
        tags: ['#thesis', 'writing'],
    })
    const doc = parseBoard(md)
    assert.equal(doc.isBoard, true)
    assert.equal(doc.project, 'Thesis')
    assert.deepEqual(doc.tags, ['#thesis', '#writing'])
})

test('duplicateCard copies a multi-line card without copying its block id', () => {
    const doc = parseBoard([
        '---',
        'kanban-plugin: board',
        '---',
        '',
        '## Doing',
        '',
        '- [ ] Draft chapter ^abc1',
        '\t- [x] Outline',
        '- [ ] Next card',
    ].join('\n'))

    const out = duplicateCard(doc, doc.lanes[0].cards[0], { indent: '\t' })
    const next = parseBoard(out)
    assert.equal(next.lanes[0].cards.length, 3)
    assert.equal(next.lanes[0].cards[0].blockId, 'abc1')
    assert.equal(next.lanes[0].cards[1].blockId, '')
    assert.equal(next.lanes[0].cards[1].text, 'Draft chapter\n- [x] Outline')
    assert.equal(next.lanes[0].cards[2].text, 'Next card')
})

test('normalizes tags and edits card tags cleanly before trailing metadata', () => {
    assert.equal(normalizeTag('  thesis  '), '#thesis')
    assert.equal(normalizeTag('#project/my app!'), '#project/my-app')
    assert.equal(normalizeTag('12345'), '')
    assert.equal(normalizeTag('###'), '')

    const card = 'Write intro @{2025-10-03} [🍅:: 1/2]'
    const withTag = addTagToCardText(card, 'writing')
    assert.equal(withTag, 'Write intro #writing @{2025-10-03} [🍅:: 1/2]')

    // Duplicate tag (case-insensitive) is a no-op
    assert.equal(addTagToCardText(withTag, '#WRITING'), withTag)

    // Removing #writing does not touch #writing-notes
    const multi = 'Write #writing and #writing-notes\n\t- [ ] detail #writing'
    assert.equal(removeTagFromCardText(multi, '#writing'), 'Write and #writing-notes\n\t- [ ] detail')

    const toggled = toggleTagInCardText('Plan sprint', '#sprint')
    assert.equal(toggled, 'Plan sprint #sprint')
    assert.equal(toggleTagInCardText(toggled, 'sprint'), 'Plan sprint')
})

test('withPriority sets and clears priority in Tasks and Dataview formats while keeping block id', () => {
    const tasksLine = withPriority('- [ ] Fix bug ^k1', 'high', 'TASKS')
    assert.equal(tasksLine, '- [ ] Fix bug ⏫ ^k1')
    assert.equal(withPriority(tasksLine, 'highest', 'TASKS'), '- [ ] Fix bug 🔺 ^k1')
    assert.equal(withPriority(tasksLine, '', 'TASKS'), '- [ ] Fix bug ^k1')

    const dvLine = withPriority('- [ ] Fix bug ^k1', 'medium', 'DATAVIEW')
    assert.equal(dvLine, '- [ ] Fix bug [priority:: medium] ^k1')
    assert.equal(withPriority(dvLine, '', 'DATAVIEW'), '- [ ] Fix bug ^k1')
})

test('extractTagTrigger and applyTagCompletion autocomplete #tags accurately', () => {
    // Triggers at start of text or after whitespace
    assert.deepEqual(extractTagTrigger('#th', 3), { start: 0, end: 3, query: 'th' })
    assert.deepEqual(extractTagTrigger('Draft #', 7), { start: 6, end: 7, query: '' })
    assert.deepEqual(extractTagTrigger('Draft #wr more', 9), { start: 6, end: 9, query: 'wr' })

    // Does not trigger inside wiki-link headings or mid-word hashes
    assert.equal(extractTagTrigger('[[Note#Heading]]', 14), null)
    assert.equal(extractTagTrigger('foo#bar', 7), null)

    const completed = applyTagCompletion('Draft #wr\n\t- [ ] sub', { start: 6, end: 9, query: 'wr' }, '#writing')
    assert.equal(completed.text, 'Draft #writing \n\t- [ ] sub')
    assert.equal(completed.cursor, 'Draft #writing '.length)

    const inlineSpace = applyTagCompletion('Draft #wr now', { start: 6, end: 9, query: 'wr' }, '#writing')
    assert.equal(inlineSpace.text, 'Draft #writing now')
    assert.equal(inlineSpace.cursor, 'Draft #writing '.length)
})

test('rankTagSuggestions prioritizes board branches, board tags, and query matches', () => {
    const pool: TagSuggestion[] = [
        { tag: '#other', count: 20, sources: ['vault'] },
        { tag: '#thesis/intro', count: 1, sources: ['branch'] },
        { tag: '#writing', count: 3, sources: ['board', 'flora'] },
        { tag: '#thesis', count: 0, sources: ['project', 'island'] },
    ]
    const all = rankTagSuggestions('', pool, { boardTags: ['#thesis'], exclude: ['#thesis'] })
    assert.deepEqual(
        all.map((s) => s.tag),
        ['#thesis/intro', '#writing', '#other'],
    )

    const filtered = rankTagSuggestions('th', pool, { boardTags: ['#thesis'] })
    assert.equal(filtered[0].tag, '#thesis/intro')
    assert.equal(filtered[1].tag, '#thesis')
})

test('dedicated board propagates overarching tags and lets card branches steer flora + progress islands', () => {
    const md = newBoardText([{ title: 'Doing' }, { title: 'Done', complete: true }], 'en', {
        project: 'Thesis',
        tags: ['#thesis'],
    })
    const withCards = md.replace('## Doing\n', '## Doing\n\n- [ ] Draft intro #writing ^c1\n- [ ] Literature notes ^c2\n')
    const doc = parseBoard(withCards)
    const file = Object.assign(new TFile(), { path: 'Boards/Thesis.md', name: 'Thesis.md', basename: 'Thesis', extension: 'md' })

    const introTask = cardToTask(file, doc, doc.lanes[0].cards[0], 'TASKS')
    assert.equal(introTask.project, 'Thesis')
    assert.deepEqual(introTask.tags, ['#writing'])
    assert.deepEqual(introTask.inheritedTags, ['#thesis'])
    // Card's own branch tag comes first for flora selection, overarching board tag follows
    assert.deepEqual(focusTags(introTask), ['#writing', '#thesis'])

    const litTask = cardToTask(file, doc, doc.lanes[0].cards[1], 'TASKS')
    assert.deepEqual(focusTags(litTask), ['#thesis'])

    // resolveTasks also inherits board dedication
    const resolved = resolveTasks('TASKS', file, withCards, {
        frontmatter: { 'kanban-plugin': 'board', project: 'Thesis', tags: ['thesis'] },
        listItems: [
            { position: { start: { line: 10 } }, parent: -10, task: ' ' },
            { position: { start: { line: 11 } }, parent: -10, task: ' ' },
        ],
    } as never)
    assert.equal(resolved[0].project, 'Thesis')
    assert.deepEqual(resolved[0].inheritedTags, ['#thesis'])

    // Engine session with branch tag picks branch flora while crediting both islands
    const t = makeEngine((g) => {
        g.unlockedSpecies.push('sakura', 'ancient_oak')
        g.tagMappings.push({ tag: '#thesis', speciesId: 'ancient_oak' })
        g.islands = [
            { id: 'isle_1', index: 1, name: 'Thesis Isle', biome: 'meadow', focus: { kind: 'tag', value: '#thesis' }, bridge: 0, sightedOn: TODAY, minutes: 0, level: 0, notes: 0, notesMark: 0 },
            { id: 'isle_2', index: 2, name: 'Writing Isle', biome: 'sakura_garden', focus: { kind: 'tag', value: '#writing' }, bridge: 0, sightedOn: TODAY, minutes: 0, level: 0, notes: 0, notesMark: 0 },
        ]
    })

    t.engine.startSession(25, introTask.description, introTask.path, focusTags(introTask))
    const result = t.engine.completeSession(25, { taskText: introTask.description, notePath: introTask.path, tags: focusTags(introTask) })
    assert.equal(result?.tree.speciesId, 'sakura', 'card branch #writing picks sakura')
    assert.deepEqual(result?.tree.tags, ['#writing', '#thesis'])
    assert.equal(t.g.islands[0].bridge, 25, 'overarching #thesis island gets 25m')
    assert.equal(t.g.islands[1].bridge, 25, 'branch #writing island gets 25m')

    // Untagged card on the dedicated board still falls back to #thesis flora & island
    t.engine.startSession(25, litTask.description, litTask.path, focusTags(litTask))
    const fallback = t.engine.completeSession(25, { taskText: litTask.description, notePath: litTask.path, tags: focusTags(litTask) })
    assert.equal(fallback?.tree.speciesId, 'ancient_oak')
    assert.equal(t.g.islands[0].bridge, 50)
})

test('completing a card on a dedicated board lays a plank on its island', () => {
    const t = makeEngine((g) => {
        g.islands = [
            { id: 'isle_1', index: 1, name: 'Thesis Isle', biome: 'meadow', focus: { kind: 'tag', value: '#thesis' }, bridge: 0, sightedOn: TODAY, minutes: 0, level: 0, notes: 0, notesMark: 0 },
        ]
    })
    const handlers: Record<string, ((...a: unknown[]) => void)[]> = {}
    const on = (name: string, fn: (...a: unknown[]) => void) => {
        ;(handlers[name] ??= []).push(fn)
        return { name }
    }
    const file = Object.assign(new TFile(), { path: 'Boards/Thesis.md', basename: 'Thesis', extension: 'md' })
    const plugin = {
        app: {
            metadataCache: { on, getFileCache: () => ({ frontmatter: { 'kanban-plugin': 'board', tags: ['thesis'] } }) },
            workspace: { on, onLayoutReady() {}, getActiveFile: () => null },
            vault: { on, cachedRead: async () => '' },
        },
        registerEvent() {},
        storageManager: { getGamification: () => t.g },
        forestEngine: t.engine,
        tracker: { task: undefined },
        timer: { subscribe: (fn: (v: unknown) => void) => (fn({ inSession: false, mode: 'WORK' }), () => {}) },
    }
    const watcher = new BoardWatcher(plugin as never)
    const startBoard = '---\nkanban-plugin: board\ntags:\n  - thesis\n---\n\n## Doing\n\n- [ ] Outline\n\n## Done\n\n**Complete**\n'
    const doneBoard = '---\nkanban-plugin: board\ntags:\n  - thesis\n---\n\n## Doing\n\n## Done\n\n**Complete**\n- [x] Outline\n'
    watcher.observe(file, startBoard)
    handlers.changed.forEach((fn) => fn(file, doneBoard, { frontmatter: { 'kanban-plugin': 'board', tags: ['thesis'] } }))

    assert.equal(t.g.islands[0].bridge, TASK_WATERING_MINUTES)
})
