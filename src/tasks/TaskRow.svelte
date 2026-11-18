<script lang="ts">
import type { TaskItem } from 'Tasks'
import TaskItemComponent from 'TaskItemComponent.svelte'
import Icon from './Icon.svelte'
import Pomodoros from './Pomodoros.svelte'
import { describeDue, describeStart, longDate } from './dates'

export let item: TaskItem
/** The task the timer is focused on. */
export let active = false
/** The editor is open under this row. */
export let editing = false
/** Fill the row in as pomodoros are finished. */
export let showProgress = true
export let render: (content: string, el: HTMLElement) => void
export let onSelect: () => void
export let onEdit: () => void
export let onMenu: (e: MouseEvent) => void
/** Shown only because a subtask under it matches the search. */
export let context = false
/** Its subtasks are folded away. */
export let collapsed = false
export let onToggle: () => void = () => {}

$: depth = item.depth ?? 0
$: sub = item.subtasks ?? { done: 0, total: 0 }
$: rollup = item.rollup ?? { actual: item.actual, expected: item.expected }
// Pomodoros spent on the steps, when there are more than on the task's own line
$: rolledUp = sub.total > 0 && (rollup.actual > item.actual || rollup.expected > item.expected)

$: ratio = item.expected > 0 ? Math.min(100, (item.actual / item.expected) * 100) : 0
$: due = item.due ? describeDue(item.due, item.checked) : null
$: start = item.start ? describeStart(item.start) : null
$: hasMeta = item.actual > 0 || item.expected > 0 || !!due || !!start || !!item.lane || sub.total > 0

function onKey(e: KeyboardEvent) {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onSelect()
    }
}
</script>

<div
    class="row"
    class:active
    class:checked={item.checked}
    class:editing
    class:waiting={!!start && start.tone === 'future' && !item.checked}
    class:has-progress={showProgress && ratio > 0}
    class:context
    class:subtask={depth > 0}
    style="--pct:{ratio}%; --depth:{depth}"
    role="button"
    tabindex="0"
    aria-pressed={active}
    on:click={onSelect}
    on:keydown={onKey}
    on:contextmenu|preventDefault={onMenu}
>
    <span class="status" aria-hidden="true">
        <Icon name={item.checked ? 'check-circle' : 'circle'} size={14} />
    </span>

    <div class="body">
        <TaskItemComponent {render} content={item.description} />

        {#if hasMeta}
            <div class="meta">
                {#if sub.total > 0}
                    <button
                        class="chip steps"
                        class:all={sub.done === sub.total}
                        aria-expanded={!collapsed}
                        title="{sub.done} of {sub.total} subtasks done · {collapsed ? 'show' : 'hide'} them"
                        on:click|stopPropagation={onToggle}
                        on:keydown|stopPropagation
                    >
                        <Icon name={collapsed ? 'chevron-right' : 'chevron-down'} size={10} />
                        <Icon name="list-checks" size={10} />{sub.done}/{sub.total}
                    </button>
                {/if}
                {#if item.lane}
                    <span class="chip lane" title="Lane on the board">{item.lane}</span>
                {/if}
                <Pomodoros actual={item.actual} expected={item.expected} />
                {#if rolledUp}
                    <span class="chip rollup" title="Pomodoros on this task and its subtasks: {rollup.actual} done{rollup.expected > 0 ? ` of ${rollup.expected} planned` : ''}">
                        🍅 {rollup.actual}{rollup.expected > 0 ? `/${rollup.expected}` : ''} in all
                    </span>
                {/if}
                {#if start}
                    <span class="chip start {start.tone}" title="Start date: {longDate(item.start)}">
                        <Icon name="play" size={10} filled />{start.text}
                    </span>
                {/if}
                {#if due}
                    <span class="chip due {due.tone}" title="Due: {longDate(item.due)}">
                        <Icon name="calendar" size={10} />{due.text}
                    </span>
                {/if}
            </div>
        {/if}
    </div>

    <button
        class="edit"
        class:on={editing}
        aria-label="Edit pomodoros and dates"
        aria-expanded={editing}
        title="Edit pomodoros and dates"
        on:click|stopPropagation={onEdit}
    >
        <Icon name="sliders" size={14} />
    </button>
</div>

<style>
.row {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 8px 8px calc(12px + var(--depth, 0) * 18px);
    cursor: pointer;
    outline: none;
    background-color: transparent;
    transition: background-color 0.12s;
}
.row.has-progress {
    background-image: linear-gradient(
        to right,
        color-mix(in srgb, var(--color-green) 15%, transparent) var(--pct),
        transparent var(--pct)
    );
}
.row:hover {
    background-color: var(--background-modifier-hover);
}
.row:focus-visible {
    box-shadow: inset 0 0 0 2px var(--interactive-accent);
}
.row.active {
    background-color: color-mix(in srgb, var(--interactive-accent) 11%, transparent);
    box-shadow: inset 3px 0 0 var(--interactive-accent);
}
.row.active:focus-visible {
    box-shadow: inset 3px 0 0 var(--interactive-accent), inset 0 0 0 2px var(--interactive-accent);
}
/* A thread back up to the parent task */
.row.subtask::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(18px + (var(--depth) - 1) * 18px);
    width: 1px;
    background: var(--background-modifier-border);
}
.row.subtask {
    padding-top: 6px;
    padding-bottom: 6px;
}
.row.context .body {
    opacity: 0.6;
}
.status {
    margin-top: 2px;
    color: var(--color-blue, var(--interactive-accent));
}
.row.checked .status {
    color: var(--color-green);
}
.row.active .status {
    color: var(--interactive-accent);
}
.body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.row.checked .body :global(.pomodoro-tasks-item-desc) {
    text-decoration: line-through;
    color: var(--text-muted);
}
.row.waiting .body :global(.pomodoro-tasks-item-desc) {
    opacity: 0.7;
}

.meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    min-height: 16px;
}
.chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 0 6px;
    height: 16px;
    border-radius: 99px;
    font-size: 0.66rem;
    font-weight: 600;
    white-space: nowrap;
    color: var(--text-muted);
    background: var(--background-modifier-hover);
}
.chip.steps {
    height: 16px;
    padding: 0 6px 0 3px;
    border: none;
    box-shadow: none;
    cursor: pointer;
    font-variant-numeric: tabular-nums;
}
.chip.steps:hover {
    color: var(--text-normal);
    background: var(--background-modifier-active-hover, var(--background-modifier-hover));
}
.chip.steps:focus-visible {
    box-shadow: 0 0 0 2px var(--interactive-accent);
}
.chip.steps.all {
    color: var(--color-green);
    background: color-mix(in srgb, var(--color-green) 14%, transparent);
}
.chip.rollup {
    font-weight: 500;
    color: var(--text-faint);
    background: transparent;
    padding: 0;
    font-variant-numeric: tabular-nums;
}
.chip.lane {
    max-width: 110px;
    overflow: hidden;
    text-overflow: ellipsis;
    border-radius: 5px;
    color: var(--text-muted);
    background: transparent;
    box-shadow: inset 0 0 0 1px var(--background-modifier-border);
}
.chip.past {
    color: var(--text-faint);
    font-weight: 500;
}
.chip.later {
    color: var(--text-muted);
}
.chip.soon {
    color: var(--color-orange, #e0a030);
    background: color-mix(in srgb, var(--color-orange, #e0a030) 14%, transparent);
}
.chip.today {
    color: var(--color-orange, #e0a030);
    background: color-mix(in srgb, var(--color-orange, #e0a030) 22%, transparent);
}
.chip.overdue {
    color: var(--color-red);
    background: color-mix(in srgb, var(--color-red) 16%, transparent);
}
.chip.future {
    color: var(--color-blue, var(--interactive-accent));
    background: color-mix(in srgb, var(--color-blue, var(--interactive-accent)) 14%, transparent);
}

.edit {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    margin: -2px 0;
    padding: 0;
    border: none;
    border-radius: 7px;
    box-shadow: none;
    background: transparent;
    color: var(--text-faint);
    opacity: 0.7;
    cursor: pointer;
    transition: opacity 0.12s, background-color 0.12s, color 0.12s;
}
.row:hover .edit,
.edit:focus-visible,
.edit.on {
    opacity: 1;
}
.edit:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
}
.edit.on {
    color: var(--interactive-accent);
    background: color-mix(in srgb, var(--interactive-accent) 14%, transparent);
}
</style>
