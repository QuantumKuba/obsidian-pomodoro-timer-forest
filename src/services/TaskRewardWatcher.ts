import { TFile, type CachedMetadata } from 'obsidian'
import type PomodoroTimerPlugin from '../main'
import { get } from 'svelte/store'
import { extractTaskComponents } from '../utils'

type TaskSnapshot = { checked: boolean; focused: boolean }

/** A note's tasks by normalized text, and each task with a block id by that id. */
type FileSnapshot = { tasks: Map<string, TaskSnapshot>; blocks: Map<string, { checked: boolean; key: string }> }

/**
 * Watches markdown tasks across the vault and reports genuine `[ ]` → `[x]`
 * transitions to the ForestEngine. A file's task states are snapshotted when
 * it is opened, so only ticks the user actually makes are rewarded — pasting
 * in already-checked tasks or re-toggling the same task does nothing.
 *
 * The task the timer is focused on is followed by its block id, so the timer can offer to end
 * the session early once it is done (and take the offer back if it is unchecked again).
 */
export default class TaskRewardWatcher {
    private plugin: PomodoroTimerPlugin
    private snapshots = new Map<string, FileSnapshot>()

    constructor(plugin: PomodoroTimerPlugin) {
        this.plugin = plugin

        plugin.registerEvent(
            plugin.app.workspace.on('file-open', (file) => {
                if (file) void this.prime(file)
            }),
        )
        plugin.registerEvent(
            plugin.app.metadataCache.on('changed', (file, content, cache) => this.onChanged(file, content, cache)),
        )
        plugin.registerEvent(
            plugin.app.vault.on('rename', (file, oldPath) => {
                const snap = this.snapshots.get(oldPath)
                if (snap) {
                    this.snapshots.delete(oldPath)
                    this.snapshots.set(file.path, snap)
                }
            }),
        )
        plugin.app.workspace.onLayoutReady(() => {
            const file = plugin.app.workspace.getActiveFile()
            if (file) void this.prime(file)
        })
    }

    /** Snapshots a note's tasks, so ticks made from now on are noticed even if it is not opened. */
    public async prime(file: TFile): Promise<void> {
        if (file.extension !== 'md' || this.snapshots.has(file.path)) return
        try {
            const content = await this.plugin.app.vault.cachedRead(file)
            const cache = this.plugin.app.metadataCache.getFileCache(file)
            if (cache) this.snapshots.set(file.path, this.readTasks(content, cache))
        } catch {
            // The file vanished before it could be read; the next open will try again
        }
    }

    private readTasks(content: string, cache: CachedMetadata): FileSnapshot {
        const out = new Map<string, TaskSnapshot>()
        const blocks: FileSnapshot['blocks'] = new Map()
        const lines = content.split('\n')
        for (const item of cache.listItems || []) {
            if (item.task === undefined) continue
            const line = lines[item.position.start.line]
            const components = line ? extractTaskComponents(line) : null
            if (!components) continue
            const checked = item.task === 'x' || item.task === 'X'
            const key = TaskRewardWatcher.normalize(components.body)
            const blockId = components.blockLink.trim()
            if (blockId) blocks.set(blockId, { checked, key })
            if (!key) continue
            const focused = /\[🍅::\s*[1-9]/.test(components.body)
            // Duplicate texts in one file: treat as checked only if every copy is
            const prev = out.get(key)
            out.set(key, { checked: prev ? prev.checked && checked : checked, focused: focused || !!prev?.focused })
        }
        return { tasks: out, blocks }
    }

    /** Strip everything that changes when a task is completed or tracked. */
    static normalize(body: string): string {
        return body
            .replace(/✅\s*\d{4}-\d{2}-\d{2}/g, '')
            .replace(/\[completion::[^\]]*\]/g, '')
            .replace(/\[🍅::[^\]]*\]/g, '')
            .replace(/\s\^[\w-]+\s*$/, '')
            .replace(/\s+/g, ' ')
            .trim()
    }

    private onChanged(file: TFile, content: string, cache: CachedMetadata): void {
        if (file.extension !== 'md') return
        const next = this.readTasks(content, cache)
        const prev = this.snapshots.get(file.path)
        this.snapshots.set(file.path, next)
        if (!prev) return

        // The timer's task, followed by its block id (added when it was focused)
        const tracked = this.plugin.tracker?.task
        const trackedId = tracked?.path === file.path ? tracked.blockLink.trim() : ''
        const trackedBefore = trackedId ? prev.blocks.get(trackedId)?.checked : undefined
        const trackedNow = trackedId ? next.blocks.get(trackedId) : undefined
        const trackedDone = trackedBefore === false && trackedNow?.checked === true
        const inSession = this.workSessionRunning()

        next.tasks.forEach(({ checked, focused }, key) => {
            if (checked && prev.tasks.get(key)?.checked === false) {
                const label = key.replace(/#[\w\-/]+/g, '').replace(/\s+/g, ' ').trim() || key
                // Done while the timer was focused on it counts like a task with 🍅 behind it
                const focusedNow = trackedDone && inSession && key === trackedNow?.key
                this.plugin.forestEngine?.onTaskCompleted(`${file.path}::${key}`, label, focused || focusedNow)
            }
        })

        if (trackedDone) this.plugin.timer?.markTaskDone()
        else if (trackedBefore === true && trackedNow?.checked === false) this.plugin.timer?.forgetTaskDone()
    }

    private workSessionRunning(): boolean {
        const timer = this.plugin.timer
        if (!timer) return false
        const t = get(timer)
        return t.inSession && t.mode === 'WORK'
    }
}
