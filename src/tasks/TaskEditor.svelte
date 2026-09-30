<script lang="ts">
import { onDestroy } from 'svelte'
import type { TaskItem } from 'Tasks'
import type { TaskLineEdits } from 'serializer/TaskLineEditor'
import Icon from './Icon.svelte'
import Pomodoros from './Pomodoros.svelte'
import { today, addDays, relativeDays, longDate } from './dates'

export let task: TaskItem
/** Writes the edits to the task's line in its note; resolves false when the line was not found. */
export let save: (edits: TaskLineEdits) => Promise<boolean> | boolean | void
/** Whether finished sessions are added to the task automatically. */
export let trackingEnabled = true
/** Whether the Tasks plugin's own editor can be opened. */
export let tasksPlugin = false
export let openInTasks: () => void
export let openNote: (e: MouseEvent) => void

type Field = 'expected' | 'actual'
type DateField = 'start' | 'due'

const SAVE_DELAY = 450
const PLAN_CHOICES = [1, 2, 3, 4, 6, 8]
const DATE_FIELDS: { field: DateField; label: string; icon: 'play' | 'calendar' }[] = [
    { field: 'start', label: 'Start date', icon: 'play' },
    { field: 'due', label: 'Due date', icon: 'calendar' },
]
const DATE_CHOICES: { label: string; days: number }[] = [
    { label: 'Today', days: 0 },
    { label: 'Tomorrow', days: 1 },
    { label: 'In a week', days: 7 },
]

let draft = { expected: 0, actual: 0, start: '', due: '' }
let edits: TaskLineEdits = {}
let dirty = false
let saving = false
let savedAt = 0
let timer: number | undefined
let queue: Promise<unknown> = Promise.resolve()

// Follow the note, unless an edit is on its way to it (the note reports back a moment later)
$: follow(task)

function follow(t: TaskItem, force = false) {
    if (!force && (dirty || saving || Date.now() - savedAt < 1000)) return
    draft = { expected: t.expected, actual: t.actual, start: t.start, due: t.due }
}

function schedule(change: TaskLineEdits, delay: number) {
    edits = { ...edits, ...change }
    dirty = true
    window.clearTimeout(timer)
    timer = window.setTimeout(flush, delay)
}

function flush() {
    window.clearTimeout(timer)
    // Writes go one after the other so a slow one cannot overwrite a newer one
    queue = queue.then(async () => {
        if (!dirty) return
        const batch = edits
        edits = {}
        dirty = false
        saving = true
        let ok = false
        try {
            ok = (await save(batch)) !== false
        } catch (err) {
            console.error('[Pomodoro Timer Forest] Could not save the task', err)
        } finally {
            saving = false
            savedAt = Date.now()
        }
        // The task could not be written: show what the note really says
        if (!ok) follow(task, true)
    })
}

onDestroy(() => {
    if (dirty) flush()
})

function step(field: Field, by: number) {
    const value = Math.max(0, Math.min(99, draft[field] + by))
    if (value === draft[field]) return
    draft[field] = value
    schedule({ [field]: value }, SAVE_DELAY)
}

function plan(n: number) {
    draft.expected = n
    schedule({ expected: n }, 0)
}

function setDate(field: DateField, value: string) {
    draft[field] = value
    schedule({ [field]: value || null }, 0)
}

const fromToday = (days: number) => addDays(today(), days)

$: left = Math.max(0, draft.expected - draft.actual)
$: status =
    draft.expected === 0
        ? draft.actual > 0
            ? `${draft.actual} done`
            : 'Not planned'
        : left === 0
          ? 'All done'
          : `${left} left`
$: clash = !!draft.start && !!draft.due && draft.due < draft.start
</script>

<div class="editor">
    <section class="block">
        <div class="block-head">
            <span class="block-title">🍅 Pomodoros</span>
            <span class="pill" class:done={draft.expected > 0 && left === 0} class:empty={draft.expected === 0 && draft.actual === 0}>
                {status}
            </span>
        </div>

        <div class="steppers">
            <div class="stepper">
                <span class="stepper-label">Planned</span>
                <div class="stepper-ctl">
                    <button class="step" aria-label="One fewer planned" disabled={draft.expected === 0} on:click={() => step('expected', -1)}>
                        <Icon name="minus" size={13} />
                    </button>
                    <span class="value" aria-live="polite">{draft.expected}</span>
                    <button class="step" aria-label="One more planned" on:click={() => step('expected', 1)}>
                        <Icon name="plus" size={13} />
                    </button>
                </div>
            </div>
            <div class="stepper">
                <span class="stepper-label">Done</span>
                <div class="stepper-ctl">
                    <button class="step" aria-label="One fewer done" disabled={draft.actual === 0} on:click={() => step('actual', -1)}>
                        <Icon name="minus" size={13} />
                    </button>
                    <span class="value" aria-live="polite">{draft.actual}</span>
                    <button class="step" aria-label="One more done" on:click={() => step('actual', 1)}>
                        <Icon name="plus" size={13} />
                    </button>
                </div>
            </div>
        </div>

        {#if draft.expected > 0 || draft.actual > 0}
            <div class="dots-row"><Pomodoros actual={draft.actual} expected={draft.expected} max={12} /></div>
        {/if}

        {#if draft.expected === 0}
            <div class="quick">
                <span class="quick-label">How many will it take?</span>
                {#each PLAN_CHOICES as n}
                    <button class="chip" on:click={() => plan(n)}>{n}</button>
                {/each}
            </div>
        {/if}

        {#if !trackingEnabled}
            <p class="hint">
                Finished sessions are not added to this count automatically. Turn on “Enable task tracking” in the plugin settings to have that done for you.
            </p>
        {/if}
    </section>

    {#each DATE_FIELDS as d (d.field)}
        <section class="block">
            <div class="block-head">
                <span class="block-title"><Icon name={d.icon} size={12} /> {d.label}</span>
                {#if draft[d.field]}
                    <span class="rel" title={longDate(draft[d.field])}>{relativeDays(draft[d.field])}</span>
                {/if}
            </div>
            <div class="date-row">
                <input
                    class="date"
                    type="date"
                    aria-label={d.label}
                    value={draft[d.field]}
                    on:change={(e) => setDate(d.field, e.currentTarget.value)}
                />
                <button
                    class="clear"
                    class:hidden={!draft[d.field]}
                    aria-label="Remove the {d.label.toLowerCase()}"
                    title="Remove"
                    tabindex={draft[d.field] ? 0 : -1}
                    on:click={() => setDate(d.field, '')}
                >
                    <Icon name="x" size={13} />
                </button>
            </div>
            <div class="quick">
                {#each DATE_CHOICES as c}
                    <button class="chip" class:on={draft[d.field] === fromToday(c.days)} on:click={() => setDate(d.field, fromToday(c.days))}>
                        {c.label}
                    </button>
                {/each}
            </div>
        </section>
    {/each}

    {#if clash}
        <p class="warn">The due date is before the start date.</p>
    {/if}

    <div class="actions">
        {#if tasksPlugin}
            <button class="action primary" on:click={openInTasks} title="Open this task in the Tasks plugin's editor: priority, recurrence, all dates">
                <Icon name="list-checks" size={13} /> Edit in Tasks
            </button>
        {/if}
        <button class="action" on:click={openNote} title="Jump to this task in its note">
            <Icon name="external-link" size={13} /> Open in note
        </button>
    </div>
</div>

<style>
.editor {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 2px 10px 10px 34px;
    padding: 10px 12px 12px;
    border-radius: 10px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    animation: te-in 0.16s ease-out;
    cursor: default;
}
@keyframes te-in {
    from {
        opacity: 0;
        transform: translateY(-4px);
    }
}
.block {
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.block + .block {
    padding-top: 10px;
    border-top: 1px solid var(--background-modifier-border);
}
.block-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}
.block-title {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--text-muted);
}
.pill {
    padding: 1px 8px;
    border-radius: 99px;
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--color-red);
    background: color-mix(in srgb, var(--color-red) 14%, transparent);
    font-variant-numeric: tabular-nums;
}
.pill.done {
    color: var(--color-green);
    background: color-mix(in srgb, var(--color-green) 16%, transparent);
}
.pill.empty {
    color: var(--text-faint);
    background: var(--background-modifier-hover);
}
.rel {
    font-size: 0.68rem;
    color: var(--text-faint);
}

.steppers {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
}
.stepper {
    display: flex;
    flex-direction: column;
    gap: 3px;
}
.stepper-label {
    font-size: 0.66rem;
    color: var(--text-faint);
    text-transform: uppercase;
    letter-spacing: 0.06em;
}
.stepper-ctl {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 32px;
    padding: 0 3px;
    border-radius: 99px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
}
.value {
    min-width: 1.6em;
    text-align: center;
    font-size: 0.95rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
}
.step {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: none;
    border-radius: 50%;
    box-shadow: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: background-color 0.12s, color 0.12s, transform 0.08s;
}
.step:hover:not(:disabled) {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
}
.step:active:not(:disabled) {
    transform: scale(0.88);
}
.step:disabled {
    opacity: 0.3;
    cursor: default;
}
.dots-row {
    display: flex;
    min-height: 10px;
}

.quick {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
}
.quick-label {
    flex-basis: 100%;
    font-size: 0.68rem;
    color: var(--text-faint);
}
.chip {
    height: auto;
    min-width: 28px;
    padding: 3px 9px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 99px;
    box-shadow: none;
    background: var(--background-primary);
    color: var(--text-muted);
    font-size: 0.72rem;
    line-height: 1.2;
    cursor: pointer;
    transition: background-color 0.12s, border-color 0.12s, color 0.12s;
}
.chip:hover {
    border-color: var(--interactive-accent);
    color: var(--text-normal);
}
.chip.on {
    background: var(--interactive-accent);
    border-color: var(--interactive-accent);
    color: var(--text-on-accent, #fff);
}

.date-row {
    display: flex;
    align-items: center;
    gap: 6px;
}
.date {
    flex: 1;
    min-width: 0;
    height: 30px;
    padding: 0 8px;
    font-size: 0.8rem;
    border-radius: 8px;
    color-scheme: light dark;
}
.clear {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: none;
    border-radius: 50%;
    box-shadow: none;
    background: transparent;
    color: var(--text-faint);
    cursor: pointer;
}
.clear:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
}
/* Keeps the two date fields the same width whether or not a date is set */
.clear.hidden {
    visibility: hidden;
}

.hint,
.warn {
    margin: 0;
    font-size: 0.68rem;
    line-height: 1.35;
    color: var(--text-faint);
}
.warn {
    color: var(--color-red);
}

.actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding-top: 10px;
    border-top: 1px solid var(--background-modifier-border);
}
.action {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: auto;
    padding: 5px 10px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    box-shadow: none;
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.74rem;
    cursor: pointer;
}
.action:hover {
    border-color: var(--interactive-accent);
}
.action.primary {
    background: color-mix(in srgb, var(--interactive-accent) 16%, var(--background-primary));
    border-color: color-mix(in srgb, var(--interactive-accent) 50%, transparent);
}
</style>
