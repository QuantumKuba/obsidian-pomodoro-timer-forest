<script lang="ts">
import { createEventDispatcher, onMount } from 'svelte'
import { gamificationStore, pluginInstance, clockMinute, viewedIsland, levelInfo, settings } from '../stores'
import { renderArchipelago, islandIconSvg } from '../render/ArchipelagoMap'
import { BIOME_CONFIGS, ICONS } from '../assets/floraAssets'
import { formatMinutes, xpForLevel } from '../services/Progression'
import {
    ISLAND_LAND_LEVELS, ISLAND_MAX_LAND, ISLAND_SIGHT_LEVEL,
    bridgeProgress, focusHowTo, focusLabel, frontier, getIsland, islandBoonPct, islandLandSize, islandName, isReached, itemsOn,
    masteryProgress, masteryTitle, nextLibraryMilestone, reachReward,
    type FocusSuggestion,
} from '../services/Islands'
import type { IslandFocus } from '../types/forest'

export let full = false

const dispatch = createEventDispatcher<{ visit: void }>()
const engine = pluginInstance?.forestEngine
const mapId = `pfm${Math.random().toString(36).slice(2, 7)}`

/** An island id, or `home`. */
let selectedId: string | null = null
let suggestions: FocusSuggestion[] = []
let index: { tags: string[]; folders: string[] } = { tags: [], folders: [] }

type Kind = IslandFocus['kind']
let kind: Kind = 'tag'
let value = ''
let rechart = false
let renaming = false
let nameDraft = ''

$: g = $gamificationStore
$: islands = g.islands || []
$: horizon = frontier(g)
$: if (selectedId === null || (selectedId !== 'home' && !getIsland(g, selectedId))) selectedId = horizon?.id ?? islands[islands.length - 1]?.id ?? 'home'
$: island = selectedId && selectedId !== 'home' ? getIsland(g, selectedId) ?? null : null
$: reached = !!island && isReached(island)
$: skySlot = Math.floor($clockMinute.getTime() / 300_000)
$: mapHtml = renderArchipelago(g, { selected: selectedId, date: new Date(skySlot * 300_000), idPrefix: mapId })
$: bridge = island ? bridgeProgress(island) : null
$: mastery = island ? masteryProgress(island.minutes) : null
$: nextLand = island ? ISLAND_LAND_LEVELS.find((l) => l > island.level) : undefined
$: showForm = !!island && (!island.focus || rechart)
$: reachedCount = islands.filter(isReached).length
$: openNote = pluginInstance?.app.workspace?.getActiveFile?.() ?? null

function refresh() {
    engine?.refreshIslandLibraries()
    suggestions = engine?.suggestIslandFocus() ?? []
    index = engine?.vaultIndex() ?? { tags: [], folders: [] }
}
onMount(refresh)

function select(id: string) {
    selectedId = id
    rechart = false
    renaming = false
    value = ''
}

function onMapClick(e: MouseEvent) {
    const el = (e.target as Element).closest('[data-island]')
    if (el) select(el.getAttribute('data-island') || 'home')
}

function chart(focus: IslandFocus) {
    if (!island || !engine?.chartIsland(island.id, focus)) return
    rechart = false
    value = ''
    refresh()
}

function chartTyped() {
    if (kind === 'any') chart({ kind: 'any' })
    else if (value.trim()) chart({ kind, value: value.trim() })
}

function visit(id: string | null) {
    viewedIsland.set(id)
    dispatch('visit')
}

function startRename() {
    if (!island) return
    nameDraft = islandName(island)
    renaming = true
}

function saveName() {
    if (island) engine?.renameIsland(island.id, nameDraft)
    renaming = false
}

const KINDS: { id: Kind; label: string; hint: string }[] = [
    { id: 'tag', label: 'A tag', hint: 'Sessions on tasks and notes that carry it.' },
    { id: 'folder', label: 'A folder', hint: 'Sessions on notes inside it.' },
    { id: 'note', label: 'A hub note', hint: 'Sessions on the note, or on notes that link to it.' },
    { id: 'any', label: 'Any focus', hint: 'Everything counts, at half pace.' },
]
const focusIcon = (focus: IslandFocus | null) => (!focus ? '❔' : focus.kind === 'tag' ? '🏷️' : focus.kind === 'folder' ? '📁' : focus.kind === 'note' ? '📝' : '🌊')
const BIOME_SWATCH: Record<string, string> = {
    meadow: '#86bf62', sakura_garden: '#f3a9c6', autumn_valley: '#d8963f', alpine_frost: '#c9d9e6', twilight_moss: '#5361b0',
    coral_lagoon: '#ecd49c', ember_highlands: '#8a4c3f', jade_marsh: '#55a288',
}
const sessionsLeft = (minutes: number) => Math.max(1, Math.ceil(minutes / Math.max(1, $settings.workLen || 25)))
</script>

<div class="pf-isles" class:full>
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="map" on:click={onMapClick}>
        {@html mapHtml}
        <div class="map-stats">
            <span title="Islands reached by a finished bridge">🏝️ {reachedCount}</span>
            <span title="Focus laid into bridges and island mastery">🪵 {formatMinutes(g.lifetimeStats.islandMinutes || 0)}</span>
        </div>
    </div>

    <div class="side">
        {#if !islands.length}
            <section class="card">
                <span class="eyebrow">The archipelago</span>
                <h4>Nothing on the horizon yet</h4>
                <p class="body">
                    At village level {ISLAND_SIGHT_LEVEL} the first island comes into view. You decide what it stands for: a tag, a folder or a
                    note in this vault. Focusing on that is what builds the bridge.
                </p>
                <div class="bar"><div class="fill" style="width:{Math.round(Math.min(1, g.xp / xpForLevel(ISLAND_SIGHT_LEVEL)) * 100)}%"></div></div>
                <span class="muted">Level {$levelInfo.level} · {Math.max(0, xpForLevel(ISLAND_SIGHT_LEVEL) - g.xp)} XP to go</span>
            </section>
        {:else if !island}
            <section class="card">
                <div class="head">
                    <span class="art">{@html islandIconSvg(g.activeBiome)}</span>
                    <div class="title">
                        <span class="eyebrow">Home village</span>
                        <h4>{BIOME_CONFIGS[g.activeBiome]?.name ?? 'Home'}</h4>
                    </div>
                </div>
                <p class="body">Where it all started. {g.landSize}×{g.landSize} of land, {itemsOn(g, null).length} things standing on it.</p>
                <div class="actions"><button class="primary" on:click={() => visit(null)}>Go home</button></div>
            </section>
        {:else}
            <section class="card" class:far={!reached}>
                <div class="head">
                    <span class="art">{@html islandIconSvg(island.biome)}</span>
                    <div class="title">
                        <span class="eyebrow">{reached ? `Reached ${island.reachedOn}` : island.focus ? 'Bridge under way' : 'Land sighted'} · {BIOME_CONFIGS[island.biome]?.name ?? island.biome}</span>
                        {#if renaming}
                            <form class="rename" on:submit|preventDefault={saveName}>
                                <!-- svelte-ignore a11y-autofocus -->
                                <input type="text" bind:value={nameDraft} maxlength="40" autofocus on:blur={saveName} />
                            </form>
                        {:else}
                            <h4>
                                {islandName(island)}
                                {#if island.focus}<button class="link" title="Rename this island" on:click={startRename}>✎</button>{/if}
                            </h4>
                        {/if}
                    </div>
                </div>

                {#if island.focus && !showForm}
                    <div class="focus-chip" title={focusHowTo(island.focus)}>
                        <span>{focusIcon(island.focus)}</span>
                        <strong>{focusLabel(island.focus)}</strong>
                        <button class="link" on:click={() => { rechart = true; kind = island?.focus?.kind ?? 'tag'; value = '' }}>Change</button>
                    </div>
                {/if}

                {#if showForm}
                    <p class="body">
                        {#if island.focus}
                            Point this island at something else. Everything built so far is kept.
                        {:else}
                            Decide what this island stands for. Its bridge is built only by focus on that, and afterwards the island keeps growing with it.
                        {/if}
                    </p>
                    {#if suggestions.length}
                        <span class="eyebrow">From your vault</span>
                        <div class="suggestions">
                            {#each suggestions as s (s.label + s.focus.kind)}
                                <button class="suggestion" on:click={() => chart(s.focus)}>
                                    <span class="s-icon">{focusIcon(s.focus)}</span>
                                    <span class="s-body">
                                        <strong>{s.label}</strong>
                                        <span class="muted">{[s.minutes ? `${formatMinutes(s.minutes)} of focus lately` : '', s.notes ? `${s.notes} note${s.notes === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}</span>
                                    </span>
                                </button>
                            {/each}
                        </div>
                    {/if}
                    <span class="eyebrow">Or choose</span>
                    <div class="kinds">
                        {#each KINDS as k}
                            <button class:active={kind === k.id} title={k.hint} on:click={() => { kind = k.id; value = '' }}>{k.label}</button>
                        {/each}
                    </div>
                    <form class="chart" on:submit|preventDefault={chartTyped}>
                        {#if kind === 'tag'}
                            <input type="text" placeholder="#study" bind:value list="{mapId}-tags" />
                            <datalist id="{mapId}-tags">{#each index.tags as t}<option value={t}></option>{/each}</datalist>
                        {:else if kind === 'folder'}
                            <input type="text" placeholder="Projects/Thesis" bind:value list="{mapId}-folders" />
                            <datalist id="{mapId}-folders">{#each index.folders as f}<option value={f}></option>{/each}</datalist>
                        {:else if kind === 'note'}
                            <input type="text" placeholder="Maps/Health.md" bind:value />
                        {/if}
                        <button class="primary" type="submit" disabled={kind !== 'any' && !value.trim()}>Chart it</button>
                    </form>
                    {#if kind === 'note' && openNote}
                        <button class="link left" on:click={() => (value = openNote?.path ?? '')}>Use the note that is open: {openNote.basename}</button>
                    {/if}
                    <span class="muted">{KINDS.find((k) => k.id === kind)?.hint}</span>
                    {#if rechart}<button class="link left" on:click={() => (rechart = false)}>Keep it as it is</button>{/if}
                {:else if !reached && bridge}
                    <div class="meter">
                        <div class="meter-head"><span>🪵 Bridge</span><span class="num">{Math.floor(bridge.laid)} / {bridge.target} min</span></div>
                        <div class="bar planks"><div class="fill" style="width:{Math.round(bridge.ratio * 100)}%"></div></div>
                        <span class="muted">About {sessionsLeft(bridge.target - bridge.laid)} more session{sessionsLeft(bridge.target - bridge.laid) === 1 ? '' : 's'}. Finished tasks lay a plank too.</span>
                    </div>
                    <p class="hint">{focusHowTo(island.focus)}</p>
                    <div class="reward">
                        <span class="eyebrow">On landing</span>
                        <span class="r-sub">
                            {islandLandSize(0)}×{islandLandSize(0)} of new land · {BIOME_CONFIGS[island.biome]?.name ?? island.biome} ground · +{islandBoonPct(0)}% Sunlight on its subject ·
                            +{reachReward(island.index).sunlight}{@html ICONS.sunlight} +{reachReward(island.index).coins}{@html ICONS.coin}
                        </span>
                    </div>
                {:else if mastery}
                    <div class="meter">
                        <div class="meter-head"><span>⛰️ {masteryTitle(mastery.level)} · mastery {mastery.level}</span><span class="num">{Math.floor(mastery.into)} / {mastery.needed} min</span></div>
                        <div class="bar"><div class="fill green" style="width:{Math.round(mastery.ratio * 100)}%"></div></div>
                        <span class="muted">{formatMinutes(island.minutes)} of focus here so far. Next: {masteryTitle(mastery.level + 1)}.</span>
                    </div>
                    <ul class="facts">
                        <li><span>☀️</span>+{islandBoonPct(island.level)}% Sunlight whenever you focus on {focusLabel(island.focus)}</li>
                        <li>
                            <span>🧱</span>{islandLandSize(island.level)}×{islandLandSize(island.level)} of land{#if nextLand && islandLandSize(island.level) < ISLAND_MAX_LAND}, growing at mastery {nextLand}{/if}
                        </li>
                        <li>
                            <span>📚</span>{island.notes} note{island.notes === 1 ? '' : 's'} in its library · next milestone {nextLibraryMilestone(Math.max(island.notesMark, 0))}
                        </li>
                    </ul>
                    <p class="hint">{focusHowTo(island.focus)}</p>
                    <div class="actions"><button class="primary" on:click={() => island && visit(island.id)}>Visit and build</button></div>
                {/if}
            </section>
        {/if}

        {#if islands.length}
            <section class="list">
                <button class="row" class:active={selectedId === 'home'} on:click={() => select('home')}>
                    <span class="swatch" style="background:{BIOME_SWATCH[g.activeBiome]}"></span>
                    <span class="row-name">Home</span>
                    <span class="muted">{g.landSize}×{g.landSize}</span>
                </button>
                {#each islands as isle (isle.id)}
                    {@const b = bridgeProgress(isle)}
                    <button class="row" class:active={selectedId === isle.id} class:far={!isReached(isle)} on:click={() => select(isle.id)}>
                        <span class="swatch" style="background:{BIOME_SWATCH[isle.biome]}"></span>
                        <span class="row-name">{islandName(isle)}</span>
                        <span class="muted">
                            {#if isReached(isle)}{focusLabel(isle.focus)} · mastery {isle.level}{:else if isle.focus}🪵 {Math.floor(b.laid)}/{b.target} min{:else}chart it{/if}
                        </span>
                    </button>
                {/each}
            </section>
            <section class="how">
                <span class="eyebrow">How the islands work</span>
                <p>Each island stands for a part of this vault. Focus on it builds the bridge; once you land, the same focus raises its mastery, its land and your Sunlight. There is always another island after this one.</p>
            </section>
        {/if}
    </div>
</div>

<style>
.pf-isles { display: flex; flex-direction: column; gap: 10px; }
.full.pf-isles { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(280px, 1fr); align-items: start; gap: 14px; }
.map {
    position: relative;
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid var(--background-modifier-border);
    line-height: 0;
}
.map :global(svg.pf-archipelago) { width: 100%; height: auto; display: block; }
.map :global(.pf-map-isle) { cursor: pointer; }
.map :global(.pf-map-isle > g), .map :global(.pf-map-isle > polygon) { transition: opacity 0.2s ease; }
.map :global(.pf-map-isle:hover .pf-map-name) { fill: #fff8dc; }
.map :global(.pf-map-name) {
    font: 700 12px var(--font-interface, sans-serif);
    fill: #fff;
    paint-order: stroke;
    stroke: rgba(12, 24, 48, 0.5);
    stroke-width: 2.2px;
    stroke-linejoin: round;
    letter-spacing: 0.01em;
}
.map :global(.pf-map-sub) {
    font: 600 9.5px var(--font-interface, sans-serif);
    fill: #eef6ff;
    paint-order: stroke;
    stroke: rgba(12, 24, 48, 0.45);
    stroke-width: 1.9px;
    stroke-linejoin: round;
}
/* The full page draws the map more than twice as large: its lettering is set smaller to match */
.full .map :global(.pf-map-name) { font-size: 8.5px; stroke-width: 1.6px; }
.full .map :global(.pf-map-sub) { font-size: 6.8px; stroke-width: 1.4px; }
.map :global(.pf-map-q) { font: 800 11px var(--font-interface, sans-serif); fill: #b5741a; }
.map :global(.pf-map-ring) { animation: pf-map-ring 14s linear infinite; }
.map :global(.pf-map-mark) { animation: pf-map-bob 2.6s ease-in-out infinite; }
@keyframes pf-map-ring { to { stroke-dashoffset: -90; } }
@keyframes pf-map-bob { 50% { transform: translateY(-2.5px); } }
@media (prefers-reduced-motion: reduce) {
    .map :global(.pf-map-ring), .map :global(.pf-map-mark) { animation: none; }
}
.map-stats {
    position: absolute;
    left: 8px;
    top: 8px;
    display: flex;
    gap: 6px;
    line-height: 1.2;
    font-size: 0.7rem;
    font-weight: 700;
    color: #fff;
}
.map-stats span { padding: 3px 8px; border-radius: 99px; background: rgba(12, 24, 48, 0.42); backdrop-filter: blur(3px); }
.side { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border-radius: 14px;
    border: 1px solid rgba(110, 168, 196, 0.5);
    background: linear-gradient(180deg, rgba(120, 190, 220, 0.12), rgba(120, 190, 220, 0) 70%), var(--background-secondary);
}
.card.far { border-style: dashed; }
.head { display: flex; align-items: center; gap: 10px; }
.art { width: 46px; height: 46px; flex-shrink: 0; }
.art :global(svg) { width: 100%; height: 100%; display: block; overflow: visible; }
.title { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.eyebrow { font-size: 0.6rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #4f8ea8; }
h4 { margin: 0; font-size: 1.08rem; line-height: 1.2; display: flex; align-items: center; gap: 4px; }
.body { margin: 0; font-size: 0.76rem; line-height: 1.4; color: var(--text-muted); }
.hint { margin: 0; font-size: 0.72rem; line-height: 1.35; color: var(--text-muted); font-style: italic; }
.muted { color: var(--text-muted); font-size: 0.7rem; line-height: 1.3; }
.link {
    display: inline;
    height: auto;
    padding: 0 2px;
    border: none;
    box-shadow: none;
    background: transparent;
    color: var(--text-accent);
    font-size: 0.72rem;
    cursor: pointer;
}
.link.left { align-self: flex-start; text-align: left; }
.focus-chip {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 9px;
    border-radius: 10px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    font-size: 0.8rem;
}
.focus-chip strong { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.suggestions { display: flex; flex-direction: column; gap: 4px; }
.suggestion {
    display: flex;
    align-items: center;
    gap: 9px;
    height: auto;
    padding: 6px 9px;
    border-radius: 10px;
    text-align: left;
    justify-content: flex-start;
    background: var(--background-primary);
    cursor: pointer;
}
.suggestion:hover { border-color: #6ea8c4; }
.s-body { display: flex; flex-direction: column; min-width: 0; }
.s-body strong { font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kinds { display: flex; gap: 3px; padding: 3px; border-radius: 10px; background: var(--background-primary); }
.kinds button {
    flex: 1;
    height: auto;
    padding: 4px 2px;
    font-size: 0.7rem;
    border: none;
    box-shadow: none;
    background: transparent;
    color: var(--text-muted);
    border-radius: 8px;
    cursor: pointer;
    white-space: nowrap;
}
.kinds button.active { color: var(--text-normal); font-weight: 700; background: var(--background-secondary); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.14); }
.chart { display: flex; gap: 6px; }
.chart input, .rename input { flex: 1; min-width: 0; height: 30px; font-size: 0.8rem; }
.rename { display: flex; }
button.primary {
    height: auto;
    padding: 6px 14px;
    font-weight: 700;
    color: #fff;
    background: linear-gradient(180deg, #5aa6c8, #3f86a8);
    border: none;
    cursor: pointer;
}
button.primary:disabled { opacity: 0.5; cursor: default; }
.actions { display: flex; gap: 6px; }
.meter { display: flex; flex-direction: column; gap: 4px; }
.meter-head { display: flex; justify-content: space-between; gap: 8px; font-size: 0.8rem; font-weight: 700; }
.num { color: var(--text-muted); font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
.bar { height: 7px; border-radius: 99px; background: var(--background-modifier-border); overflow: hidden; }
.fill { height: 100%; border-radius: 99px; background: linear-gradient(90deg, #7cc0de, #3f86a8); transition: width 0.6s ease; }
.planks .fill { background: repeating-linear-gradient(90deg, #c79a62 0 7px, #a67845 7px 9px); }
.fill.green { background: linear-gradient(90deg, #9ccc65, #43a047); }
.facts { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: 0.75rem; }
.facts li { display: flex; gap: 7px; align-items: baseline; }
.reward {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 7px 9px;
    border-radius: 10px;
    background: var(--background-primary);
    border: 1px dashed rgba(110, 168, 196, 0.6);
}
.r-sub { font-size: 0.7rem; color: var(--text-muted); line-height: 1.4; }
.r-sub :global(svg) { width: 12px; height: 12px; vertical-align: -2px; }
.list { display: flex; flex-direction: column; gap: 3px; }
.row {
    display: flex;
    align-items: center;
    gap: 8px;
    height: auto;
    padding: 5px 9px;
    border-radius: 9px;
    justify-content: flex-start;
    text-align: left;
    box-shadow: none;
    border: 1px solid transparent;
    background: var(--background-secondary);
    cursor: pointer;
}
.row.active { border-color: #6ea8c4; }
.row.far .row-name { color: var(--text-muted); }
.row-name { font-size: 0.78rem; font-weight: 600; white-space: nowrap; }
.row .muted { flex: 1; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.swatch { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.how { display: flex; flex-direction: column; gap: 3px; padding: 0 4px; }
.how p { margin: 0; font-size: 0.7rem; line-height: 1.4; color: var(--text-muted); }
</style>
