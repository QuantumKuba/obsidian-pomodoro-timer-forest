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

$: ratio = item.expected > 0 ? Math.min(100, (item.actual / item.expected) * 100) : 0
$: due = item.due ? describeDue(item.due, item.checked) : null
$: start = item.start ? describeStart(item.start) : null
$: hasMeta = item.actual > 0 || item.expected > 0 || !!due || !!start || !!item.lane

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
    style="--pct:{ratio}%"
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
                {#if item.lane}
                    <span class="chip lane" title="Lane on the board">{item.lane}</span>
                {/if}
                <Pomodoros actual={item.actual} expected={item.expected} />
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
    padding: 8px 8px 8px 12px;
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
