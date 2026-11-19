import { getAllTags, type App } from 'obsidian'
import type { TaskFormat } from '../Settings'
import type { GamificationData } from '../types/forest'
import { getSpecies } from '../assets/floraCatalog'
import { islandName } from '../services/Islands'
import { normalizeBoardTag, readCardMeta, type BoardDoc, type Priority } from './BoardModel'

export const normalizeTag = normalizeBoardTag

export type TagSource = 'branch' | 'board' | 'project' | 'island' | 'flora' | 'vault'

export interface TagSuggestion {
    tag: string
    count: number
    sources: TagSource[]
    hint?: string
}

export interface TagTrigger {
    start: number
    end: number
    query: string
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const TRAILING_META =
    /(?:\s+(?:@@?\{[^}]*\}|@\[\[[^\]]*\]\]|(?:📅|🛫|⏳|➕|✅|❌)️?\s*\d{4}-\d{2}-\d{2}|\[(?:due|start|scheduled|created|completion|cancelled|priority)::[^\]]*\]|[([ ]*🍅::[^\])]*[\])]|🔁️?\s*[a-zA-Z0-9, !]+|[🔺⏫🔼🔽⏬]️?|\^[a-zA-Z0-9-]+))+\s*$/u

const PRIORITY_OUTPUT: Record<Exclude<Priority, ''>, { TASKS: string; DATAVIEW: string }> = {
    highest: { TASKS: '🔺', DATAVIEW: '[priority:: highest]' },
    high: { TASKS: '⏫', DATAVIEW: '[priority:: high]' },
    medium: { TASKS: '🔼', DATAVIEW: '[priority:: medium]' },
    low: { TASKS: '🔽', DATAVIEW: '[priority:: low]' },
    lowest: { TASKS: '⏬', DATAVIEW: '[priority:: lowest]' },
}

export function cardHasTag(text: string, rawTag: string): boolean {
    const want = normalizeTag(rawTag).toLowerCase()
    if (!want) return false
    return readCardMeta(text).tags.some((t) => t.toLowerCase() === want)
}

/** Inserts `#tag` cleanly on the card's first line before trailing metadata fields. */
export function addTagToCardText(text: string, rawTag: string): string {
    const tag = normalizeTag(rawTag)
    if (!tag || cardHasTag(text, tag)) return text
    const lines = text.split('\n')
    const first = lines[0] ?? ''
    const m = first.match(TRAILING_META)
    const splitAt = m?.index ?? first.length
    const head = first.slice(0, splitAt).replace(/\s+$/, '')
    const tail = first.slice(splitAt)
    lines[0] = head ? `${head} ${tag}${tail}` : `${tag}${tail}`
    return lines.join('\n')
}

/** Removes `#tag` (case-insensitive) wherever it appears in the card's text. */
export function removeTagFromCardText(text: string, rawTag: string): string {
    const want = normalizeTag(rawTag)
    if (!want) return text
    const re = new RegExp(`(^|[ \\t])${escapeRegex(want)}(?=$|[\\s!@#$%^&*(),.?":{}|<>\\[\\]])`, 'giu')
    return text
        .split('\n')
        .map((line) => {
            const leadMatch = line.match(/^(\s*)/)
            const lead = leadMatch ? leadMatch[1] : ''
            const body = line.slice(lead.length)
            const cleaned = body
                .replace(re, (_m, sep: string) => sep)
                .replace(/[ \t]{2,}/g, ' ')
                .trim()
            return cleaned ? `${lead}${cleaned}` : ''
        })
        .join('\n')
        .replace(/^\n+|\n+$/g, '')
}

export function toggleTagInCardText(text: string, rawTag: string): string {
    return cardHasTag(text, rawTag) ? removeTagFromCardText(text, rawTag) : addTagToCardText(text, rawTag)
}

/** Sets or clears priority on a card's first line, keeping any trailing `^blockId`. */
export function withPriority(line: string, priority: Priority, format: TaskFormat): string {
    const blockMatch = line.match(/\s+\^[a-zA-Z0-9-]+\s*$/)
    const blockId = blockMatch ? blockMatch[0] : ''
    let head = (blockMatch && blockMatch.index !== undefined ? line.slice(0, blockMatch.index) : line)
        .replace(/[🔺⏫🔼🔽⏬]️?/gu, '')
        .replace(/\[priority::\s*(?:highest|high|medium|low|lowest)\s*\]/giu, '')
        .replace(/[ \t]{2,}/g, ' ')
        .trimEnd()
    if (priority) {
        const token = PRIORITY_OUTPUT[priority][format]
        head = head ? `${head} ${token}` : token
    }
    return `${head}${blockId}`
}

const INVALID_TAG_CHAR = /[\s!@#$%^&*(),.?":{}|<>[\]]/

/**
 * Detects an active `#query` tag token at `cursor` (for inline autocomplete in an input or textarea).
 * Only triggers when `#` is at index 0 or preceded by whitespace, so `[[Note#Heading]]` never triggers it.
 */
export function extractTagTrigger(text: string, cursor: number): TagTrigger | null {
    if (cursor < 0 || cursor > text.length) return null
    let i = cursor - 1
    while (i >= 0) {
        const ch = text[i]
        if (ch === '#') {
            if (i > 0 && !/\s/.test(text[i - 1])) return null
            const query = text.slice(i + 1, cursor)
            let end = cursor
            while (end < text.length && !INVALID_TAG_CHAR.test(text[end])) end++
            return { start: i, end, query }
        }
        if (INVALID_TAG_CHAR.test(ch)) return null
        i--
    }
    return null
}

/** Replaces the active `#query` span with `#tag ` and returns the new text and cursor offset. */
export function applyTagCompletion(text: string, trigger: TagTrigger, rawTag: string): { text: string; cursor: number } {
    const tag = normalizeTag(rawTag)
    if (!tag) return { text, cursor: trigger.end }
    const before = text.slice(0, trigger.start)
    const after = text.slice(trigger.end)
    const hasHorizSpace = /^[ \t]/.test(after)
    const inserted = hasHorizSpace ? tag : `${tag} `
    return {
        text: `${before}${inserted}${after}`,
        cursor: before.length + tag.length + 1,
    }
}

function isBranchOf(tag: string, parent: string): boolean {
    const t = tag.toLowerCase()
    const p = parent.toLowerCase()
    return t.startsWith(`${p}/`)
}

/** Ranks and filters tag suggestions for a query, prioritising board branches, board tags, and matches. */
export function rankTagSuggestions(
    query: string,
    pool: TagSuggestion[],
    opts: { boardTags?: string[]; exclude?: string[]; limit?: number } = {},
): TagSuggestion[] {
    const q = query.trim().replace(/^#+/, '').toLowerCase()
    const boardTags = (opts.boardTags ?? []).map((t) => normalizeTag(t).toLowerCase()).filter(Boolean)
    const excluded = new Set((opts.exclude ?? []).map((t) => normalizeTag(t).toLowerCase()).filter(Boolean))
    const limit = opts.limit ?? 14

    const scored: { item: TagSuggestion; score: number }[] = []
    for (const item of pool) {
        const lower = item.tag.toLowerCase()
        if (excluded.has(lower)) continue
        const body = lower.slice(1)
        let matchScore = 100
        if (q) {
            if (body === q) matchScore = 400
            else if (body.startsWith(q)) matchScore = 300
            else if (body.split('/').some((seg) => seg.startsWith(q))) matchScore = 240
            else if (body.includes(q)) matchScore = 160
            else continue
        }

        let boost = 0
        if (boardTags.some((bt) => isBranchOf(lower, bt))) boost += 80
        if (item.sources.includes('board')) boost += 50
        if (item.sources.includes('project')) boost += 40
        if (item.sources.includes('island')) boost += 30
        if (item.sources.includes('flora')) boost += 20
        boost += Math.min(25, item.count)
        scored.push({ item, score: matchScore + boost })
    }

    scored.sort((a, b) => b.score - a.score || b.item.count - a.item.count || a.item.tag.localeCompare(b.item.tag))
    return scored.slice(0, limit).map((s) => s.item)
}

/** Collects tags from the current board, the Obsidian vault, islands, and smart flora mappings. */
export function collectBoardTags(app: App, doc: BoardDoc, gamification?: GamificationData): TagSuggestion[] {
    const byLower = new Map<string, { tag: string; count: number; sources: Set<TagSource>; hints: string[] }>()
    const touch = (raw: string, source: TagSource, countDelta = 0, hint?: string) => {
        const tag = normalizeTag(raw)
        if (!tag) return
        const key = tag.toLowerCase()
        let entry = byLower.get(key)
        if (!entry) {
            entry = { tag, count: 0, sources: new Set(), hints: [] }
            byLower.set(key, entry)
        }
        entry.count += countDelta
        entry.sources.add(source)
        if (hint && !entry.hints.includes(hint)) entry.hints.push(hint)
    }

    const boardTags = doc.tags.map((t) => t.toLowerCase())
    for (const t of doc.tags) touch(t, 'project', 0, 'Board topic')

    for (const lane of doc.lanes) {
        for (const card of lane.cards) {
            for (const t of card.meta.tags) {
                const isBranch = boardTags.some((bt) => isBranchOf(t, bt))
                touch(t, isBranch ? 'branch' : 'board', 1)
            }
        }
    }

    for (const island of gamification?.islands ?? []) {
        if (island.focus?.kind === 'tag') {
            touch(island.focus.value, 'island', 0, `🏝️ ${islandName(island)}`)
        }
    }

    for (const mapping of gamification?.tagMappings ?? []) {
        const sp = getSpecies(mapping.speciesId)
        touch(mapping.tag, 'flora', 0, sp ? `🌱 ${sp.name}` : undefined)
    }

    const rawTags = (app?.metadataCache as { getTags?: () => Record<string, number> } | undefined)?.getTags?.()
    if (rawTags && typeof rawTags === 'object') {
        for (const [tag, count] of Object.entries(rawTags)) {
            const isBranch = boardTags.some((bt) => isBranchOf(tag, bt))
            touch(tag, isBranch ? 'branch' : 'vault', count)
        }
    } else {
        for (const file of app?.vault?.getMarkdownFiles?.() ?? []) {
            const cache = app.metadataCache?.getFileCache?.(file)
            if (!cache) continue
            for (const tag of getAllTags(cache) ?? []) {
                const isBranch = boardTags.some((bt) => isBranchOf(tag, bt))
                touch(tag, isBranch ? 'branch' : 'vault', 1)
            }
        }
    }

    const out: TagSuggestion[] = []
    for (const entry of byLower.values()) {
        const sources = [...entry.sources]
        const hintParts = [...entry.hints]
        if (sources.includes('branch') && !hintParts.includes('Branch')) hintParts.unshift('Branch')
        if (sources.includes('board') && entry.count > 0) hintParts.push(`${entry.count} on board`)
        out.push({
            tag: entry.tag,
            count: entry.count,
            sources,
            ...(hintParts.length ? { hint: hintParts.join(' · ') } : {}),
        })
    }
    return out
}
