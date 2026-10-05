<script lang="ts">
import { createEventDispatcher } from 'svelte'
import { gamificationStore, pluginInstance, levelInfo } from '../stores'
import { FLORA_SPECIES, HOMESTEAD_BUILDINGS } from '../assets/floraCatalog'
import { perkText } from '../services/Progression'
import { ICONS } from '../assets/floraAssets'
import type { FloraSpecies, HomesteadBuilding } from '../types/forest'

export let full = false

const dispatch = createEventDispatcher<{ place: string }>()
const engine = pluginInstance?.forestEngine

let section: 'seeds' | 'builds' = 'seeds'

$: g = $gamificationStore
$: level = $levelInfo.level

function shortfall(sun: number, coin: number): string {
    const parts = []
    if (g.sunlight < sun) parts.push(`${sun - g.sunlight}☀️`)
    if (g.coins < coin) parts.push(`${coin - g.coins}🪙`)
    return parts.length ? `${parts.join(' + ')} to go` : ''
}

function shortfallHtml(sun: number, coin: number): string {
    const parts = []
    if (g.sunlight < sun) parts.push(`${sun - g.sunlight}${ICONS.sunlight}`)
    if (g.coins < coin) parts.push(`${coin - g.coins}${ICONS.coin}`)
    return parts.length ? `${parts.join(' + ')} to go` : ''
}

function buySpecies(sp: FloraSpecies) {
    engine?.unlockSpecies(sp.id)
}

function buyBuilding(b: HomesteadBuilding) {
    if (engine?.buyBuilding(b.id)) dispatch('place', `building:${b.id}`)
}

function placedCount(id: string): number {
    return g.homestead.filter((i) => i.itemId === id).length + (g.inventory[`building:${id}`] || 0)
}
</script>

<div class="pf-market" class:full>
    <div class="seg">
        <button class:active={section === 'seeds'} on:click={() => (section = 'seeds')}>🌱 Nursery</button>
        <button class:active={section === 'builds'} on:click={() => (section = 'builds')}>🔨 Builders</button>
    </div>

    {#if section === 'seeds'}
        <p class="hint">Unlock a species to grow it in focus sessions. Every tree you finish becomes a sapling for your village.</p>
        <div class="grid">
            {#each FLORA_SPECIES as sp (sp.id)}
                {@const owned = g.unlockedSpecies.includes(sp.id)}
                {@const locked = !owned && level < sp.unlockLevel}
                {@const afford = g.sunlight >= sp.sunlightCost && g.coins >= sp.coinsCost}
                <div class="card" class:owned class:locked style="--accent:{sp.color}">
                    <div class="art">{@html sp.iconSvg}{#if locked}<span class="lock">🔒 Lv {sp.unlockLevel}</span>{/if}</div>
                    <div class="body">
                        <div class="title"><strong>{sp.name}</strong><span class="tag">{sp.category}</span></div>
                        <p class="desc">{sp.description}</p>
                        <div class="foot">
                            {#if owned}
                                {#if g.selectedSpeciesId === sp.id}
                                    <span class="active-seed">✓ Current seed</span>
                                {:else}
                                    <button class="ghost" on:click={() => engine?.selectSpecies(sp.id)}>Use as seed</button>
                                {/if}
                                <span class="muted">{g.inventory[`tree:${sp.id}`] || 0} sapling{(g.inventory[`tree:${sp.id}`] || 0) === 1 ? '' : 's'}</span>
                            {:else if locked}
                                <span class="muted">Reach level {sp.unlockLevel} to unlock</span>
                            {:else}
                                <span class="cost">{@html ICONS.sunlight}{sp.sunlightCost} {@html ICONS.coin}{sp.coinsCost}</span>
                                <button class="buy" disabled={!afford} title={shortfall(sp.sunlightCost, sp.coinsCost)} on:click={() => buySpecies(sp)}>
                                    {@html afford ? 'Unlock' : shortfallHtml(sp.sunlightCost, sp.coinsCost)}
                                </button>
                            {/if}
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {:else}
        <p class="hint">Buildings grant lasting perks that grow with upgrades. Paths, brooks and decorations can be bought as often as you like. Garden plots grow crops while you focus.</p>
        <div class="grid">
            {#each HOMESTEAD_BUILDINGS as b (b.id)}
                {@const owned = b.unique && g.unlockedBuildings.includes(b.id)}
                {@const locked = level < b.unlockLevel}
                {@const afford = g.sunlight >= b.sunlightCost && g.coins >= b.coinsCost}
                {@const atLimit = !!b.limit && placedCount(b.id) >= b.limit}
                <div class="card" class:owned class:locked>
                    <div class="art">{@html b.iconSvg}{#if locked}<span class="lock">🔒 Lv {b.unlockLevel}</span>{/if}</div>
                    <div class="body">
                        <div class="title"><strong>{b.name}</strong><span class="tag">{b.category}</span></div>
                        <p class="desc">{b.description}</p>
                        {#if b.perk}<p class="perk">⚡ {perkText(b, 1)}</p>{/if}
                        {#if b.maxLevel > 1}<p class="upg">Upgradable to {'★'.repeat(b.maxLevel)}</p>{/if}
                        <div class="foot">
                            {#if owned}
                                <span class="active-seed">✓ Built</span>
                            {:else if locked}
                                <span class="muted">Reach level {b.unlockLevel} to build</span>
                            {:else}
                                <span class="cost">{@html ICONS.sunlight}{b.sunlightCost} {@html ICONS.coin}{b.coinsCost}</span>
                                {#if !b.unique && placedCount(b.id)}<span class="muted">own {placedCount(b.id)}{b.limit ? `/${b.limit}` : ''}</span>{/if}
                                {#if !atLimit}
                                    <button class="buy" disabled={!afford} title={shortfall(b.sunlightCost, b.coinsCost)} on:click={() => buyBuilding(b)}>
                                        {@html afford ? 'Build' : shortfallHtml(b.sunlightCost, b.coinsCost)}
                                    </button>
                                {/if}
                            {/if}
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
.pf-market { display: flex; flex-direction: column; gap: 10px; }
.seg {
    display: flex;
    gap: 4px;
    padding: 3px;
    border-radius: 10px;
    background: var(--background-secondary);
}
.seg button {
    flex: 1;
    font-size: 0.78rem;
    background: transparent;
    box-shadow: none;
    border: none;
    cursor: pointer;
}
.seg button.active {
    background: var(--background-primary);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
    font-weight: 700;
}
.hint { margin: 0; font-size: 0.74rem; color: var(--text-muted); }
.grid { display: grid; grid-template-columns: 1fr; gap: 8px; }
.full .grid { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
.card {
    display: flex;
    gap: 10px;
    padding: 10px;
    border-radius: 12px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    transition: transform 0.15s, border-color 0.15s;
}
.card:hover { transform: translateY(-1px); border-color: var(--interactive-accent); }
.card.locked .art :global(svg) { filter: grayscale(1) brightness(0.8); opacity: 0.55; }
.card.owned { border-color: rgba(102, 187, 106, 0.5); }
.art { position: relative; width: 58px; height: 58px; flex-shrink: 0; }
.art :global(svg) { width: 100%; height: 100%; }
.lock {
    position: absolute;
    left: 50%;
    bottom: -2px;
    transform: translateX(-50%);
    font-size: 0.6rem;
    font-weight: 700;
    white-space: nowrap;
    padding: 1px 5px;
    border-radius: 99px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
}
.body { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.title { display: flex; justify-content: space-between; align-items: center; gap: 6px; font-size: 0.85rem; }
.tag {
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 1px 6px;
    border-radius: 4px;
    color: var(--text-muted);
    background: var(--background-modifier-border);
}
.desc { margin: 0; font-size: 0.72rem; color: var(--text-muted); line-height: 1.3; }
.perk { margin: 0; font-size: 0.7rem; font-weight: 600; color: #e39b2d; }
.upg { margin: 0; font-size: 0.66rem; color: #ffb300; letter-spacing: 0.5px; }
.foot { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
.cost { font-size: 0.75rem; font-weight: 700; display: inline-flex; align-items: center; gap: 2px; }
.cost :global(svg), .buy :global(svg) { width: 13px; height: 13px; }
.muted { font-size: 0.7rem; color: var(--text-muted); }
.active-seed { font-size: 0.72rem; font-weight: 700; color: #43a047; }
.buy {
    margin-left: auto;
    font-size: 0.72rem;
    padding: 3px 10px;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
}
.buy:disabled { opacity: 0.6; background: var(--background-modifier-border); color: var(--text-muted); cursor: default; }
.ghost { font-size: 0.72rem; padding: 3px 9px; }
</style>
