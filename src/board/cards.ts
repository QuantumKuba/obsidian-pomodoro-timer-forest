import { moment, type App, type TFile } from 'obsidian'
import type { TaskFormat } from 'Settings'
import type { TaskItem } from 'Tasks'
import { DESERIALIZERS } from 'serializer'
import { editTaskLine } from 'serializer/TaskLineEditor'
import { extractTaskComponents } from 'utils'
import type { BoardCard, BoardDoc, CardMeta } from './BoardModel'

/** Obsidian helpers for board cards: dates in the board's format, block ids, the timer's task. */

export const KANBAN_PLUGIN_ID = 'obsidian-kanban'

export function kanbanPluginEnabled(app: App): boolean {
    return !!app.plugins?.plugins?.[KANBAN_PLUGIN_ID]
}

/** The language Obsidian runs in; the Kanban plugin writes its markers in it. */
export function obsidianLanguage(): string {
    try {
        return window.localStorage.getItem('language') || 'en'
    } catch {
        return 'en'
    }
}

/** What new lines inside a card are indented with: the vault's own choice, like the Kanban plugin. */
export function cardIndent(app: App): string {
    const config = (app.vault as unknown as { getConfig?: (key: string) => unknown }).getConfig
    return config?.call(app.vault, 'useTab') === false ? '    ' : '\t'
}

const settingString = (settings: Record<string, unknown> | undefined, key: string, fallback: string) =>
    typeof settings?.[key] === 'string' && settings[key] ? (settings[key] as string) : fallback

/** A card's due date as `YYYY-MM-DD`, reading Kanban dates in the board's own date format. */
export function cardDueDate(meta: CardMeta, settings?: Record<string, unknown>): string {
    if (meta.due) return meta.due
    if (!meta.dueRaw) return ''
    const m = moment(meta.dueRaw, settingString(settings, 'date-format', 'YYYY-MM-DD'), true)
    return m.isValid() ? m.format('YYYY-MM-DD') : ''
}

/** A block id that no card on the board uses yet. */
export function newBlockId(doc: BoardDoc): string {
    const used = new Set(doc.lanes.flatMap((l) => l.cards.map((c) => c.blockId)))
    for (;;) {
        const id = Math.random().toString(36).slice(2, 8)
        if (!used.has(id) && !/^\d+$/.test(id)) return id
    }
}

const splitBlockId = (line: string): [string, string] => {
    const m = line.match(/\s+\^[a-zA-Z0-9-]+\s*$/)
    return m && m.index !== undefined ? [line.slice(0, m.index), line.slice(m.index)] : [line.replace(/\s+$/, ''), '']
}

/** The card's first line with a new pomodoro estimate (0 removes it). */
export function withEstimate(line: string, expected: number, format: TaskFormat): string {
    return editTaskLine(line, { expected }, format)
}

/**
 * The card's first line with a new due date (null removes it). A date already on the card is
 * changed where it is, in the way it is written. A new one is written as a Kanban date when the
 * board uses them or the Kanban plugin is installed, so that plugin shows it too; otherwise in
 * the task format chosen in the settings.
 */
export function withDue(line: string, iso: string | null, opts: { format: TaskFormat; kanbanDates: boolean; settings?: Record<string, unknown> }): string {
    const trigger = settingString(opts.settings, 'date-trigger', '@')
    const t = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const kanban = new RegExp(`(^|\\s)${t}\\{[^}]*\\}`)
    const written = (date: string) => {
        const fmt = settingString(opts.settings, 'date-format', 'YYYY-MM-DD')
        return fmt === 'YYYY-MM-DD' ? date : moment(date, 'YYYY-MM-DD').format(fmt)
    }

    if (kanban.test(line)) {
        if (iso === null) {
            const [text, id] = splitBlockId(line.replace(kanban, ''))
            return `${text.replace(/\s{2,}/g, ' ').replace(/\s+$/, '')}${id}`
        }
        return line.replace(kanban, (_m, lead: string) => `${lead}${trigger}{${written(iso)}}`)
    }
    if (/📅️?\s*\d{4}-\d{2}-\d{2}/u.test(line)) return editTaskLine(line, { due: iso }, 'TASKS')
    if (/\[due::\s*\d{4}-\d{2}-\d{2}\s*\]/.test(line)) return editTaskLine(line, { due: iso }, 'DATAVIEW')
    if (iso === null) return line
    if (opts.kanbanDates) {
        const [text, id] = splitBlockId(line)
        return `${text} ${trigger}{${written(iso)}}${id}`
    }
    return editTaskLine(line, { due: iso }, opts.format)
}

/** True when cards on this board carry Kanban `@{…}` dates. */
export function boardUsesKanbanDates(doc: BoardDoc): boolean {
    return doc.lanes.some((l) => l.cards.some((c) => !!c.meta.dueRaw))
}

/** Kanban dates and times read as noise in a task's description. */
export function stripKanbanDates(text: string): string {
    return text
        .replace(/(^|\s)@@?\{[^}]*\}/g, '$1')
        .replace(/(^|\s)@\[\[[^\]]*\]\]/g, '$1')
        .replace(/\s{2,}/g, ' ')
        .trim()
}

/** The card as a task the timer can focus on. */
export function cardToTask(file: TFile, doc: BoardDoc, card: BoardCard, format: TaskFormat): TaskItem {
    const line = doc.lines[card.start]
    const components = extractTaskComponents(line)
    // Kanban dates go first: the fields the task format reads are read from the end of the line
    const body = stripKanbanDates(components?.body ?? card.text.split('\n')[0])
    const detail = DESERIALIZERS[format].deserialize(body)
    const description = detail.description || card.meta.label
    const date = (m: { format: (f: string) => string } | null) => m?.format('YYYY-MM-DD') ?? ''
    return {
        path: file.path,
        fileName: file.name,
        text: line,
        name: description,
        description,
        status: card.checkChar,
        blockLink: card.blockId ? ` ^${card.blockId}` : '',
        checked: card.checked,
        done: date(detail.doneDate),
        due: cardDueDate(card.meta, doc.settings?.data) || date(detail.dueDate),
        created: date(detail.createdDate),
        cancelled: date(detail.cancelledDate),
        scheduled: date(detail.scheduledDate),
        start: date(detail.startDate),
        priority: detail.priority,
        recurrence: detail.recurrenceRule,
        expected: card.meta.expected,
        actual: card.meta.actual,
        tags: card.meta.tags,
        line: card.start,
        lane: doc.lanes[card.lane]?.title,
    }
}
