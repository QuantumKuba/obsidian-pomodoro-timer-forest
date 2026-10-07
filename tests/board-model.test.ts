import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import {
    addCard,
    addLane,
    archiveCards,
    cardDone,
    deleteCard,
    deleteLane,
    hasBoardFrontmatter,
    laneRole,
    makeBoard,
    moveCard,
    moveLane,
    newBoardText,
    parseBoard,
    readCardMeta,
    renameLane,
    setBoardSetting,
    setCardBlockId,
    setCardChecked,
    setLaneComplete,
    toggleSubtask,
    updateCardText,
} from '../src/board/BoardModel'

/** What the Kanban plugin itself writes. */
const KANBAN = [
    '---',
    '',
    'kanban-plugin: board',
    '',
    '---',
    '',
    '## To do',
    '',
    '- [ ] Write the intro #write @{2025-10-03}',
    '- [ ] Collect references',
    '\tsecond line of the card',
    '\t- [x] find the paper',
    '\t- [ ] read it',
    '',
    '',
    '## Doing (2)',
    '',
    '- [ ] Draft the methods [🍅:: 2/4] ^m1',
    '',
    '',
    '## Done',
    '',
    '**Complete**',
    '- [x] Pick a topic',
    '',
    '',
    '***',
    '',
    '## Archive',
    '',
    '- [x] Old card',
    '',
    '%% kanban:settings',
    '```',
    '{"kanban-plugin":"board","list-collapse":[false,false,false]}',
    '```',
    '%%',
].join('\n')

test('reads lanes, cards, the archive and the settings the Kanban plugin writes', () => {
    const doc = parseBoard(KANBAN)
    assert.equal(doc.isBoard, true)
    assert.deepEqual(
        doc.lanes.map((l) => [l.title, l.maxItems, l.complete, l.cards.length]),
        [
            ['To do', 0, false, 2],
            ['Doing', 2, false, 1],
            ['Done', 0, true, 1],
        ],
    )
    const [intro, refs] = doc.lanes[0].cards
    assert.equal(intro.text, 'Write the intro #write @{2025-10-03}')
    assert.equal(intro.meta.due, '2025-10-03')
    assert.deepEqual(intro.meta.tags, ['#write'])
    assert.equal(intro.meta.title, 'Write the intro #write')
    assert.equal(refs.text, 'Collect references\nsecond line of the card\n- [x] find the paper\n- [ ] read it')
    assert.deepEqual(refs.meta.subtasks, { done: 1, total: 2 })
    assert.equal(refs.end - refs.start, 4)

    const draft = doc.lanes[1].cards[0]
    assert.equal(draft.blockId, 'm1')
    assert.equal(draft.key, '^m1')
    assert.equal(draft.meta.actual, 2)
    assert.equal(draft.meta.expected, 4)
    assert.equal(draft.meta.title, 'Draft the methods')

    assert.equal(doc.archive?.cards.length, 1)
    assert.equal(doc.archive?.cards[0].text, 'Old card')
    assert.deepEqual(doc.settings?.data['list-collapse'], [false, false, false])
})

test('notes without the frontmatter key are not boards', () => {
    assert.equal(hasBoardFrontmatter(KANBAN), true)
    assert.equal(hasBoardFrontmatter('# Notes\n- [ ] a task'), false)
    assert.equal(hasBoardFrontmatter('---\ntags: [x]\n---\n## Lane'), false)
    assert.equal(parseBoard('---\nkanban-plugin: basic\n---\n').isBoard, true)
})

test('moving a card into a Complete lane ticks it off; moving it out opens it again', () => {
    const doc = parseBoard(KANBAN)
    const moved = parseBoard(moveCard(doc, { lane: 0, index: 0 }, { lane: 2, index: 0 }))
    assert.deepEqual(moved.lanes.map((l) => l.cards.length), [1, 1, 2])
    const card = moved.lanes[2].cards[0]
    assert.equal(card.checked, true)
    assert.equal(card.text, 'Write the intro #write @{2025-10-03}')

    const back = parseBoard(moveCard(moved, { lane: 2, index: 0 }, { lane: 1, index: 1 }))
    assert.equal(back.lanes[1].cards[1].checked, false)
    assert.equal(back.lanes[1].cards[0].blockId, 'm1')
})

test('a multi-line card moves with all its lines, and the rest of the note is untouched', () => {
    const doc = parseBoard(KANBAN)
    const text = moveCard(doc, { lane: 0, index: 1 }, { lane: 1, index: 0 })
    const moved = parseBoard(text)
    assert.equal(moved.lanes[1].cards[0].text, doc.lanes[0].cards[1].text)
    assert.equal(moved.lanes[1].cards[1].key, '^m1')
    // Frontmatter, archive and settings are byte for byte what they were
    assert.ok(text.startsWith('---\n\nkanban-plugin: board\n\n---\n'))
    assert.ok(text.endsWith(KANBAN.slice(KANBAN.indexOf('***'))))
})

test('reordering inside a lane counts positions without the moved card', () => {
    const doc = parseBoard(KANBAN)
    const down = parseBoard(moveCard(doc, { lane: 0, index: 0 }, { lane: 0, index: 1 }))
    assert.deepEqual(down.lanes[0].cards.map((c) => c.text.split('\n')[0]), ['Collect references', 'Write the intro #write @{2025-10-03}'])
    const same = moveCard(doc, { lane: 0, index: 0 }, { lane: 0, index: 0 })
    assert.equal(same, KANBAN)
})

test('cards can be dropped into an empty lane', () => {
    const empty = newBoardText([{ title: 'To do' }, { title: 'Doing', maxItems: 3 }, { title: 'Done', complete: true }])
    let doc = parseBoard(empty)
    assert.deepEqual(doc.lanes.map((l) => l.cards.length), [0, 0, 0])
    doc = parseBoard(addCard(doc, 0, 'First'))
    doc = parseBoard(addCard(doc, 0, 'Second'))
    doc = parseBoard(addCard(doc, 0, 'Zeroth', { position: 'top' }))
    assert.deepEqual(doc.lanes[0].cards.map((c) => c.text), ['Zeroth', 'First', 'Second'])
    doc = parseBoard(moveCard(doc, { lane: 0, index: 1 }, { lane: 1, index: 0 }))
    doc = parseBoard(moveCard(doc, { lane: 0, index: 0 }, { lane: 2, index: 0 }))
    assert.deepEqual(doc.lanes.map((l) => l.cards.map((c) => c.text)), [['Second'], ['First'], ['Zeroth']])
    assert.equal(doc.lanes[2].cards[0].checked, true)
    assert.equal(doc.lanes[1].maxItems, 3)
    assert.ok(doc.settings)
})

test('a card added to a Complete lane starts ticked off, and new lines are indented under it', () => {
    const doc = parseBoard(KANBAN)
    const added = parseBoard(addCard(doc, 2, 'Ship it\nwith notes', { indent: '    ' }))
    const card = added.lanes[2].cards[1]
    assert.equal(card.checked, true)
    assert.equal(added.lines[card.start + 1], '    with notes')
    assert.equal(card.text, 'Ship it\nwith notes')
})

test('editing a card keeps its check and block id', () => {
    const doc = parseBoard(KANBAN)
    const edited = parseBoard(updateCardText(doc, doc.lanes[1].cards[0], 'Draft the methods section [🍅:: 2/4]'))
    const card = edited.lanes[1].cards[0]
    assert.equal(card.blockId, 'm1')
    assert.equal(card.text, 'Draft the methods section [🍅:: 2/4]')
    assert.equal(parseBoard(updateCardText(doc, doc.lanes[1].cards[0], '  ')).lanes[1].cards.length, 0)
})

test('ticking, block ids, checklists and deleting', () => {
    let doc = parseBoard(KANBAN)
    doc = parseBoard(setCardChecked(doc, doc.lanes[0].cards[0], true))
    assert.equal(doc.lanes[0].cards[0].checked, true)
    doc = parseBoard(setCardBlockId(doc, doc.lanes[0].cards[0], 'ab12'))
    assert.equal(doc.lanes[0].cards[0].blockId, 'ab12')
    assert.ok(doc.lines[doc.lanes[0].cards[0].start].endsWith('@{2025-10-03} ^ab12'))
    doc = parseBoard(toggleSubtask(doc, doc.lanes[0].cards[1], 1))
    assert.deepEqual(doc.lanes[0].cards[1].meta.subtasks, { done: 2, total: 2 })
    doc = parseBoard(deleteCard(doc, doc.lanes[0].cards[1]))
    assert.equal(doc.lanes[0].cards.length, 1)
    assert.equal(doc.lanes[1].cards[0].key, '^m1')
})

test('archiving moves cards under the archive, creating it when needed', () => {
    const doc = parseBoard(KANBAN)
    const archived = parseBoard(archiveCards(doc, [doc.lanes[2].cards[0]]))
    assert.equal(archived.lanes[2].cards.length, 0)
    assert.deepEqual(archived.archive?.cards.map((c) => c.text), ['Old card', 'Pick a topic'])

    const fresh = parseBoard(addCard(parseBoard(newBoardText([{ title: 'Done', complete: true }])), 0, 'Finished'))
    const withArchive = parseBoard(archiveCards(fresh, fresh.lanes[0].cards))
    assert.equal(withArchive.lanes[0].cards.length, 0)
    assert.equal(withArchive.archive?.cards[0].text, 'Finished')
    assert.ok(withArchive.settings, 'the settings block stays at the end')
    assert.ok(withArchive.archive!.end <= withArchive.settings!.start)
})

test('lanes can be added, renamed, limited, marked complete, moved and deleted', () => {
    let doc = parseBoard(KANBAN)
    doc = parseBoard(addLane(doc, 'Review'))
    assert.deepEqual(doc.lanes.map((l) => l.title), ['To do', 'Doing', 'Done', 'Review'])
    assert.ok(doc.archive, 'the archive is still recognised')
    doc = parseBoard(renameLane(doc, doc.lanes[3], 'In review', 2))
    assert.equal(doc.lines[doc.lanes[3].heading], '## In review (2)')
    doc = parseBoard(moveLane(doc, 3, 1))
    assert.deepEqual(doc.lanes.map((l) => l.title), ['To do', 'In review', 'Doing', 'Done'])
    assert.equal(doc.lanes[2].cards[0].key, '^m1')
    doc = parseBoard(setLaneComplete(doc, doc.lanes[1], true))
    assert.equal(doc.lanes[1].complete, true)
    doc = parseBoard(setLaneComplete(doc, doc.lanes[3], false))
    assert.equal(doc.lanes[3].complete, false)
    assert.equal(doc.lanes[3].cards.length, 1)
    doc = parseBoard(deleteLane(doc, doc.lanes[0]))
    assert.deepEqual(doc.lanes.map((l) => l.title), ['In review', 'Doing', 'Done'])
})

test('a first lane on an empty board goes right under the frontmatter', () => {
    const text = addLane(parseBoard('---\n\nkanban-plugin: board\n\n---\n'), 'Ideas')
    assert.ok(text.startsWith('---\n\nkanban-plugin: board\n\n---\n\n## Ideas'), text)
})

test('settings are written into the Kanban settings block', () => {
    const doc = parseBoard(KANBAN)
    const next = parseBoard(setBoardSetting(doc, 'list-collapse', [true, false, false]))
    assert.deepEqual(next.settings?.data, { 'kanban-plugin': 'board', 'list-collapse': [true, false, false] })
    const added = parseBoard(setBoardSetting(parseBoard('---\nkanban-plugin: board\n---\n## A\n'), 'lane-width', 300))
    assert.equal(added.settings?.data['lane-width'], 300)
})

test('lane roles come from the Complete marker, the title or an override', () => {
    assert.equal(laneRole({ title: 'Anything', complete: true }), 'done')
    assert.equal(laneRole({ title: 'Done', complete: false }), 'done')
    assert.equal(laneRole({ title: '✅ Shipped this week', complete: false }), 'done')
    assert.equal(laneRole({ title: 'Zrobione', complete: false }), 'done')
    assert.equal(laneRole({ title: 'In progress', complete: false }), 'active')
    assert.equal(laneRole({ title: 'W trakcie', complete: false }), 'active')
    assert.equal(laneRole({ title: 'Doing', complete: false }), 'active')
    assert.equal(laneRole({ title: 'To do', complete: false }), 'backlog')
    assert.equal(laneRole({ title: 'Backlog', complete: false }), 'backlog')
    assert.equal(laneRole({ title: 'Waiting', complete: false }, { Waiting: 'active' }), 'active')
    assert.equal(laneRole({ title: 'Done', complete: false }, { Done: 'backlog' }), 'backlog')
})

test('a card is finished when it is ticked off or sits in a done lane', () => {
    const doc = parseBoard(KANBAN)
    assert.equal(cardDone(doc.lanes[0].cards[0], 'backlog'), false)
    assert.equal(cardDone(doc.lanes[0].cards[0], 'done'), true)
    assert.equal(cardDone(doc.lanes[2].cards[0], 'backlog'), true)
})

test('card chips: Tasks dates, Dataview fields, priority and Kanban times', () => {
    const m = readCardMeta('Call the bank ⏫ 📅 2025-11-02 🛫 2025-10-30 @@{14:30} #admin')
    assert.equal(m.due, '2025-11-02')
    assert.equal(m.start, '2025-10-30')
    assert.equal(m.priority, 'high')
    assert.equal(m.time, '14:30')
    assert.equal(m.title, 'Call the bank #admin')
    const dv = readCardMeta('Plan [due:: 2025-12-01] [priority:: low]')
    assert.equal(dv.due, '2025-12-01')
    assert.equal(dv.priority, 'low')
    assert.equal(dv.title, 'Plan')
    const custom = readCardMeta('Party @{03/12/2025}')
    assert.equal(custom.due, '')
    assert.equal(custom.dueRaw, '03/12/2025')
    assert.equal(readCardMeta('Read [[Some Note|the note]] **now**').label, 'Read the note now')
})

test('cards keep their identity when completed, tracked or given a date', () => {
    const before = parseBoard('---\nkanban-plugin: board\n---\n## A\n\n- [ ] Write it\n- [ ] Write it\n')
    const after = parseBoard('---\nkanban-plugin: board\n---\n## A\n\n- [x] Write it [🍅:: 1] ✅ 2025-10-07 @{2025-10-08}\n- [ ] Write it\n')
    assert.deepEqual(before.lanes[0].cards.map((c) => c.key), ['Write it', 'Write it#2'])
    assert.deepEqual(after.lanes[0].cards.map((c) => c.key), ['Write it', 'Write it#2'])
})

test('plain list items are cards too, and get a checkbox when ticked', () => {
    const doc = parseBoard('---\nkanban-plugin: board\n---\n\n## Ideas\n\n- an idea\n* another\n\nA note under the lane, not a card.\n')
    assert.deepEqual(doc.lanes[0].cards.map((c) => c.text), ['an idea', 'another'])
    const ticked = setCardChecked(doc, doc.lanes[0].cards[0], true)
    assert.ok(ticked.includes('- [x] an idea'))
    assert.ok(ticked.includes('A note under the lane, not a card.'))
})

test('headings and lists inside fenced code are not lanes or cards', () => {
    const doc = parseBoard('---\nkanban-plugin: board\n---\n\n## Real\n\n- [ ] card\n\n```\n## not a lane\n- [ ] not a card\n```\n')
    assert.equal(doc.lanes.length, 1)
    assert.equal(doc.lanes[0].cards.length, 1)
})

test('Windows line endings are kept', () => {
    const doc = parseBoard(KANBAN.replace(/\n/g, '\r\n'))
    assert.equal(doc.lanes[0].cards[0].text, 'Write the intro #write @{2025-10-03}')
    const moved = moveCard(doc, { lane: 0, index: 0 }, { lane: 1, index: 0 })
    assert.ok(!/[^\r]\n/.test(moved), 'every line ends with CRLF')
})

test('translated markers from the Kanban plugin are understood', () => {
    const doc = parseBoard('---\nkanban-plugin: board\n---\n\n## Fertig\n\n**Fertiggestellt**\n- [x] a\n\n***\n\n## Archiv\n\n- [x] b\n')
    assert.equal(doc.lanes[0].complete, true)
    assert.equal(doc.archive?.cards[0].text, 'b')
})

test('any note can become a board', () => {
    assert.equal(makeBoard('- [ ] a').split('\n')[2], 'kanban-plugin: board')
    const withFm = makeBoard('---\ntags: [x]\n---\nbody')
    assert.equal(withFm, '---\ntags: [x]\nkanban-plugin: board\n---\nbody')
    assert.equal(hasBoardFrontmatter(withFm), true)
})
