import PomodoroTimerPlugin from 'main'
import { TFile, type CachedMetadata } from 'obsidian'
import { extractTaskComponents } from 'utils'
import { writable, derived, type Readable, type Writable } from 'svelte/store'

import type { TaskFormat } from 'Settings'
import type { Unsubscriber } from 'svelte/motion'
import { DESERIALIZERS } from 'serializer'
import type { TaskLineEdits } from 'serializer/TaskLineEditor'
import TaskWriter from 'TaskWriter'
import { settings } from 'stores'

export type TaskItem = {
    path: string
    text: string
    fileName: string
    name: string
    status: string
    blockLink: string
    checked: boolean
    done: string
    due: string
    created: string
    cancelled: string
    scheduled: string
    start: string
    description: string
    priority: string
    recurrence: string
    expected: number
    actual: number
    tags: string[]
    line: number
}

/** The tasks of one note, as listed in the task panel. */
export type TaskGroup = {
    path: string
    /** File name without the extension. */
    name: string
    /** The note currently open in the editor. */
    current: boolean
    pinned: boolean
    /** The note is still being read. */
    loading: boolean
    tasks: TaskItem[]
}

export type TaskStore = {
    /** The current note first (unless it is pinned), then the pinned notes in the order pinned. */
    groups: TaskGroup[]
    /** Every task of every group. */
    list: TaskItem[]
}

export default class Tasks implements Readable<TaskStore> {
    private plugin: PomodoroTimerPlugin

    private _store: Writable<TaskStore>

    public subscribe

    public writer: TaskWriter

    private unsubscribers: Unsubscriber[] = []

    private state: TaskStore = {
        groups: [],
        list: [],
    }

    /** Tasks of the notes currently listed, by note path. */
    private loaded = new Map<string, TaskItem[]>()

    /** Notes read before Obsidian had indexed them; read again once it has. */
    private unresolved = new Set<string>()

    public static getDeserializer(format: TaskFormat) {
        return DESERIALIZERS[format]
    }

    constructor(plugin: PomodoroTimerPlugin) {
        this.plugin = plugin
        this.writer = new TaskWriter(plugin)

        this._store = writable(this.state)

        this.unsubscribers.push(
            this._store.subscribe((state) => {
                this.state = state
            }),
        )

        // Which notes are listed depends only on the current note and the pins, so the
        // panel is not rebuilt each time a task is picked.
        this.unsubscribers.push(
            derived(this.plugin.tracker!, ($tracker) =>
                [$tracker.file?.path ?? '', ...$tracker.pinned].join('\n'),
            ).subscribe(() => this.refresh()),
        )

        // Tasks are read differently when the format setting changes
        let format = plugin.getSettings().taskFormat
        this.unsubscribers.push(
            settings.subscribe((s) => {
                if (s.taskFormat !== format) {
                    format = s.taskFormat
                    this.loaded.clear()
                    this.refresh()
                }
            }),
        )

        this.subscribe = this._store.subscribe

        this.plugin.registerEvent(
            plugin.app.metadataCache.on('resolved', () => {
                const paths = [...this.unresolved]
                this.unresolved.clear()
                paths.forEach((path) => this.loadFileTasks(path))
            }),
        )

        this.plugin.registerEvent(
            plugin.app.metadataCache.on(
                'changed',
                (file: TFile, content: string, cache: CachedMetadata) => {
                    if (
                        file.extension === 'md' &&
                        this.wanted().some((w) => w.path === file.path)
                    ) {
                        const tasks = resolveTasks(
                            this.plugin.getSettings().taskFormat,
                            file,
                            content,
                            cache,
                        )
                        this.loaded.set(file.path, tasks)
                        this.publish()
                        this.plugin.tracker?.sync(file.path, tasks)
                    }
                },
            ),
        )
    }

    /** The notes to list, in display order. */
    private wanted() {
        const tracker = this.plugin.tracker
        const current = tracker?.file?.path
        const pinned = tracker?.pinnedPaths ?? []
        const out: { path: string; current: boolean; pinned: boolean }[] = []
        if (current && !pinned.includes(current)) {
            out.push({ path: current, current: true, pinned: false })
        }
        for (const path of pinned) {
            out.push({ path, current: path === current, pinned: true })
        }
        return out
    }

    /** Reads the notes that are newly listed and forgets the ones that no longer are. */
    private refresh() {
        const wanted = this.wanted()
        for (const path of [...this.loaded.keys()]) {
            if (!wanted.some((w) => w.path === path)) this.loaded.delete(path)
        }
        this.publish()
        for (const { path } of wanted) {
            if (!this.loaded.has(path)) this.loadFileTasks(path)
        }
    }

    private publish() {
        const { vault } = this.plugin.app
        const groups: TaskGroup[] = []
        for (const w of this.wanted()) {
            const file = vault.getAbstractFileByPath(w.path)
            if (!(file instanceof TFile)) continue // a pinned note that is not in this vault (yet)
            groups.push({
                path: w.path,
                name: file.basename,
                current: w.current,
                pinned: w.pinned,
                loading: !this.loaded.has(w.path),
                tasks: this.loaded.get(w.path) ?? [],
            })
        }
        this._store.set({
            groups,
            list: groups.flatMap((g) => g.tasks),
        })
    }

    public loadFileTasks(path: string) {
        const file = this.plugin.app.vault.getAbstractFileByPath(path)
        if (!(file instanceof TFile)) return
        if (file.extension !== 'md') {
            this.loaded.set(path, [])
            this.publish()
            return
        }
        this.plugin.app.vault
            .cachedRead(file)
            .then((c) => {
                // The panel may have moved on while the note was being read
                if (!this.wanted().some((w) => w.path === path)) return
                const metadata = this.plugin.app.metadataCache.getFileCache(file)
                if (!metadata) this.unresolved.add(path)
                const tasks = resolveTasks(
                    this.plugin.getSettings().taskFormat,
                    file,
                    c,
                    metadata,
                )
                this.loaded.set(path, tasks)
                this.publish()
                this.plugin.tracker?.sync(path, tasks)
            })
            .catch((err) =>
                console.error('[Pomodoro Timer Forest] Failed to read tasks', err),
            )
    }

    /** Writes pomodoros / dates to the task's line in its note. */
    public update(task: TaskItem, edits: TaskLineEdits) {
        return this.writer.update(task, edits)
    }

    public destroy() {
        for (let unsub of this.unsubscribers) {
            unsub()
        }
    }
}

export function resolveTasks(
    format: TaskFormat,
    file: TFile,
    content: string,
    metadata: CachedMetadata | null,
): TaskItem[] {
    if (!content || !metadata) {
        return []
    }

    let cache: Record<number, TaskItem> = {}
    const lines = content.split('\n')
    for (let rawElement of metadata.listItems || []) {
        if (rawElement.task) {
            let lineNr = rawElement.position.start.line
            let line = lines[lineNr]

            const components = extractTaskComponents(line)
            if (!components) {
                continue
            }
            let detail = DESERIALIZERS[format].deserialize(components.body)

            let [actual, expected] = detail.pomodoros.split('/')

            const dateformat = 'YYYY-MM-DD'
            let item: TaskItem = {
                text: line,
                path: file.path,
                fileName: file.name,
                name: detail.description,
                status: components.status,
                blockLink: components.blockLink,
                checked: rawElement.task != '' && rawElement.task != ' ',
                description: detail.description,
                done: detail.doneDate?.format(dateformat) ?? '',
                due: detail.dueDate?.format(dateformat) ?? '',
                created: detail.createdDate?.format(dateformat) ?? '',
                cancelled: detail.cancelledDate?.format(dateformat) ?? '',
                scheduled: detail.scheduledDate?.format(dateformat) ?? '',
                start: detail.startDate?.format(dateformat) ?? '',
                priority: detail.priority,
                recurrence: detail.recurrenceRule,
                expected: parseInt(expected) || 0,
                actual: parseInt(actual) || 0,
                tags: detail.tags,
                line: lineNr,
            }

            cache[lineNr] = item
        }
    }

    return Object.values(cache)
}
