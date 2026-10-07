<script lang="ts">
import { onDestroy, tick } from 'svelte'
import { Menu, Notice } from 'obsidian'
import type { BoardView } from './BoardView'
import type { BoardCard } from './BoardModel'
import { cardDone, laneRole, setCardBlockId } from './BoardModel'
import { CardDragger } from './dnd'
import { boardUsesKanbanDates, cardDueDate, kanbanPluginEnabled, newBlockId } from './cards'
import type { BoardContext, FocusInfo } from './context'
import Lane from './Lane.svelte'
import FocusPill from './FocusPill.svelte'
import BoardStats from './BoardStats.svelte'
import RewardToasts from '../forest/RewardToasts.svelte'
import Icon from '../tasks/Icon.svelte'
import { coins, gamificationStore, levelInfo, settings, streak, todayLog } from '../stores'
import { ICONS } from '../assets/floraAssets'
import { BOARD_MILESTONES } from '../services/Progression'
import type { RewardEvent } from '../types/forest'

export let view: BoardView

const doc = view.doc
const note = view.note
const timer = view.plugin.timer!
const tracker = view.plugin.tracker!
const engine = view.plugin.forestEngine

let root: HTMLDivElement
let query = ''
let searchEl: HTMLInputElement
let showStats = false
let editingKey: string | null = null
let addingLane = false
let laneDraft = ''
let laneInput: HTMLInputElement

const dragger = new CardDragger(
    () => root,
    (from, to) => view.moveCard(from, to),
)
const drag = dragger.drag
const target = dragger.target
onDestroy(() => dragger.destroy())

$: path = $note.path
$: memory = $gamificationStore.boards?.[path]
$: lanes = $doc.lanes
$: roles = lanes.map((l) => laneRole(l, memory?.laneRoles))
$: boardSettings = $doc.settings?.data
$: collapsedList = Array.isArray(boardSettings?.['list-collapse']) ? (boardSettings?.['list-collapse'] as boolean[]) : []
$: laneWidth = typeof boardSettings?.['lane-width'] === 'number' ? Math.max(220, Math.min(480, boardSettings['lane-width'] as number)) : 286
$: composeAtTop = String(boardSettings?.['new-card-insertion-method'] ?? '').startsWith('prepend')
$: kanbanDates = boardUsesKanbanDates($doc) || kanbanPluginEnabled(view.app)

$: counts = lanes.reduce(
    (acc, lane, i) => {
        for (const c of lane.cards) acc[cardDone(c, roles[i]) ? 'done' : roles[i] === 'active' ? 'active' : 'backlog']++
        return acc
    },
    { backlog: 0, active: 0, done: 0 },
)
$: total = counts.backlog + counts.active + counts.done
$: pct = total ? Math.round((counts.done / total) * 100) : 0
$: overLimit = lanes.filter((l) => l.maxItems > 0 && l.cards.length > l.maxItems).map((l) => l.title)
$: shipped = memory?.shipped ?? 0
$: nextMilestone = BOARD_MILESTONES.find((m) => m > shipped) ?? null

$: needle = query.trim().toLowerCase()
$: matches = needle
    ? (c: BoardCard) => c.text.toLowerCase().includes(needle) || c.meta.tags.some((t) => t.toLowerCase().includes(needle))
    : null

// The card the timer is focused on, followed by its block id
$: task = $tracker.task
$: focusId = task && task.path === path ? task.blockLink.trim().replace(/^\^/, '') : ''
$: focusKey = focusId ? (lanes.flatMap((l) => l.cards).find((c) => c.blockId === focusId)?.key ?? null) : null
$: working = $timer.inSession && $timer.mode === 'WORK'
$: focus = focusKey
    ? ({
          running: $timer.running && $timer.mode === 'WORK',
          remaining: working ? $timer.remained.human.replace(/\s/g, '') : `${$timer.workLen}:00`,
          ratio: working && $timer.count ? $timer.elapsed / $timer.count : 0,
      } as FocusInfo)
    : null

$: dueOf = (card: BoardCard) => cardDueDate(card.meta, boardSettings)

let ctx: BoardContext
$: ctx = {
    view,
    render: (text: string, el: HTMLElement) => view.renderMarkdown(text, el),
    staleDays: $settings.boardStaleDays ?? 5,
    filterTag: (tag: string) => (query = tag.trim()),
    edit: (key: string) => (editingKey = key || null),
    cardMenu,
    toggleTimer: () => timer.toggleTimer(),
}

// Rewards for this board's cards rise from the card itself instead of a toast
let bursts: Record<string, { coins: number; xp: number }> = {}
const seen = new Set<string>()
const ownEvent = (e: RewardEvent) => !!path && !!e.ref && e.ref.startsWith(`${path}::`)
const unsubscribe = engine?.rewardEvents.subscribe((events) => {
    for (const e of events) {
        if (seen.has(e.id) || !ownEvent(e)) continue
        seen.add(e.id)
        const key = e.ref!.slice(path.length + 2)
        bursts = { ...bursts, [key]: { coins: e.coins, xp: e.xp } }
        window.setTimeout(() => {
            const { [key]: _gone, ...rest } = bursts
            bursts = rest
            engine?.dismissReward(e.id)
        }, 1900)
    }
})
onDestroy(() => unsubscribe?.())

function cardMenu(card: BoardCard, e: MouseEvent) {
    const done = card.lane >= 0 && cardDone(card, roles[card.lane])
    const menu = new Menu()
    if (!done) {
        menu.addItem((i) => i.setTitle('Focus and start the timer').setIcon('play').setSection('focus').onClick(() => void view.focusCard(card.key, true)))
        menu.addItem((i) => i.setTitle('Make it the next focus').setIcon('target').setSection('focus').onClick(() => void view.focusCard(card.key, false)))
    }
    menu.addItem((i) => i.setTitle('Edit').setIcon('pencil').setSection('card').onClick(() => (editingKey = card.key)))
    menu.addItem((i) =>
        i
            .setTitle(done ? 'Open again' : 'Finish')
            .setIcon(done ? 'rotate-ccw' : 'check-circle-2')
            .setSection('card')
            .onClick(() => view.toggleCard(card.key)),
    )
    lanes.forEach((lane, i) => {
        if (i === card.lane) return
        menu.addItem((item) =>
            item
                .setTitle(`Move to ${lane.title}`)
                .setIcon('arrow-right')
                .setSection('move')
                .onClick(() => view.moveCard({ lane: card.lane, index: card.index }, { lane: i, index: 0 })),
        )
    })
    menu.addItem((i) => i.setTitle('Open in the note').setIcon('file-text').setSection('note').onClick(() => void view.openCardInNote(card.key, e)))
    menu.addItem((i) => i.setTitle('Copy link to card').setIcon('link').setSection('note').onClick(() => void copyLink(card)))
    menu.addItem((i) => i.setTitle('Archive').setIcon('archive').setSection('danger').onClick(() => view.archiveCard(card.key)))
    menu.addItem((i) => i.setTitle('Delete').setIcon('trash-2').setSection('danger').onClick(() => view.deleteCard(card.key)))
    menu.showAtMouseEvent(e)
}

/** A `[[note#^id]]` link to the card, giving it a block id when it has none. */
async function copyLink(card: BoardCard) {
    let id = card.blockId
    if (!id) {
        id = newBlockId($doc)
        view.edit((d) => {
            const c = d.lanes[card.lane]?.cards[card.index]
            return c && c.key === card.key ? setCardBlockId(d, c, id) : d.lines.join(d.eol)
        })
    }
    await navigator.clipboard.writeText(`[[${$note.name}#^${id}]]`)
    new Notice('Link to the card copied.')
}

function boardMenu(e: MouseEvent) {
    const menu = new Menu()
    menu.addItem((i) => i.setTitle('Add a lane').setIcon('plus').onClick(() => void startLane()))
    menu.addItem((i) => i.setTitle('Archive finished cards').setIcon('archive').onClick(() => view.archiveFinished()))
    menu.addItem((i) => i.setTitle('Undo').setIcon('undo').setSection('history').onClick(() => view.undo()))
    menu.addItem((i) => i.setTitle('Redo').setIcon('redo').setSection('history').onClick(() => view.redo()))
    menu.addItem((i) => i.setTitle('Open as markdown').setIcon('file-text').setSection('open').onClick(() => void view.openAsMarkdown()))
    if (kanbanPluginEnabled(view.app)) {
        menu.addItem((i) =>
            i
                .setTitle('Open in the Kanban plugin')
                .setIcon('square-kanban')
                .setSection('open')
                .onClick(() => {
                    if (view.file) void view.plugin.boardOpening?.openInKanban(view.leaf, view.file)
                }),
        )
    }
    menu.showAtMouseEvent(e)
}

async function startLane() {
    addingLane = true
    laneDraft = ''
    await tick()
    laneInput?.focus()
    laneInput?.scrollIntoView({ inline: 'end', block: 'nearest', behavior: 'smooth' })
}

function saveLane() {
    if (laneDraft.trim()) view.addLane(laneDraft)
    laneDraft = ''
    addingLane = false
}

function onLaneKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
        e.preventDefault()
        if (laneDraft.trim()) {
            view.addLane(laneDraft)
            laneDraft = ''
        } else addingLane = false
    } else if (e.key === 'Escape') {
        addingLane = false
    }
}

function showCard(blockId: string) {
    const card = lanes.flatMap((l) => l.cards).find((c) => c.blockId === blockId)
    if (!card) return
    const el = root?.querySelector(`[data-card="${CSS.escape(card.key)}"]`)
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
}

function onSearchKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
        query = ''
        searchEl?.blur()
    }
}

function setUpLanes() {
    view.addLane('To do')
    view.addLane('Doing')
    view.setLaneLimit(1, 3)
    view.addLane('Done')
    view.setLaneRole(2, 'done')
}
</script>

<div class="pf-board" bind:this={root} style="--pf-lane-w:{laneWidth}px">
    <RewardToasts hide={ownEvent} />

    {#if !$doc.isBoard}
        <div class="setup">
            <Icon name="kanban" size={28} />
            <h2>Turn this note into a board</h2>
            <p>Three lanes to start with: To do, Doing (with a limit of three cards) and Done. The note stays plain markdown, so the Kanban plugin can open it too.</p>
            <button class="mod-cta" on:click={() => view.setUp()}>Set up the board</button>
        </div>
    {:else}
        <header class="board-head">
            <div class="head-top">
                <div class="title-block">
                    <h1 title={path}>{$note.name}</h1>
                    <div class="summary">
                        <span><b>{counts.backlog}</b> to do</span>
                        <span class="sep">·</span>
                        <span class:hot={counts.active > 0}><b>{counts.active}</b> in progress</span>
                        <span class="sep">·</span>
                        <span><b>{counts.done}</b> finished</span>
                        {#if total > 0}
                            <div class="progress" title="{pct}% of the cards on the board are finished" aria-hidden="true">
                                <span class="seg done" style="flex-grow:{counts.done}"></span>
                                <span class="seg active" style="flex-grow:{counts.active}"></span>
                                <span class="seg backlog" style="flex-grow:{counts.backlog}"></span>
                            </div>
                            <span class="pct">{pct}%</span>
                        {/if}
                    </div>
                </div>
                <FocusPill {timer} {tracker} {path} onShowCard={showCard} />
            </div>

            <div class="head-bar">
                <div class="today" title="Today, across all your boards and notes">
                    <span class="kpi"><Icon name="check-circle" size={13} /><b>{$todayLog.cardsCompleted ?? 0}</b> cards today</span>
                    <span class="kpi"><Icon name="clock" size={13} /><b>{$todayLog.totalMinutes}</b> min focus</span>
                    {#if nextMilestone}
                        <span class="kpi milestone" title="Cards finished on this board, and the next milestone">
                            <Icon name="trophy" size={13} /><span><b>{shipped}</b>/{nextMilestone}</span>
                        </span>
                    {/if}
                </div>
                <div class="ledger">
                    <span class="lvl" title="{$levelInfo.title} · {$levelInfo.into}/{$levelInfo.needed} XP to level {$levelInfo.level + 1}">
                        <span class="lvl-num">{$levelInfo.level}</span>
                        <span class="xp"><span class="xp-fill" style="width:{Math.round($levelInfo.ratio * 100)}%"></span></span>
                    </span>
                    <span class="res" title="Coins">{@html ICONS.coin}<b>{$coins}</b></span>
                    <span class="res streak" class:lit={$streak.current > 0} title="Focus streak · longest {$streak.longest} days">{@html ICONS.flame}<b>{$streak.current}</b></span>
                </div>
                <div class="tools">
                    <label class="search" class:on={!!query}>
                        <Icon name="search" size={13} />
                        <input bind:this={searchEl} bind:value={query} type="text" placeholder="Filter cards" aria-label="Filter cards" on:keydown={onSearchKey} />
                        {#if query}
                            <button class="clear" aria-label="Clear the filter" on:click={() => (query = '')}><Icon name="x" size={12} /></button>
                        {/if}
                    </label>
                    <button class="tool" class:on={showStats} aria-pressed={showStats} title="Board statistics" aria-label="Board statistics" on:click={() => (showStats = !showStats)}>
                        <Icon name="chart" size={15} />
                    </button>
                    <button class="tool" title="Board options" aria-label="Board options" on:click={boardMenu}>
                        <Icon name="more" size={15} />
                    </button>
                </div>
            </div>
        </header>

        {#if showStats}
            <BoardStats {memory} {counts} {overLimit} />
        {/if}

        {#if lanes.length === 0}
            <div class="setup">
                <h2>An empty board</h2>
                <p>Lanes hold cards as they move from waiting, to in progress, to finished.</p>
                <div class="setup-actions">
                    <button class="mod-cta" on:click={setUpLanes}>Add To do, Doing and Done</button>
                    <button on:click={startLane}>Add a lane</button>
                </div>
            </div>
        {/if}

        <div class="pf-lanes" class:filtering={!!matches} class:empty={lanes.length === 0}>
            {#each lanes as lane, i}
                <Lane
                    {lane}
                    role={roles[i]}
                    {ctx}
                    {dragger}
                    drag={$drag}
                    target={$target}
                    memory={memory?.cards ?? {}}
                    {dueOf}
                    {focusKey}
                    {focus}
                    {bursts}
                    {editingKey}
                    {matches}
                    collapsed={!!collapsedList[i]}
                    {composeAtTop}
                    {kanbanDates}
                    dateSettings={boardSettings}
                    laneCount={lanes.length}
                />
            {/each}
            {#if addingLane}
                <div class="new-lane">
                    <input
                        bind:this={laneInput}
                        bind:value={laneDraft}
                        placeholder="Lane title"
                        aria-label="New lane title"
                        on:keydown={onLaneKey}
                        on:blur={saveLane}
                    />
                    <span class="hint">Enter to add · Esc to cancel</span>
                </div>
            {:else if lanes.length > 0}
                <button class="add-lane" on:click={startLane}><Icon name="plus" size={14} />Add a lane</button>
            {/if}
        </div>
        {#if matches}
            <p class="filter-note">Showing cards that match “{query.trim()}”. Clear the filter to drag cards.</p>
        {/if}
    {/if}
</div>

<style>
.pf-board {
    --pf-lane-bg: color-mix(in srgb, var(--background-secondary) 82%, var(--background-primary));
    --pf-lane-border: color-mix(in srgb, var(--background-modifier-border) 70%, transparent);
    --pf-card-bg: var(--background-primary);
    --pf-card-done-bg: color-mix(in srgb, var(--background-primary) 55%, var(--background-secondary));
    --pf-card-border: color-mix(in srgb, var(--background-modifier-border) 85%, transparent);
    --pf-card-border-hover: var(--background-modifier-border-hover, var(--background-modifier-border));
    --pf-card-shadow: 0 1px 2px rgba(15, 23, 42, 0.05), 0 1px 1px rgba(15, 23, 42, 0.03);
    --pf-card-shadow-hover: 0 6px 16px -6px rgba(15, 23, 42, 0.16), 0 1px 2px rgba(15, 23, 42, 0.06);
    --pf-card-font: 0.86rem;
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    color: var(--text-normal);
}
:global(.theme-dark) .pf-board {
    --pf-lane-bg: color-mix(in srgb, var(--background-secondary) 70%, var(--background-primary));
    --pf-card-bg: color-mix(in srgb, var(--background-primary) 40%, var(--background-modifier-hover, #2a2a2a));
    --pf-card-done-bg: color-mix(in srgb, var(--background-primary) 70%, var(--background-secondary));
    --pf-card-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
    --pf-card-shadow-hover: 0 8px 20px -8px rgba(0, 0, 0, 0.6), 0 1px 2px rgba(0, 0, 0, 0.4);
}

.board-head {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px 16px 12px;
}
.head-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
}
.title-block {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
}
h1 {
    margin: 0;
    font-size: 1.32rem;
    font-weight: 720;
    letter-spacing: -0.012em;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.summary {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 2px 6px;
    font-size: 0.76rem;
    color: var(--text-muted);
}
.summary b {
    font-weight: 700;
    color: var(--text-normal);
    font-variant-numeric: tabular-nums;
}
.summary .hot b {
    color: var(--interactive-accent);
}
.sep {
    color: var(--text-faint);
}
.progress {
    display: flex;
    gap: 2px;
    width: 120px;
    height: 6px;
    margin-left: 8px;
    border-radius: 99px;
    overflow: hidden;
}
.seg {
    flex-basis: 0;
    min-width: 0;
}
.seg.done {
    background: var(--color-green);
}
.seg.active {
    background: var(--interactive-accent);
}
.seg.backlog {
    background: var(--background-modifier-border);
}
.pct {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
}

.head-bar {
    display: flex;
    align-items: center;
    gap: 10px 14px;
    flex-wrap: wrap;
}
.today {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
}
.kpi {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.74rem;
    color: var(--text-muted);
    white-space: nowrap;
}
.kpi b {
    color: var(--text-normal);
    font-variant-numeric: tabular-nums;
}
.kpi :global(.pf-icon) {
    color: var(--text-faint);
}
.kpi.milestone :global(.pf-icon) {
    color: var(--color-yellow);
}
.ledger {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-left: auto;
}
.lvl {
    display: inline-flex;
    align-items: center;
    gap: 6px;
}
.lvl-num {
    display: inline-grid;
    place-items: center;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    border-radius: 6px;
    font-size: 0.7rem;
    font-weight: 800;
    color: var(--text-normal);
    background: var(--background-modifier-hover);
    border: 1px solid var(--background-modifier-border);
}
.xp {
    width: 46px;
    height: 4px;
    border-radius: 4px;
    background: var(--background-modifier-border);
    overflow: hidden;
}
.xp-fill {
    display: block;
    height: 100%;
    border-radius: 4px;
    background: linear-gradient(90deg, #f2c94c, #e2a336);
}
.res {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.76rem;
    font-variant-numeric: tabular-nums;
}
.res :global(svg) {
    width: 14px;
    height: 14px;
}
.streak {
    filter: grayscale(1);
    opacity: 0.55;
}
.streak.lit {
    filter: none;
    opacity: 1;
}
.tools {
    display: flex;
    align-items: center;
    gap: 4px;
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
    width: 150px;
    height: 30px;
    padding: 0 24px 0 28px;
    border-radius: 9px;
    font-size: 0.78rem;
    transition: width 0.15s ease;
}
.search input:focus,
.search.on input {
    width: 200px;
}
.clear {
    position: absolute;
    right: 4px;
    display: inline-grid;
    place-items: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    box-shadow: none;
    background: transparent;
    color: var(--text-faint);
    cursor: pointer;
}
.tool {
    display: inline-grid;
    place-items: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: none;
    border-radius: 9px;
    box-shadow: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
}
.tool:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
}
.tool.on {
    color: var(--interactive-accent);
    background: color-mix(in srgb, var(--interactive-accent) 12%, transparent);
}

.pf-lanes {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 6px 16px 18px;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-padding: 0 16px;
}
.pf-lanes > :global(*) {
    max-height: 100%;
}
.pf-lanes.empty {
    flex: 0 0 auto;
}
.add-lane {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    width: 180px;
    height: 44px;
    padding: 0 14px;
    border: 1px dashed var(--background-modifier-border);
    border-radius: 14px;
    box-shadow: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 0.8rem;
    cursor: pointer;
}
.add-lane:hover {
    color: var(--text-normal);
    border-color: var(--background-modifier-border-hover, var(--text-faint));
    background: var(--pf-lane-bg);
}
.new-lane {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: var(--pf-lane-w);
    padding: 10px;
    border-radius: 14px;
    background: var(--pf-lane-bg);
    border: 1px solid var(--pf-lane-border);
}
.new-lane input {
    width: 100%;
    height: 30px;
    font-weight: 650;
}
.hint {
    font-size: 0.66rem;
    color: var(--text-faint);
}
.filter-note {
    margin: -8px 16px 10px;
    font-size: 0.7rem;
    color: var(--text-faint);
}

.setup {
    max-width: 440px;
    margin: 48px auto;
    padding: 28px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    text-align: center;
    color: var(--text-muted);
}
.setup h2 {
    margin: 4px 0 0;
    font-size: 1.15rem;
    color: var(--text-normal);
}
.setup p {
    margin: 0 0 6px;
    font-size: 0.84rem;
    line-height: 1.5;
}
.setup-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: center;
}

:global(body.pf-dragging),
:global(body.pf-dragging *) {
    cursor: grabbing !important;
}

@media (max-width: 640px) {
    .board-head {
        padding: 12px 12px 10px;
    }
    .pf-lanes {
        padding: 6px 12px 14px;
        scroll-snap-type: x mandatory;
    }
    .pf-lanes > :global(.pf-lane) {
        scroll-snap-align: start;
        width: min(var(--pf-lane-w), calc(100vw - 48px));
    }
    /* One row under the title: the ledger, then the tools */
    .today {
        display: none;
    }
    .head-bar {
        flex-wrap: nowrap;
    }
    .ledger {
        margin-left: 0;
        gap: 10px;
    }
    .tools {
        margin-left: auto;
    }
    .search input,
    .search input:focus,
    .search.on input {
        width: 112px;
    }
}
</style>
