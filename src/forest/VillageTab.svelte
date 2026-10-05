<script lang="ts">
import { afterUpdate, createEventDispatcher, onDestroy, onMount } from 'svelte'
import { gamificationStore, pluginInstance, clockMinute, settings, charm, vitality, levelInfo } from '../stores'
import { renderVillage, homesteadItemSprite } from '../render/VillageScene'
import VillageLife from '../render/VillageLife'
import { SPECIES_SVGS, BUILDING_SVGS, BIOME_CONFIGS, ICONS } from '../assets/floraAssets'
import {
    getBuilding, getSpecies, getCrop, cropProgress, isRipePlot,
    CROPS, GARDEN_PLOT_ID, LAND_EXPANSIONS, BIOME_UNLOCK_LEVELS, TREE_MAX_LEVEL,
} from '../assets/floraCatalog'
import { perkText, TASK_WATERING_MINUTES } from '../services/Progression'
import type { BiomeType, PlacedHomesteadItem, RewardEvent } from '../types/forest'

export let full = false

const dispatch = createEventDispatcher<{ market: void }>()
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
})

const life = new VillageLife()
let frame: HTMLElement
let lifeLayer: HTMLElement
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
})

$: inventory = Object.entries(g.inventory)
    .filter(([, n]) => n > 0)
    .map(([key, count]) => {
        const [type, id] = key.split(':')
        const name = type === 'tree' ? getSpecies(id)?.name : getBuilding(id)?.name
        const svg = type === 'tree' ? SPECIES_SVGS[id] : BUILDING_SVGS[id]
        return { key, type, id, count, name: name || id, svg: svg || '' }
    })
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'building' ? -1 : 1))

$: nextLand = LAND_EXPANSIONS.find((l) => l.size === g.landSize + 1)
$: freeTiles = g.landSize * g.landSize - g.homestead.filter((i) => i.gridX < g.landSize && i.gridY < g.landSize).length
$: placingName = placingKey ? inventory.find((i) => i.key === placingKey)?.name : ''

function itemName(item: PlacedHomesteadItem): string {
    return item.customName || (item.itemType === 'tree' ? getSpecies(item.itemId)?.name : getBuilding(item.itemId)?.name) || item.itemId
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
}
const cheered = new Set<string>()
let watching = false
const stopWatching = engine?.rewardEvents.subscribe((events) => {
    for (const event of events) {
        if (cheered.has(event.id)) continue
        cheered.add(event.id)
        // Events from before this view opened were celebrated elsewhere
        if (watching && CHEERS[event.kind]) life.cheer(CHEERS[event.kind])
    }
})
watching = true

function onSceneClick(e: MouseEvent) {
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
})

$: upgrade = selected && engine ? engine.getUpgradeInfo(selected) : null
$: selBuilding = selected?.itemType === 'building' ? getBuilding(selected.itemId) : undefined
$: maxLevel = selected?.itemType === 'tree' ? TREE_MAX_LEVEL : selBuilding?.maxLevel ?? 1
$: plot = selected?.itemType === 'building' && selected.itemId === GARDEN_PLOT_ID ? selected : null
$: crop = plot ? getCrop(plot.cropId) : null
$: ripeCount = g.homestead.filter(isRipePlot).length
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
            <span title="Charm grows with every tree, building and upgrade">💐 {$charm} charm</span>
            <span title={$vitality.blurb}>🌿 {$vitality.label}</span>
        </div>
    </div>

    <div class="layout">
        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <div class="scene-frame" bind:this={frame} class:placing={placingKey || movingId} on:click={onSceneClick}>
            {@html sceneHtml}
            <div class="life-layer" bind:this={lifeLayer}></div>
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
                            {:else if selBuilding?.perk}
                                <p class="perk">⚡ {perkText(selBuilding, selected.level)}</p>
                                {#if !upgrade?.maxed}<p class="perk next">Next: {perkText(selBuilding, selected.level + 1)}</p>{/if}
                            {:else if selected.itemType === 'tree'}
                                <p class="perk">Grows fuller with care. Adds charm to your village.</p>
                            {:else}
                                <p class="perk">Adds charm to your village.</p>
                            {/if}
                        </div>
                    </div>
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
                            <button class="inv-item {placingKey === inv.key ? 'active' : ''}" title="Place {inv.name}" on:click={() => startPlacing(inv.key)}>
                                <span class="inv-art">{@html inv.svg}</span>
                                <span class="inv-count">×{inv.count}</span>
                                <span class="inv-name">{inv.name}</span>
                            </button>
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
    gap: 10px;
    font-size: 0.72rem;
    color: var(--text-muted);
}
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
}
.scene-frame.placing { box-shadow: 0 0 0 2px var(--interactive-accent); }
/* While placing or moving, clicks go to the tiles, not to whoever stands on them */
.scene-frame.placing :global(.pf-actor) { pointer-events: none; }
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
