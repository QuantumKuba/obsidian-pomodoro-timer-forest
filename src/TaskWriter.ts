import { Notice, TFile } from 'obsidian'
import type PomodoroTimerPlugin from 'main'
import type { TaskItem } from 'Tasks'
import type { TaskFormat } from 'Settings'
import { DESERIALIZERS } from 'serializer'
import { editTaskLine, type TaskLineEdits } from 'serializer/TaskLineEditor'
import { extractTaskComponents } from 'utils'

const TASKS_PLUGIN_ID = 'obsidian-tasks-plugin'

/** The part of the Tasks plugin's public API (`apiV1`) used here. */
type TasksApiV1 = {
    editTaskLineModal?: (taskLine: string) => Promise<string>
}

type TaskIdentity = Pick<TaskItem, 'line' | 'blockLink' | 'description'>

/**
 * Finds the line of a task in the current text of its note. Line numbers shift as the user
 * types, so a task is recognised by its block id, or else by its description (which the
 * pomodoro and date edits never touch). The closest match to the old position wins.
 */
export function locateTaskLine(
    lines: string[],
    task: TaskIdentity,
    format: TaskFormat,
): number {
    const deserializer = DESERIALIZERS[format]
    const link = task.blockLink.trim()

    const matches = (line: string | undefined, byLink: boolean) => {
        if (line === undefined) return false
        const components = extractTaskComponents(line.replace(/\r$/, ''))
        if (!components) return false
        return byLink
            ? components.blockLink.trim() === link
            : deserializer.deserialize(components.body).description ===
                  task.description
    }

    const search = (byLink: boolean) => {
        if (matches(lines[task.line], byLink)) return task.line
        let best = -1
        lines.forEach((line, i) => {
            if (
                matches(line, byLink) &&
                (best < 0 || Math.abs(i - task.line) < Math.abs(best - task.line))
            ) {
                best = i
            }
        })
        return best
    }

    if (link) {
        const index = search(true)
        if (index >= 0) return index
    }
    return search(false)
}

/** Writes task edits back to the notes the tasks came from. */
export default class TaskWriter {
    constructor(private plugin: PomodoroTimerPlugin) {}

    private fileOf(task: TaskItem): TFile | null {
        const file = this.plugin.app.vault.getAbstractFileByPath(task.path)
        return file instanceof TFile && file.extension === 'md' ? file : null
    }

    /** Sets pomodoros and dates on the task's line. False when the task could not be found. */
    public async update(task: TaskItem, edits: TaskLineEdits): Promise<boolean> {
        const file = this.fileOf(task)
        if (!file) return false
        const format = this.plugin.getSettings().taskFormat
        let found = false
        await this.plugin.app.vault.process(file, (data) => {
            const lines = data.split('\n')
            const index = locateTaskLine(lines, task, format)
            if (index < 0) return data
            found = true
            lines[index] = editTaskLine(lines[index], edits, format)
            return lines.join('\n')
        })
        if (!found) new Notice('That task has moved or was deleted in its note.')
        return found
    }

    private get tasksApi(): TasksApiV1 | undefined {
        const plugin = this.plugin.app.plugins?.plugins?.[TASKS_PLUGIN_ID]
        return plugin?.apiV1 as TasksApiV1 | undefined
    }

    /** The Tasks plugin may load after this one, so ask every time rather than remembering. */
    public tasksPluginAvailable(): boolean {
        return typeof this.tasksApi?.editTaskLineModal === 'function'
    }

    /**
     * Opens the Tasks plugin's own editor for the task (priority, recurrence, all dates…) and
     * writes the result back. Nothing happens when the editor is cancelled.
     */
    public async editWithTasksPlugin(task: TaskItem): Promise<boolean> {
        const edit = this.tasksApi?.editTaskLineModal
        const file = this.fileOf(task)
        if (!edit || !file) {
            new Notice('Install and enable the Tasks plugin to use its task editor.')
            return false
        }
        const format = this.plugin.getSettings().taskFormat
        const before = (await this.plugin.app.vault.read(file)).split('\n')
        const at = locateTaskLine(before, task, format)
        if (at < 0) {
            new Notice('That task has moved or was deleted in its note.')
            return false
        }
        const original = before[at].replace(/\r$/, '')

        let edited: string
        try {
            edited = await edit.call(this.tasksApi, original)
        } catch (err) {
            console.error('[Pomodoro Timer Forest] The Tasks plugin editor failed', err)
            new Notice('The Tasks plugin could not open its editor.')
            return false
        }
        // An empty result means the editor was cancelled
        edited = edited.replace(/\n+$/, '')
        if (!edited || edited === original) return false

        let found = false
        await this.plugin.app.vault.process(file, (data) => {
            const lines = data.split('\n')
            const index = locateTaskLine(lines, task, format)
            if (index < 0) return data
            found = true
            // Finishing a recurring task gives back two lines: the next one and the done one
            const cr = lines[index].endsWith('\r') ? '\r' : ''
            lines.splice(index, 1, ...edited.split('\n').map((l) => l + cr))
            return lines.join('\n')
        })
        if (!found) new Notice('That task changed while it was being edited, so nothing was saved.')
        return found
    }
}
