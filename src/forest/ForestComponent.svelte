<script lang="ts">
import { tick } from 'svelte'
import { gamificationStore, questBoard, levelInfo, vitality, todayLog, settings } from '../stores'
import { FLORA_SPECIES, HOMESTEAD_BUILDINGS } from '../assets/floraCatalog'
import HudBar from './HudBar.svelte'
import RewardToasts from './RewardToasts.svelte'
import VillageTab from './VillageTab.svelte'
import GroveTab from './GroveTab.svelte'
import MarketTab from './MarketTab.svelte'
import JourneyTab from './JourneyTab.svelte'

/** Full-page workspace tab (true) or the compact sidebar panel under the timer (false). */
export let full = false

type Tab = 'village' | 'grove' | 'market' | 'journey'
export let activeTab: Tab = 'village'

let village: VillageTab

$: g = $gamificationStore
$: toPlace = Object.values(g.inventory).reduce((a, b) => a + (b > 0 ? b : 0), 0)
$: questsLeft = $questBoard ? $questBoard.quests.filter((q) => !q.claimed).length : 0
$: chestReady = !!$questBoard && questsLeft === 0 && !$questBoard.chestClaimed
$: affordable =
    FLORA_SPECIES.some((s) => !g.unlockedSpecies.includes(s.id) && s.unlockLevel <= $levelInfo.level && g.sunlight >= s.sunlightCost && g.coins >= s.coinsCost) ||
    HOMESTEAD_BUILDINGS.some(
        (b) => !(b.unique && g.unlockedBuildings.includes(b.id)) && b.category !== 'path' && b.unlockLevel <= $levelInfo.level && g.sunlight >= b.sunlightCost && g.coins >= b.coinsCost,
    )

async function placeFromMarket(e: CustomEvent<string>) {
    activeTab = 'village'
    await tick()
    village?.startPlacing(e.detail)
}

function greeting(): string {
    const h = new Date().getHours()
    return h < 5 ? 'Burning the midnight oil' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}
</script>

<div class="pf-forest" class:full>
    {#if full}
        <RewardToasts />
        <header class="page-head">
            <div>
                <h2>{greeting()}, {$levelInfo.title.toLowerCase()}</h2>
                <p>
                    {$todayLog.completedPomodoros}/{$settings.dailyGoal} trees today · {$vitality.blurb}
                </p>
            </div>
        </header>
        <HudBar />
    {/if}

    <nav class="tabs">
        <button class:active={activeTab === 'village'} on:click={() => (activeTab = 'village')}>
            🏡 Village{#if toPlace}<span class="badge">{toPlace}</span>{/if}
        </button>
        <button class:active={activeTab === 'grove'} on:click={() => (activeTab = 'grove')}>🌲 Grove</button>
        <button class:active={activeTab === 'market'} on:click={() => (activeTab = 'market')}>
            🛒 Market{#if affordable}<span class="dot" title="Something new is affordable"></span>{/if}
        </button>
        <button class:active={activeTab === 'journey'} on:click={() => (activeTab = 'journey')}>
            📯 Journey{#if chestReady}<span class="badge gold">!</span>{:else if questsLeft}<span class="badge soft">{questsLeft}</span>{/if}
        </button>
    </nav>

    <div class="content">
        {#if activeTab === 'village'}
            <VillageTab bind:this={village} {full} on:market={() => (activeTab = 'market')} />
        {:else if activeTab === 'grove'}
            <GroveTab {full} />
        {:else if activeTab === 'market'}
            <MarketTab {full} on:place={placeFromMarket} />
        {:else}
            <JourneyTab {full} />
        {/if}
    </div>
</div>

<style>
.pf-forest {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    padding: 4px 2px 16px;
    font-size: 0.9rem;
    color: var(--text-normal);
}
.pf-forest.full {
    max-width: 1180px;
    margin: 0 auto;
    padding: 18px 22px 40px;
    gap: 14px;
}
.page-head h2 {
    margin: 0;
    font-size: 1.35rem;
}
.page-head p {
    margin: 2px 0 0;
    color: var(--text-muted);
    font-size: 0.82rem;
}
.tabs {
    display: flex;
    gap: 3px;
    padding: 3px;
    border-radius: 12px;
    background: var(--background-secondary-alt, var(--background-secondary));
}
.tabs button {
    position: relative;
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 6px 4px;
    font-size: 0.76rem;
    white-space: nowrap;
    border: none;
    box-shadow: none;
    background: transparent;
    color: var(--text-muted);
    border-radius: 9px;
    cursor: pointer;
}
.tabs button:hover { color: var(--text-normal); }
.tabs button.active {
    color: var(--text-normal);
    font-weight: 700;
    background: var(--background-primary);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.14);
}
.badge {
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    display: inline-grid;
    place-items: center;
    border-radius: 99px;
    font-size: 0.62rem;
    font-weight: 800;
    color: #fff;
    background: #43a047;
}
.badge.soft { background: var(--background-modifier-border); color: var(--text-muted); }
.badge.gold { background: #ffb300; color: #4a2d00; animation: pf-badge 1.2s ease-in-out infinite; }
.dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #ffb300;
    box-shadow: 0 0 6px #ffb300;
}
@keyframes pf-badge { 50% { transform: scale(1.2); } }
</style>
