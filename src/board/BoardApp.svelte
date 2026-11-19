<script lang="ts">
import { onDestroy, onMount, tick } from 'svelte'
import { Menu, Notice, Platform } from 'obsidian'
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
import { islandName, focusRate } from '../services/Islands'
import { getSpecies } from '../assets/floraCatalog'
import { normalizeTag, rankTagSuggestions, type TagSuggestion } from './tags'
import type { RewardEvent } from '../types/forest'

export let view: BoardView

const doc = view.doc
const note = view.note
const timer = view.plugin.timer!
const tracker = view.plugin.tracker!
const engine = view.plugin.forestEngine

let root: HTMLDivElement
let lanesEl: HTMLDivElement
let tabsEl: HTMLElement
let query = ''
let searchEl: HTMLInputElement
let searchFocused = false
let searchSuggestIdx = 0
let showStats = false
let showDedicate = false
let projectDraft = ''
let dedicateTags: string[] = []
let dedicateTagInput = ''
let dedicateTagEl: HTMLInputElement
let dedicatePool: TagSuggestion[] = []
let dedicateSuggestIdx = 0
let editingKey: string | null = null
let addingLane = false
let laneDraft = ''
let laneInput: HTMLInputElement

/** A narrow pane (a phone, or a thin split) shows one lane at a time, with tabs to switch. */
const NARROW = 620
let narrow = Platform.isPhone
let activeLane = 0
let scrollFrame: number | null = null

const ROLE_ICON = { backlog: 'circle-dashed', active: 'circle-half', done: 'check-circle' } as const

const dragger = new CardDragger(
    () => root,
    (from, to) => view.moveCard(from, to),
)
const drag = dragger.drag
const target = dragger.target
onDestroy(() => dragger.destroy())

onMount(() => {
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect.width ?? 0
        if (width > 0) narrow = width < NARROW
    })
    observer.observe(root)
    return () => observer.disconnect()
})

$: path = $note.path
$: memory = $gamificationStore.boards?.[path]
$: lanes = $doc.lanes
$: boardTags = $doc.tags
$: boardProject = $doc.project
$: dedicated = !!boardProject || boardTags.length > 0
$: matchingIslands = ($gamificationStore.islands ?? []).filter((isl) => isl.focus && focusRate(isl.focus, { tags: boardTags, notePath: path }) > 0)
$: boardSpecies = (() => {
    const unlocked = $gamificationStore.unlockedSpecies ?? []
    const maps = $gamificationStore.tagMappings ?? []
    for (const bt of boardTags) {
        const m = maps.find((x) => x.tag.toLowerCase() === bt.toLowerCase() && unlocked.includes(x.speciesId))
        if (m) return getSpecies(m.speciesId) ?? null
    }
    return null
})()
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
$: activeTagFilter = needle.startsWith('#') ? query.trim() : ''
$: matches = needle
    ? (c: BoardCard) => c.text.toLowerCase().includes(needle) || c.meta.tags.some((t) => t.toLowerCase().includes(needle))
    : null
$: matchedCount = matches ? lanes.reduce((n, l) => n + l.cards.filter(matches).length, 0) : total

$: boardCardTags = (() => {
    const map = new Map<string, { tag: string; count: number; branch: boolean }>()
    const bases = boardTags.map((t) => t.toLowerCase())
    for (const lane of lanes) {
        for (const c of lane.cards) {
            for (const t of c.meta.tags) {
                const key = t.toLowerCase()
                const cur = map.get(key)
                if (cur) cur.count++
                else map.set(key, { tag: t, count: 1, branch: bases.some((b) => key.startsWith(`${b}/`)) })
            }
        }
    }
    return [...map.values()].sort((a, b) => Number(b.branch) - Number(a.branch) || b.count - a.count || a.tag.localeCompare(b.tag))
})()

$: searchSuggestions = (() => {
    if (!searchFocused || !query.trim().startsWith('#')) return [] as string[]
    const q = query.trim().toLowerCase()
    const seen = new Set<string>()
    const out: string[] = []
    for (const item of [...boardCardTags.map((x) => x.tag), ...boardTags]) {
        const l = item.toLowerCase()
        if (seen.has(l) || !l.includes(q)) continue
        seen.add(l)
        out.push(item)
        if (out.length >= 6) break
    }
    return out
})()
$: if (searchSuggestIdx >= searchSuggestions.length) searchSuggestIdx = Math.max(0, searchSuggestions.length - 1)

$: dedicateSuggestions = (() => {
    if (!showDedicate) return [] as TagSuggestion[]
    return rankTagSuggestions(dedicateTagInput, dedicatePool, { boardTags: dedicateTags, exclude: dedicateTags, limit: 8 })
})()
$: if (dedicateSuggestIdx >= dedicateSuggestions.length) dedicateSuggestIdx = Math.max(0, dedicateSuggestions.length - 1)
$: islandChoices = ($gamificationStore.islands ?? []).filter((isl): isl is typeof isl & { focus: { kind: 'tag'; value: string } } => isl.focus?.kind === 'tag')
$: derivedProjectTag = (() => {
    const t = normalizeTag(projectDraft)
    if (!t || dedicateTags.some((x) => x.toLowerCase() === t.toLowerCase())) return ''
    return t
})()

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
    filterTag: (tag: string) => {
        const clean = tag.trim()
        query = query.trim().toLowerCase() === clean.toLowerCase() ? '' : clean
    },
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
    menu.addItem((i) => i.setTitle('Duplicate').setIcon('copy').setSection('card').onClick(() => view.duplicateCard(card.key)))
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
    menu.addItem((i) => i.setTitle('Branch into sub-board').setIcon('git-branch').setSection('note').onClick(() => void view.branchCardToBoard(card.key)))
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
    menu.addItem((i) => i.setTitle('Dedicate to tag / project…').setIcon('tag').onClick(() => void openDedicate(true)))
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
    showStats = showStats && !narrow
    await tick()
    laneInput?.focus()
    if (narrow) scrollLanesTo(laneInput?.closest<HTMLElement>('.new-lane') ?? null)
    else laneInput?.scrollIntoView({ inline: 'end', block: 'nearest', behavior: 'smooth' })
}

/** Adds the lane and, on a narrow board, shows it. */
async function addLane(title: string) {
    view.addLane(title)
    if (!narrow) return
    await tick()
    goToLane(lanes.length - 1)
}

function saveLane() {
    if (laneDraft.trim()) void addLane(laneDraft)
    laneDraft = ''
    addingLane = false
}

function onLaneKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
        e.preventDefault()
        if (laneDraft.trim()) {
            void addLane(laneDraft)
            laneDraft = ''
        } else addingLane = false
    } else if (e.key === 'Escape') {
        addingLane = false
    }
}

function showCard(blockId: string) {
    const card = lanes.flatMap((l) => l.cards).find((c) => c.blockId === blockId)
    if (!card) return
    if (narrow) goToLane(card.lane)
    const el = root?.querySelector(`[data-card="${CSS.escape(card.key)}"]`)
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
}

function onSearchKey(e: KeyboardEvent) {
    if (searchSuggestions.length > 0) {
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            searchSuggestIdx = (searchSuggestIdx + 1) % searchSuggestions.length
            return
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault()
            searchSuggestIdx = (searchSuggestIdx - 1 + searchSuggestions.length) % searchSuggestions.length
            return
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault()
            query = searchSuggestions[searchSuggestIdx]
            searchFocused = false
            return
        }
    }
    if (e.key === 'Escape') {
        query = ''
        searchFocused = false
        searchEl?.blur()
    }
}

async function openDedicate(forceOpen = false) {
    if (showDedicate && !forceOpen) {
        showDedicate = false
        return
    }
    projectDraft = boardProject
    dedicateTags = [...boardTags]
    dedicateTagInput = ''
    dedicatePool = view.getTagSuggestions()
    dedicateSuggestIdx = 0
    showDedicate = true
    await tick()
    dedicateTagEl?.focus()
}

function addDedicateTag(raw: string) {
    const tag = normalizeTag(raw)
    if (!tag) return
    if (!dedicateTags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
        dedicateTags = [...dedicateTags, tag]
    }
    dedicateTagInput = ''
    dedicateSuggestIdx = 0
}

function removeDedicateTag(tag: string) {
    dedicateTags = dedicateTags.filter((t) => t.toLowerCase() !== tag.toLowerCase())
}

function saveDedication() {
    if (dedicateTagInput.trim()) addDedicateTag(dedicateTagInput)
    view.setDedication({ project: projectDraft.trim() || null, tags: dedicateTags })
    showDedicate = false
}

function clearDedication() {
    view.setDedication({ project: null, tags: [] })
    showDedicate = false
}

function onDedicateKey(e: KeyboardEvent) {
    if (e.isComposing) return
    const list = dedicateSuggestions
    if (list.length > 0 && dedicateTagInput.trim()) {
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            dedicateSuggestIdx = (dedicateSuggestIdx + 1) % list.length
            return
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault()
            dedicateSuggestIdx = (dedicateSuggestIdx - 1 + list.length) % list.length
            return
        }
        if (e.key === 'Tab') {
            e.preventDefault()
            addDedicateTag(list[dedicateSuggestIdx].tag)
            return
        }
    }
    if (e.key === 'Enter') {
        e.preventDefault()
        if (dedicateTagInput.trim()) {
            const exact = list.find((s) => s.tag.toLowerCase() === normalizeTag(dedicateTagInput).toLowerCase())
            if (exact) addDedicateTag(exact.tag)
            else if (list.length > 0 && dedicateTagInput.trim() === '#') addDedicateTag(list[dedicateSuggestIdx].tag)
            else addDedicateTag(dedicateTagInput)
        } else {
            saveDedication()
        }
    } else if (e.key === 'Escape') {
        e.preventDefault()
        showDedicate = false
    }
}

function setUpLanes() {
    view.addLane('To do')
    view.addLane('Doing')
    view.setLaneLimit(1, 3)
    view.addLane('Done')
    view.setLaneRole(2, 'done')
}

// ---------------------------------------------------------------------------
// Narrow boards: one lane in view, tabs to switch
// ---------------------------------------------------------------------------

/** Scrolls the lanes so this element starts at the left edge. */
function scrollLanesTo(el: HTMLElement | null) {
    if (!el || !lanesEl) return
    const pad = parseFloat(getComputedStyle(lanesEl).paddingLeft) || 0
    lanesEl.scrollTo({ left: lanesEl.scrollLeft + el.getBoundingClientRect().left - lanesEl.getBoundingClientRect().left - pad, behavior: 'smooth' })
}

function goToLane(index: number) {
    scrollLanesTo(lanesEl?.querySelector<HTMLElement>(`[data-lane="${index}"]`) ?? null)
    activeLane = index
}

/** The lane whose left edge is closest to the left of the view is the one being looked at. */
function syncActiveLane() {
    scrollFrame = null
    if (!lanesEl) return
    const left = lanesEl.getBoundingClientRect().left + (parseFloat(getComputedStyle(lanesEl).paddingLeft) || 0)
    let best = activeLane
    let distance = Infinity
    for (const el of Array.from(lanesEl.querySelectorAll<HTMLElement>('[data-lane]'))) {
        const d = Math.abs(el.getBoundingClientRect().left - left)
        if (d < distance) {
            distance = d
            best = Number(el.dataset.lane)
        }
    }
    activeLane = best
}

function onLanesScroll() {
    if (!narrow || scrollFrame !== null) return
    scrollFrame = window.requestAnimationFrame(syncActiveLane)
}

// The active tab stays in view as the lanes scroll
$: if (narrow && tabsEl) {
    const tab = tabsEl.querySelector<HTMLElement>(`[data-lane-tab="${activeLane}"]`)
    if (tab) {
        const strip = tabsEl.getBoundingClientRect()
        const r = tab.getBoundingClientRect()
        if (r.left < strip.left + 12) tabsEl.scrollTo({ left: tabsEl.scrollLeft + r.left - strip.left - 12, behavior: 'smooth' })
        else if (r.right > strip.right - 12) tabsEl.scrollTo({ left: tabsEl.scrollLeft + r.right - strip.right + 12, behavior: 'smooth' })
    }
}
</script>

<div class="pf-board" class:narrow bind:this={root} style="--pf-lane-w:{laneWidth}px">
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
            <div class="title-row">
                <h1 title={path}>{$note.name}</h1>
                <button
                    class="dedicate-chip"
                    class:set={dedicated}
                    class:open={showDedicate}
                    title={dedicated
                        ? 'Dedicated topic / project — focusing on any card here counts toward this too. Click to edit.'
                        : 'Dedicate this board to a tag or project so every card inherits it'}
                    on:click={() => void openDedicate()}
                >
                    {#if dedicated}
                        {#if boardProject}
                            <span class="proj-badge"><Icon name="folder" size={11} />{boardProject}</span>
                        {/if}
                        {#each boardTags as t (t)}
                            <span class="tag-badge">{t}</span>
                        {/each}
                        {#if matchingIslands.length > 0}
                            <span class="isle-badge" title="Builds {islandName(matchingIslands[0])}">🏝️ {islandName(matchingIslands[0])}</span>
                        {:else if boardSpecies}
                            <span class="flora-badge" title="Grows {boardSpecies.name}">🌱 {boardSpecies.name}</span>
                        {/if}
                    {:else}
                        <Icon name="tag" size={11} />
                        <span>Dedicate</span>
                    {/if}
                </button>
            </div>
            <div class="summary">
                <span class="counts">
                    <span><b>{counts.backlog}</b> to do</span>
                    <span class="sep">·</span>
                    <span class:hot={counts.active > 0}><b>{counts.active}</b> in progress</span>
                    <span class="sep">·</span>
                    <span><b>{counts.done}</b> finished</span>
                </span>
                {#if total > 0}
                    <div class="progress" title="{pct}% of the cards on the board are finished" aria-hidden="true">
                        <span class="seg done" style="flex-grow:{counts.done}"></span>
                        <span class="seg active" style="flex-grow:{counts.active}"></span>
                        <span class="seg backlog" style="flex-grow:{counts.backlog}"></span>
                    </div>
                    <span class="pct">{pct}%</span>
                {/if}
            </div>
            <div class="focus-slot">
                <FocusPill {timer} {tracker} {path} onShowCard={showCard} compact={narrow} {boardTags} {boardProject} />
            </div>

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
                <div class="search-wrap">
                    <label class="search" class:on={!!query}>
                        <Icon name="search" size={13} />
                        <input
                            bind:this={searchEl}
                            bind:value={query}
                            type="text"
                            placeholder="Filter or #tag"
                            aria-label="Filter cards"
                            on:focus={() => (searchFocused = true)}
                            on:blur={() => window.setTimeout(() => (searchFocused = false), 120)}
                            on:keydown={onSearchKey}
                        />
                        {#if query}
                            <button class="clear" aria-label="Clear the filter" on:click={() => (query = '')}><Icon name="x" size={12} /></button>
                        {/if}
                    </label>
                    {#if searchSuggestions.length > 0}
                        <div class="search-suggest" role="listbox" aria-label="Filter by tag">
                            {#each searchSuggestions as tag, idx (tag)}
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected={idx === searchSuggestIdx}
                                    class="suggest-opt"
                                    class:active={idx === searchSuggestIdx}
                                    on:pointerdown|preventDefault
                                    on:click={() => {
                                        query = tag
                                        searchFocused = false
                                    }}
                                >
                                    {tag}
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>
                <button class="tool" class:on={showStats} aria-pressed={showStats} title="Board statistics" aria-label="Board statistics" on:click={() => (showStats = !showStats)}>
                    <Icon name="chart" size={15} />
                </button>
                <button class="tool" title="Board options" aria-label="Board options" on:click={boardMenu}>
                    <Icon name="more" size={15} />
                </button>
            </div>
        </header>

        {#if showDedicate}
            <section class="dedicate-panel" aria-label="Board topic and project dedication">
                <div class="dedicate-head">
                    <div>
                        <strong>Dedicate board to a topic or project</strong>
                        <p class="dedicate-sub">Focusing on any card here also counts toward these tags, so individual cards can branch off with their own sub-tags.</p>
                    </div>
                    <button type="button" class="tool" aria-label="Close" on:click={() => (showDedicate = false)}><Icon name="x" size={14} /></button>
                </div>

                <div class="dedicate-grid">
                    <label class="dedicate-field">
                        <span>Project name <small>(optional)</small></span>
                        <input
                            type="text"
                            bind:value={projectDraft}
                            placeholder="e.g. Thesis, Website Relaunch…"
                            on:keydown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault()
                                    saveDedication()
                                } else if (e.key === 'Escape') {
                                    showDedicate = false
                                }
                            }}
                        />
                    </label>
                    <div class="dedicate-field">
                        <span>Dedicated tags</span>
                        <div class="dedicate-tags-box">
                            {#each dedicateTags as t (t)}
                                <span class="d-tag">
                                    <span>{t}</span>
                                    <button type="button" aria-label="Remove {t}" on:click={() => removeDedicateTag(t)}><Icon name="x" size={10} /></button>
                                </span>
                            {/each}
                            <div class="d-input-wrap">
                                <input
                                    bind:this={dedicateTagEl}
                                    bind:value={dedicateTagInput}
                                    type="text"
                                    placeholder={dedicateTags.length ? 'Add another #tag…' : 'Type #tag to autocomplete…'}
                                    on:keydown={onDedicateKey}
                                />
                                {#if dedicateTagInput.trim() && dedicateSuggestions.length > 0}
                                    <div class="d-suggest" role="listbox">
                                        {#each dedicateSuggestions as s, idx (s.tag)}
                                            <button
                                                type="button"
                                                role="option"
                                                aria-selected={idx === dedicateSuggestIdx}
                                                class="d-suggest-item"
                                                class:active={idx === dedicateSuggestIdx}
                                                on:pointerdown|preventDefault
                                                on:click={() => addDedicateTag(s.tag)}
                                            >
                                                <span class="d-suggest-tag">{s.tag}</span>
                                                {#if s.hint}<span class="d-suggest-hint">{s.hint}</span>{/if}
                                            </button>
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                            {#if dedicateTagInput.trim()}
                                <button type="button" class="d-add" on:click={() => addDedicateTag(dedicateTagInput)}>Add</button>
                            {/if}
                        </div>
                    </div>
                </div>

                {#if derivedProjectTag || islandChoices.length > 0 || dedicatePool.length > 0}
                    <div class="dedicate-picks">
                        {#if derivedProjectTag}
                            <button type="button" class="pick-chip accent" on:click={() => addDedicateTag(derivedProjectTag)}>
                                + Use {derivedProjectTag}
                            </button>
                        {/if}
                        {#each islandChoices as isl (isl.id)}
                            {@const active = dedicateTags.some((t) => t.toLowerCase() === isl.focus.value.toLowerCase())}
                            <button
                                type="button"
                                class="pick-chip"
                                class:on={active}
                                title="Link this board to {islandName(isl)}"
                                on:click={() => (active ? removeDedicateTag(isl.focus.value) : addDedicateTag(isl.focus.value))}
                            >
                                🏝️ {islandName(isl)} · {isl.focus.value}
                            </button>
                        {/each}
                        {#each dedicatePool.filter((s) => !s.sources.includes('island')).slice(0, 8) as s (s.tag)}
                            {@const active = dedicateTags.some((t) => t.toLowerCase() === s.tag.toLowerCase())}
                            {#if !active}
                                <button type="button" class="pick-chip" title={s.hint} on:click={() => addDedicateTag(s.tag)}>
                                    {s.tag}
                                </button>
                            {/if}
                        {/each}
                    </div>
                {/if}

                <div class="dedicate-actions">
                    {#if dedicated}
                        <button type="button" class="d-clear" on:click={clearDedication}>Clear dedication</button>
                    {/if}
                    <span class="spacer"></span>
                    <button type="button" on:click={() => (showDedicate = false)}>Cancel</button>
                    <button type="button" class="mod-cta" on:click={saveDedication}>Save dedication</button>
                </div>
            </section>
        {/if}

        {#if boardCardTags.length > 0 && !(narrow && showStats)}
            <div class="tag-strip" role="toolbar" aria-label="Filter cards by tag">
                <button type="button" class="strip-pill" class:on={!needle} on:click={() => (query = '')}>
                    All <span class="strip-n">{total}</span>
                </button>
                {#each boardCardTags as item (item.tag)}
                    {@const on = needle === item.tag.toLowerCase()}
                    <button
                        type="button"
                        class="strip-pill"
                        class:on
                        class:branch={item.branch}
                        title={on ? 'Clear tag filter' : `Filter by ${item.tag}`}
                        on:click={() => ctx.filterTag(item.tag)}
                    >
                        {#if item.branch}<Icon name="git-branch" size={10} />{/if}
                        <span>{item.tag}</span>
                        <span class="strip-n">{item.count}</span>
                    </button>
                {/each}
            </div>
        {/if}

        {#if narrow && lanes.length > 0 && !showStats}
            <nav class="lane-tabs" class:dragging={!!$drag} bind:this={tabsEl} aria-label="Lanes">
                {#each lanes as lane, i}
                    <button
                        class="tab {roles[i]}"
                        class:on={i === activeLane}
                        class:drop={!!$drag && $target?.lane === i}
                        class:over={lane.maxItems > 0 && lane.cards.length > lane.maxItems}
                        data-lane-tab={i}
                        aria-label="{lane.title}, {lane.cards.length} cards"
                        aria-current={i === activeLane ? 'true' : undefined}
                        on:click={() => goToLane(i)}
                    >
                        <Icon name={ROLE_ICON[roles[i]]} size={12} />
                        <span class="tab-title">{lane.title}</span>
                        <span class="n">{lane.cards.length}</span>
                    </button>
                {/each}
                <button class="tab add" aria-label="Add a lane" title="Add a lane" on:click={startLane}><Icon name="plus" size={13} /></button>
            </nav>
        {/if}

        {#if showStats}
            <!-- On a narrow board the statistics take the lanes' place until they are closed again -->
            <div class="stats-slot">
                <BoardStats {memory} {counts} {overLimit} {narrow} />
            </div>
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

        <div class="pf-lanes" class:filtering={!!matches} class:empty={lanes.length === 0} class:hidden={narrow && showStats} bind:this={lanesEl} on:scroll={onLanesScroll}>
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
                    {boardTags}
                    {activeTagFilter}
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
                    <span class="hint">{Platform.isMobile ? 'Enter to add' : 'Enter to add · Esc to cancel'}</span>
                </div>
            {:else if lanes.length > 0}
                <button class="add-lane" on:click={startLane}><Icon name="plus" size={14} />Add a lane</button>
            {/if}
        </div>
        {#if matches}
            <p class="filter-note">Showing {matchedCount} of {total} cards matching “{query.trim()}”. Clear the filter to drag cards.</p>
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

/* The header is a grid, so a narrow board can lay the same pieces out differently */
.board-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    grid-template-areas:
        'title   title  focus'
        'summary summary focus'
        'today   ledger tools';
    align-items: center;
    column-gap: 14px;
    padding: 14px 16px 12px;
}
.title-row {
    grid-area: title;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 10px;
    min-width: 0;
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
.dedicate-chip {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 5px;
    height: auto;
    min-height: 24px;
    padding: 2px 9px;
    border-radius: 99px;
    border: 1px dashed var(--background-modifier-border);
    box-shadow: none;
    background: transparent;
    color: var(--text-faint);
    font-size: 0.71rem;
    font-weight: 600;
    cursor: pointer;
    transition: border-color 0.14s, background-color 0.14s, color 0.14s;
}
.dedicate-chip:hover,
.dedicate-chip.open {
    border-style: solid;
    border-color: var(--interactive-accent);
    color: var(--text-normal);
    background: color-mix(in srgb, var(--interactive-accent) 10%, transparent);
}
.dedicate-chip.set {
    border-style: solid;
    border-color: color-mix(in srgb, var(--interactive-accent) 32%, var(--background-modifier-border));
    background: color-mix(in srgb, var(--interactive-accent) 8%, var(--pf-card-bg));
    color: var(--text-normal);
}
.proj-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-weight: 650;
}
.tag-badge {
    color: var(--text-accent, var(--interactive-accent));
    font-weight: 650;
}
.isle-badge,
.flora-badge {
    font-size: 0.67rem;
    color: var(--text-muted);
    font-weight: 500;
}
.summary {
    grid-area: summary;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 2px 6px;
    margin-top: 3px;
    font-size: 0.76rem;
    color: var(--text-muted);
}
.counts {
    display: inline-flex;
    align-items: center;
    gap: 6px;
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
.focus-slot {
    grid-area: focus;
    justify-self: end;
    min-width: 0;
    max-width: 100%;
}

.today {
    grid-area: today;
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    margin-top: 10px;
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
    grid-area: ledger;
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 10px;
    justify-self: end;
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
    grid-area: tools;
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 10px;
    justify-self: end;
}
.search-wrap {
    position: relative;
}
.search {
    position: relative;
    display: flex;
    align-items: center;
    color: var(--text-faint);
}
.search-suggest {
    position: absolute;
    left: 0;
    right: 0;
    top: calc(100% + 4px);
    z-index: 30;
    display: flex;
    flex-direction: column;
    padding: 4px;
    border-radius: 9px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    box-shadow: 0 12px 28px -8px rgba(0, 0, 0, 0.28);
}
.suggest-opt {
    display: flex;
    align-items: center;
    width: 100%;
    height: auto;
    padding: 5px 8px;
    border: none;
    border-radius: 6px;
    box-shadow: none;
    background: transparent;
    color: var(--text-accent, var(--interactive-accent));
    font-size: 0.75rem;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
}
.suggest-opt.active,
.suggest-opt:hover {
    background: color-mix(in srgb, var(--interactive-accent) 14%, transparent);
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

.dedicate-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0 16px 10px;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--pf-lane-bg);
    border: 1px solid color-mix(in srgb, var(--interactive-accent) 32%, var(--pf-lane-border));
    box-shadow: var(--pf-card-shadow);
}
.dedicate-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
}
.dedicate-head strong {
    font-size: 0.84rem;
}
.dedicate-sub {
    margin: 2px 0 0;
    font-size: 0.72rem;
    color: var(--text-muted);
    line-height: 1.4;
}
.dedicate-grid {
    display: grid;
    grid-template-columns: minmax(180px, 260px) minmax(0, 1fr);
    gap: 10px 14px;
}
.dedicate-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--text-muted);
}
.dedicate-field small {
    font-weight: 400;
    color: var(--text-faint);
}
.dedicate-field input {
    height: 30px;
    font-size: 0.8rem;
}
.dedicate-tags-box {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
    min-height: 32px;
    padding: 3px 6px;
    border-radius: 8px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
}
.d-tag {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 22px;
    padding: 0 5px 0 8px;
    border-radius: 99px;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--text-accent, var(--interactive-accent));
    background: color-mix(in srgb, var(--interactive-accent) 12%, transparent);
}
.d-tag button {
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
    cursor: pointer;
}
.d-input-wrap {
    position: relative;
    flex: 1 1 130px;
    min-width: 110px;
}
.d-input-wrap input {
    width: 100%;
    height: 24px;
    padding: 0 4px;
    border: none;
    box-shadow: none;
    background: transparent;
    font-size: 0.78rem;
}
.d-input-wrap input:focus {
    box-shadow: none;
}
.d-add {
    height: 22px;
    padding: 0 8px;
    border-radius: 6px;
    font-size: 0.72rem;
    cursor: pointer;
}
.d-suggest {
    position: absolute;
    left: -6px;
    right: -6px;
    top: calc(100% + 6px);
    z-index: 30;
    display: flex;
    flex-direction: column;
    max-height: 185px;
    overflow-y: auto;
    padding: 4px;
    border-radius: 9px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    box-shadow: 0 12px 28px -8px rgba(0, 0, 0, 0.28);
}
.d-suggest-item {
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
    cursor: pointer;
}
.d-suggest-item.active,
.d-suggest-item:hover {
    background: color-mix(in srgb, var(--interactive-accent) 14%, transparent);
}
.d-suggest-tag {
    font-weight: 600;
    color: var(--text-accent, var(--interactive-accent));
}
.d-suggest-hint {
    font-size: 0.68rem;
    color: var(--text-faint);
}
.dedicate-picks {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
}
.pick-chip {
    height: auto;
    padding: 3px 9px;
    border-radius: 99px;
    border: 1px solid var(--background-modifier-border);
    box-shadow: none;
    background: var(--pf-card-bg);
    color: var(--text-muted);
    font-size: 0.7rem;
    cursor: pointer;
}
.pick-chip:hover {
    border-color: var(--interactive-accent);
    color: var(--text-normal);
}
.pick-chip.on {
    background: var(--interactive-accent);
    border-color: var(--interactive-accent);
    color: var(--text-on-accent, #fff);
}
.pick-chip.accent {
    border-style: dashed;
    color: var(--text-accent, var(--interactive-accent));
}
.dedicate-actions {
    display: flex;
    align-items: center;
    gap: 8px;
}
.dedicate-actions .spacer {
    flex: 1;
}
.d-clear {
    border: none;
    box-shadow: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 0.74rem;
    cursor: pointer;
}
.d-clear:hover {
    color: var(--color-red);
}

.tag-strip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 16px 8px;
    overflow-x: auto;
    scrollbar-width: none;
}
.tag-strip::-webkit-scrollbar {
    display: none;
}
.strip-pill {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 24px;
    padding: 0 9px;
    border-radius: 99px;
    border: 1px solid var(--background-modifier-border);
    box-shadow: none;
    background: var(--pf-card-bg);
    color: var(--text-muted);
    font-size: 0.71rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
}
.strip-pill:hover {
    border-color: var(--interactive-accent);
    color: var(--text-normal);
}
.strip-pill.branch:not(.on) {
    border-color: color-mix(in srgb, var(--interactive-accent) 32%, var(--background-modifier-border));
}
.strip-pill.on {
    background: var(--interactive-accent);
    border-color: var(--interactive-accent);
    color: var(--text-on-accent, #fff);
}
.strip-n {
    font-size: 0.65rem;
    opacity: 0.75;
    font-variant-numeric: tabular-nums;
}

/* ---- Narrow: one lane fills the view, tabs switch between them ---- */
.narrow .dedicate-grid {
    grid-template-columns: 1fr;
}
.narrow .dedicate-panel {
    margin: 0 12px 8px;
}
.narrow .tag-strip {
    padding: 0 12px 6px;
}
:global(body.is-mobile) .dedicate-field input,
:global(body.is-mobile) .d-input-wrap input,
:global(body.is-mobile) .search input {
    font-size: max(16px, 0.82rem);
}
:global(body.is-mobile) .d-suggest-item {
    min-height: 36px;
    font-size: 0.84rem;
}
:global(body.is-mobile) .strip-pill {
    height: 28px;
    font-size: 0.76rem;
}
:global(body.is-mobile) .dedicate-chip {
    min-height: 28px;
    font-size: 0.76rem;
}
.narrow .board-head {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
        'title  tools'
        'ledger summary'
        'focus  focus';
    column-gap: 10px;
    padding: 10px 12px 8px;
}
.narrow h1 {
    font-size: 1.12rem;
}
.narrow .today,
.narrow .counts {
    display: none;
}
.narrow .summary {
    justify-self: end;
    margin-top: 6px;
    flex-wrap: nowrap;
}
.narrow .progress {
    width: 72px;
    margin-left: 0;
}
.narrow .ledger {
    justify-self: start;
    margin-top: 6px;
    gap: 10px;
}
.narrow .tools {
    margin-top: 0;
}
.narrow .focus-slot {
    justify-self: stretch;
    margin-top: 8px;
}
/* The filter is a button until it is tapped or has something in it */
.narrow .search input {
    width: 30px;
    padding: 0;
    opacity: 0;
    background: transparent;
    border-color: transparent;
}
.narrow .search:focus-within input,
.narrow .search.on input {
    width: 140px;
    padding: 0 24px 0 28px;
    opacity: 1;
    background: var(--background-modifier-form-field);
    border-color: var(--background-modifier-border);
}
.narrow .search > :global(.pf-icon) {
    color: var(--text-muted);
}

.lane-tabs {
    flex: none;
    display: flex;
    gap: 6px;
    padding: 2px 12px 8px;
    overflow-x: auto;
    scrollbar-width: none;
}
.lane-tabs::-webkit-scrollbar {
    display: none;
}
.tab {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 32px;
    padding: 0 11px;
    border: 1px solid transparent;
    border-radius: 99px;
    box-shadow: none;
    background: var(--background-modifier-hover);
    color: var(--text-muted);
    font-size: 0.76rem;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    transition: background-color 0.15s, border-color 0.15s, color 0.15s, height 0.15s;
}
.tab :global(.pf-icon) {
    color: var(--text-faint);
}
.tab.active :global(.pf-icon) {
    color: var(--interactive-accent);
}
.tab.done :global(.pf-icon) {
    color: var(--color-green);
}
.tab.on {
    color: var(--text-normal);
    background: var(--pf-card-bg);
    border-color: var(--pf-lane-border);
    box-shadow: var(--pf-card-shadow);
}
.tab-title {
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
}
.tab .n {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--text-faint);
}
.tab.over .n {
    color: var(--color-orange);
}
.tab.add {
    width: 32px;
    padding: 0;
    justify-content: center;
}
/* While a card is being dragged, the tabs are places to drop it */
.lane-tabs.dragging .tab:not(.add) {
    height: 38px;
    border-style: dashed;
    border-color: color-mix(in srgb, var(--interactive-accent) 40%, transparent);
}
.lane-tabs.dragging .tab.add {
    visibility: hidden;
}
.tab.drop {
    color: var(--interactive-accent);
    border-style: solid;
    border-color: var(--interactive-accent);
    background: color-mix(in srgb, var(--interactive-accent) 14%, transparent);
}
.tab.drop :global(.pf-icon),
.tab.drop .n {
    color: inherit;
}

.narrow .pf-lanes {
    gap: 10px;
    padding: 2px 12px 12px;
    scroll-padding: 0 12px;
    scroll-snap-type: x mandatory;
}
.narrow .pf-lanes.hidden {
    display: none;
}
.narrow .stats-slot {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding-bottom: 12px;
}
:global(body.pf-dragging) .narrow .pf-lanes {
    scroll-snap-type: none;
}
.narrow .pf-lanes > :global(.pf-lane) {
    width: calc(100% - 22px);
    scroll-snap-align: start;
}
.narrow .pf-lanes > :global(.pf-lane.collapsed) {
    width: 42px;
}
.narrow .new-lane,
.narrow .add-lane {
    width: calc(100% - 22px);
    scroll-snap-align: start;
}
.narrow .filter-note {
    margin: -6px 12px 8px;
}
</style>
