/**
 * Kanban boards kept as markdown, in the file format of the Kanban plugin
 * (https://github.com/mgmeyers/obsidian-kanban), so the same note opens in either plugin:
 *
 *     ---
 *     kanban-plugin: board
 *     ---
 *
 *     ## Doing (3)            ← a lane; "(3)" is its card limit
 *
 *     - [ ] A card @{2025-10-03}
 *         more lines of the same card, indented
 *
 *     ## Done
 *
 *     **Complete**            ← cards moved here are ticked off
 *     - [x] A finished card ^a1b2
 *
 *     ***
 *
 *     ## Archive
 *
 *     %% kanban:settings
 *     ```
 *     {"kanban-plugin":"board"}
 *     ```
 *     %%
 *
 * Nothing in here touches Obsidian. A board is read into line ranges, and every edit returns
 * the note's new text with only the affected lines changed: whatever the parser does not
 * understand (notes between lanes, odd spacing, other frontmatter) is left exactly as it was.
 */

export const BOARD_FRONTMATTER_KEY = 'kanban-plugin'

/** What a lane is for. Done lanes finish the cards moved into them. */
export type LaneRole = 'backlog' | 'active' | 'done'

export type Priority = 'highest' | 'high' | 'medium' | 'low' | 'lowest' | ''

export interface CardMeta {
    /** The card's markdown without the fields shown as chips (dates, pomodoros, priority). */
    title: string
    /** The first line of `title`, as plain as possible: for logs, rewards and the timer. */
    label: string
    tags: string[]
    /** `YYYY-MM-DD` when the due date could be read without a date format. */
    due: string
    /** A Kanban `@{…}` date as written, for boards with their own date format. */
    dueRaw: string
    time: string
    start: string
    priority: Priority
    actual: number
    expected: number
    subtasks: { done: number; total: number }
}

export interface BoardCard {
    lane: number
    index: number
    /** First line, and the line after its last one. */
    start: number
    end: number
    checkChar: string
    checked: boolean
    /** The card's markdown: its first line after the checkbox and the lines under it, dedented. */
    text: string
    /** Without the `^`. */
    blockId: string
    meta: CardMeta
    /** Identifies the card while it moves around: its block id, else its text. */
    key: string
}

export interface BoardLane {
    index: number
    /** The heading line, and the line after the lane's last one. */
    heading: number
    end: number
    level: number
    title: string
    /** Card limit, written after the title as `(3)`. 0 for none. */
    maxItems: number
    /** Has the `**Complete**` marker: cards moved here are ticked off. */
    complete: boolean
    completeLine: number
    cards: BoardCard[]
}

export interface BoardArchive {
    /** The `***` line, the `## Archive` heading and the line after the last archived card. */
    rule: number
    heading: number
    end: number
    cards: BoardCard[]
}

export interface BoardSettingsBlock {
    start: number
    end: number
    data: Record<string, unknown>
}

export interface BoardDoc {
    lines: string[]
    eol: string
    /** The frontmatter has the `kanban-plugin` key. */
    isBoard: boolean
    frontmatter: { start: number; end: number } | null
    lanes: BoardLane[]
    archive: BoardArchive | null
    settings: BoardSettingsBlock | null
    /** Where the board's content starts (after the frontmatter) and where lanes end. */
    bodyStart: number
    lanesEnd: number
}

// ---------------------------------------------------------------------------
// Locale: the Kanban plugin writes its markers in the language Obsidian runs in
// ---------------------------------------------------------------------------

const COMPLETE_WORDS: Record<string, string> = {
    en: 'Complete',
    de: 'Fertiggestellt',
    it: 'Completato',
    ja: '完了',
    ko: '완료됨',
    'pt-BR': 'Concluído',
    ru: 'Выполнено',
    zh: '完成',
}
const ARCHIVE_WORDS: Record<string, string> = {
    en: 'Archive',
    de: 'Archiv',
    it: 'Archivio',
    ja: 'アーカイブ',
    ko: '보관됨',
    'pt-BR': 'Arquivado',
    ru: 'Архивировать',
    zh: '归档',
}
const COMPLETE_SET = new Set(Object.values(COMPLETE_WORDS).map((w) => `**${w}**`))
const ARCHIVE_SET = new Set(Object.values(ARCHIVE_WORDS))

/** The marker the Kanban plugin would write in this language, so both plugins agree. */
export function completeMarker(language = 'en'): string {
    return `**${COMPLETE_WORDS[language] ?? COMPLETE_WORDS.en}**`
}

export function archiveTitle(language = 'en'): string {
    return ARCHIVE_WORDS[language] ?? ARCHIVE_WORDS.en
}

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/
const THEMATIC_BREAK = /^ {0,3}([*_-])(?:[ \t]*\1){2,}[ \t]*$/
const FENCE = /^ {0,3}(`{3,}|~{3,})/
/** A top-level list item, with or without a checkbox: indent, marker, check char, text. */
const LIST_ITEM = /^( {0,3})([-*+]|\d{1,9}[.)])(?:[ \t]+|$)(?:\[(.)\](?:[ \t]+|$))?(.*)$/
const BLOCK_ID = /\s+\^([a-zA-Z0-9-]+)\s*$/

const isBlank = (line: string | undefined) => line === undefined || line.trim() === ''
const isIndented = (line: string) => /^(\t| {2,})/.test(line)
const isHeading = (line: string) => HEADING.test(line)
const isBreak = (line: string) => THEMATIC_BREAK.test(line)
const isListItem = (line: string) => !isBreak(line) && LIST_ITEM.test(line)

function headingOf(line: string): { level: number; text: string } | null {
    const m = line.match(HEADING)
    if (!m) return null
    return { level: m[1].length, text: (m[2] ?? '').trim() }
}

/** `Doing (3)` → title `Doing`, limit 3. `<br>` is how the Kanban plugin writes line breaks. */
export function parseLaneTitle(raw: string): { title: string; maxItems: number } {
    const text = raw.replace(/<br>/g, ' ').trim()
    const m = text.match(/^(.*?)\s*\((\d+)\)$/)
    if (!m) return { title: text, maxItems: 0 }
    return { title: m[1], maxItems: Number(m[2]) }
}

export function laneHeading(title: string, maxItems: number, level = 2): string {
    const clean = title.replace(/\r?\n/g, ' ').trim() || 'Untitled'
    return `${'#'.repeat(level)} ${clean}${maxItems > 0 ? ` (${maxItems})` : ''}`
}

// ---------------------------------------------------------------------------
// Card metadata
// ---------------------------------------------------------------------------

const ISO = /^\d{4}-\d{2}-\d{2}$/
const POMODOROS = /[[(]\s*🍅::\s*(\d*)\s*(?:\/\s*(\d*))?\s*[\])]/u
const PRIORITY_EMOJI: [RegExp, Priority][] = [
    [/🔺/u, 'highest'],
    [/⏫/u, 'high'],
    [/🔼/u, 'medium'],
    [/🔽/u, 'low'],
    [/⏬/u, 'lowest'],
]
const TAG = /(^|\s)#([^\s!@#$%^&*(),.?":{}|<>[\]]+)/g

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Reads the chips of a card: due date, pomodoros, priority, tags and its checklist. */
export function readCardMeta(text: string, dateTrigger = '@', timeTrigger = '@@'): CardMeta {
    const lines = text.split('\n')
    const first = lines[0] ?? ''
    const rest = lines.slice(1)

    let dueRaw = ''
    let due = ''
    let time = ''
    let start = ''
    let priority: Priority = ''
    let actual = 0
    let expected = 0

    const t = escapeRegex(timeTrigger)
    const d = escapeRegex(dateTrigger)
    const timeRe = new RegExp(`(^|\\s)${t}\\{([^}]*)\\}`, 'u')
    const dateRe = new RegExp(`(^|\\s)${d}\\{([^}]*)\\}`, 'u')
    const dateLinkRe = new RegExp(`(^|\\s)${d}\\[\\[([^\\]]*)\\]\\]`, 'u')

    let line = first
    const cut = (re: RegExp) => {
        line = line.replace(re, (_m, lead: string) => lead ?? '')
    }

    // The time trigger usually starts with the date trigger, so it goes first
    const tm = line.match(timeRe)
    if (tm) {
        time = tm[2].trim()
        cut(timeRe)
    }
    const dm = line.match(dateRe) ?? line.match(dateLinkRe)
    if (dm) {
        dueRaw = dm[2].trim()
        if (ISO.test(dueRaw)) due = dueRaw
        cut(dateRe)
        cut(dateLinkRe)
    }

    const tasksDue = line.match(/📅️?\s*(\d{4}-\d{2}-\d{2})/u) || line.match(/\[due::\s*(\d{4}-\d{2}-\d{2})\s*\]/u)
    if (tasksDue && !due) due = tasksDue[1]
    const tasksStart = line.match(/🛫\s*(\d{4}-\d{2}-\d{2})/u) || line.match(/\[start::\s*(\d{4}-\d{2}-\d{2})\s*\]/u)
    if (tasksStart) start = tasksStart[1]

    const pm = line.match(POMODOROS)
    if (pm) {
        actual = parseInt(pm[1]) || 0
        expected = parseInt(pm[2] ?? '') || 0
    }

    for (const [re, p] of PRIORITY_EMOJI) {
        if (re.test(line)) {
            priority = p
            break
        }
    }
    const dvPriority = line.match(/\[priority::\s*(highest|high|medium|low|lowest)\s*\]/iu)
    if (!priority && dvPriority) priority = dvPriority[1].toLowerCase() as Priority

    // What stays in the text is what reads as the card itself
    line = line
        .replace(POMODOROS, '')
        .replace(/(📅|🛫|⏳|➕|✅|❌)️?\s*\d{4}-\d{2}-\d{2}/gu, '')
        .replace(/\[(due|start|scheduled|created|completion|cancelled|priority)::[^\]]*\]/giu, '')
        .replace(/[🔺⏫🔼🔽⏬]️?/gu, '')
        .replace(/🔁️?\s*[a-zA-Z0-9 ,]+?(?=(\s[📅🛫⏳➕✅❌#]|$))/gu, (m) => m)
        .replace(/[ \t]{2,}/g, ' ')
        .trim()

    const tags: string[] = []
    for (const m of text.matchAll(TAG)) {
        const tag = `#${m[2]}`
        if (!tags.includes(tag)) tags.push(tag)
    }

    let done = 0
    let total = 0
    for (const r of rest) {
        const m = r.match(/^\s*(?:[-*+]|\d+[.)])\s+\[(.)\]/)
        if (!m) continue
        total++
        if (m[1] !== ' ') done++
    }

    const title = [line, ...rest].join('\n').trim()
    const label =
        line
            .replace(/!?\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
            .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
            .replace(/[*_~`=]+/g, '')
            .replace(/\s+/g, ' ')
            .trim() || line

    return { title, label, tags, due, dueRaw, time, start, priority, actual, expected, subtasks: { done, total } }
}

/** A card's identity when it has no block id: its text without what changes as it is worked on. */
export function normalizeCardKey(text: string): string {
    return text
        .split('\n')[0]
        .replace(/✅\s*\d{4}-\d{2}-\d{2}/gu, '')
        .replace(/\[completion::[^\]]*\]/g, '')
        .replace(POMODOROS, '')
        .replace(/(^|\s)@@?\{[^}]*\}/g, ' ')
        .replace(/(^|\s)@\[\[[^\]]*\]\]/g, ' ')
        .replace(/(📅|🛫|⏳|➕)️?\s*\d{4}-\d{2}-\d{2}/gu, '')
        .replace(/\s\^[\w-]+\s*$/, '')
        .replace(/\s+/g, ' ')
        .trim()
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export function splitLines(text: string): { lines: string[]; eol: string } {
    return { lines: text.split(/\r?\n/), eol: text.includes('\r\n') ? '\r\n' : '\n' }
}

/** True when the frontmatter of this text marks it as a board. */
export function hasBoardFrontmatter(text: string): boolean {
    const { lines } = splitLines(text)
    const fm = findFrontmatter(lines)
    if (!fm) return false
    return lines.slice(fm.start + 1, fm.end).some((l) => /^kanban-plugin\s*:\s*\S/.test(l))
}

function findFrontmatter(lines: string[]): { start: number; end: number } | null {
    if (lines[0]?.trim() !== '---') return null
    for (let i = 1; i < lines.length; i++) {
        const t = lines[i].trim()
        if (t === '---' || t === '...') return { start: 0, end: i }
    }
    return null
}

function findSettings(lines: string[], from: number): BoardSettingsBlock | null {
    for (let i = lines.length - 1; i >= from; i--) {
        if (!lines[i].trim().startsWith('%% kanban:settings')) continue
        let end = lines.length - 1
        for (let j = i + 1; j < lines.length; j++) {
            if (lines[j].trim() === '%%' || lines[j].trim().endsWith('%%')) {
                end = j
                break
            }
        }
        let data: Record<string, unknown> = {}
        const body = lines.slice(i + 1, end).join('\n')
        const json = body.replace(/^\s*```\w*\s*/, '').replace(/\s*```\s*$/, '').trim()
        if (json) {
            try {
                const parsed: unknown = JSON.parse(json)
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed as Record<string, unknown>
            } catch {
                // A hand-edited block the Kanban plugin could not read either; keep it as it is
            }
        }
        return { start: i, end, data }
    }
    return null
}

/** The line after a card's last line: indented lines and lazy continuations belong to it. */
function cardEnd(lines: string[], start: number, limit: number): number {
    let last = start
    let fence: string | null = null
    for (let i = start + 1; i < limit; i++) {
        const line = lines[i]
        if (fence) {
            last = i
            if (line.trim().startsWith(fence)) fence = null
            continue
        }
        if (isBlank(line)) continue
        if (isIndented(line)) {
            const f = line.trim().match(/^(`{3,}|~{3,})/)
            if (f) fence = f[1]
            last = i
            continue
        }
        if (isListItem(line) || isHeading(line) || isBreak(line) || FENCE.test(line)) break
        // An unindented line right under the card's text continues its paragraph
        if (!isBlank(lines[i - 1]) && i - 1 === last) {
            last = i
            continue
        }
        break
    }
    return last + 1
}

function readCard(lines: string[], start: number, end: number, lane: number, index: number, triggers: [string, string]): BoardCard {
    const m = lines[start].match(LIST_ITEM)!
    const checkChar = m[3] ?? ' '
    let first = m[4] ?? ''
    let blockId = ''
    const id = first.match(BLOCK_ID)
    if (id && id.index !== undefined) {
        blockId = id[1]
        first = first.slice(0, id.index)
    }
    const rest = lines.slice(start + 1, end).map((l) => l.replace(/^(\t| {1,4})/, '').replace(/\s+$/, ''))
    const text = [first.trim(), ...rest].join('\n').trim()
    return {
        lane,
        index,
        start,
        end,
        checkChar,
        checked: checkChar !== ' ',
        text,
        blockId,
        meta: readCardMeta(text, triggers[0], triggers[1]),
        key: '',
    }
}

function readCards(lines: string[], from: number, to: number, lane: number, triggers: [string, string]): BoardCard[] {
    const cards: BoardCard[] = []
    let fence: string | null = null
    for (let i = from; i < to; i++) {
        const line = lines[i]
        const f = line.match(FENCE)
        if (f) {
            fence = fence ? (line.trim().startsWith(fence) ? null : fence) : f[1]
            continue
        }
        if (fence || !isListItem(line)) continue
        const end = cardEnd(lines, i, to)
        cards.push(readCard(lines, i, end, lane, cards.length, triggers))
        i = end - 1
    }
    return cards
}

export function parseBoard(text: string): BoardDoc {
    const { lines, eol } = splitLines(text)
    const frontmatter = findFrontmatter(lines)
    const isBoard = !!frontmatter && lines.slice(frontmatter.start + 1, frontmatter.end).some((l) => /^kanban-plugin\s*:\s*\S/.test(l))
    const bodyStart = frontmatter ? frontmatter.end + 1 : 0
    const settings = findSettings(lines, bodyStart)
    const bodyEnd = settings ? settings.start : lines.length
    const triggers: [string, string] = [
        typeof settings?.data['date-trigger'] === 'string' ? (settings.data['date-trigger'] as string) : '@',
        typeof settings?.data['time-trigger'] === 'string' ? (settings.data['time-trigger'] as string) : '@@',
    ]

    // Headings outside code blocks, and where the archive starts
    const headings: { line: number; level: number; text: string }[] = []
    let archiveRule = -1
    let archiveHeading = -1
    let fence: string | null = null
    let lastBreak = -1
    for (let i = bodyStart; i < bodyEnd; i++) {
        const line = lines[i]
        const f = line.match(FENCE)
        if (f) {
            fence = fence ? (line.trim().startsWith(fence) ? null : fence) : f[1]
            continue
        }
        if (fence) continue
        if (isBreak(line) && isBlank(lines[i - 1])) {
            lastBreak = i
            continue
        }
        const h = headingOf(line)
        if (h) {
            const afterBreak = lastBreak >= 0 && lines.slice(lastBreak + 1, i).every(isBlank)
            if (afterBreak && ARCHIVE_SET.has(h.text) && archiveHeading < 0) {
                archiveRule = lastBreak
                archiveHeading = i
                break
            }
            headings.push({ line: i, ...h })
        }
        if (!isBlank(line)) lastBreak = isBreak(line) ? i : -1
    }

    const lanesEnd = archiveRule >= 0 ? archiveRule : bodyEnd
    const lanes: BoardLane[] = headings.map((h, index) => {
        const end = index + 1 < headings.length ? headings[index + 1].line : lanesEnd
        const { title, maxItems } = parseLaneTitle(h.text)
        let completeLine = -1
        for (let i = h.line + 1; i < end; i++) {
            const t = lines[i].trim()
            if (!t) continue
            if (COMPLETE_SET.has(t)) completeLine = i
            break
        }
        // A lane ends at the last line that is not blank, so the gap before the next one stays
        let laneEnd = end
        while (laneEnd > h.line + 1 && isBlank(lines[laneEnd - 1])) laneEnd--
        return {
            index,
            heading: h.line,
            end: laneEnd,
            level: h.level,
            title,
            maxItems,
            complete: completeLine >= 0,
            completeLine,
            cards: readCards(lines, h.line + 1, end, index, triggers),
        }
    })

    let archive: BoardArchive | null = null
    if (archiveHeading >= 0) {
        archive = {
            rule: archiveRule,
            heading: archiveHeading,
            end: bodyEnd,
            cards: readCards(lines, archiveHeading + 1, bodyEnd, -1, triggers),
        }
        while (archive.end > archiveHeading + 1 && isBlank(lines[archive.end - 1])) archive.end--
    }

    // Keys: the block id, else the text; the same text twice gets a counter
    const seen = new Map<string, number>()
    const keyOf = (card: BoardCard) => {
        const base = card.blockId ? `^${card.blockId}` : normalizeCardKey(card.text) || `#${card.lane}:${card.index}`
        const n = (seen.get(base) ?? 0) + 1
        seen.set(base, n)
        return n > 1 ? `${base}#${n}` : base
    }
    for (const lane of lanes) for (const card of lane.cards) card.key = keyOf(card)
    if (archive) for (const card of archive.cards) card.key = keyOf(card)

    return { lines, eol, isBoard, frontmatter, lanes, archive, settings, bodyStart, lanesEnd }
}

// ---------------------------------------------------------------------------
// Lane roles
// ---------------------------------------------------------------------------

const DONE_WORDS =
    /(^|[\s(\[:\-–—])(done|complete[d]?|finished|shipped|closed|resolved|released|archived?|zrobione|gotowe|ukończone|zakończone|fertig|erledigt|abgeschlossen|hecho|terminad[oa]s?|completad[oa]s?|termin[ée]e?s?|fait|conclu[íi]d[oa]s?|feito|completato|fatto|klaar|gedaan|готово|сделано|выполнено|完了|完成|완료)($|[\s)\]:!.\-–—])/iu
const ACTIVE_WORDS =
    /(^|[\s(\[:\-–—])(doing|in[ -]?progress|progress|wip|active|working|today|current|ongoing|started|focus|review|testing|in review|blocked|w trakcie|w toku|robię|w realizacji|in arbeit|läuft|en curso|haciendo|en cours|em andamento|fazendo|in corso|bezig|в работе|делаю|進行中|进行中|진행 ?중)($|[\s)\]:!.\-–—])/iu

/**
 * A lane's role from its marker and title; `overrides` (by lane title) wins over the title.
 * Lanes with the Complete marker are always done lanes.
 */
export function laneRole(lane: Pick<BoardLane, 'title' | 'complete'>, overrides?: Record<string, LaneRole>): LaneRole {
    if (lane.complete) return 'done'
    const o = overrides?.[lane.title]
    if (o) return o
    const title = lane.title.replace(/[✅✔☑️🏁]/gu, ' done ')
    if (DONE_WORDS.test(` ${title} `)) return 'done'
    if (ACTIVE_WORDS.test(` ${title} `)) return 'active'
    return 'backlog'
}

/** A card counts as finished when it is ticked off or sits in a done lane. */
export function cardDone(card: BoardCard, role: LaneRole): boolean {
    return card.checked || role === 'done'
}

// ---------------------------------------------------------------------------
// Editing: each returns the new text of the note
// ---------------------------------------------------------------------------

export interface EditOptions {
    /** What continuation lines of a card are indented with. */
    indent?: string
    /** The language Obsidian runs in, for the Complete and Archive markers. */
    language?: string
}

const join = (doc: BoardDoc, lines: string[]) => lines.join(doc.eol)

/** The lines of a card with this text: the first after the checkbox, the rest indented under it. */
export function formatCard(text: string, checkChar = ' ', blockId = '', indent = '\t'): string[] {
    const parts = text.replace(/\r/g, '').trim().split('\n')
    const first = `- [${checkChar}] ${parts[0].trim()}${blockId ? ` ^${blockId}` : ''}`.replace(/\s+$/, '')
    return [first, ...parts.slice(1).map((l) => (l.trim() ? `${indent}${l.replace(/\s+$/, '')}` : ''))]
}

/** The first line of a card with a different check character (adds a checkbox if it had none). */
export function withCheck(line: string, checkChar: string): string {
    const m = line.match(LIST_ITEM)
    if (!m) return line
    const markerEnd = m[1].length + m[2].length
    const after = line.slice(markerEnd)
    if (m[3] !== undefined) return line.slice(0, markerEnd) + after.replace(/^([ \t]+)\[.\]/, `$1[${checkChar}]`)
    return `${line.slice(0, markerEnd)} [${checkChar}]${after.startsWith(' ') ? '' : ' '}${after}`.replace(/\[(.)\]\s{2,}/, '[$1] ')
}

function cardAt(doc: BoardDoc, lane: number, index: number): BoardCard | null {
    if (lane < 0) return doc.archive?.cards[index] ?? null
    return doc.lanes[lane]?.cards[index] ?? null
}

function cardLines(doc: BoardDoc, card: BoardCard): string[] {
    return doc.lines.slice(card.start, card.end)
}

/** Inserts card lines at a position in a lane (index past the end appends). */
function insertIntoLane(doc: BoardDoc, laneIndex: number, index: number, block: string[]): string {
    const lane = doc.lanes[laneIndex]
    if (!lane) return join(doc, doc.lines)
    const lines = [...doc.lines]
    const cards = lane.cards
    if (cards.length > 0) {
        const at = index < cards.length ? cards[Math.max(0, index)].start : cards[cards.length - 1].end
        lines.splice(at, 0, ...block)
        return join(doc, lines)
    }
    // An empty lane: under the heading (and the Complete marker), after one blank line
    let at: number
    const insert = [...block]
    if (lane.completeLine >= 0) {
        at = lane.completeLine + 1
    } else if (isBlank(lines[lane.heading + 1]) && lane.heading + 1 < lines.length) {
        at = lane.heading + 2
    } else {
        at = lane.heading + 1
        insert.unshift('')
    }
    const next = lines[at]
    if (next !== undefined && !isBlank(next) && !isListItem(next)) insert.push('')
    lines.splice(at, 0, ...insert)
    return join(doc, lines)
}

function removeLines(doc: BoardDoc, start: number, end: number): string {
    const lines = [...doc.lines]
    lines.splice(start, end - start)
    return join(doc, lines)
}

export function addCard(doc: BoardDoc, laneIndex: number, text: string, opts: EditOptions & { position?: 'top' | 'bottom' } = {}): string {
    const lane = doc.lanes[laneIndex]
    if (!lane || !text.trim()) return join(doc, doc.lines)
    const block = formatCard(text, lane.complete ? 'x' : ' ', '', opts.indent)
    return insertIntoLane(doc, laneIndex, opts.position === 'top' ? 0 : lane.cards.length, block)
}

/**
 * Moves a card to a position in another lane (or the same one); `toIndex` counts the cards of
 * the target lane without the moved one. Like the Kanban plugin, a card moved into a Complete
 * lane is ticked off and one moved out of it is opened again.
 */
export function moveCard(doc: BoardDoc, from: { lane: number; index: number }, to: { lane: number; index: number }): string {
    const card = cardAt(doc, from.lane, from.index)
    const target = doc.lanes[to.lane]
    if (!card || !target) return join(doc, doc.lines)
    if (from.lane === to.lane && from.index === to.index) return join(doc, doc.lines)
    const source = from.lane >= 0 ? doc.lanes[from.lane] : null
    const block = cardLines(doc, card)
    if (target.complete && !card.checked) block[0] = withCheck(block[0], 'x')
    else if (source?.complete && !target.complete && card.checked) block[0] = withCheck(block[0], ' ')
    const without = parseBoard(removeLines(doc, card.start, card.end))
    return insertIntoLane(without, to.lane, to.index, block)
}

export function updateCardText(doc: BoardDoc, card: BoardCard, text: string, opts: EditOptions = {}): string {
    if (!text.trim()) return deleteCard(doc, card)
    const lines = [...doc.lines]
    lines.splice(card.start, card.end - card.start, ...formatCard(text, card.checkChar, card.blockId, opts.indent))
    return join(doc, lines)
}

/** Replaces the first line of a card (pomodoro and date edits work on that line only). */
export function replaceCardLine(doc: BoardDoc, card: BoardCard, line: string): string {
    const lines = [...doc.lines]
    lines[card.start] = line
    return join(doc, lines)
}

export function setCardBlockId(doc: BoardDoc, card: BoardCard, blockId: string): string {
    if (card.blockId === blockId) return join(doc, doc.lines)
    const first = doc.lines[card.start].replace(BLOCK_ID, '').replace(/\s+$/, '')
    return replaceCardLine(doc, card, `${first} ^${blockId}`)
}

export function setCardChecked(doc: BoardDoc, card: BoardCard, checked: boolean): string {
    return replaceCardLine(doc, card, withCheck(doc.lines[card.start], checked ? 'x' : ' '))
}

/** Ticks or unticks the n-th checklist item inside a card. */
export function toggleSubtask(doc: BoardDoc, card: BoardCard, n: number): string {
    let seen = -1
    for (let i = card.start + 1; i < card.end; i++) {
        const m = doc.lines[i].match(/^(\s*(?:[-*+]|\d+[.)])\s+\[)(.)(\].*)$/)
        if (!m) continue
        seen++
        if (seen !== n) continue
        const lines = [...doc.lines]
        lines[i] = `${m[1]}${m[2] === ' ' ? 'x' : ' '}${m[3]}`
        return join(doc, lines)
    }
    return join(doc, doc.lines)
}

export function deleteCard(doc: BoardDoc, card: BoardCard): string {
    return removeLines(doc, card.start, card.end)
}

/** Moves cards to the archive at the bottom of the board, creating it when needed. */
export function archiveCards(doc: BoardDoc, cards: BoardCard[], opts: EditOptions = {}): string {
    if (cards.length === 0) return join(doc, doc.lines)
    const blocks = [...cards].sort((a, b) => a.start - b.start).map((c) => cardLines(doc, c))
    // Remove from the bottom up so the line numbers above stay right
    const lines = [...doc.lines]
    for (const c of [...cards].sort((a, b) => b.start - a.start)) lines.splice(c.start, c.end - c.start)
    const without = parseBoard(lines.join(doc.eol))
    const out = [...without.lines]
    const moved = blocks.flat()
    if (without.archive) {
        const at = without.archive.cards.length ? without.archive.cards[without.archive.cards.length - 1].end : without.archive.heading + 1
        const insert = without.archive.cards.length ? moved : ['', ...moved]
        out.splice(at, 0, ...insert)
        return out.join(doc.eol)
    }
    const at = without.settings ? without.settings.start : out.length
    // Trim the blank lines before the archive, then add exactly one gap
    let cut = at
    while (cut > without.bodyStart && isBlank(out[cut - 1])) cut--
    const archive = ['', '', '***', '', `## ${archiveTitle(opts.language)}`, '', ...moved, '']
    if (without.settings) archive.push('')
    out.splice(cut, at - cut, ...archive)
    return out.join(doc.eol)
}

export function addLane(doc: BoardDoc, title: string, opts: EditOptions & { complete?: boolean; maxItems?: number } = {}): string {
    const lines = [...doc.lines]
    let at = doc.lanesEnd
    // After the last lane's content, keeping the blank lines that lead to the archive or settings
    while (at > doc.bodyStart && isBlank(lines[at - 1])) at--
    const lead = at === doc.bodyStart ? (doc.frontmatter ? [''] : []) : ['', '']
    const block = [...lead, laneHeading(title, opts.maxItems ?? 0), '']
    if (opts.complete) block.push(completeMarker(opts.language), '')
    lines.splice(at, 0, ...block)
    return join(doc, lines)
}

export function renameLane(doc: BoardDoc, lane: BoardLane, title: string, maxItems = lane.maxItems): string {
    const lines = [...doc.lines]
    lines[lane.heading] = laneHeading(title, maxItems, lane.level)
    return join(doc, lines)
}

/** Adds or removes the Complete marker (cards already in the lane are left as they are). */
export function setLaneComplete(doc: BoardDoc, lane: BoardLane, complete: boolean, opts: EditOptions = {}): string {
    if (lane.complete === complete) return join(doc, doc.lines)
    const lines = [...doc.lines]
    if (!complete) {
        lines.splice(lane.completeLine, 1)
        return join(doc, lines)
    }
    if (isBlank(lines[lane.heading + 1]) && lane.heading + 1 < lines.length) lines.splice(lane.heading + 2, 0, completeMarker(opts.language))
    else lines.splice(lane.heading + 1, 0, '', completeMarker(opts.language))
    return join(doc, lines)
}

/** Removes a lane with its cards. */
export function deleteLane(doc: BoardDoc, lane: BoardLane): string {
    const next = doc.lanes[lane.index + 1]
    const end = next ? next.heading : lane.end
    return removeLines(doc, lane.heading, end)
}

/** Moves a lane to another position among the lanes. */
export function moveLane(doc: BoardDoc, from: number, to: number): string {
    const n = doc.lanes.length
    if (from === to || from < 0 || from >= n || to < 0 || to >= n) return join(doc, doc.lines)
    const start = doc.lanes[0].heading
    const blocks = doc.lanes.map((lane, i) => {
        const end = i + 1 < n ? doc.lanes[i + 1].heading : lane.end
        const block = doc.lines.slice(lane.heading, end)
        while (block.length > 1 && isBlank(block[block.length - 1])) block.pop()
        return block
    })
    const [moved] = blocks.splice(from, 1)
    blocks.splice(to, 0, moved)
    const lanesBlock = blocks.flatMap((b, i) => (i < blocks.length - 1 ? [...b, '', ''] : b))
    const lines = [...doc.lines]
    lines.splice(start, doc.lanes[n - 1].end - start, ...lanesBlock)
    return join(doc, lines)
}

/** Sets a key in the `%% kanban:settings` block, adding the block when there is none. */
export function setBoardSetting(doc: BoardDoc, key: string, value: unknown): string {
    const lines = [...doc.lines]
    if (doc.settings) {
        const data = { ...doc.settings.data, [key]: value }
        lines.splice(doc.settings.start, doc.settings.end - doc.settings.start + 1, '%% kanban:settings', '```', JSON.stringify(data), '```', '%%')
        return join(doc, lines)
    }
    while (lines.length && isBlank(lines[lines.length - 1])) lines.pop()
    const data = { [BOARD_FRONTMATTER_KEY]: 'board', [key]: value }
    lines.push('', '', '%% kanban:settings', '```', JSON.stringify(data), '```', '%%')
    return join(doc, lines)
}

/** The text of a new board with these lanes; the last one is a Complete lane. */
export function newBoardText(lanes: { title: string; maxItems?: number; complete?: boolean }[], language = 'en'): string {
    const out = ['---', '', `${BOARD_FRONTMATTER_KEY}: board`, '', '---', '']
    for (const lane of lanes) {
        out.push(laneHeading(lane.title, lane.maxItems ?? 0), '')
        if (lane.complete) out.push(completeMarker(language))
        out.push('', '')
    }
    out.push('', '', '%% kanban:settings', '```', JSON.stringify({ [BOARD_FRONTMATTER_KEY]: 'board' }), '```', '%%')
    return out.join('\n')
}

/** Adds the board frontmatter key to a note that has none. */
export function makeBoard(text: string): string {
    const { lines, eol } = splitLines(text)
    const fm = findFrontmatter(lines)
    if (fm) {
        if (lines.slice(fm.start + 1, fm.end).some((l) => /^kanban-plugin\s*:/.test(l))) {
            return lines.map((l, i) => (i > fm.start && i < fm.end && /^kanban-plugin\s*:/.test(l) ? `${BOARD_FRONTMATTER_KEY}: board` : l)).join(eol)
        }
        lines.splice(fm.end, 0, `${BOARD_FRONTMATTER_KEY}: board`)
        return lines.join(eol)
    }
    return ['---', '', `${BOARD_FRONTMATTER_KEY}: board`, '', '---', '', ...lines].join(eol)
}
