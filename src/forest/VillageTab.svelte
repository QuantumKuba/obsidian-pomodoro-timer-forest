<script lang="ts">
import { afterUpdate, createEventDispatcher, onDestroy, onMount } from 'svelte'
import { gamificationStore, pluginInstance, clockMinute, settings, charm, vitality, levelInfo, charter } from '../stores'
import { renderVillage, homesteadItemSprite, sceneLayout, tileAtPoint } from '../render/VillageScene'
import VillageLife from '../render/VillageLife'
import { SPECIES_SVGS, BUILDING_SVGS, BIOME_CONFIGS, ICONS, cropSvg } from '../assets/floraAssets'
import {
    getBuilding, getSpecies, getCrop, cropProgress, isRipePlot,
    CROPS, GARDEN_PLOT_ID, LAND_EXPANSIONS, BIOME_UNLOCK_LEVELS, TREE_MAX_LEVEL,
} from '../assets/floraCatalog'
import { perkText, saplingSellValue, TASK_WATERING_MINUTES } from '../services/Progression'
import { CHARTER_RANKS } from '../services/Charter'
import { getTreasure } from '../assets/treasureCatalog'
import { HEART_STAGES, heartStage } from '../services/HeartTree'
import HeartTreeCard from './HeartTreeCard.svelte'
import type { BiomeType, PlacedHomesteadItem, RewardEvent } from '../types/forest'

export let full = false

const dispatch = createEventDispatcher<{ market: void; journey: void }>()
const engine = pluginInstance?.forestEngine
const sceneId = `pfv${Math.random().toString(36).slice(2, 7)}`

let selectedId: string | null = null
let placingKey: string | null = null
let movingId: string | null = null

$: g = $gamificationStore
$: selected = g.homestead.find((i) => i.id === selectedId) || null
// The sky only needs to move every few minutes; re-rendering less keeps things calm
$: skySlot = Math.floor($clockMinute.getTime() / 300_000)
// Selection/placement highlights are NOT part of the scene markup: changing them
// must not rebuild the SVG (that would restart every animation). See afterUpdate.
// Villagers and hens walk around unless motion is switched off; then they are drawn standing
const calm = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
$: live = !$settings.lowFps && !calm
$: sceneHtml = renderVillage(g, {
    interactive: true,
    date: new Date(skySlot * 300_000),
    still: $settings.lowFps,
    idPrefix: sceneId,
    liveActors: live,
    pickups: true,
})

const life = new VillageLife()
let frame: HTMLElement
let lifeLayer: HTMLElement
let stashEl: HTMLElement | null = null

interface DragState {
    item: PlacedHomesteadItem
    originX: number
    originY: number
    pointerId: number
    startX: number
    startY: number
    frameX: number
    frameY: number
    isDragging: boolean
    isLifting: boolean
    overStash: boolean
    targetTile: { x: number; y: number } | null
    isValidTarget: boolean
    landing: boolean
    stashing: boolean
}

let drag: DragState | null = null
let suppressNextClick = false

function getItemSprite(item: PlacedHomesteadItem): string {
    if (item.itemType === 'building' && item.itemId === GARDEN_PLOT_ID) {
        return cropSvg(getCrop(item.cropId).id, cropProgress(item))
    }
    return homesteadItemSprite(item)
}

function playSound(type: 'pickup' | 'plant') {
    if (!$settings.forestSounds || !engine?.soundManager) return
    if (type === 'pickup') engine.soundManager.playPickup()
    else if (type === 'plant') engine.soundManager.playPlantSeed()
}

function getTileAtPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const under = document.elementFromPoint(clientX, clientY)
    const hitEl = under?.closest<SVGElement>('.pf-hit')
    if (hitEl && hitEl.dataset.x !== undefined && hitEl.dataset.y !== undefined) {
        return { x: Number(hitEl.dataset.x), y: Number(hitEl.dataset.y) }
    }
    if (!frame) return null
    const svg = frame.querySelector<SVGSVGElement>('svg.pf-scene')
    if (!svg) return null
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return null
    const svgPt = pt.matrixTransform(ctm.inverse())
    const L = sceneLayout(g.landSize)
    return tileAtPoint(L, svgPt.x, svgPt.y)
}

function updateDragTileHighlights() {
    if (!frame) return
    frame.querySelectorAll<SVGElement>('.pf-item').forEach((itemEl) => {
        const isSource = !!drag?.isDragging && itemEl.getAttribute('data-item') === drag.item.id
        itemEl.classList.toggle('pf-dragging-source', isSource)
    })
    frame.querySelectorAll<SVGElement>('.pf-hit').forEach((tile) => {
        const x = Number(tile.dataset.x)
        const y = Number(tile.dataset.y)
        const isTarget = !!drag?.isDragging && !drag.overStash && drag.targetTile && drag.targetTile.x === x && drag.targetTile.y === y
        const isValid = drag?.isValidTarget ?? false
        tile.classList.toggle('pf-drop-target', !!isTarget && isValid)
        tile.classList.toggle('pf-drop-invalid', !!isTarget && !isValid)
    })
}

function clearDragHighlights() {
    if (!frame) return
    frame.querySelectorAll<SVGElement>('.pf-item.pf-dragging-source').forEach((el) => {
        el.classList.remove('pf-dragging-source')
    })
    frame.querySelectorAll<SVGElement>('.pf-hit.pf-drop-target, .pf-hit.pf-drop-invalid').forEach((el) => {
        el.classList.remove('pf-drop-target', 'pf-drop-invalid')
    })
}

afterUpdate(() => {
    if (!frame) return
    if (live) life.sync(frame, lifeLayer, g, $settings.dailyGoal || 4)
    else life.clear()
    const occupied = new Set(g.homestead.map((i) => `${i.gridX},${i.gridY}`))
    const targeting = !!placingKey || !!movingId
    frame.querySelectorAll<SVGElement>('.pf-hit').forEach((tile) => {
        const x = Number(tile.dataset.x)
        const y = Number(tile.dataset.y)
        tile.classList.toggle('pf-selected', !!selected && selected.gridX === x && selected.gridY === y)
        tile.classList.toggle('pf-target', targeting && !occupied.has(`${x},${y}`))
    })
    if (drag?.isDragging) {
        updateDragTileHighlights()
    }
})

$: inventory = Object.entries(g.inventory)
    .filter(([, n]) => n > 0)
    .map(([key, count]) => {
        const [type, id] = key.split(':')
        const name = type === 'tree' ? getSpecies(id)?.name : getBuilding(id)?.name
        const svg = type === 'tree' ? SPECIES_SVGS[id] : BUILDING_SVGS[id]
        return { key, type, id, count, name: name || id, svg: svg || '', price: type === 'tree' ? saplingSellValue(id) : 0 }
    })
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'building' ? -1 : 1))

$: nextLand = LAND_EXPANSIONS.find((l) => l.size === g.landSize + 1)
$: freeTiles = g.landSize * g.landSize - g.homestead.filter((i) => i.gridX < g.landSize && i.gridY < g.landSize).length
$: placingName = placingKey ? inventory.find((i) => i.key === placingKey)?.name : ''

function itemName(item: PlacedHomesteadItem): string {
    return item.customName || (item.itemType === 'tree' ? getSpecies(item.itemId)?.name : getBuilding(item.itemId)?.name) || item.itemId
}

/** Sell one spare sapling (the whole stack with Shift) and let go of it if it was being placed. */
function sell(inv: { key: string; id: string; count: number }, e: MouseEvent) {
    const earned = engine?.sellSapling(inv.id, e.shiftKey ? inv.count : 1) ?? 0
    if (earned && placingKey === inv.key && !(($gamificationStore.inventory[inv.key] ?? 0) > 0)) placingKey = null
}

/** Pick ripe crops (all of them when no ids are given) and show what each plot gave. */
function harvest(ids?: string[]) {
    const picked = engine?.harvestCrops(ids) ?? []
    for (const crop of picked) {
        const plot = g.homestead.find((i) => i.id === crop.id)
        if (plot) life.pop({ x: plot.gridX, y: plot.gridY }, `+${crop.coins}`)
    }
    if (picked.length) life.cheer()
}

// The villagers celebrate the big moments with you
const CHEERS: Partial<Record<RewardEvent['kind'], string>> = {
    harvest: 'A new tree! Well done!',
    early: 'Task done. Nice work!',
    levelup: 'The village is growing!',
    chest: 'Ooh, what was in the chest?',
    quest: 'Quest done!',
    achievement: 'That calls for a celebration!',
    rank: 'A new chapter for the village!',
    request: 'Thank you, neighbour!',
    treasure: 'Ooh, what did you find?',
    heart: 'That tree of yours looks happy.',
}
const cheered = new Set<string>()
let watching = false
const stopWatching = engine?.rewardEvents.subscribe((events) => {
    for (const event of events) {
        if (cheered.has(event.id)) continue
        cheered.add(event.id)
        // Events from before this view opened were celebrated elsewhere; small things pass quietly
        if (watching && !event.minor && CHEERS[event.kind]) life.cheer(CHEERS[event.kind])
    }
})
watching = true

/** A find was clicked: it is picked up and rises from where it lay. */
function pickUp(el: Element) {
    const tile = { x: Number(el.getAttribute('data-px')), y: Number(el.getAttribute('data-py')) }
    for (const got of engine?.collectPickups([el.getAttribute('data-pickup') || '']) ?? []) {
        const t = getTreasure(got.itemId)
        if (t) life.sparkle(tile, t.iconSvg, t.name)
    }
}

function onSceneClick(e: MouseEvent) {
    if (suppressNextClick) {
        suppressNextClick = false
        return
    }
    const find = (e.target as Element).closest('[data-pickup]')
    if (find && !placingKey && !movingId) {
        pickUp(find)
        return
    }
    const actor = (e.target as Element).closest('[data-actor]')
    if (actor && !placingKey && !movingId) {
        life.poke(actor.getAttribute('data-actor') || '')
        return
    }
    const el = (e.target as Element).closest('[data-x]')
    if (!el || !engine) {
        cancelModes()
        selectedId = null
        return
    }
    const x = Number(el.getAttribute('data-x'))
    const y = Number(el.getAttribute('data-y'))
    const occupant = g.homestead.find((i) => i.gridX === x && i.gridY === y)

    if (placingKey) {
        if (occupant) {
            selectedId = occupant.id
            return
        }
        const key = placingKey
        if (engine.placeFromInventory(key, x, y)) {
            // Keep laying paths/brooks/saplings while there are more of the same
            if (!(($gamificationStore.inventory[key] ?? 0) > 0)) placingKey = null
            selectedId = null
        }
        return
    }
    if (movingId) {
        if (!occupant && engine.moveHomesteadItem(movingId, x, y)) {
            selectedId = movingId
            movingId = null
        }
        return
    }
    selectedId = occupant ? occupant.id : null
    // A ripe plot is picked with the same click that selects it
    if (occupant && isRipePlot(occupant)) harvest([occupant.id])
}

function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return
    if (placingKey || movingId) return

    const target = e.target as Element
    if (target.closest('[data-pickup]') || target.closest('[data-actor]') || target.closest('.pf-stash-target')) return

    let item: PlacedHomesteadItem | null = null
    const itemEl = target.closest('[data-item]')
    if (itemEl) {
        const id = itemEl.getAttribute('data-item')
        item = g.homestead.find((i) => i.id === id) || null
    }
    if (!item) {
        const tileEl = target.closest('[data-x]')
        if (tileEl) {
            const x = Number(tileEl.getAttribute('data-x'))
            const y = Number(tileEl.getAttribute('data-y'))
            item = g.homestead.find((i) => i.gridX === x && i.gridY === y) || null
        }
    }
    if (!item) return

    const rect = frame.getBoundingClientRect()
    drag = {
        item,
        originX: item.gridX,
        originY: item.gridY,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        frameX: e.clientX - rect.left,
        frameY: e.clientY - rect.top,
        isDragging: false,
        isLifting: false,
        overStash: false,
        targetTile: null,
        isValidTarget: false,
        landing: false,
        stashing: false,
    }
}

function onPointerMove(e: PointerEvent) {
    if (!drag || drag.pointerId !== e.pointerId) return
    if (drag.landing || drag.stashing) return

    const rect = frame.getBoundingClientRect()
    drag.frameX = e.clientX - rect.left
    drag.frameY = e.clientY - rect.top

    if (!drag.isDragging) {
        const dist = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY)
        if (dist >= 5) {
            drag.isDragging = true
            drag.isLifting = true
            try {
                frame.setPointerCapture(e.pointerId)
            } catch {}
            playSound('pickup')
            setTimeout(() => {
                if (drag) drag.isLifting = false
            }, 380)
        } else {
            return
        }
    }

    if (stashEl) {
        const sRect = stashEl.getBoundingClientRect()
        drag.overStash =
            e.clientX >= sRect.left - 16 &&
            e.clientX <= sRect.right + 16 &&
            e.clientY >= sRect.top - 16 &&
            e.clientY <= sRect.bottom + 16
    } else {
        drag.overStash = false
    }

    if (drag.overStash) {
        drag.targetTile = null
        drag.isValidTarget = false
    } else {
        const tile = getTileAtPoint(e.clientX, e.clientY)
        drag.targetTile = tile
        if (tile) {
            const isOrigin = tile.x === drag.originX && tile.y === drag.originY
            const isFree = !g.homestead.some((i) => i.id !== drag.item.id && i.gridX === tile.x && i.gridY === tile.y)
            drag.isValidTarget = isOrigin || isFree
        } else {
            drag.isValidTarget = false
        }
    }

    updateDragTileHighlights()
}

function onPointerUp(e: PointerEvent) {
    if (!drag || drag.pointerId !== e.pointerId) return

    try {
        frame.releasePointerCapture(e.pointerId)
    } catch {}

    if (!drag.isDragging) {
        drag = null
        return
    }

    suppressNextClick = true
    setTimeout(() => {
        suppressNextClick = false
    }, 150)

    const currentDrag = drag

    if (currentDrag.overStash) {
        currentDrag.stashing = true
        playSound('pickup')
        life.pop({ x: currentDrag.originX, y: currentDrag.originY }, 'Stowed 📦')
        setTimeout(() => {
            if (engine) engine.stowHomesteadItem(currentDrag.item.id)
            if (selectedId === currentDrag.item.id) selectedId = null
            drag = null
            clearDragHighlights()
        }, 240)
        return
    }

    if (currentDrag.targetTile && currentDrag.isValidTarget) {
        const { x, y } = currentDrag.targetTile
        if (x === currentDrag.originX && y === currentDrag.originY) {
            selectedId = currentDrag.item.id
            drag = null
            clearDragHighlights()
            return
        }
        if (engine && engine.moveHomesteadItem(currentDrag.item.id, x, y)) {
            selectedId = currentDrag.item.id
            playSound('plant')
            life.sparkle({ x, y }, getItemSprite(currentDrag.item), '✨')
            clearDragHighlights()
            drag = null
            return
        }
    }

    currentDrag.landing = true
    setTimeout(() => {
        drag = null
        clearDragHighlights()
    }, 220)
}

function onPointerCancel(e: PointerEvent) {
    if (drag && drag.pointerId === e.pointerId) {
        try {
            frame.releasePointerCapture(e.pointerId)
        } catch {}
        drag = null
        clearDragHighlights()
    }
}

function onStashClick(e: MouseEvent) {
    if (drag?.isDragging) return
    e.stopPropagation()
    const invEl = frame?.parentElement?.querySelector('.inventory')
    invEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

export function startPlacing(key: string) {
    movingId = null
    selectedId = null
    placingKey = placingKey === key ? null : key
}

function cancelModes() {
    placingKey = null
    movingId = null
}

function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
        if (drag) {
            try {
                frame.releasePointerCapture(drag.pointerId)
            } catch {}
            drag = null
            clearDragHighlights()
        }
        cancelModes()
        selectedId = null
    }
}

const BIOME_IDS = Object.keys(BIOME_UNLOCK_LEVELS) as BiomeType[]

function selectBiome(id: BiomeType) {
    engine?.selectBiome(id)
}

onMount(() => window.addEventListener('keydown', onKey))
onDestroy(() => {
    window.removeEventListener('keydown', onKey)
    stopWatching?.()
    life.destroy()
    clearDragHighlights()
})

$: upgrade = selected && engine ? engine.getUpgradeInfo(selected) : null
$: selBuilding = selected?.itemType === 'building' ? getBuilding(selected.itemId) : undefined
$: maxLevel = selected?.itemType === 'tree' ? TREE_MAX_LEVEL : selBuilding?.maxLevel ?? 1
$: plot = selected?.itemType === 'building' && selected.itemId === GARDEN_PLOT_ID ? selected : null
$: crop = plot ? getCrop(plot.cropId) : null
$: ripeCount = g.homestead.filter(isRipePlot).length
$: isHeart = !!selected && selected.itemType === 'tree' && g.heartTree?.itemId === selected.id
</script>

<div class="pf-village" class:full>
    <div class="village-head">
        <div class="biomes">
            {#each BIOME_IDS as id}
                {@const conf = BIOME_CONFIGS[id]}
                {@const unlocked = g.unlockedBiomes.includes(id)}
                <button
                    class="biome {id === g.activeBiome ? 'active' : ''}"
                    class:locked={!unlocked}
                    title={unlocked ? `${conf.name}: ${conf.description}` : `${conf.name} — unlocks at level ${BIOME_UNLOCK_LEVELS[id]}`}
                    on:click={() => selectBiome(id)}>
                    <span class="swatch biome-{id}"></span>{#if full}{conf.name}{/if}
                    {#if !unlocked}<span class="lock">🔒</span>{/if}
                </button>
            {/each}
        </div>
        <div class="village-stats">
            {#if ripeCount}
                <button class="harvest-all" title="Pick every ripe crop" on:click={() => harvest()}>🧺 Harvest {ripeCount}</button>
            {/if}
            <button
                class="charter-chip"
                title={$charter.chapter ? `Village Charter: ${$charter.done} of ${$charter.total} goals toward ${$charter.nextRankName}` : 'Village Charter: every chapter is signed'}
                on:click={() => dispatch('journey')}>📜 {$charter.rankName}{#if $charter.chapter}<span class="chip-prog">{$charter.done}/{$charter.total}</span>{/if}</button>
            <span title="Charm grows with every tree, building and upgrade">💐 {$charm} charm</span>
            <span title={$vitality.blurb}>🌿 {$vitality.label}</span>
        </div>
    </div>

    <div class="layout">
        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <div
            class="scene-frame"
            bind:this={frame}
            class:placing={placingKey || movingId}
            class:is-dragging={drag?.isDragging}
            on:click={onSceneClick}
            on:pointerdown={onPointerDown}
            on:pointermove={onPointerMove}
            on:pointerup={onPointerUp}
            on:pointercancel={onPointerCancel}
        >
            {@html sceneHtml}
            <div class="life-layer" bind:this={lifeLayer}></div>

            <!-- Cute Stash Icon in the Corner -->
            <div
                class="pf-stash-target"
                bind:this={stashEl}
                class:active={drag?.isDragging}
                class:hover={drag?.overStash}
                on:click={onStashClick}
                role="button"
                tabindex="0"
                title="Stash: drop a piece here to stow it back to inventory"
            >
                <div class="pf-stash-icon-wrap">
                    <svg class="pf-stash-svg" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <g class="pf-stash-chest">
                            <ellipse cx="18" cy="32" rx="14" ry="3.5" fill="rgba(0,0,0,0.18)"/>
                            <rect x="5" y="15" width="26" height="15" rx="3.5" fill="#8c5b36" stroke="#5a381e" stroke-width="1.2"/>
                            <line x1="5" y1="21" x2="31" y2="21" stroke="#5a381e" stroke-width="0.9" opacity="0.6"/>
                            <rect x="9" y="15" width="3" height="15" fill="#c99738"/>
                            <rect x="24" y="15" width="3" height="15" fill="#c99738"/>
                            <g class="pf-stash-lid">
                                <path d="M4 16C4 10 9 6.5 18 6.5C27 6.5 32 10 32 16H4Z" fill="#a46d42" stroke="#5a381e" stroke-width="1.2"/>
                                <rect x="9" y="7" width="3" height="9" fill="#c99738"/>
                                <rect x="24" y="7" width="3" height="9" fill="#c99738"/>
                                <path class="pf-stash-sprout" d="M18 6.5C18 3 22 2 24 3.5C24.5 5.5 21.5 6.5 18 6.5Z" fill="#78b948" stroke="#48782a" stroke-width="0.8"/>
                            </g>
                            <rect x="16" y="14" width="4" height="5.5" rx="1.2" fill="#ffe066" stroke="#b38600" stroke-width="0.8"/>
                            <circle cx="18" cy="16.5" r="0.9" fill="#664d00"/>
                        </g>
                    </svg>
                    <span class="pf-stash-sparkle">✨</span>
                </div>
                <div class="pf-stash-label">
                    {#if drag?.overStash}
                        <span class="pf-stash-text highlight">Stow here! ✨</span>
                    {:else if drag?.isDragging}
                        <span class="pf-stash-text ready">Drop to Stow 📦</span>
                    {:else}
                        <span class="pf-stash-text idle">Stash</span>
                    {/if}
                </div>
            </div>

            <!-- Floating Drag Preview with Bouncy Lift Animation -->
            {#if drag && drag.isDragging}
                <div
                    class="pf-drag-preview"
                    class:lifting={drag.isLifting}
                    class:stashing={drag.stashing}
                    class:landing={drag.landing}
                    class:over-stash={drag.overStash}
                    style="left: {drag.frameX}px; top: {drag.frameY}px;"
                >
                    <div class="pf-drag-shadow"></div>
                    <div class="pf-drag-item">
                        {@html getItemSprite(drag.item)}
                        {#if isRipePlot(drag.item)}
                            <span class="pf-drag-badge">🌾</span>
                        {:else if drag.item.level > 1}
                            <span class="pf-drag-badge stars">★{drag.item.level}</span>
                        {/if}
                    </div>
                </div>
            {/if}

            {#if placingKey || movingId}
                <div class="mode-banner">
                    <span>{placingKey ? `Tap an empty tile to place ${placingName}` : 'Tap an empty tile to move it there'}</span>
                    <button on:click|stopPropagation={cancelModes}>Done</button>
                </div>
            {/if}
        </div>

        <div class="side">
            {#if selected}
                <div class="inspector">
                    <div class="insp-head">
                        <div class="insp-art">{@html homesteadItemSprite(selected)}</div>
                        <div class="insp-info">
                            <h4>{itemName(selected)}</h4>
                            {#if maxLevel > 1}
                                <span class="stars">{'★'.repeat(selected.level)}<span class="dim">{'★'.repeat(Math.max(0, maxLevel - selected.level))}</span></span>
                            {/if}
                            {#if plot && crop}
                                {@const progress = cropProgress(plot)}
                                <p class="perk">
                                    {crop.icon} {crop.name} ·
                                    {progress >= 1 ? 'ready to harvest!' : `${Math.floor(plot.cropGrowth || 0)} of ${crop.growMinutes} focus minutes`}
                                </p>
                                <div class="crop-bar" class:ripe={progress >= 1}><div style="width:{Math.round(progress * 100)}%"></div></div>
                                <p class="perk next">Grows with every minute you focus. Each finished task waters it (+{TASK_WATERING_MINUTES}m). It never wilts.</p>
                            {:else if selBuilding?.charterRank}
                                <p class="perk">📜 Charter landmark, earned on becoming a {CHARTER_RANKS[selBuilding.charterRank]?.name}.</p>
                                {#if selBuilding.perk}<p class="perk">⚡ {perkText(selBuilding, selected.level)}</p>{/if}
                                {#if selBuilding.id === 'clock_tower'}<p class="perk next">It has struck {Math.floor(g.lifetimeStats.totalFocusMinutes / 60)} hours of your focus.</p>{/if}
                            {:else if selBuilding?.perk}
                                <p class="perk">⚡ {perkText(selBuilding, selected.level)}</p>
                                {#if !upgrade?.maxed}<p class="perk next">Next: {perkText(selBuilding, selected.level + 1)}</p>{/if}
                            {:else if selected.itemType === 'tree' && isHeart}
                                <p class="perk">♥ Your Heart Tree · {heartStage(g).name}</p>
                            {:else if selected.itemType === 'tree'}
                                <p class="perk">Grows fuller with care. Adds charm to your village.</p>
                            {:else}
                                <p class="perk">Adds charm to your village.</p>
                            {/if}
                        </div>
                    </div>
                    {#if isHeart}
                        <HeartTreeCard compact />
                    {/if}
                    {#if plot && crop}
                        <div class="crops">
                            {#each CROPS as c (c.id)}
                                {@const locked = $levelInfo.level < c.unlockLevel}
                                <button
                                    class="crop"
                                    class:active={c.id === crop.id}
                                    disabled={locked}
                                    title={locked
                                        ? `${c.name} unlock at level ${c.unlockLevel}`
                                        : `${c.name}: ${c.growMinutes} focus minutes for ${c.coins} coins and ${c.xp} XP. ${c.description}`}
                                    on:click={() => plot && engine?.plantCrop(plot.id, c.id)}>
                                    <span class="crop-icon">{locked ? '🔒' : c.icon}</span>
                                    <span class="crop-time">{locked ? `Lv ${c.unlockLevel}` : `${c.growMinutes}m`}</span>
                                </button>
                            {/each}
                        </div>
                    {/if}
                    <div class="insp-actions">
                        {#if plot && crop && cropProgress(plot) >= 1}
                            <button class="primary" on:click={() => plot && harvest([plot.id])}>
                                🧺 Harvest · {@html ICONS.coin}{crop.coins} +{crop.xp} XP
                            </button>
                        {:else if plot}
                            <!-- nothing to buy for a plot: it grows by itself -->
                        {:else if upgrade && !upgrade.maxed}
                            <button
                                class="primary"
                                disabled={g.sunlight < upgrade.sunlight || g.coins < upgrade.coins}
                                on:click={() => selected && engine?.upgradeHomesteadItem(selected.id)}>
                                ✨ {selected.itemType === 'tree' ? 'Nurture' : 'Upgrade'} · {@html ICONS.sunlight}{upgrade.sunlight} {@html ICONS.coin}{upgrade.coins}
                            </button>
                        {:else if upgrade?.maxed && maxLevel > 1}
                            <span class="maxed">Fully upgraded ✨</span>
                        {/if}
                        {#if selected.itemType === 'tree' && !isHeart}
                            <button
                                class="heart-pick"
                                title={g.heartTree
                                    ? 'Choose this tree instead. Its bond, stage and ornaments come along; nothing is lost.'
                                    : `Look after this tree a little each day. It grows with you and carries the ornaments you find (+${HEART_STAGES[0].sunlightPct}% Sunlight to start).`}
                                on:click={() => selected && engine?.chooseHeartTree(selected.id)}>♥ Make this my Heart Tree</button>
                        {/if}
                        <button on:click={() => { movingId = selected?.id ?? null; placingKey = null }}>↔ Move</button>
                        <button on:click={() => { if (selected) engine?.stowHomesteadItem(selected.id); selectedId = null }}>📦 Stow</button>
                    </div>
                </div>
            {/if}

            <div class="inventory">
                <div class="inv-head">
                    <span>Inventory</span>
                    <span class="muted">{freeTiles} free tile{freeTiles === 1 ? '' : 's'}</span>
                </div>
                {#if inventory.length === 0}
                    <p class="empty">
                        Nothing to place yet. Every finished focus session gives you a sapling of the tree you grew, and the
                        <!-- svelte-ignore a11y-invalid-attribute -->
                        <a href="#" on:click|preventDefault={() => dispatch('market')}>market</a> sells buildings.
                    </p>
                {:else}
                    <div class="inv-grid">
                        {#each inventory as inv (inv.key)}
                            <div class="inv-cell">
                                <button class="inv-item {placingKey === inv.key ? 'active' : ''}" title="Place {inv.name}" on:click={() => startPlacing(inv.key)}>
                                    <span class="inv-art">{@html inv.svg}</span>
                                    <span class="inv-count">×{inv.count}</span>
                                    <span class="inv-name">{inv.name}</span>
                                </button>
                                {#if inv.type === 'tree'}
                                    <button
                                        class="inv-sell"
                                        title="Sell a spare {inv.name} sapling for {inv.price} coin{inv.price === 1 ? '' : 's'} (Shift-click sells all {inv.count})"
                                        on:click={(e) => sell(inv, e)}>
                                        Sell {@html ICONS.coin}{inv.price}
                                    </button>
                                {/if}
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>

            {#if nextLand}
                <div class="land">
                    <span>🧭 Expand to {nextLand.size}×{nextLand.size}</span>
                    {#if $levelInfo.level < nextLand.unlockLevel}
                        <span class="muted">Level {nextLand.unlockLevel}</span>
                    {:else}
                        <button
                            disabled={g.sunlight < nextLand.sunlightCost || g.coins < nextLand.coinsCost}
                            on:click={() => engine?.expandLand()}>{@html ICONS.sunlight}{nextLand.sunlightCost} {@html ICONS.coin}{nextLand.coinsCost}</button>
                    {/if}
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
.pf-village {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.village-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}
.biomes {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
}
.biome {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 7px;
    font-size: 0.72rem;
    border-radius: 99px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    cursor: pointer;
    position: relative;
}
.biome.active {
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 1px var(--interactive-accent);
}
.biome.locked { opacity: 0.55; }
.lock { font-size: 0.6rem; }
.swatch {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 1px solid rgba(0, 0, 0, 0.2);
}
.biome-meadow { background: linear-gradient(135deg, #93c96d, #5f9e45); }
.biome-sakura_garden { background: linear-gradient(135deg, #f7b6d0, #b8d88e); }
.biome-autumn_valley { background: linear-gradient(135deg, #f0a24a, #c6743f); }
.biome-alpine_frost { background: linear-gradient(135deg, #ffffff, #a4bccd); }
.biome-twilight_moss { background: linear-gradient(135deg, #7df9ff, #3f4d8f); }
.village-stats {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    font-size: 0.72rem;
    color: var(--text-muted);
}
.charter-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: auto;
    padding: 2px 8px;
    font-size: 0.72rem;
    font-weight: 600;
    border-radius: 99px;
    color: var(--text-normal);
    background: var(--background-secondary);
    border: 1px solid rgba(201, 162, 90, 0.55);
    box-shadow: none;
    cursor: pointer;
}
.charter-chip:hover { border-color: #c9a25a; }
.chip-prog { color: var(--text-muted); font-weight: 400; font-variant-numeric: tabular-nums; }
.layout {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.full .layout {
    flex-direction: row;
    align-items: flex-start;
}
.full .scene-frame {
    flex: 1 1 auto;
    min-width: 0;
}
.full .side {
    width: 300px;
    flex-shrink: 0;
}
.scene-frame {
    position: relative;
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid var(--background-modifier-border);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04), 0 8px 24px rgba(0, 0, 0, 0.12);
    touch-action: none;
}
.scene-frame.placing { box-shadow: 0 0 0 2px var(--interactive-accent); }
.scene-frame.is-dragging { cursor: grabbing !important; user-select: none; }
.scene-frame.is-dragging :global(.pf-hit),
.scene-frame.is-dragging :global(.pf-item) { cursor: grabbing !important; }

/* ---- Corner Stash Target ---- */
.pf-stash-target {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 15;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 5px 10px 5px 7px;
    border-radius: 999px;
    background: rgba(255, 253, 246, 0.88);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1.5px solid rgba(198, 156, 88, 0.45);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.8);
    cursor: pointer;
    user-select: none;
    transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
    transform-origin: center right;
}

.pf-stash-target:hover {
    border-color: #c9a25a;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.16);
    transform: translateY(-1px) scale(1.03);
}

.pf-stash-target.active {
    background: #fffdf2;
    border-color: #e5b342;
    box-shadow: 0 0 0 2px rgba(229, 179, 66, 0.3), 0 8px 20px rgba(212, 160, 48, 0.25);
    transform: scale(1.06);
    animation: pf-stash-gentle-pulse 2s ease-in-out infinite;
}

.pf-stash-target.hover {
    background: #fff7d6;
    border-color: #f59e0b;
    box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.4), 0 10px 25px rgba(245, 158, 11, 0.4);
    transform: scale(1.18) rotate(-3deg);
    animation: pf-stash-wobble 0.5s ease-in-out infinite alternate;
}

.pf-stash-icon-wrap {
    position: relative;
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.pf-stash-svg {
    width: 100%;
    height: 100%;
    display: block;
    filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.2));
    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.pf-stash-lid {
    transform-origin: 4px 16px;
    transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.pf-stash-target:hover .pf-stash-lid,
.pf-stash-target.active .pf-stash-lid {
    transform: rotate(-10deg);
}

.pf-stash-target.hover .pf-stash-lid {
    transform: rotate(-28deg);
}

.pf-stash-sparkle {
    position: absolute;
    top: -6px;
    right: -6px;
    font-size: 0.75rem;
    opacity: 0;
    pointer-events: none;
    transform: scale(0.5);
    transition: all 0.2s ease;
}

.pf-stash-target.hover .pf-stash-sparkle {
    opacity: 1;
    transform: scale(1.2) translateY(-2px);
    animation: pf-sparkle-float 0.8s ease-in-out infinite alternate;
}

.pf-stash-label {
    display: flex;
    align-items: center;
    font-size: 0.75rem;
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
}

.pf-stash-text.idle {
    color: #6d4c1b;
}

.pf-stash-text.ready {
    color: #925805;
    animation: pf-text-pulse 1.2s ease-in-out infinite alternate;
}

.pf-stash-text.highlight {
    color: #b45309;
    font-size: 0.78rem;
    font-weight: 800;
}

@keyframes pf-stash-gentle-pulse {
    0%, 100% { transform: scale(1.06); }
    50% { transform: scale(1.09); }
}

@keyframes pf-stash-wobble {
    0% { transform: scale(1.18) rotate(-4deg); }
    100% { transform: scale(1.22) rotate(2deg); }
}

@keyframes pf-sparkle-float {
    0% { transform: scale(1.1) translateY(0); }
    100% { transform: scale(1.3) translateY(-4px); }
}

@keyframes pf-text-pulse {
    0% { opacity: 0.8; }
    100% { opacity: 1; }
}

/* ---- Drag Preview Floating Piece & Bouncy Lift ---- */
.pf-drag-preview {
    position: absolute;
    pointer-events: none;
    z-index: 60;
    transform: translate(-50%, -75%);
    will-change: left, top, transform;
    display: flex;
    flex-direction: column;
    align-items: center;
}

.pf-drag-shadow {
    position: absolute;
    bottom: -2px;
    left: 50%;
    width: 48px;
    height: 16px;
    margin-left: -24px;
    border-radius: 50%;
    background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0) 70%);
    opacity: 0.35;
    transform: scale(0.85);
    transition: transform 0.2s ease, opacity 0.2s ease;
}

.pf-drag-item {
    position: relative;
    width: 68px;
    height: 68px;
    display: flex;
    align-items: center;
    justify-content: center;
    transform-origin: 50% 82%;
    animation: pf-drag-float 2.4s ease-in-out infinite alternate;
}

.pf-drag-item :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
    filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.32));
}

.pf-drag-badge {
    position: absolute;
    top: 2px;
    right: 2px;
    padding: 1px 5px;
    font-size: 0.65rem;
    font-weight: 800;
    border-radius: 99px;
    background: #ffc107;
    color: #4a2d00;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.pf-drag-preview.lifting .pf-drag-item {
    animation: pf-lift-bounce 0.42s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

.pf-drag-preview.lifting .pf-drag-shadow {
    animation: pf-shadow-lift 0.42s ease-out forwards;
}

.pf-drag-preview.over-stash .pf-drag-item {
    transform: scale(0.88) translateY(-10px) rotate(6deg);
    filter: brightness(1.15) drop-shadow(0 0 10px rgba(255, 215, 0, 0.8));
    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.pf-drag-preview.stashing .pf-drag-item {
    transform: scale(0.12) translateY(24px) rotate(360deg);
    opacity: 0;
    transition: all 0.24s cubic-bezier(0.55, 0, 0.8, 0.5);
}

.pf-drag-preview.landing .pf-drag-item {
    animation: pf-drop-land 0.26s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

@keyframes pf-lift-bounce {
    0% {
        transform: scale(0.92) translateY(6px);
    }
    30% {
        transform: scale(1.22, 0.82) translateY(2px);
    }
    65% {
        transform: scale(0.92, 1.18) translateY(-28px) rotate(-3deg);
    }
    85% {
        transform: scale(1.08, 0.95) translateY(-14px) rotate(2deg);
    }
    100% {
        transform: scale(1.05) translateY(-18px) rotate(0deg);
    }
}

@keyframes pf-drag-float {
    0% {
        transform: scale(1.05) translateY(-18px) rotate(-1.5deg);
    }
    50% {
        transform: scale(1.08) translateY(-24px) rotate(1.5deg);
    }
    100% {
        transform: scale(1.05) translateY(-18px) rotate(-1.5deg);
    }
}

@keyframes pf-shadow-lift {
    0% { transform: scale(1.1); opacity: 0.6; }
    30% { transform: scale(1.2); opacity: 0.7; }
    100% { transform: scale(0.85); opacity: 0.35; }
}

@keyframes pf-drop-land {
    0% {
        transform: scale(1.05) translateY(-18px);
    }
    50% {
        transform: scale(1.18, 0.82) translateY(4px);
    }
    80% {
        transform: scale(0.96, 1.04) translateY(-2px);
    }
    100% {
        transform: scale(1) translateY(0);
    }
}

@media (prefers-reduced-motion: reduce) {
    .pf-drag-item,
    .pf-drag-preview.lifting .pf-drag-item,
    .pf-stash-target.active,
    .pf-stash-target.hover {
        animation: none !important;
        transform: none !important;
    }
}
.scene-frame.placing { box-shadow: 0 0 0 2px var(--interactive-accent); }
/* While placing or moving, clicks go to the tiles, not to whoever stands on them */
.scene-frame.placing :global(.pf-actor),
.scene-frame.placing :global(.pf-pickup) { pointer-events: none; }
.life-layer {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
}
.life-layer :global(.pf-bubble) {
    position: absolute;
    left: 0;
    top: 0;
    max-width: 150px;
    padding: 4px 9px;
    border-radius: 10px;
    font-size: 0.72rem;
    line-height: 1.25;
    text-align: center;
    color: #3a2c1a;
    background: #fffdf6;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.28);
    animation: pf-bubble-in 0.18s ease-out;
}
.life-layer :global(.pf-bubble)::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: -4px;
    width: 8px;
    height: 8px;
    margin-left: -4px;
    background: inherit;
    transform: rotate(45deg);
}
.life-layer :global(.pf-pop) {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 0.85rem;
    font-weight: 800;
    color: #fff;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
    transform: translate(-50%, -100%);
    animation: pf-pop-rise 1.4s ease-out forwards;
}
.life-layer :global(.pf-find) {
    font-size: 0.75rem;
    font-weight: 700;
    color: #fffbe6;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.75);
    animation-duration: 1.6s;
}
.life-layer :global(.pf-find-art) {
    width: 22px;
    height: 22px;
    filter: drop-shadow(0 0 4px rgba(255, 236, 170, 0.9));
}
.life-layer :global(.pf-find-art svg) { width: 100%; height: 100%; display: block; }
.life-layer :global(.pf-pop-coin) {
    width: 0.8em;
    height: 0.8em;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #fff1b8, #ffc94a 55%, #e19b16);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}
@keyframes -global-pf-bubble-in {
    from { opacity: 0; scale: 0.7; }
    to { opacity: 1; scale: 1; }
}
@keyframes -global-pf-pop-rise {
    0% { opacity: 0; translate: 0 6px; }
    15% { opacity: 1; }
    70% { opacity: 1; }
    100% { opacity: 0; translate: 0 -34px; }
}
.harvest-all {
    height: auto;
    padding: 2px 9px;
    font-size: 0.72rem;
    font-weight: 700;
    border-radius: 99px;
    color: #4a2d00;
    background: #ffc94a;
    cursor: pointer;
}
.crop-bar {
    height: 5px;
    margin-top: 5px;
    border-radius: 9px;
    overflow: hidden;
    background: var(--background-modifier-border);
}
.crop-bar div {
    height: 100%;
    border-radius: 9px;
    background: linear-gradient(90deg, #8bc34a, #5a9e3a);
    transition: width 0.4s;
}
.crop-bar.ripe div { background: linear-gradient(90deg, #ffd54f, #ffb300); }
.crops {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    margin-top: 10px;
}
.crop {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    height: auto;
    padding: 5px 2px 4px;
    border-radius: 9px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    cursor: pointer;
}
.crop.active { border-color: var(--interactive-accent); box-shadow: 0 0 0 1px var(--interactive-accent); }
.crop:disabled { opacity: 0.5; cursor: default; }
.crop-icon { font-size: 1.05rem; line-height: 1.2; }
.crop-time { font-size: 0.62rem; color: var(--text-muted); }
.mode-banner {
    position: absolute;
    left: 8px;
    right: 8px;
    bottom: 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 10px;
    font-size: 0.75rem;
    background: rgba(20, 24, 22, 0.78);
    color: #fff;
    backdrop-filter: blur(4px);
}
.mode-banner button {
    font-size: 0.72rem;
    padding: 2px 10px;
}
.side {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.inspector, .inventory, .land {
    border-radius: 12px;
    padding: 10px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
}
.inspector { border-color: var(--interactive-accent); }
.insp-head {
    display: flex;
    gap: 10px;
}
.insp-art {
    width: 64px;
    height: 64px;
    flex-shrink: 0;
}
.insp-art :global(svg) { width: 100%; height: 100%; }
.insp-info h4 { margin: 0 0 2px; font-size: 0.9rem; }
.stars { color: #ffc107; font-size: 0.8rem; letter-spacing: 1px; }
.stars .dim { color: var(--background-modifier-border); }
.perk { margin: 4px 0 0; font-size: 0.72rem; color: #e39b2d; font-weight: 600; }
.perk.next { color: var(--text-muted); font-weight: 400; }
.insp-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
}
.insp-actions button { font-size: 0.74rem; padding: 4px 9px; }
.insp-actions .primary {
    flex: 1 1 100%;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
}
.insp-actions .primary:disabled { opacity: 0.5; }
.maxed { flex: 1 1 100%; font-size: 0.75rem; color: #ffb300; font-weight: 700; }
.insp-actions .heart-pick {
    flex: 1 1 100%;
    color: #4f7f37;
    border: 1px solid rgba(122, 170, 96, 0.6);
    background: rgba(140, 200, 103, 0.1);
}
.inv-head {
    display: flex;
    justify-content: space-between;
    font-size: 0.78rem;
    font-weight: 700;
    margin-bottom: 8px;
}
.muted { color: var(--text-muted); font-weight: 400; font-size: 0.72rem; }
.empty { margin: 0; font-size: 0.74rem; color: var(--text-muted); line-height: 1.4; }
.inv-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
    gap: 6px;
}
.inv-cell { display: flex; flex-direction: column; gap: 3px; }
.inv-sell {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    height: auto;
    padding: 2px 4px;
    font-size: 0.62rem;
    font-weight: 700;
    border-radius: 8px;
    cursor: pointer;
}
.inv-sell :global(svg) { width: 11px; height: 11px; }
.inv-item {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    height: auto;
    padding: 6px 4px 4px;
    border-radius: 10px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    cursor: pointer;
}
.inv-item:hover { border-color: var(--interactive-accent); transform: translateY(-1px); }
.inv-item.active { border-color: var(--interactive-accent); box-shadow: 0 0 0 2px var(--interactive-accent); }
.inv-art { width: 38px; height: 38px; }
.inv-art :global(svg) { width: 100%; height: 100%; }
.inv-count {
    position: absolute;
    top: 3px;
    right: 5px;
    font-size: 0.65rem;
    font-weight: 800;
    color: var(--text-muted);
}
.inv-name {
    font-size: 0.62rem;
    color: var(--text-muted);
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.land {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.75rem;
}
.land button { font-size: 0.72rem; padding: 3px 8px; }
.insp-actions .primary :global(svg), .land button :global(svg) { width: 13px; height: 13px; vertical-align: -2px; }
</style>
