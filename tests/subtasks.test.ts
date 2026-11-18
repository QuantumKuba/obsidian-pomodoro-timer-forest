import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { resolveTasks, type TaskItem } from '../src/Tasks'
import { nestTasks, nextStep, sameTask, taskLabel, taskTags, ancestorsOf } from '../src/tasks/hierarchy'

/**
 * The list items Obsidian's metadata cache reports for a note: each item with the line of the
 * item it sits under (negative at the root of a list), and its checkbox, if it has one.
 */
function listItems(content: string) {
    const items: { position: { start: { line: number } }; parent: number; task?: string }[] = []
    const stack: { indent: number; line: number }[] = []
    let listStart = -1
    content.split('\n').forEach((text, line) => {
        const m = text.match(/^(\s*)[-*+] (?:\[(.)\] )?/)
        if (!m) {
            if (text.trim()) {
                stack.length = 0
                listStart = -1
            }
            return
        }
        const indent = m[1].replace(/\t/g, '    ').length
        while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
        if (listStart < 0) listStart = line
        const parent = stack.length ? stack[stack.length - 1].line : -listStart
        items.push({ position: { start: { line } }, parent, task: m[2] })
        stack.push({ indent, line })
    })
    return items
}

function read(content: string): TaskItem[] {
    const file = { path: 'Papers/DRAC.md', name: 'DRAC.md', basename: 'DRAC', extension: 'md' }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return resolveTasks('TASKS', file as any, content, { listItems: listItems(content) } as any)
}

const DRAC = [
    '# DRAC',
    '',
    '- [ ] Apply fixes to the DRAC paper #drac [🍅:: 1/2]',
    '    - [x] Introduction [🍅:: 2/2]',
    '    - [ ] Background ^bg01',
    '    - [ ] Methodology [🍅:: 0/3]',
    '        - [x] Rewrite the sampling paragraph',
    '        - [ ] Redo figure 3 #figures',
    '    - [ ] Results',
    '- [ ] Email the supervisor',
].join('\n')

const byName = (tasks: TaskItem[], description: string) => {
    const t = tasks.find((t) => t.description.startsWith(description))
    assert.ok(t, `no task “${description}”`)
    return t
}

test('subtasks know the task they belong to', () => {
    const tasks = read(DRAC)
    const parent = byName(tasks, 'Apply fixes')
    const intro = byName(tasks, 'Introduction')
    const fig = byName(tasks, 'Redo figure 3')
    const email = byName(tasks, 'Email')

    assert.equal(parent.depth, 0)
    assert.equal(parent.parentLine, -1)
    assert.equal(intro.parentLine, parent.line)
    assert.equal(intro.depth, 1)
    assert.equal(fig.depth, 2)
    assert.deepEqual(fig.ancestors, ['Apply fixes to the DRAC paper #drac', 'Methodology'])
    assert.equal(email.depth, 0)
    assert.deepEqual(email.ancestors, [])
})

test('a parent counts its direct subtasks and adds up their pomodoros', () => {
    const tasks = read(DRAC)
    const parent = byName(tasks, 'Apply fixes')
    assert.deepEqual(parent.subtasks, { done: 1, total: 4 })
    // 1/2 of its own, 2/2 on the introduction, 0/3 on the methodology
    assert.deepEqual(parent.rollup, { actual: 3, expected: 7 })
    assert.deepEqual(byName(tasks, 'Methodology').subtasks, { done: 1, total: 2 })
    assert.deepEqual(byName(tasks, 'Results').subtasks, { done: 0, total: 0 })
})

test('subtasks inherit the tags of the tasks they sit under, for islands and quests', () => {
    const tasks = read(DRAC)
    const fig = byName(tasks, 'Redo figure 3')
    assert.deepEqual(fig.inheritedTags, ['#drac'])
    assert.deepEqual(taskTags(fig), ['#drac', '#figures'])
    assert.deepEqual(taskTags(byName(tasks, 'Email')), [])
})

test('a plain bullet between a task and its checkboxes does not break the link', () => {
    const tasks = read(['- [ ] Write the thesis', '    - Chapters', '        - [ ] Chapter 1', '        - [ ] Chapter 2'].join('\n'))
    const thesis = byName(tasks, 'Write the thesis')
    assert.equal(byName(tasks, 'Chapter 1').parentLine, thesis.line)
    assert.deepEqual(thesis.subtasks, { done: 0, total: 2 })
})

test('a list at the very top of a note nests like any other', () => {
    const tasks = read(['- [ ] First', '- [ ] Second', '    - [ ] Under the second'].join('\n'))
    assert.equal(byName(tasks, 'First').parentLine, -1)
    assert.equal(byName(tasks, 'Second').parentLine, -1)
    assert.equal(byName(tasks, 'Under the second').parentLine, 1)
    const nested = read(['- [ ] Top', '    - [ ] Child'].join('\n'))
    assert.equal(byName(nested, 'Child').parentLine, 0)
})

test('separate lists and flat notes stay flat', () => {
    const tasks = read(['- [ ] One', '- [ ] Two', '', 'Some text', '', '- [ ] Three'].join('\n'))
    assert.ok(tasks.every((t) => t.depth === 0 && t.parentLine === -1))
})

test('logs read Parent › Subtask', () => {
    const tasks = read(DRAC)
    const fig = byName(tasks, 'Redo figure 3')
    assert.equal(taskLabel({ ...fig, name: fig.description }), 'Apply fixes to the DRAC paper #drac › Methodology › Redo figure 3 #figures')
    assert.equal(taskLabel({ name: 'Email', ancestors: [] }), 'Email')
    assert.equal(taskLabel(undefined), undefined)
    assert.deepEqual(
        ancestorsOf(tasks, fig).map((t) => t.description),
        ['Apply fixes to the DRAC paper #drac', 'Methodology'],
    )
})

test('focusing a task with subtasks starts on its first open one', () => {
    const tasks = read(DRAC)
    const step = nextStep(tasks, byName(tasks, 'Apply fixes'))
    assert.equal(step.next?.description, 'Background')
    // Methodology's first open step is deeper down
    assert.equal(nextStep(tasks, byName(tasks, 'Methodology')).next?.description, 'Redo figure 3 #figures')
})

test('finishing a subtask moves on to the next open one under the same parent', () => {
    const tasks = read(DRAC)
    const bg = byName(tasks, 'Background')
    const step = nextStep(tasks, bg, true)
    // Methodology has open steps of its own: go straight to the first one
    assert.equal(step.next?.description, 'Redo figure 3 #figures')
    assert.equal(step.parent?.description, 'Apply fixes to the DRAC paper #drac')
    assert.equal(step.parentReady, false)

    // The last step of Methodology: Methodology itself is ready to be ticked off
    const last = nextStep(tasks, byName(tasks, 'Redo figure 3'), true)
    assert.equal(last.next, undefined)
    assert.equal(last.parentReady, true)
    assert.equal(last.parent?.description, 'Methodology')
    // Once it is ticked off, the parent's next step follows
    const ticked = tasks.map((t) => (t.description === 'Methodology' ? { ...t, checked: true } : t))
    assert.equal(nextStep(ticked, byName(ticked, 'Methodology'), true).next?.description, 'Results')
    // The last open step wraps round to one that was skipped
    assert.equal(nextStep(tasks, byName(tasks, 'Results'), true).next?.description, 'Background')
})

test('finishing the last subtask says the parent can be ticked off', () => {
    const tasks = read(['- [ ] Submit the paper', '    - [x] Proofread', '    - [ ] Upload ^up01'].join('\n'))
    const step = nextStep(tasks, byName(tasks, 'Upload'), true)
    assert.equal(step.next, undefined)
    assert.equal(step.parentReady, true)
    assert.equal(step.parent?.description, 'Submit the paper')
})

test('a top-level task with no subtasks has no next step', () => {
    const tasks = read(DRAC)
    const step = nextStep(tasks, byName(tasks, 'Email'), true)
    assert.equal(step.next, undefined)
    assert.equal(step.parent, undefined)
    assert.equal(step.parentReady, false)
})

test('the focused subtask is found by its block id even after lines move', () => {
    const tasks = read(DRAC)
    const bg = byName(tasks, 'Background')
    assert.ok(sameTask(bg, { ...bg, line: bg.line + 5 }))
    assert.ok(!sameTask(bg, byName(tasks, 'Results')))
})

test('nesting works on tasks given in any order', () => {
    const base = { path: 'a.md', blockLink: '', tags: [], actual: 0, expected: 0, checked: false }
    const nested = nestTasks(
        [
            { ...base, line: 2, description: 'child' },
            { ...base, line: 1, description: 'parent' },
        ],
        new Map([
            [1, -1],
            [2, 1],
        ]),
    )
    assert.deepEqual(
        nested.map((t) => [t.description, t.depth]),
        [
            ['parent', 0],
            ['child', 1],
        ],
    )
})
