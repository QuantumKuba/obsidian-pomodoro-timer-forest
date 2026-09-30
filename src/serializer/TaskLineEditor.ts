import type { TaskFormat } from 'Settings'
import { DEFAULT_SYMBOLS } from './DefaultTaskSerializer'
import { DATAVIEW_SYMBOLS } from './DataviewTaskSerializer'
import { TaskRegularExpressions } from './TaskModels'

/**
 * Edits the pomodoro estimate / count and the start / due dates of one task line in place.
 *
 * Everything else on the line (indentation, status, description, tags, priority, recurrence,
 * a block link…) is left exactly as the user wrote it. Dates use the symbols of the chosen
 * task format, so the result is read back by this plugin, the Tasks plugin and Dataview alike.
 */

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export type TaskLineEdits = {
    /** Planned pomodoros. 0 or null removes the estimate. */
    expected?: number | null
    /** Finished pomodoros. */
    actual?: number
    /** `YYYY-MM-DD`, or null to remove the start date. */
    start?: string | null
    /** `YYYY-MM-DD`, or null to remove the due date. */
    due?: string | null
}

type Kind = 'pomodoros' | 'priority' | 'done' | 'cancelled' | 'due' | 'scheduled' | 'start' | 'created' | 'recurrence' | 'tag'

/** A component found in the trailing part of a task: body.slice(from, to). */
type Span = { kind: Kind; from: number; to: number; match: RegExpMatchArray }

const SYMBOLS = { TASKS: DEFAULT_SYMBOLS, DATAVIEW: DATAVIEW_SYMBOLS } as const

/** Matches are tried in this order on every pass, like the plugin's own parser does. */
const KINDS: [Kind, keyof typeof DEFAULT_SYMBOLS.TaskFormatRegularExpressions][] = [
    ['pomodoros', 'pomodorosRegex'],
    ['priority', 'priorityRegex'],
    ['done', 'doneDateRegex'],
    ['cancelled', 'cancelledDateRegex'],
    ['due', 'dueDateRegex'],
    ['scheduled', 'scheduledDateRegex'],
    ['start', 'startDateRegex'],
    ['created', 'createdDateRegex'],
    ['recurrence', 'recurrenceRegex'],
]

/**
 * Finds the task components that trail the description, in any order and mixed with tags.
 * Regexes are anchored to the end of the text, so the text is cut back one component at a
 * time; offsets in the shortened text are the same as in the original body.
 */
function scan(body: string, format: TaskFormat): Span[] {
    const regexes = SYMBOLS[format].TaskFormatRegularExpressions
    const spans: Span[] = []
    let end = body.length
    let matched: boolean
    let runs = 0
    do {
        matched = false
        for (const [kind, key] of KINDS) {
            const text = body.slice(0, end).trimEnd()
            const match = text.match(regexes[key])
            if (match && match.index !== undefined) {
                spans.push({ kind, from: match.index, to: text.length, match })
                end = match.index
                matched = true
            }
        }
        const text = body.slice(0, end).trimEnd()
        const tag = text.match(TaskRegularExpressions.hashTagsFromEnd)
        if (tag && tag.index !== undefined) {
            // Tags may sit between components; they stay where they are
            spans.push({ kind: 'tag', from: tag.index, to: text.length, match: tag })
            end = tag.index
            matched = true
        }
        runs++
    } while (matched && runs <= 20)
    return spans
}

const pomodoroText = (format: TaskFormat, actual: number, expected: number): string => {
    const value = expected > 0 ? `${actual}/${expected}` : `${actual}`
    return `[${SYMBOLS[format].pomodorosSymbol} ${value}]`
}

const dateText = (format: TaskFormat, kind: 'start' | 'due', date: string): string => {
    const s = SYMBOLS[format]
    const symbol = kind === 'start' ? s.startDateSymbol : s.dueDateSymbol
    return format === 'DATAVIEW' ? `[${symbol} ${date}]` : `${symbol} ${date}`
}

/** Kinds that come after each date in the Tasks plugin's own field order. */
const AFTER: Record<'start' | 'due', Kind[]> = {
    start: ['scheduled', 'due', 'cancelled', 'done'],
    due: ['cancelled', 'done'],
}

/** Pomodoro count and estimate as written on a line; null when it has none. */
export function readPomodoros(line: string, format: TaskFormat): { actual: number; expected: number } | null {
    const body = bodyOf(line)
    if (!body) return null
    const span = scan(body.text, format).find((s) => s.kind === 'pomodoros')
    if (!span) return null
    const [actual, expected] = span.match[1].split('/')
    return { actual: parseInt(actual) || 0, expected: parseInt(expected) || 0 }
}

type Body = { head: string; text: string; tail: string }

/** Splits a task line into the part before its body, the body, and a trailing block link. */
function bodyOf(line: string): Body | null {
    const m = line.match(TaskRegularExpressions.taskRegex)
    if (!m) return null
    // taskRegex's last group is everything after the checkbox and its spaces
    const start = line.length - m[4].length
    let text = line.slice(start)
    let tail = ''
    const link = text.match(/\s+\^[a-zA-Z0-9-]+\s*$/u)
    if (link && link.index !== undefined) {
        tail = text.slice(link.index)
        text = text.slice(0, link.index)
    }
    return { head: line.slice(0, start), text: text.trimEnd(), tail }
}

/** Returns the line with the edits applied; the line unchanged if it is not a task. */
export function editTaskLine(line: string, edits: TaskLineEdits, format: TaskFormat): string {
    // Files with Windows line endings leave a \r on the line
    const cr = line.endsWith('\r') ? '\r' : ''
    if (cr) line = line.slice(0, -1)
    const parts = bodyOf(line)
    if (!parts) return line + cr

    let body = parts.text

    const replaceSpan = (span: Span | undefined, text: string | null): boolean => {
        if (!span) return false
        if (text === null) {
            // Remove the component together with the spaces that separated it from its neighbour
            let from = span.from
            let to = span.to
            if (from > 0) while (from > 0 && body[from - 1] === ' ') from--
            else while (to < body.length && body[to] === ' ') to++
            body = body.slice(0, from) + body.slice(to)
        } else {
            body = body.slice(0, span.from) + text + body.slice(span.to)
        }
        return true
    }

    /** Edits are applied one at a time, each on a freshly scanned body. */
    const find = (kind: Kind) => scan(body, format).find((s) => s.kind === kind)

    const setDate = (kind: 'start' | 'due', date: string | null | undefined) => {
        if (date === undefined) return
        if (date && !DATE_PATTERN.test(date)) return
        const span = find(kind)
        if (date === null || date === '') {
            replaceSpan(span, null)
            return
        }
        const text = dateText(format, kind, date)
        if (replaceSpan(span, text)) return
        // Not there yet: place it before any field that follows it in the Tasks plugin's order
        const later = scan(body, format)
            .filter((s) => AFTER[kind].includes(s.kind))
            .sort((a, b) => a.from - b.from)[0]
        body = later
            ? `${body.slice(0, later.from).trimEnd()} ${text} ${body.slice(later.from)}`
            : `${body} ${text}`
    }

    if (edits.actual !== undefined || edits.expected !== undefined) {
        const span = find('pomodoros')
        const [a, e] = span ? span.match[1].split('/') : ['', '']
        const actual = Math.max(0, edits.actual ?? (parseInt(a) || 0))
        const expected = Math.max(0, edits.expected === undefined ? parseInt(e) || 0 : (edits.expected ?? 0))
        if (actual === 0 && expected === 0) {
            replaceSpan(span, null)
        } else {
            // Keep the brackets / parentheses the user chose
            const open = span ? span.match[0].trimStart()[0] : '['
            const close = open === '(' ? ')' : ']'
            const text = pomodoroText(format, actual, expected).replace(/^\[/, open).replace(/]$/, close)
            if (!replaceSpan(span, text)) {
                // Next to the description, ahead of priority / recurrence / dates
                const first = scan(body, format)
                    .filter((s) => s.kind !== 'tag')
                    .sort((a, b) => a.from - b.from)[0]
                body = first ? `${body.slice(0, first.from).trimEnd()} ${text} ${body.slice(first.from)}` : `${body} ${text}`
            }
        }
    }

    setDate('start', edits.start)
    setDate('due', edits.due)

    return `${parts.head}${body.trimEnd()}${parts.tail}${cr}`
}
