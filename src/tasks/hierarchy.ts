/**
 * Subtasks: tasks nested under another task in a note.
 *
 *     - [ ] Apply fixes to the DRAC paper #drac
 *         - [x] Introduction
 *         - [ ] Background
 *         - [ ] Methodology
 *
 * Obsidian tells each list item which item it sits under. A task's parent is the nearest task
 * above it in that chain, so a plain bullet in between ("- Sections") does not break the link.
 * Nothing here touches the note: it only reads the shape the user already wrote.
 */

/** What a task needs for its place in the tree to be worked out. */
export type NestableTask = {
    path: string
    line: number
    checked: boolean
    description: string
    blockLink: string
    tags: string[]
    actual: number
    expected: number
}

/** A task's place among the other tasks of its note. */
export type TaskNesting = {
    /** Line of the task this one is a subtask of; -1 for a top-level task. */
    parentLine: number
    /** How many tasks it is nested under: 0 for a top-level task. */
    depth: number
    /** Descriptions of the tasks it is nested under, outermost first. */
    ancestors: string[]
    /** Tags of the tasks it is nested under: a subtask belongs to whatever its parent belongs to. */
    inheritedTags: string[]
    /** Its direct subtasks: how many there are and how many are done. */
    subtasks: { done: number; total: number }
    /** Pomodoros on it and on every task nested under it. */
    rollup: { actual: number; expected: number }
}

export const NO_NESTING: TaskNesting = {
    parentLine: -1,
    depth: 0,
    ancestors: [],
    inheritedTags: [],
    subtasks: { done: 0, total: 0 },
    rollup: { actual: 0, expected: 0 },
}

/**
 * Places each task of one note in the tree.
 *
 * @param tasks the note's tasks, in any order
 * @param parentOf the list item each list item sits under, by line (Obsidian's `ListItemCache.parent`,
 *                 which is negative for an item at the root of its list)
 * @returns the tasks in note order, each with its nesting
 */
export function nestTasks<T extends NestableTask>(
    tasks: T[],
    parentOf: Map<number, number>,
): (T & TaskNesting)[] {
    const sorted = [...tasks].sort((a, b) => a.line - b.line)
    const byLine = new Map<number, T & TaskNesting>()

    const taskParent = (line: number): number => {
        let p = parentOf.get(line) ?? -1
        // Walk up through plain bullets until a task (or the root) is reached
        const seen = new Set<number>()
        while (p >= 0 && !byLine.has(p) && !seen.has(p)) {
            seen.add(p)
            p = parentOf.get(p) ?? -1
        }
        return p >= 0 && byLine.has(p) ? p : -1
    }

    // A parent always comes before its children in the note, so one pass in note order is enough
    const out: (T & TaskNesting)[] = []
    for (const task of sorted) {
        const parentLine = taskParent(task.line)
        const parent = parentLine >= 0 ? byLine.get(parentLine) : undefined
        const nested: T & TaskNesting = {
            ...task,
            parentLine,
            depth: parent ? parent.depth + 1 : 0,
            ancestors: parent ? [...parent.ancestors, parent.description] : [],
            inheritedTags: parent ? unique([...parent.inheritedTags, ...parent.tags]) : [],
            subtasks: { done: 0, total: 0 },
            rollup: { actual: Math.max(0, task.actual), expected: Math.max(0, task.expected) },
        }
        byLine.set(task.line, nested)
        out.push(nested)
    }

    // Children before parents, so pomodoros add up all the way to the top
    for (let i = out.length - 1; i >= 0; i--) {
        const task = out[i]
        const parent = byLine.get(task.parentLine)
        if (!parent) continue
        parent.subtasks.total++
        if (task.checked) parent.subtasks.done++
        parent.rollup.actual += task.rollup.actual
        parent.rollup.expected += task.rollup.expected
    }
    return out
}

const unique = (list: string[]) => [...new Set(list)]

type Identity = Pick<NestableTask, 'path' | 'line' | 'blockLink' | 'description'>

/** Block ids identify a task once it has one; before that, its place in the note does. */
export function sameTask(a: Identity | undefined, b: Identity | undefined): boolean {
    if (!a || !b || a.path !== b.path) return false
    const la = a.blockLink.trim()
    const lb = b.blockLink.trim()
    if (la && lb) return la === lb
    return a.line === b.line && a.description === b.description
}

/** The task's tags together with the ones it inherits from the tasks it is nested under. */
export function taskTags(task: { tags?: string[]; inheritedTags?: string[] } | undefined): string[] {
    if (!task) return []
    return unique([...(task.inheritedTags ?? []), ...(task.tags ?? [])])
}

/**
 * Tags to pass into a focus session: the task's own branch tags first (so they pick the tree
 * species when mapped), followed by inherited parent/board tags so the overarching topic is
 * always credited too.
 */
export function focusTags(task: { tags?: string[]; inheritedTags?: string[] } | undefined): string[] {
    if (!task) return []
    const seen = new Set<string>()
    const out: string[] = []
    for (const raw of [...(task.tags ?? []), ...(task.inheritedTags ?? [])]) {
        const key = raw.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        out.push(raw)
    }
    return out
}

/** How the task reads in a log or a notice: `Parent › Subtask`. */
export function taskLabel(
    task: { name?: string; text?: string; ancestors?: string[] } | undefined,
): string | undefined {
    if (!task) return undefined
    const own = task.name || task.text
    if (!own) return own
    const trail = (task.ancestors ?? []).filter(Boolean)
    return trail.length ? `${trail.join(' › ')} › ${own}` : own
}

type Nested = NestableTask & Partial<Pick<TaskNesting, 'parentLine'>>

/** The direct subtasks of a task, in note order. */
export function childrenOf<T extends Nested>(list: T[], task: Identity): T[] {
    const me = list.find((t) => sameTask(t, task))
    if (!me) return []
    return list
        .filter((t) => t.path === me.path && t.parentLine === me.line)
        .sort((a, b) => a.line - b.line)
}

/** The task a task is a subtask of. */
export function parentOf<T extends Nested>(list: T[], task: Identity): T | undefined {
    const me = list.find((t) => sameTask(t, task))
    if (!me || me.parentLine === undefined || me.parentLine < 0) return undefined
    return list.find((t) => t.path === me.path && t.line === me.parentLine)
}

/** The tasks a task is nested under, outermost first. */
export function ancestorsOf<T extends Nested>(list: T[], task: Identity): T[] {
    const out: T[] = []
    let parent = parentOf(list, task)
    while (parent && !out.includes(parent)) {
        out.unshift(parent)
        parent = parentOf(list, parent)
    }
    return out
}

/** The first open task nested (at any depth) under a task: the leaf to work on next. */
function firstOpenLeaf<T extends Nested>(list: T[], task: T): T | undefined {
    for (const child of childrenOf(list, task)) {
        if (child.checked) continue
        return firstOpenLeaf(list, child) ?? child
    }
    return undefined
}

export type NextStep<T> = {
    /** The subtask to move on to, if there is one left. */
    next?: T
    /** The task the focused one is a subtask of. */
    parent?: T
    /** Every subtask of the parent is done: the parent itself can be ticked off. */
    parentReady: boolean
}

/**
 * Where to go after (or instead of) the focused task, working down a list of subtasks:
 * - a task with open subtasks: start on its first open one
 * - a subtask: the next open subtask after it under the same parent, then any earlier one
 *   that was skipped, then on up to the parent's own next sibling
 */
export function nextStep<T extends Nested>(
    list: T[],
    focus: Identity | undefined,
    /** The focused task has just been ticked off (the list may not show it yet). */
    done = false,
): NextStep<T> {
    const me = focus ? list.find((t) => sameTask(t, focus)) : undefined
    if (!me) return { parentReady: false }

    const leaf = done || me.checked ? undefined : firstOpenLeaf(list, me)
    if (leaf) return { next: leaf, parent: me, parentReady: false }

    let current: T = me
    let parent = parentOf(list, current)
    const top = parent
    while (parent) {
        const siblings = childrenOf(list, parent).filter((t) => !sameTask(t, current) && !t.checked)
        const after = siblings.find((t) => t.line > current.line)
        const pick = after ?? siblings[0]
        if (pick) return { next: firstOpenLeaf(list, pick) ?? pick, parent: top, parentReady: false }
        // Everything under this parent is done
        if (!parent.checked) return { parent: top, parentReady: parent === top }
        current = parent
        parent = parentOf(list, current)
    }
    return { parent: top, parentReady: false }
}
