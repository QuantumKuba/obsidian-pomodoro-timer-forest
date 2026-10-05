import { type TaskItem } from 'Tasks'
import type PomodoroTimerPlugin from 'main'
import { TFile, Keymap } from 'obsidian'
import {
    writable,
    get,
    type Readable,
    type Writable,
    type Unsubscriber,
} from 'svelte/store'
import { settings } from 'stores'
import { editTaskLine, readPomodoros } from 'serializer/TaskLineEditor'
import { locateTaskLine } from 'TaskWriter'

export type TaskTrackerState = {
    /** The task the timer is counting pomodoros for. */
    task?: TaskItem
    /** The note being worked in: the last note that was active. */
    file?: TFile
    /** Notes whose tasks stay listed while working in other notes. */
    pinned: string[]
}

type TaskTrackerStore = Readable<TaskTrackerState>

const sameList = (a: string[], b: string[]) =>
    a.length === b.length && a.every((value, i) => value === b[i])

export default class TaskTracker implements TaskTrackerStore {
    private plugin

    private state: TaskTrackerState

    private store: Writable<TaskTrackerState>

    public subscribe

    private unsubscribers: Unsubscriber[] = []

    constructor(plugin: PomodoroTimerPlugin) {
        this.plugin = plugin
        this.state = { pinned: [...(plugin.getSettings().pinnedNotes ?? [])] }
        this.store = writable(this.state)
        this.subscribe = this.store.subscribe
        this.unsubscribers.push(
            this.store.subscribe((state) => {
                this.state = state
            }),
        )

        // Pins live in the saved settings so they survive restarts and follow the vault
        // between devices; the settings store stays the single source of truth.
        this.unsubscribers.push(
            settings.subscribe((s) => {
                const pinned = s.pinnedNotes ?? []
                if (!sameList(pinned, this.state.pinned)) {
                    this.store.update((state) =>
                        this.scoped({ ...state, pinned: [...pinned] }),
                    )
                }
            }),
        )

        plugin.registerEvent(
            plugin.app.workspace.on('active-leaf-change', () => {
                const file = this.plugin.app.workspace.getActiveFile()
                // The timer panel, graph view etc. have no file: stay on the last note
                if (!file || file.path === this.state.file?.path) return
                this.store.update((state) => {
                    const next = { ...state, file }
                    // The focused task stays while its note is pinned or a session is running
                    if (
                        next.task &&
                        !next.pinned.includes(next.task.path) &&
                        !this.sessionRunning()
                    ) {
                        next.task = undefined
                    }
                    return next
                })
            }),
        )

        plugin.registerEvent(
            plugin.app.vault.on('rename', (file, oldPath) => {
                // The pins and the focused task change together, so the focus is not dropped
                // for a moment while its note is between two names
                const pinned = this.state.pinned.includes(oldPath)
                    ? this.state.pinned.map((p) => (p === oldPath ? file.path : p))
                    : null
                if (!pinned && this.state.task?.path !== oldPath) return
                this.store.update((state) => ({
                    ...state,
                    pinned: pinned ?? state.pinned,
                    task:
                        state.task?.path === oldPath
                            ? { ...state.task, path: file.path }
                            : state.task,
                }))
                if (pinned) this.savePinned(pinned)
            }),
        )

        plugin.registerEvent(
            plugin.app.vault.on('delete', (file) => {
                if (this.state.pinned.includes(file.path)) {
                    this.setPinned(this.state.pinned.filter((p) => p !== file.path))
                }
            }),
        )

        plugin.app.workspace.onLayoutReady(() => {
            const file = this.plugin.app.workspace.getActiveFile()
            this.store.update((state) => ({ ...state, file: file ?? state.file }))
        })
    }

    get task() {
        return this.state.task
    }

    get file() {
        return this.state.file
    }

    get pinnedPaths() {
        return this.state.pinned
    }

    public isPinned(path: string | undefined) {
        return !!path && this.state.pinned.includes(path)
    }

    /** True when the focused task belongs to a pinned note, so it should survive a timer reset. */
    public get taskPinned() {
        return this.isPinned(this.state.task?.path)
    }

    /** Pins a note (the current one by default), or unpins it when it is already pinned. */
    public togglePinned(path: string | undefined = this.state.file?.path) {
        if (!path) return
        this.setPinned(
            this.isPinned(path)
                ? this.state.pinned.filter((p) => p !== path)
                : [...this.state.pinned, path],
        )
    }

    private setPinned(pinned: string[]) {
        this.store.update((state) => this.scoped({ ...state, pinned }))
        this.savePinned(pinned)
    }

    private savePinned(pinned: string[]) {
        this.plugin.storageManager?.updateSettings((s) => ({
            ...s,
            pinnedNotes: pinned,
        }))
    }

    /** Drops the focused task when its note is neither pinned nor the current note any more. */
    private scoped(state: TaskTrackerState): TaskTrackerState {
        const path = state.task?.path
        if (path && path !== state.file?.path && !state.pinned.includes(path)) {
            if (!this.sessionRunning()) return { ...state, task: undefined }
        }
        return state
    }

    private sessionRunning() {
        const timer = this.plugin.timer
        if (!timer) return false
        const t = get(timer)
        return t.inSession && t.mode === 'WORK'
    }

    public async active(task: TaskItem) {
        await this.ensureBlockId(task)
        const file = this.plugin.app.vault.getAbstractFileByPath(task.path)
        // Watch the note, so ticking the task off is noticed even if the note is never opened
        if (file instanceof TFile) void this.plugin.taskRewards?.prime(file)
        // Moving on to another task means the session carries on with it
        const current = this.state.task
        if (current && (current.path !== task.path || current.blockLink !== task.blockLink)) {
            this.plugin.timer?.forgetTaskDone()
        }
        // A copy: the label below is edited without touching the list
        this.store.update((state) => ({ ...state, task: { ...task } }))
    }

    public setTaskName(name: string) {
        this.store.update((state) => ({
            ...state,
            task: state.task ? { ...state.task, name } : state.task,
        }))
    }

    private async ensureBlockId(task: TaskItem) {
        let file = this.plugin.app.vault.getAbstractFileByPath(task.path)
        if (file && file instanceof TFile) {
            const f = file
            if (f.extension === 'md') {
                let content = await this.plugin.app.vault.read(f)
                let lines = content.split('\n')
                if (lines.length > task.line) {
                    let line = lines[task.line]
                    if (task.blockLink) {
                        if (!line.endsWith(task.blockLink)) {
                            // block id mismatch?
                            lines[task.line] += `${task.blockLink}`
                            await this.plugin.app.vault.modify(f, lines.join('\n'))
                            return
                        }
                    } else {
                        // generate block id
                        let blockId = this.createBlockId()
                        task.blockLink = blockId
                        lines[task.line] += `${blockId}`
                        await this.plugin.app.vault.modify(f, lines.join('\n'))
                    }
                }
            }
        }
    }

    private createBlockId() {
        return ` ^${Math.random().toString(36).substring(2, 6)}`
    }

    public clear() {
        this.store.update((state) => ({ ...state, task: undefined }))
    }

    public openNote(event: MouseEvent, path: string) {
        const file = this.plugin.app.vault.getAbstractFileByPath(path)
        if (file instanceof TFile) {
            const leaf = this.plugin.app.workspace.getLeaf(
                Keymap.isModEvent(event),
            )
            void leaf.openFile(file)
        }
    }

    public openTask = (event: MouseEvent, task: TaskItem) => {
        let file = this.plugin.app.vault.getAbstractFileByPath(task.path)
        if (file && file instanceof TFile && task.line >= 0) {
            const leaf = this.plugin.app.workspace.getLeaf(
                Keymap.isModEvent(event),
            )
            void leaf.openFile(file, { eState: { line: task.line } })
        }
    }

    public finish() {}

    public destory() {
        for (let unsub of this.unsubscribers) {
            unsub()
        }
    }

    /** Called with the freshly read tasks of a note; keeps the focused task up to date. */
    public sync(path: string, tasks: TaskItem[]) {
        const current = this.state.task
        if (!current || current.path !== path) return
        const fresh =
            (current.blockLink &&
                tasks.find((t) => t.blockLink === current.blockLink)) ||
            tasks.find(
                (t) => t.line === current.line && t.description === current.description,
            ) ||
            tasks.find((t) => t.description === current.description)
        if (!fresh) return
        // A label the user has not changed follows the description
        const name =
            current.name === current.description ? fresh.description : current.name
        this.store.update((state) => ({
            ...state,
            task: { ...fresh, name },
        }))
    }

    public async updateActual() {
        // update task item
        if (
            this.plugin.getSettings().enableTaskTracking &&
            this.task &&
            this.task.blockLink
        ) {
            const task = this.task
            this.store.update((state) => ({
                ...state,
                task: state.task
                    ? { ...state.task, actual: Math.max(0, state.task.actual) + 1 }
                    : state.task,
            }))
            await this.incrTaskActual(task)
        }
    }

    /** Counts one more finished pomodoro on the task's line in its note. */
    private async incrTaskActual(task: TaskItem) {
        const file = this.plugin.app.vault.getAbstractFileByPath(task.path)
        if (!(file instanceof TFile) || file.extension !== 'md') {
            return
        }
        const format = this.plugin.getSettings().taskFormat

        await this.plugin.app.vault.process(file, (data) => {
            const lines = data.split('\n')
            const index = locateTaskLine(lines, task, format)
            if (index < 0) return data
            // Count from what the note says, not from what was last read
            const done = readPomodoros(lines[index], format)?.actual ?? 0
            lines[index] = editTaskLine(lines[index], { actual: done + 1 }, format)
            return lines.join('\n')
        })
    }
}
