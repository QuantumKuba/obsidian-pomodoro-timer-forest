import { TFile, type CachedMetadata } from 'obsidian'
import type PomodoroTimerPlugin from '../main'
import { extractTaskComponents } from '../utils'

type TaskSnapshot = { checked: boolean; focused: boolean }

/**
 * Watches markdown tasks across the vault and reports genuine `[ ]` → `[x]`
 * transitions to the ForestEngine. A file's task states are snapshotted when
 * it is opened, so only ticks the user actually makes are rewarded — pasting
 * in already-checked tasks or re-toggling the same task does nothing.
 */
export default class TaskRewardWatcher {
    private plugin: PomodoroTimerPlugin
    /** path -> (normalized task text -> checked) */
    private snapshots = new Map<string, Map<string, TaskSnapshot>>()

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

    private async prime(file: TFile): Promise<void> {
        if (file.extension !== 'md' || this.snapshots.has(file.path)) return
        try {
            const content = await this.plugin.app.vault.cachedRead(file)
            const cache = this.plugin.app.metadataCache.getFileCache(file)
            if (cache) this.snapshots.set(file.path, this.readTasks(content, cache))
        } catch {
            // The file vanished before it could be read; the next open will try again
        }
    }

    private readTasks(content: string, cache: CachedMetadata): Map<string, TaskSnapshot> {
        const out = new Map<string, TaskSnapshot>()
        const lines = content.split('\n')
        for (const item of cache.listItems || []) {
            if (item.task === undefined) continue
            const line = lines[item.position.start.line]
            const components = line ? extractTaskComponents(line) : null
            if (!components) continue
            const key = TaskRewardWatcher.normalize(components.body)
            if (!key) continue
            const checked = item.task === 'x' || item.task === 'X'
            const focused = /\[🍅::\s*[1-9]/.test(components.body)
            // Duplicate texts in one file: treat as checked only if every copy is
            const prev = out.get(key)
            out.set(key, { checked: prev ? prev.checked && checked : checked, focused: focused || !!prev?.focused })
        }
        return out
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

        next.forEach(({ checked, focused }, key) => {
            if (checked && prev.get(key)?.checked === false) {
                const label = key.replace(/#[\w\-/]+/g, '').replace(/\s+/g, ' ').trim() || key
                this.plugin.forestEngine?.onTaskCompleted(`${file.path}::${key}`, label, focused)
            }
        })
    }
}
