<script lang="ts">
import { onMount, tick } from 'svelte'
import { Platform } from 'obsidian'
import type { BoardCard, Priority } from './BoardModel'
import { readCardMeta } from './BoardModel'
import type { BoardContext } from './context'
import { cardDueDate, withDue, withEstimate } from './cards'
import {
    addTagToCardText,
    applyTagCompletion,
    extractTagTrigger,
    normalizeTag,
    rankTagSuggestions,
    removeTagFromCardText,
    toggleTagInCardText,
    withPriority,
    type TagSuggestion,
    type TagTrigger,
} from './tags'
import Icon from '../tasks/Icon.svelte'
import { addDays, nextMonday, today } from '../tasks/dates'

/** The card being edited; null for a new card. */
export let card: BoardCard | null = null
export let ctx: BoardContext
export let kanbanDates = false
export let dateSettings: Record<string, unknown> | undefined = undefined
export let boardTags: string[] = []
export let activeTagFilter = ''
export let placeholder = 'Write a card…'
export let onSave: (text: string) => void
export let onClose: () => void
/** New cards: the editor stays open after adding, for the next one. */
export let keepOpen = false

let draft = card?.text ?? ''
let area: HTMLTextAreaElement
let root: HTMLDivElement
let tagInput: HTMLInputElement
let saved = false
/** On a phone, Enter starts a new line (there is no Shift) and the button saves. */
const mobile = Platform.isMobile

let pool: TagSuggestion[] = []
let trigger: TagTrigger | null = null
let dismissedAt = -1
let activeIdx = 0
let showTagPicker = false
let tagSearch = ''

$: triggerChar = typeof dateSettings?.['date-trigger'] === 'string' ? (dateSettings['date-trigger'] as string) : '@'
$: meta = readCardMeta(draft, triggerChar)
$: estimate = meta.expected
$: due = cardDueDate(meta, dateSettings)
$: format = ctx.view.plugin.getSettings().taskFormat
$: filterChip =
    activeTagFilter && activeTagFilter.startsWith('#') && !meta.tags.some((t) => t.toLowerCase() === activeTagFilter.toLowerCase())
        ? activeTagFilter
        : ''

type SuggestOption = { tag: string; hint?: string; create?: boolean }

$: suggestItems = (() => {
    if (!trigger) return [] as SuggestOption[]
    const ranked = rankTagSuggestions(trigger.query, pool, { boardTags, exclude: meta.tags, limit: 7 })
    const items: SuggestOption[] = ranked.map((s) => ({ tag: s.tag, hint: s.hint }))
    const created = normalizeTag(trigger.query)
    if (created && !items.some((i) => i.tag.toLowerCase() === created.toLowerCase()) && !meta.tags.some((t) => t.toLowerCase() === created.toLowerCase())) {
        items.push({ tag: created, hint: 'New tag', create: true })
    }
    return items
})()

$: showSuggest = !!trigger && trigger.start !== dismissedAt && suggestItems.length > 0
$: if (activeIdx >= suggestItems.length) activeIdx = Math.max(0, suggestItems.length - 1)

$: pickerTags = rankTagSuggestions(tagSearch, pool, { boardTags, limit: 18 })
$: pickerNewTag = (() => {
    const t = normalizeTag(tagSearch)
    if (!t) return ''
    if (pickerTags.some((p) => p.tag.toLowerCase() === t.toLowerCase())) return ''
    return t
})()

function refreshPool() {
    pool = ctx.view.getTagSuggestions()
}

onMount(async () => {
    refreshPool()
    await tick()
    area?.focus()
    const end = area?.value.length ?? 0
    area?.setSelectionRange(end, end)
    grow()
    // Above the keyboard that just opened
    if (mobile) window.setTimeout(() => root?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 250)
})

function grow() {
    if (!area) return
    area.style.height = 'auto'
    area.style.height = `${Math.min(320, area.scrollHeight + 2)}px`
}

function syncTrigger() {
    if (!area) {
        trigger = null
        return
    }
    const pos = area.selectionStart ?? draft.length
    const next = extractTagTrigger(draft, pos)
    if (!next || next.start !== dismissedAt) dismissedAt = -1
    if (next?.query !== trigger?.query) activeIdx = 0
    const wasClosed = !trigger
    trigger = next
    if (wasClosed && next) void tick().then(() => root?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
}

async function acceptSuggest(opt: SuggestOption) {
    if (!trigger) return
    const res = applyTagCompletion(draft, trigger, opt.tag)
    draft = res.text
    trigger = null
    dismissedAt = -1
    refreshPool()
    await tick()
    area?.focus()
    area?.setSelectionRange(res.cursor, res.cursor)
    grow()
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

function setPriority(p: Exclude<Priority, ''>) {
    const next: Priority = meta.priority === p ? '' : p
    firstLine((l) => withPriority(l, next, format))
}

function addTag(raw: string) {
    draft = addTagToCardText(draft, raw)
    refreshPool()
    void tick().then(grow)
}

function removeTag(raw: string) {
    draft = removeTagFromCardText(draft, raw)
    refreshPool()
    void tick().then(grow)
}

function toggleTag(raw: string) {
    draft = toggleTagInCardText(draft, raw)
    refreshPool()
    void tick().then(grow)
}

async function openTagPicker() {
    showTagPicker = !showTagPicker
    if (showTagPicker) {
        refreshPool()
        await tick()
        tagInput?.focus()
        root?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    } else {
        await tick()
        area?.focus()
    }
}

async function startBranchTag(baseTag: string) {
    const clean = normalizeTag(baseTag)
    if (!clean) return
    tagSearch = `${clean.slice(1)}/`
    await tick()
    tagInput?.focus()
}

function onTagSearchKey(e: KeyboardEvent) {
    if (e.isComposing) return
    if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        const created = normalizeTag(tagSearch)
        if (created) {
            addTag(created)
            tagSearch = ''
        } else if (pickerTags.length > 0) {
            toggleTag(pickerTags[0].tag)
        }
    } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        showTagPicker = false
        tagSearch = ''
        area?.focus()
    }
}

function save() {
    const text = draft.trim()
    if (keepOpen) {
        if (text) onSave(text)
        draft = ''
        trigger = null
        dismissedAt = -1
        showTagPicker = false
        tagSearch = ''
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
    if (showSuggest) {
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            activeIdx = (activeIdx + 1) % suggestItems.length
            return
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault()
            activeIdx = (activeIdx - 1 + suggestItems.length) % suggestItems.length
            return
        }
        if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
            e.preventDefault()
            e.stopPropagation()
            void acceptSuggest(suggestItems[activeIdx])
            return
        }
        if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            dismissedAt = trigger?.start ?? -1
            return
        }
    }
    if (e.key === 'Enter' && !e.shiftKey && !mobile) {
        e.preventDefault()
        save()
    } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        cancel()
    }
}

function onAreaKeyUp(e: KeyboardEvent) {
    if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) return
    syncTrigger()
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

const PRIORITIES: { value: Exclude<Priority, ''>; label: string }[] = [
    { value: 'highest', label: 'Urgent priority' },
    { value: 'high', label: 'High priority' },
    { value: 'medium', label: 'Medium priority' },
    { value: 'low', label: 'Low priority' },
]
</script>

<!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
<div class="pf-editor" bind:this={root} on:focusout={onFocusOut} on:pointerdown|stopPropagation on:click|stopPropagation>
    <div class="area-wrap">
        <textarea
            bind:this={area}
            bind:value={draft}
            rows="2"
            {placeholder}
            spellcheck="true"
            on:input={() => {
                grow()
                syncTrigger()
            }}
            on:click={syncTrigger}
            on:keyup={onAreaKeyUp}
            on:keydown={onKey}
            aria-label={card ? 'Card text' : 'New card'}
        ></textarea>

        {#if showSuggest}
            <div class="tag-suggest" role="listbox" aria-label="Tag suggestions">
                {#each suggestItems as opt, idx (opt.tag)}
                    <button
                        type="button"
                        role="option"
                        aria-selected={idx === activeIdx}
                        class="suggest-item"
                        class:active={idx === activeIdx}
                        on:pointerdown|preventDefault
                        on:click={() => void acceptSuggest(opt)}
                    >
                        <span class="suggest-tag">{opt.create ? `+ ${opt.tag}` : opt.tag}</span>
                        {#if opt.hint}
                            <span class="suggest-hint">{opt.hint}</span>
                        {/if}
                    </button>
                {/each}
            </div>
        {/if}
    </div>

    <div class="tag-bar">
        {#each meta.tags as t (t)}
            <span class="tag-pill">
                <span>{t}</span>
                <button type="button" class="tag-rm" aria-label="Remove {t}" title="Remove {t}" on:click={() => removeTag(t)}>
                    <Icon name="x" size={10} />
                </button>
            </span>
        {/each}
        <button type="button" class="tag-add" class:on={showTagPicker} title="Add or toggle tags (or type # in the card)" on:click={openTagPicker}>
            <Icon name="tag" size={11} />
            <span>{meta.tags.length ? 'Tags' : '+ Tag'}</span>
        </button>
        {#if filterChip}
            <button type="button" class="tag-quick" title="Add active filter tag {filterChip}" on:click={() => addTag(filterChip)}>
                + {filterChip}
            </button>
        {/if}
    </div>

    {#if showTagPicker}
        <div class="tag-picker">
            <div class="tag-search-row">
                <input
                    bind:this={tagInput}
                    bind:value={tagSearch}
                    type="text"
                    placeholder="Find or create #tag…"
                    aria-label="Find or create tag"
                    on:keydown={onTagSearchKey}
                />
                {#if boardTags.length > 0}
                    <button
                        type="button"
                        class="branch-btn"
                        title="Create a sub-tag branching off {boardTags[0]}"
                        on:click={() => void startBranchTag(boardTags[0])}
                    >
                        <Icon name="git-branch" size={11} />
                        <span>{boardTags[0]}/…</span>
                    </button>
                {/if}
            </div>
            <div class="tag-pool">
                {#if pickerNewTag}
                    <button
                        type="button"
                        class="pool-chip create"
                        on:click={() => {
                            addTag(pickerNewTag)
                            tagSearch = ''
                        }}
                    >
                        <Icon name="plus" size={10} /> Create {pickerNewTag}
                    </button>
                {/if}
                {#each pickerTags as s (s.tag)}
                    {@const has = meta.tags.some((t) => t.toLowerCase() === s.tag.toLowerCase())}
                    <button
                        type="button"
                        class="pool-chip"
                        class:on={has}
                        class:branch={s.sources.includes('branch')}
                        title={s.hint ?? s.tag}
                        on:click={() => toggleTag(s.tag)}
                    >
                        <span>{s.tag}</span>
                        {#if s.hint && (s.sources.includes('flora') || s.sources.includes('island'))}
                            <span class="pool-hint">{s.hint}</span>
                        {/if}
                    </button>
                {:else}
                    {#if !pickerNewTag}
                        <span class="pool-empty">Type a tag name and press Enter to add it.</span>
                    {/if}
                {/each}
            </div>
        </div>
    {/if}

    <div class="fields">
        <div class="field" title="Planned pomodoros">
            <span class="tomato" aria-hidden="true">🍅</span>
            <button type="button" class="step" aria-label="One pomodoro less" disabled={estimate <= 0} on:click={() => setEstimate(estimate - 1)}><Icon name="minus" size={11} /></button>
            <span class="num" aria-label="Planned pomodoros">{estimate || '–'}</span>
            <button type="button" class="step" aria-label="One pomodoro more" on:click={() => setEstimate(estimate + 1)}><Icon name="plus" size={11} /></button>
        </div>
        <div class="field prio" role="group" aria-label="Priority">
            <Icon name="flag" size={11} />
            {#each PRIORITIES as p}
                <button
                    type="button"
                    class="prio-dot {p.value}"
                    class:on={meta.priority === p.value}
                    title={meta.priority === p.value ? `Clear ${p.label.toLowerCase()}` : p.label}
                    aria-label={p.label}
                    aria-pressed={meta.priority === p.value}
                    on:click={() => setPriority(p.value)}
                ></button>
            {/each}
        </div>
        <div class="field due">
            <Icon name="calendar" size={12} />
            <input type="date" value={due} aria-label="Due date" on:change={(e) => setDue(e.currentTarget.value || null)} />
            {#if due || meta.dueRaw}
                <button type="button" class="step" aria-label="Remove the due date" on:click={() => setDue(null)}><Icon name="x" size={11} /></button>
            {:else}
                {#each QUICK_DUES as q}
                    <button type="button" class="quick" on:click={() => setDue(q.date())}>{q.label}</button>
                {/each}
            {/if}
        </div>
    </div>

    <div class="actions">
        {#if card}
            <button type="button" class="icon" title="Focus on this card" aria-label="Focus on this card" on:click={() => { save(); void ctx.view.focusCard(card?.key ?? '', true) }}><Icon name="play" size={12} filled /></button>
            <button type="button" class="icon" title="Open in the note" aria-label="Open in the note" on:click={(e) => { save(); void ctx.view.openCardInNote(card?.key ?? '', e) }}><Icon name="file-text" size={13} /></button>
            <button type="button" class="icon" title="Archive" aria-label="Archive this card" on:click={() => { cancel(); ctx.view.archiveCard(card?.key ?? '') }}><Icon name="archive" size={13} /></button>
            <button type="button" class="icon danger" title="Delete" aria-label="Delete this card" on:click={() => { cancel(); ctx.view.deleteCard(card?.key ?? '') }}><Icon name="trash" size={13} /></button>
        {/if}
        <span class="hint">{keepOpen && !mobile ? 'Enter to add · # for tags' : ''}</span>
        <button type="button" class="cancel" title="Esc" on:click={cancel}>Cancel</button>
        <button type="button" class="mod-cta save" title={mobile ? '' : 'Enter · Shift+Enter for a new line'} on:click={save}>{card ? 'Save' : 'Add card'}</button>
    </div>
</div>

<style>
.pf-editor {
    position: relative;
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
.area-wrap {
    position: relative;
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

.tag-suggest {
    display: flex;
    flex-direction: column;
    margin-top: 4px;
    max-height: 154px;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 4px;
    border-radius: 8px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
}
.suggest-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    height: auto;
    padding: 5px 8px;
    border: none;
    border-radius: 6px;
    box-shadow: none;
    background: transparent;
    text-align: left;
    font-size: 0.76rem;
    color: var(--text-normal);
    cursor: pointer;
}
.suggest-item.active,
.suggest-item:hover {
    background: color-mix(in srgb, var(--interactive-accent) 14%, transparent);
    color: var(--text-normal);
}
.suggest-tag {
    font-weight: 600;
    color: var(--text-accent, var(--interactive-accent));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.suggest-hint {
    flex: none;
    font-size: 0.68rem;
    color: var(--text-faint);
    white-space: nowrap;
}

.tag-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
}
.tag-pill {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 21px;
    padding: 0 4px 0 7px;
    border-radius: 99px;
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--text-accent, var(--interactive-accent));
    background: color-mix(in srgb, var(--interactive-accent) 12%, transparent);
}
.tag-rm {
    display: inline-grid;
    place-items: center;
    width: 15px;
    height: 15px;
    padding: 0;
    border: none;
    border-radius: 50%;
    box-shadow: none;
    background: transparent;
    color: inherit;
    opacity: 0.7;
    cursor: pointer;
}
.tag-rm:hover {
    opacity: 1;
    background: color-mix(in srgb, var(--interactive-accent) 20%, transparent);
}
.tag-add,
.tag-quick {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 21px;
    padding: 0 7px;
    border: 1px dashed var(--background-modifier-border);
    border-radius: 99px;
    box-shadow: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 0.69rem;
    cursor: pointer;
}
.tag-add:hover,
.tag-add.on,
.tag-quick:hover {
    border-style: solid;
    border-color: var(--interactive-accent);
    color: var(--text-normal);
    background: color-mix(in srgb, var(--interactive-accent) 8%, transparent);
}

.tag-picker {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 7px;
    border-radius: 8px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
}
.tag-search-row {
    display: flex;
    align-items: center;
    gap: 5px;
}
.tag-search-row input {
    flex: 1;
    min-width: 0;
    height: 26px;
    padding: 0 8px;
    font-size: 0.75rem;
    border-radius: 6px;
}
.branch-btn {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 26px;
    padding: 0 8px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    box-shadow: none;
    background: var(--background-primary);
    color: var(--text-muted);
    font-size: 0.7rem;
    cursor: pointer;
}
.branch-btn:hover {
    border-color: var(--interactive-accent);
    color: var(--text-normal);
}
.tag-pool {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    max-height: 112px;
    overflow-y: auto;
}
.pool-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: auto;
    padding: 2px 8px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 99px;
    box-shadow: none;
    background: var(--background-primary);
    color: var(--text-muted);
    font-size: 0.69rem;
    cursor: pointer;
}
.pool-chip:hover {
    border-color: var(--interactive-accent);
    color: var(--text-normal);
}
.pool-chip.on {
    background: var(--interactive-accent);
    border-color: var(--interactive-accent);
    color: var(--text-on-accent, #fff);
}
.pool-chip.branch:not(.on) {
    border-color: color-mix(in srgb, var(--interactive-accent) 35%, var(--background-modifier-border));
}
.pool-chip.create {
    border-style: dashed;
    color: var(--text-accent, var(--interactive-accent));
}
.pool-hint {
    font-size: 0.64rem;
    opacity: 0.75;
}
.pool-empty {
    font-size: 0.68rem;
    color: var(--text-faint);
    padding: 2px 4px;
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
.field.prio {
    gap: 5px;
    padding: 0 7px;
}
.prio-dot {
    position: relative;
    width: 12px;
    height: 12px;
    padding: 0;
    border: 1.5px solid var(--prio-c, var(--text-faint));
    border-radius: 50%;
    box-shadow: none;
    background: transparent;
    cursor: pointer;
    transition: transform 0.1s ease, background-color 0.1s ease;
}
.prio-dot::after {
    content: '';
    position: absolute;
    inset: -6px;
}
.prio-dot.highest { --prio-c: var(--color-red); }
.prio-dot.high { --prio-c: var(--color-orange); }
.prio-dot.medium { --prio-c: var(--color-yellow); }
.prio-dot.low { --prio-c: var(--color-blue); }
.prio-dot:hover {
    transform: scale(1.15);
    background: color-mix(in srgb, var(--prio-c) 30%, transparent);
}
.prio-dot.on {
    background: var(--prio-c);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--prio-c) 24%, transparent);
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
    white-space: nowrap;
}
.field.due {
    flex: 1 1 100%;
    flex-wrap: wrap;
    height: auto;
    min-height: 26px;
    padding: 2px 6px 2px 7px;
    min-width: 0;
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

/* Touch screens: taller controls, and the text never zooms the page (iOS zooms under 16px) */
:global(body.is-mobile) .pf-editor textarea,
:global(body.is-mobile) .pf-editor .tag-search-row input {
    font-size: max(16px, var(--pf-card-font));
}
:global(body.is-mobile) .pf-editor .tag-search-row input,
:global(body.is-mobile) .pf-editor .branch-btn {
    height: 34px;
}
:global(body.is-mobile) .pf-editor .suggest-item {
    min-height: 36px;
    font-size: 0.84rem;
}
:global(body.is-mobile) .pf-editor .tag-pill,
:global(body.is-mobile) .pf-editor .tag-add,
:global(body.is-mobile) .pf-editor .tag-quick,
:global(body.is-mobile) .pf-editor .pool-chip {
    min-height: 28px;
    font-size: 0.78rem;
}
:global(body.is-mobile) .pf-editor .field {
    min-height: 32px;
    height: auto;
    font-size: 0.8rem;
}
:global(body.is-mobile) .pf-editor .field.prio {
    gap: 8px;
    padding: 0 9px;
}
:global(body.is-mobile) .pf-editor .prio-dot {
    width: 14px;
    height: 14px;
}
:global(body.is-mobile) .pf-editor .step,
:global(body.is-mobile) .pf-editor .quick,
:global(body.is-mobile) .pf-editor .icon,
:global(body.is-mobile) .pf-editor .cancel {
    height: 28px;
    font-size: 0.78rem;
}
:global(body.is-mobile) .pf-editor .step,
:global(body.is-mobile) .pf-editor .icon {
    width: 30px;
}
:global(body.is-mobile) .pf-editor .due input {
    height: 28px;
    font-size: 0.8rem;
}
:global(body.is-mobile) .pf-editor .save {
    height: 30px;
    padding: 0 14px;
    font-size: 0.8rem;
}
:global(body.is-mobile) .pf-editor .actions {
    gap: 4px;
}
</style>