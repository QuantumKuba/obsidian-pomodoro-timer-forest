import { TFile, type CachedMetadata } from 'obsidian'
import { get } from 'svelte/store'
import type PomodoroTimerPlugin from '../main'
import type { BoardLaneRole } from '../types/forest'
import { BOARD_FRONTMATTER_KEY, cardDone, laneRole, parseBoard, type BoardDoc } from './BoardModel'
import { cardDueDate } from './cards'

type CardState = {
    key: string
    lane: string
    laneIndex: number
    index: number
    role: BoardLaneRole
    checked: boolean
    done: boolean
    blockId: string
    label: string
    actual: number
    expected: number
    due: string
}

type Snapshot = {
    cards: Map<string, CardState>
    /** Every card on the board is finished. */
    allDone: boolean
    total: number
    /** Every lane with a card limit keeps to it; null when no lane has one. */
    withinWip: boolean | null
}

/** True when the note's frontmatter marks it as a Kanban board. */
export function isBoardCache(cache: CachedMetadata | null | undefined): boolean {
    return !!cache?.frontmatter?.[BOARD_FRONTMATTER_KEY]
}

/**
 * Follows the cards on Kanban boards, whichever plugin (or editor) moves them. A board is
 * snapshotted when it is opened; from then on each change is compared with the snapshot:
 *
 * - a card that is ticked off, or moved into a done lane, is finished and rewarded once a day;
 * - every move is remembered, so the board can show how long a card has been waiting;
 * - the card the timer is focused on can end its session early once it is done.
 *
 * Only real moves count: a card added straight into a done lane, or a lane that becomes a done
 * lane with cards already in it, earns nothing.
 */
export default class BoardWatcher {
    private snapshots = new Map<string, Snapshot>()

    constructor(private plugin: PomodoroTimerPlugin) {
        plugin.registerEvent(plugin.app.metadataCache.on('changed', (file, content, cache) => this.onChanged(file, content, cache)))
        plugin.registerEvent(
            plugin.app.workspace.on('file-open', (file) => {
                if (file) void this.prime(file)
            }),
        )
        plugin.registerEvent(
            plugin.app.vault.on('rename', (file, oldPath) => {
                const snap = this.snapshots.get(oldPath)
                if (snap) {
                    this.snapshots.delete(oldPath)
                    this.snapshots.set(file.path, snap)
                }
                if (file instanceof TFile) plugin.forestEngine?.renameBoard(oldPath, file.path, file.basename)
            }),
        )
        plugin.registerEvent(plugin.app.vault.on('delete', (file) => this.snapshots.delete(file.path)))
        plugin.app.workspace.onLayoutReady(() => {
            const file = plugin.app.workspace.getActiveFile()
            if (file) void this.prime(file)
        })
    }

    public isBoard(file: TFile | null | undefined): boolean {
        return !!file && file.extension === 'md' && isBoardCache(this.plugin.app.metadataCache.getFileCache(file))
    }

    /** Starts following a board, so moves made from now on are noticed. */
    public async prime(file: TFile): Promise<void> {
        if (file.extension !== 'md' || this.snapshots.has(file.path) || !this.isBoard(file)) return
        try {
            this.observe(file, await this.plugin.app.vault.cachedRead(file))
        } catch {
            // The note vanished before it could be read; the next open tries again
        }
    }

    /** A board view read the note: follow it from this text, without rewarding anything. */
    public observe(file: TFile, text: string): void {
        if (this.snapshots.has(file.path)) return
        const doc = parseBoard(text)
        if (!doc.isBoard) return
        const snap = this.snapshot(file, doc)
        this.snapshots.set(file.path, snap)
        this.remember(file, snap)
    }

    private roles(path: string): Record<string, BoardLaneRole> | undefined {
        return this.plugin.storageManager?.getGamification().boards?.[path]?.laneRoles
    }

    private snapshot(file: TFile, doc: BoardDoc): Snapshot {
        const overrides = this.roles(file.path)
        const cards = new Map<string, CardState>()
        let open = 0
        let limited = false
        let over = false
        for (const lane of doc.lanes) {
            const role = laneRole(lane, overrides)
            if (lane.maxItems > 0) {
                limited = true
                if (lane.cards.length > lane.maxItems) over = true
            }
            for (const card of lane.cards) {
                const done = cardDone(card, role)
                if (!done) open++
                cards.set(card.key, {
                    key: card.key,
                    lane: lane.title,
                    laneIndex: lane.index,
                    index: card.index,
                    role,
                    checked: card.checked,
                    done,
                    blockId: card.blockId,
                    label: card.meta.label,
                    actual: card.meta.actual,
                    expected: card.meta.expected,
                    due: cardDueDate(card.meta, doc.settings?.data),
                })
            }
        }
        return { cards, allDone: cards.size > 0 && open === 0, total: cards.size, withinWip: limited ? !over : null }
    }

    private remember(file: TFile, snap: Snapshot, renames: [string, string][] = []): void {
        const cards = [...snap.cards.values()].map((c) => ({ key: c.key, lane: c.lane, role: c.role }))
        this.plugin.forestEngine?.syncBoard(file.path, file.basename, cards, renames)
    }

    private onChanged(file: TFile, content: string, cache: CachedMetadata): void {
        if (file.extension !== 'md') return
        if (!isBoardCache(cache)) {
            this.snapshots.delete(file.path)
            return
        }
        const doc = parseBoard(content)
        if (!doc.isBoard) return
        const next = this.snapshot(file, doc)
        const prev = this.snapshots.get(file.path)
        this.snapshots.set(file.path, next)
        if (!prev) return

        // A card whose text changed has a new key: it is the one left in the same place
        const renames: [string, string][] = []
        const gone = [...prev.cards.values()].filter((c) => !next.cards.has(c.key))
        const before = (card: CardState): CardState | undefined => {
            const same = prev.cards.get(card.key)
            if (same) return same
            const i = gone.findIndex((g) => g.laneIndex === card.laneIndex && g.index === card.index)
            if (i < 0) return undefined
            const [match] = gone.splice(i, 1)
            renames.push([match.key, card.key])
            return match
        }

        const tracker = this.plugin.tracker
        const tracked = tracker?.task?.path === file.path ? tracker.task.blockLink.trim().replace(/^\^/, '') : ''
        const inSession = this.workSessionRunning()

        const finished: CardState[] = []
        for (const card of next.cards.values()) {
            const was = before(card)
            if (!was) continue
            const isTracked = !!tracked && card.blockId === tracked
            if (!was.done && card.done) {
                // Moved or ticked off: a lane that only changed its role does not count
                if (was.lane !== card.lane || (!was.checked && card.checked)) finished.push(card)
                if (isTracked) this.plugin.timer?.markTaskDone()
            } else if (was.done && !card.done && isTracked) {
                this.plugin.timer?.forgetTaskDone()
            }
        }

        const engine = this.plugin.forestEngine
        for (const card of finished) {
            engine?.onCardCompleted({
                path: file.path,
                board: file.basename,
                key: card.key,
                label: card.label,
                actual: card.actual,
                expected: card.expected,
                due: card.due,
                focused: inSession && !!tracked && card.blockId === tracked,
                withinWip: next.withinWip,
            })
        }
        // After the rewards, which read when each card was started
        this.remember(file, next, renames)
        if (finished.length > 0 && next.allDone && !prev.allDone) engine?.onBoardCleared(file.path, file.basename, next.total)
    }

    private workSessionRunning(): boolean {
        const timer = this.plugin.timer
        if (!timer) return false
        const t = get(timer)
        return t.inSession && t.mode === 'WORK'
    }
}
