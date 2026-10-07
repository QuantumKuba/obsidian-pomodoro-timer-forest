<script lang="ts">
import { tick } from 'svelte'
import { flip } from 'svelte/animate'
import { Menu } from 'obsidian'
import type { BoardCard, BoardLane } from './BoardModel'
import type { BoardCardMemory, BoardLaneRole } from '../types/forest'
import type { BoardContext, FocusInfo } from './context'
import type { CardDragger, CardPlace, DragState } from './dnd'
import Card from './Card.svelte'
import CardEditor from './CardEditor.svelte'
import Icon from '../tasks/Icon.svelte'

export let lane: BoardLane
export let role: BoardLaneRole
export let ctx: BoardContext
export let dragger: CardDragger
export let drag: DragState | null = null
export let target: CardPlace | null = null
export let memory: Record<string, BoardCardMemory> = {}
export let dueOf: (card: BoardCard) => string
export let focusKey: string | null = null
export let focus: FocusInfo | null = null
export let bursts: Record<string, { coins: number; xp: number }> = {}
export let editingKey: string | null = null
/** Cards that match the search; null when not searching. */
export let matches: ((card: BoardCard) => boolean) | null = null
export let collapsed = false
export let composeAtTop = false
export let kanbanDates = false
export let dateSettings: Record<string, unknown> | undefined = undefined
export let laneCount = 1

let composing = false
let renaming = false
let titleDraft = ''
let titleInput: HTMLInputElement

$: shown = matches ? lane.cards.filter(matches) : lane.cards
$: hiddenCount = lane.cards.length - shown.length
$: draggingHere = !!drag && target?.lane === lane.index
$: fromHere = !!drag && drag.from.lane === lane.index
$: count = lane.cards.length - (fromHere && target?.lane !== lane.index ? 1 : 0) + (draggingHere && !fromHere ? 1 : 0)
$: limit = lane.maxItems
$: over = limit > 0 && count > limit
$: full = limit > 0 && count === limit
$: doneCount = role === 'done' ? lane.cards.length : 0
/** A card's position counted without the card being dragged, as drop targets are. */
$: posOf = (i: number) => (fromHere && drag && i > drag.from.index ? i - 1 : i)
$: endPos = lane.cards.length - (fromHere ? 1 : 0)

const ROLE_LABEL: Record<BoardLaneRole, string> = { backlog: 'To do', active: 'In progress', done: 'Done' }
const ROLE_ICON = { backlog: 'circle-dashed', active: 'circle-half', done: 'check-circle' } as const
const EMPTY: Record<BoardLaneRole, string> = {
    backlog: 'Nothing waiting here.',
    active: 'Pull a card in when you are ready to start it.',
    done: 'Finished cards land here.',
}

async function startRename() {
    titleDraft = lane.title
    renaming = true
    await tick()
    titleInput?.select()
}

function finishRename(save: boolean) {
    if (!renaming) return
    renaming = false
    if (save) ctx.view.renameLane(lane.index, titleDraft)
}

function showMenu(e: MouseEvent) {
    const view = ctx.view
    const menu = new Menu()
    for (const r of ['backlog', 'active', 'done'] as BoardLaneRole[]) {
        menu.addItem((i) =>
            i
                .setTitle(r === 'backlog' ? 'Lane for cards to do' : r === 'active' ? 'Lane for cards in progress' : 'Lane for finished cards')
                .setIcon(r === 'backlog' ? 'circle-dashed' : r === 'active' ? 'loader' : 'check-circle-2')
                .setChecked(role === r)
                .setSection('role')
                .onClick(() => view.setLaneRole(lane.index, r)),
        )
    }
    menu.addItem((i) => i.setTitle('Rename').setIcon('pencil').setSection('lane').onClick(() => void startRename()))
    menu.addItem((i) =>
        i
            .setTitle(limit ? `Card limit: ${limit}…` : 'Set a card limit…')
            .setIcon('gauge')
            .setSection('lane')
            .onClick(() => view.askLaneLimit(lane.index)),
    )
    menu.addItem((i) => i.setTitle('Collapse').setIcon('chevrons-left').setSection('lane').onClick(() => view.toggleCollapsed(lane.index)))
    if (lane.index > 0) menu.addItem((i) => i.setTitle('Move left').setIcon('arrow-left').setSection('move').onClick(() => view.moveLane(lane.index, lane.index - 1)))
    if (lane.index < laneCount - 1)
        menu.addItem((i) => i.setTitle('Move right').setIcon('arrow-right').setSection('move').onClick(() => view.moveLane(lane.index, lane.index + 1)))
    menu.addItem((i) => i.setTitle('Delete lane').setIcon('trash-2').setSection('danger').onClick(() => view.deleteLane(lane.index)))
    menu.showAtMouseEvent(e)
}

function onTitleKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
        e.preventDefault()
        finishRename(true)
    } else if (e.key === 'Escape') {
        e.preventDefault()
        finishRename(false)
    }
}
</script>

{#if collapsed}
    <section class="pf-lane collapsed {role}" data-lane={lane.index} aria-label="{lane.title} (collapsed)">
        <button class="expand" title="Expand {lane.title}" on:click={() => ctx.view.toggleCollapsed(lane.index)}>
            <span class="role-icon"><Icon name={ROLE_ICON[role]} size={13} /></span>
            <span class="v-title">{lane.title}</span>
            <span class="v-count">{lane.cards.length}</span>
        </button>
    </section>
{:else}
    <section class="pf-lane {role}" class:over class:drop={draggingHere} data-lane={lane.index} aria-label={lane.title}>
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <header class="lane-head" on:contextmenu|preventDefault={showMenu}>
            <span class="role-icon" title={ROLE_LABEL[role]}><Icon name={ROLE_ICON[role]} size={14} /></span>
            {#if renaming}
                <input
                    bind:this={titleInput}
                    bind:value={titleDraft}
                    class="title-input"
                    aria-label="Lane title"
                    on:keydown={onTitleKey}
                    on:blur={() => finishRename(true)}
                />
            {:else}
                <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
                <h3 class="title" title="Double-click to rename" on:dblclick={startRename}>{lane.title}</h3>
            {/if}
            <span class="count" class:full class:over title={limit ? `${count} of ${limit} cards — keep this lane within its limit` : `${count} cards`}>
                {count}{#if limit}<span class="of">/{limit}</span>{/if}
            </span>
            <button class="lane-btn" aria-label="Lane options" title="Lane options" on:click={showMenu}>
                <Icon name="more" size={15} />
            </button>
        </header>
        {#if limit}
            <div class="wip" aria-hidden="true">
                <div class="wip-fill" style="width:{Math.min(100, (count / limit) * 100)}%"></div>
            </div>
        {/if}

        {#if composing && composeAtTop}
            <div class="composer top">
                <CardEditor {ctx} {kanbanDates} {dateSettings} keepOpen onSave={(t) => ctx.view.addCard(lane.index, t, 'top')} onClose={() => (composing = false)} />
            </div>
        {/if}

        <div class="pf-lane-body">
            {#each shown as card, i (card.key)}
                <div class="slot" class:gone={drag?.key === card.key} animate:flip={{ duration: drag ? 0 : 180 }}>
                    {#if draggingHere && target?.index === posOf(card.index) && card.key !== drag?.key}
                        <div class="placeholder" style="height:{drag?.height ?? 40}px"></div>
                    {/if}
                    {#if editingKey === card.key}
                        <CardEditor {card} {ctx} {kanbanDates} {dateSettings} onSave={(t) => ctx.view.updateCard(card.key, t)} onClose={() => ctx.edit('')} />
                    {:else}
                        <Card
                            {card}
                            {role}
                            {ctx}
                            {dragger}
                            due={dueOf(card)}
                            since={memory[card.key]?.since}
                            dragged={drag?.key === card.key}
                            focus={focusKey === card.key ? focus : null}
                            burst={bursts[card.key] ?? null}
                            canDrag={!matches}
                        />
                    {/if}
                </div>
            {/each}
            {#if draggingHere && target?.index === endPos}
                <div class="placeholder" style="height:{drag?.height ?? 40}px"></div>
            {/if}
            {#if lane.cards.length === 0 && !draggingHere && !composing}
                <p class="empty">{EMPTY[role]}</p>
            {:else if hiddenCount > 0 && shown.length === 0}
                <p class="empty">No cards here match.</p>
            {/if}
        </div>

        {#if composing && !composeAtTop}
            <div class="composer">
                <CardEditor {ctx} {kanbanDates} {dateSettings} keepOpen onSave={(t) => ctx.view.addCard(lane.index, t, 'bottom')} onClose={() => (composing = false)} />
            </div>
        {/if}
        <footer class="lane-foot">
            {#if !composing}
                <button class="add" on:click={() => (composing = true)}><Icon name="plus" size={13} />Add a card</button>
            {/if}
            {#if role === 'done' && doneCount > 0 && !composing}
                <button class="archive" title="Move this lane's cards to the archive" on:click={() => ctx.view.archiveFinished()}>
                    <Icon name="archive" size={12} />Archive
                </button>
            {/if}
        </footer>
    </section>
{/if}

<style>
.pf-lane {
    flex: none;
    display: flex;
    flex-direction: column;
    width: var(--pf-lane-w);
    max-height: 100%;
    border-radius: 14px;
    background: var(--pf-lane-bg);
    border: 1px solid var(--pf-lane-border);
    transition: background-color 0.15s, border-color 0.15s;
}
.pf-lane.drop {
    border-color: color-mix(in srgb, var(--interactive-accent) 45%, var(--pf-lane-border));
    background: color-mix(in srgb, var(--interactive-accent) 4%, var(--pf-lane-bg));
}
.lane-head {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 10px 8px 8px 12px;
}
.role-icon {
    display: inline-flex;
    color: var(--text-faint);
}
.active .role-icon {
    color: var(--interactive-accent);
}
.done .role-icon {
    color: var(--color-green);
}
.title {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: 0.86rem;
    font-weight: 650;
    letter-spacing: 0.005em;
    color: var(--text-normal);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: default;
}
.title-input {
    flex: 1;
    min-width: 0;
    height: 24px;
    padding: 0 6px;
    font-size: 0.86rem;
    font-weight: 650;
}
.count {
    flex: none;
    min-width: 22px;
    height: 20px;
    padding: 0 7px;
    display: inline-grid;
    place-items: center;
    grid-auto-flow: column;
    border-radius: 99px;
    font-size: 0.7rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
    background: var(--background-modifier-hover);
}
.count .of {
    font-weight: 500;
    color: var(--text-faint);
}
.count.full {
    color: var(--interactive-accent);
    background: color-mix(in srgb, var(--interactive-accent) 14%, transparent);
}
.count.over {
    color: var(--color-orange);
    background: color-mix(in srgb, var(--color-orange) 16%, transparent);
}
.count.over .of {
    color: inherit;
}
.lane-btn {
    flex: none;
    display: inline-grid;
    place-items: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: none;
    border-radius: 7px;
    box-shadow: none;
    background: transparent;
    color: var(--text-faint);
    cursor: pointer;
}
.lane-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
}
.wip {
    height: 2px;
    margin: -2px 12px 6px;
    border-radius: 2px;
    background: var(--background-modifier-border);
    overflow: hidden;
}
.wip-fill {
    height: 100%;
    background: var(--interactive-accent);
    transition: width 0.25s ease;
}
.over .wip-fill {
    background: var(--color-orange);
}

.pf-lane-body {
    flex: 1 1 auto;
    min-height: 40px;
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 2px 8px 6px;
    overflow-y: auto;
    overscroll-behavior: contain;
}
.slot {
    display: flex;
    flex-direction: column;
    gap: 7px;
}
.slot.gone {
    display: none;
}
.placeholder {
    flex: none;
    border-radius: 10px;
    border: 1.5px dashed color-mix(in srgb, var(--interactive-accent) 55%, transparent);
    background: color-mix(in srgb, var(--interactive-accent) 6%, transparent);
}
.empty {
    margin: 2px 0 4px;
    padding: 14px 10px;
    border: 1px dashed var(--background-modifier-border);
    border-radius: 10px;
    font-size: 0.74rem;
    line-height: 1.4;
    text-align: center;
    color: var(--text-faint);
}
.composer {
    padding: 0 8px 4px;
}
.composer.top {
    padding: 0 8px 8px;
}
.lane-foot {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px 8px;
}
.add,
.archive {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 8px;
    border: none;
    border-radius: 8px;
    box-shadow: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 0.78rem;
    cursor: pointer;
}
.add {
    flex: 1;
}
.add:hover,
.archive:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
}
.archive {
    color: var(--text-faint);
    font-size: 0.72rem;
}

/* Collapsed: a narrow strip with the title running down it */
.pf-lane.collapsed {
    width: 42px;
}
.expand {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    height: 100%;
    min-height: 160px;
    padding: 12px 0;
    border: none;
    border-radius: 14px;
    box-shadow: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
}
.expand:hover {
    background: var(--background-modifier-hover);
}
.v-title {
    writing-mode: vertical-rl;
    font-size: 0.82rem;
    font-weight: 650;
    color: var(--text-normal);
    white-space: nowrap;
}
.v-count {
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--text-faint);
}
</style>
