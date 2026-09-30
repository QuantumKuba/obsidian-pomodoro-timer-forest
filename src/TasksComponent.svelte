<script lang="ts">
import type TaskTracker from 'TaskTracker'
import type Tasks from 'Tasks'
import type { TaskItem } from 'Tasks'
import { settings } from 'stores'
import { Menu } from 'obsidian'
import Icon from './tasks/Icon.svelte'
import Pomodoros from './tasks/Pomodoros.svelte'
import TaskRow from './tasks/TaskRow.svelte'
import TaskEditor from './tasks/TaskEditor.svelte'
import { describeDue, longDate } from './tasks/dates'

export let tasks: Tasks
export let tracker: TaskTracker
export let render: (content: string, el: HTMLElement) => void
const r = (content: string, el: HTMLElement) => {
    render(content, el)
}

type Status = '' | 'todo' | 'completed'
const FILTERS: { value: Status; label: string }[] = [
    { value: '', label: 'All' },
    { value: 'todo', label: 'Todo' },
    { value: 'completed', label: 'Done' },
]

let status: Status = ''
let query = ''
/** The row whose editor is open. */
let editingKey = ''
let tasksPlugin = false
let collapsed: Record<string, boolean> = {}

const keyOf = (t: TaskItem) => `${t.path}\n${t.line}`

function matches(item: TaskItem, status: Status, needle: string) {
    if (status === 'todo' && item.checked) return false
    if (status === 'completed' && !item.checked) return false
    if (!needle) return true
    return (
        item.description.toLowerCase().includes(needle) ||
        item.tags.some((tag) => tag.toLowerCase().includes(needle))
    )
}

$: needle = query.trim().toLowerCase()
$: filtering = status !== '' || needle !== ''
$: groups = ($tasks?.groups ?? []).map((g) => ({
    ...g,
    shown: g.tasks.filter((item) => matches(item, status, needle)),
    open: g.tasks.filter((item) => !item.checked).length,
}))
$: visible = filtering ? groups.filter((g) => g.shown.length > 0) : groups
$: openTotal = groups.reduce((n, g) => n + g.open, 0)
$: anyTasks = groups.some((g) => g.tasks.length > 0)

$: focus = $tracker.task
$: focusLeft = focus && focus.expected > 0 ? Math.max(0, focus.expected - focus.actual) : 0
$: focusDue = focus?.due ? describeDue(focus.due, focus.checked) : null

/** Block ids identify a task once it has one; before that its place in the note does. */
function isActive(item: TaskItem, task: TaskItem | undefined) {
    if (!task || task.path !== item.path) return false
    if (task.blockLink && item.blockLink) return task.blockLink === item.blockLink
    return task.line === item.line && task.description === item.description
}

const select = (item: TaskItem) => {
    void tracker.active(item)
}

const togglePinned = (path: string) => {
    tracker.togglePinned(path)
}

const changeTaskName = (e: Event) => {
    tracker.setTaskName((e.target as HTMLInputElement).value)
}

const removeTask = () => {
    tracker.clear()
}

function toggleEditor(item: TaskItem) {
    const key = keyOf(item)
    if (editingKey === key) {
        editingKey = ''
        return
    }
    // The Tasks plugin may have been enabled since the panel opened
    tasksPlugin = tasks.writer.tasksPluginAvailable()
    editingKey = key
}

const toggleGroup = (path: string) => {
    collapsed = { ...collapsed, [path]: !collapsed[path] }
}

const noteName = (fileName: string) => fileName.replace(/\.md$/, '')

const showTaskMenu = (item: TaskItem) => (e: MouseEvent) => {
    const menu = new Menu()
    menu.addItem((i) =>
        i
            .setTitle('Focus on this task')
            .setIcon('target')
            .onClick(() => select(item)),
    )
    menu.addItem((i) =>
        i
            .setTitle('Edit pomodoros and dates')
            .setIcon('sliders-horizontal')
            .onClick(() => toggleEditor(item)),
    )
    if (tasks.writer.tasksPluginAvailable()) {
        menu.addItem((i) =>
            i
                .setTitle('Edit in Tasks…')
                .setIcon('list-checks')
                .onClick(() => void tasks.writer.editWithTasksPlugin(item)),
        )
    }
    menu.addItem((i) =>
        i
            .setTitle('Open in note')
            .setIcon('file-text')
            .onClick(() => tracker.openTask(e, item)),
    )
    menu.showAtMouseEvent(e)
}
</script>

<div class="tasks">
    {#if focus}
        <section class="focus" aria-label="Focus task">
            <div class="focus-top">
                <span class="focus-tag"><span class="focus-dot"></span>Focusing on</span>
                <button class="icon-btn" on:click={removeTask} aria-label="Stop focusing on this task" title="Stop focusing on this task">
                    <Icon name="x" size={13} />
                </button>
            </div>
            <input class="focus-name" type="text" value={focus.name} on:input={changeTaskName} aria-label="Task name, as it appears in your log" />
            <div class="focus-meta">
                <Pomodoros actual={focus.actual} expected={focus.expected} max={10} />
                <span class="focus-left">
                    {#if focus.expected > 0}
                        {focusLeft > 0 ? `${focusLeft} left` : 'All planned pomodoros done'}
                    {:else if focus.actual > 0}
                        {focus.actual} done
                    {:else}
                        Not planned yet
                    {/if}
                </span>
                {#if focusDue}
                    <span class="due-chip {focusDue.tone}" title="Due: {longDate(focus.due)}">
                        <Icon name="calendar" size={10} />{focusDue.text}
                    </span>
                {/if}
                <span class="focus-from" title={focus.path}>{noteName(focus.fileName)}</span>
            </div>
        </section>
    {/if}

    {#if $tracker.file || groups.length > 0}
        <div class="panel">
            <div class="panel-head">
                <div class="panel-title">
                    <span>Tasks</span>
                    <span class="muted">{openTotal} open{groups.length > 1 ? ` · ${groups.length} notes` : ''}</span>
                </div>

                {#if anyTasks}
                    <div class="seg" role="group" aria-label="Filter tasks">
                        {#each FILTERS as f (f.value)}
                            <button class="seg-btn" class:on={status === f.value} aria-pressed={status === f.value} on:click={() => (status = f.value)}>
                                {f.label}
                            </button>
                        {/each}
                    </div>
                    <label class="search">
                        <Icon name="search" size={13} />
                        <input type="text" bind:value={query} placeholder="Search tasks…" aria-label="Search tasks" />
                        {#if query}
                            <button class="icon-btn clear-search" on:click={() => (query = '')} aria-label="Clear search"><Icon name="x" size={12} /></button>
                        {/if}
                    </label>
                {/if}
            </div>

            {#each visible as g (g.path)}
                <section class="group" class:pinned={g.pinned}>
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div
                        class="group-head"
                        role="button"
                        tabindex="0"
                        aria-expanded={!collapsed[g.path]}
                        on:click={() => toggleGroup(g.path)}
                        on:keydown={(e) => {
                            if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                                e.preventDefault()
                                toggleGroup(g.path)
                            }
                        }}
                    >
                        <span class="chev"><Icon name={collapsed[g.path] ? 'chevron-right' : 'chevron-down'} size={13} /></span>
                        <button class="group-name" on:click|stopPropagation={(e) => tracker.openNote(e, g.path)} title="Open {g.name}">
                            {g.name}
                        </button>
                        {#if g.current}<span class="viewing" title="The note you are working in"><span class="viewing-dot"></span>viewing</span>{/if}
                        <span class="group-count">
                            {#if g.loading}
                                &nbsp;
                            {:else if g.tasks.length === 0}
                                empty
                            {:else if g.open === 0}
                                all done
                            {:else}
                                {g.open} open
                            {/if}
                        </span>
                        <button
                            class="pin"
                            class:on={g.pinned}
                            aria-pressed={g.pinned}
                            aria-label={g.pinned ? `Unpin ${g.name}` : `Pin ${g.name}`}
                            title={g.pinned
                                ? 'Unpin: stop keeping this note’s tasks here'
                                : 'Pin: keep this note’s tasks here while you work in other notes'}
                            on:click|stopPropagation={() => togglePinned(g.path)}
                        >
                            <Icon name="pin" size={13} filled={g.pinned} />
                        </button>
                    </div>

                    {#if !collapsed[g.path]}
                        {#if g.shown.length > 0}
                            <div class="list">
                                {#each g.shown as item (item.line)}
                                    <TaskRow
                                        {item}
                                        render={r}
                                        showProgress={$settings.showTaskProgress}
                                        active={isActive(item, focus)}
                                        editing={editingKey === keyOf(item)}
                                        onSelect={() => select(item)}
                                        onEdit={() => toggleEditor(item)}
                                        onMenu={showTaskMenu(item)}
                                    />
                                    {#if editingKey === keyOf(item)}
                                        <TaskEditor
                                            task={item}
                                            save={(edits) => tasks.update(item, edits)}
                                            trackingEnabled={$settings.enableTaskTracking}
                                            {tasksPlugin}
                                            openInTasks={() => void tasks.writer.editWithTasksPlugin(item)}
                                            openNote={(e) => tracker.openTask(e, item)}
                                        />
                                    {/if}
                                {/each}
                            </div>
                        {:else if !filtering && !g.loading}
                            <p class="empty-note">No tasks in this note yet. Add a line like <code>- [ ] Write the intro</code> and it shows up here.</p>
                        {/if}
                    {/if}
                </section>
            {/each}

            {#if filtering && visible.length === 0}
                <p class="empty">Nothing matches{needle ? ` “${query.trim()}”` : ''}.</p>
            {:else if groups.length > 0 && !anyTasks}
                <p class="empty">
                    Pin a note to keep its tasks here while you work in other notes.
                </p>
            {/if}
        </div>
    {:else}
        <p class="empty standalone">Open a note to see its tasks.</p>
    {/if}
</div>

<style>
.tasks {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
}

/* Focus task */
.focus {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 9px 10px 10px 12px;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--interactive-accent) 45%, var(--background-modifier-border));
    background: linear-gradient(
        135deg,
        color-mix(in srgb, var(--interactive-accent) 13%, var(--background-primary)),
        var(--background-primary) 75%
    );
}
.focus-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.focus-tag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.64rem;
    font-weight: 700;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--text-muted);
}
.focus-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-red);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-red) 22%, transparent);
}
.focus-name {
    width: 100%;
    height: auto;
    padding: 3px 0;
    font-size: 0.92rem;
    font-weight: 600;
    border: none;
    border-bottom: 1px solid transparent;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    color: var(--text-normal);
}
.focus-name:hover {
    border-bottom-color: var(--background-modifier-border);
}
.focus-name:focus,
.focus-name:active {
    border-bottom-color: var(--interactive-accent);
    box-shadow: none;
}
.focus-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    font-size: 0.7rem;
    color: var(--text-muted);
}
.focus-left {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
}
.focus-from {
    margin-left: auto;
    max-width: 45%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-faint);
}
.due-chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 0 6px;
    height: 16px;
    border-radius: 99px;
    font-size: 0.66rem;
    font-weight: 600;
    background: var(--background-modifier-hover);
}
.due-chip.soon,
.due-chip.today {
    color: var(--color-orange, #e0a030);
    background: color-mix(in srgb, var(--color-orange, #e0a030) 18%, transparent);
}
.due-chip.overdue {
    color: var(--color-red);
    background: color-mix(in srgb, var(--color-red) 16%, transparent);
}
.icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    border-radius: 6px;
    box-shadow: none;
    background: transparent;
    color: var(--text-faint);
    cursor: pointer;
}
.icon-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
}

/* The list */
.panel {
    width: 100%;
    border-radius: 12px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    overflow: hidden;
}
.panel-head {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    background: var(--background-secondary);
}
.panel-title {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    font-size: 0.95rem;
    font-weight: 700;
}
.muted {
    font-size: 0.72rem;
    font-weight: 500;
    color: var(--text-faint);
}
.seg {
    display: flex;
    padding: 2px;
    gap: 2px;
    border-radius: 9px;
    background: var(--background-modifier-hover);
}
.seg-btn {
    flex: 1;
    height: auto;
    padding: 3px 0;
    border: none;
    border-radius: 7px;
    box-shadow: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 0.74rem;
    cursor: pointer;
    transition: background-color 0.12s, color 0.12s;
}
.seg-btn:hover:not(.on) {
    color: var(--text-normal);
}
.seg-btn.on {
    background: var(--interactive-accent);
    color: var(--text-on-accent, #fff);
    font-weight: 600;
}
.search {
    position: relative;
    display: flex;
    align-items: center;
    color: var(--text-faint);
}
.search > :global(.pf-icon) {
    position: absolute;
    left: 9px;
    pointer-events: none;
}
.search input {
    width: 100%;
    height: 28px;
    padding: 0 26px 0 28px;
    font-size: 0.78rem;
    border-radius: 8px;
}
.clear-search {
    position: absolute;
    right: 3px;
}

.group {
    border-top: 1px solid var(--background-modifier-border);
}
.group-head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 8px 7px 10px;
    cursor: pointer;
    outline: none;
    user-select: none;
    background: color-mix(in srgb, var(--background-secondary) 55%, var(--background-primary));
}
.group-head:hover {
    background: var(--background-modifier-hover);
}
.group-head:focus-visible {
    box-shadow: inset 0 0 0 2px var(--interactive-accent);
}
.chev {
    display: inline-flex;
    color: var(--text-faint);
}
.group-name {
    flex: 0 1 auto;
    min-width: 0;
    height: auto;
    padding: 0;
    border: none;
    box-shadow: none;
    background: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text-normal);
    cursor: pointer;
}
.group-name:hover {
    color: var(--text-accent, var(--interactive-accent));
    text-decoration: underline;
}
.viewing {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: none;
    padding: 0 6px;
    height: 16px;
    border-radius: 99px;
    font-size: 0.62rem;
    font-weight: 600;
    color: var(--color-green);
    background: color-mix(in srgb, var(--color-green) 14%, transparent);
}
.viewing-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--color-green);
}
.group-count {
    margin-left: auto;
    flex: none;
    font-size: 0.68rem;
    color: var(--text-faint);
    font-variant-numeric: tabular-nums;
}
.pin {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 6px;
    box-shadow: none;
    background: transparent;
    color: var(--text-faint);
    cursor: pointer;
    transition: color 0.12s, background-color 0.12s, transform 0.12s;
}
.pin:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
}
.pin.on {
    color: var(--interactive-accent);
    transform: rotate(-20deg);
}

.list > :global(.row + .row),
.list > :global(.editor + .row) {
    border-top: 1px solid var(--background-modifier-border);
}

.empty,
.empty-note {
    margin: 0;
    padding: 14px 16px;
    font-size: 0.78rem;
    line-height: 1.45;
    color: var(--text-faint);
    text-align: center;
}
.empty-note {
    padding: 10px 16px 14px;
}
.empty-note code {
    font-size: 0.72rem;
}
.empty.standalone {
    border: 1px dashed var(--background-modifier-border);
    border-radius: 12px;
}
</style>
