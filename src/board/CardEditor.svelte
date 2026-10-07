<script lang="ts">
import { onMount, tick } from 'svelte'
import type { BoardCard } from './BoardModel'
import { readCardMeta } from './BoardModel'
import type { BoardContext } from './context'
import { cardDueDate, withDue, withEstimate } from './cards'
import Icon from '../tasks/Icon.svelte'
import { addDays, nextMonday, today } from '../tasks/dates'

/** The card being edited; null for a new card. */
export let card: BoardCard | null = null
export let ctx: BoardContext
export let kanbanDates = false
export let dateSettings: Record<string, unknown> | undefined = undefined
export let placeholder = 'Write a card…'
export let onSave: (text: string) => void
export let onClose: () => void
/** New cards: the editor stays open after adding, for the next one. */
export let keepOpen = false

let draft = card?.text ?? ''
let area: HTMLTextAreaElement
let root: HTMLDivElement
let saved = false

$: trigger = typeof dateSettings?.['date-trigger'] === 'string' ? (dateSettings['date-trigger'] as string) : '@'
$: meta = readCardMeta(draft, trigger)
$: estimate = meta.expected
$: due = cardDueDate(meta, dateSettings)
$: format = ctx.view.plugin.getSettings().taskFormat

onMount(async () => {
    await tick()
    area?.focus()
    const end = area?.value.length ?? 0
    area?.setSelectionRange(end, end)
    grow()
})

function grow() {
    if (!area) return
    area.style.height = 'auto'
    area.style.height = `${Math.min(320, area.scrollHeight + 2)}px`
}

/** Applies a change to the first line as if it were a task line. */
function firstLine(change: (line: string) => string) {
    const [first, ...rest] = draft.split('\n')
    const edited = change(`- [ ] ${first}`).replace(/^- \[ \] ?/, '')
    draft = [edited, ...rest].join('\n')
    void tick().then(grow)
}

function setEstimate(n: number) {
    firstLine((l) => withEstimate(l, Math.max(0, Math.min(99, n)), format))
}

function setDue(iso: string | null) {
    firstLine((l) => withDue(l, iso, { format, kanbanDates, settings: dateSettings }))
}

function save() {
    const text = draft.trim()
    if (keepOpen) {
        if (text) onSave(text)
        draft = ''
        void tick().then(() => {
            grow()
            area?.focus()
        })
        return
    }
    saved = true
    if (text !== (card?.text ?? '').trim()) onSave(text)
    onClose()
}

function cancel() {
    saved = true
    onClose()
}

function onKey(e: KeyboardEvent) {
    if (e.isComposing) return
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        save()
    } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        cancel()
    }
}

/** Clicking elsewhere keeps what was written (and closes an empty new-card editor). */
function onFocusOut(e: FocusEvent) {
    const next = e.relatedTarget as Node | null
    if (saved || (next && root?.contains(next))) return
    window.setTimeout(() => {
        if (saved || root?.contains(document.activeElement)) return
        if (keepOpen) {
            if (draft.trim()) onSave(draft.trim())
            saved = true
            onClose()
        } else save()
    }, 0)
}

const QUICK_DUES = [
    { label: 'Today', date: () => today() },
    { label: 'Tomorrow', date: () => addDays(today(), 1) },
    { label: 'Next week', date: () => nextMonday() },
]
</script>

<!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
<div class="pf-editor" bind:this={root} on:focusout={onFocusOut} on:pointerdown|stopPropagation on:click|stopPropagation>
    <textarea
        bind:this={area}
        bind:value={draft}
        rows="2"
        {placeholder}
        spellcheck="true"
        on:input={grow}
        on:keydown={onKey}
        aria-label={card ? 'Card text' : 'New card'}
    ></textarea>

    <div class="fields">
        <div class="field" title="Planned pomodoros">
            <span class="tomato" aria-hidden="true">🍅</span>
            <button class="step" aria-label="One pomodoro less" disabled={estimate <= 0} on:click={() => setEstimate(estimate - 1)}><Icon name="minus" size={11} /></button>
            <span class="num" aria-label="Planned pomodoros">{estimate || '–'}</span>
            <button class="step" aria-label="One pomodoro more" on:click={() => setEstimate(estimate + 1)}><Icon name="plus" size={11} /></button>
        </div>
        <div class="field due">
            <Icon name="calendar" size={12} />
            <input type="date" value={due} aria-label="Due date" on:change={(e) => setDue(e.currentTarget.value || null)} />
            {#if due || meta.dueRaw}
                <button class="step" aria-label="Remove the due date" on:click={() => setDue(null)}><Icon name="x" size={11} /></button>
            {:else}
                {#each QUICK_DUES as q}
                    <button class="quick" on:click={() => setDue(q.date())}>{q.label}</button>
                {/each}
            {/if}
        </div>
    </div>

    <div class="actions">
        {#if card}
            <button class="icon" title="Focus on this card" aria-label="Focus on this card" on:click={() => { save(); void ctx.view.focusCard(card?.key ?? '', true) }}><Icon name="play" size={12} filled /></button>
            <button class="icon" title="Open in the note" aria-label="Open in the note" on:click={(e) => { save(); void ctx.view.openCardInNote(card?.key ?? '', e) }}><Icon name="file-text" size={13} /></button>
            <button class="icon" title="Archive" aria-label="Archive this card" on:click={() => { cancel(); ctx.view.archiveCard(card?.key ?? '') }}><Icon name="archive" size={13} /></button>
            <button class="icon danger" title="Delete" aria-label="Delete this card" on:click={() => { cancel(); ctx.view.deleteCard(card?.key ?? '') }}><Icon name="trash" size={13} /></button>
        {/if}
        <span class="hint">{keepOpen ? 'Enter to add · Esc to close' : ''}</span>
        <button class="cancel" title="Esc" on:click={cancel}>Cancel</button>
        <button class="mod-cta save" title="Enter · Shift+Enter for a new line" on:click={save}>{card ? 'Save' : 'Add card'}</button>
    </div>
</div>

<style>
.pf-editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    border-radius: 10px;
    background: var(--pf-card-bg);
    border: 1px solid color-mix(in srgb, var(--interactive-accent) 55%, var(--pf-card-border));
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--interactive-accent) 14%, transparent), var(--pf-card-shadow-hover);
    cursor: auto;
}
textarea {
    width: 100%;
    min-height: 44px;
    resize: none;
    padding: 4px 4px;
    border: none;
    box-shadow: none;
    background: transparent;
    font-size: var(--pf-card-font);
    line-height: 1.42;
    font-family: inherit;
    color: var(--text-normal);
}
textarea:focus,
textarea:focus-visible {
    box-shadow: none;
    outline: none;
}
.fields {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
.field {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 26px;
    padding: 0 4px 0 7px;
    border-radius: 7px;
    background: var(--background-modifier-hover);
    color: var(--text-muted);
    font-size: 0.74rem;
}
.tomato {
    font-size: 0.78rem;
}
.num {
    min-width: 14px;
    text-align: center;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--text-normal);
}
.step,
.quick,
.icon,
.cancel {
    height: 22px;
    padding: 0 6px;
    border: none;
    border-radius: 6px;
    box-shadow: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 0.72rem;
    cursor: pointer;
}
.step {
    width: 22px;
    padding: 0;
    display: inline-grid;
    place-items: center;
}
.step:hover:not(:disabled),
.quick:hover,
.icon:hover,
.cancel:hover {
    background: var(--background-modifier-border);
    color: var(--text-normal);
}
.step:disabled {
    opacity: 0.35;
    cursor: default;
}
.due input {
    height: 22px;
    padding: 0 2px;
    border: none;
    box-shadow: none;
    background: transparent;
    font-size: 0.74rem;
    color: var(--text-normal);
    width: 116px;
}
.quick {
    color: var(--text-faint);
}
.actions {
    display: flex;
    align-items: center;
    gap: 2px;
}
.icon {
    width: 26px;
    padding: 0;
    display: inline-grid;
    place-items: center;
}
.icon.danger:hover {
    color: var(--color-red);
}
.hint {
    flex: 1;
    min-width: 0;
    padding: 0 6px;
    font-size: 0.66rem;
    color: var(--text-faint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.save {
    height: 24px;
    padding: 0 10px;
    font-size: 0.74rem;
    border-radius: 7px;
}
</style>
