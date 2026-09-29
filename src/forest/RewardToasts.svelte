<script lang="ts">
import { onDestroy } from 'svelte'
import { fly, scale, fade } from 'svelte/transition'
import { backOut } from 'svelte/easing'
import { pluginInstance } from '../stores'
import { SPECIES_SVGS, GROWTH_STAGE_SVGS, ICONS } from '../assets/floraAssets'
import type { RewardEvent } from '../types/forest'
import { writable } from 'svelte/store'

const events = pluginInstance?.forestEngine?.rewardEvents ?? writable<RewardEvent[]>([])

$: small = $events.filter((e) => e.kind === 'task' || e.kind === 'break').slice(-3)
$: card = $events.find((e) => e.kind !== 'task' && e.kind !== 'break')

const timers = new Map<string, number>()
// `card` is listed so a queued card starts its timer once it becomes visible
$: card, $events.forEach(schedule)

function schedule(e: RewardEvent) {
    if (timers.has(e.id)) return
    const ms = e.kind === 'task' || e.kind === 'break' ? 3800 : e.kind === 'levelup' || e.kind === 'chest' ? 12000 : 9000
    // Cards wait their turn: the clock only starts once the card is on screen
    if (e.kind !== 'task' && e.kind !== 'break' && card?.id !== e.id) return
    timers.set(e.id, window.setTimeout(() => dismiss(e.id), ms))
}

function dismiss(id: string) {
    const t = timers.get(id)
    if (t) window.clearTimeout(t)
    timers.delete(id)
    pluginInstance?.forestEngine?.dismissReward(id)
}

onDestroy(() => timers.forEach((t) => window.clearTimeout(t)))

function art(e: RewardEvent): string {
    if (e.kind === 'wither') return GROWTH_STAGE_SVGS.withered
    if (e.kind === 'harvest' && e.speciesId) return SPECIES_SVGS[e.speciesId] || SPECIES_SVGS.classic_pine
    if (e.kind === 'chest') return ICONS.chest
    if (e.kind === 'levelup' || e.kind === 'achievement' || e.kind === 'quest') return ICONS.star
    return ICONS.sapling
}

// Drawn icons instead of emoji: 🪙 renders as a grey coin on some platforms
function amounts(l: { sunlight?: number; coins?: number; xp?: number }): string {
    return [l.sunlight ? `+${l.sunlight}${ICONS.sunlight}` : '', l.coins ? `+${l.coins}${ICONS.coin}` : '', l.xp ? `+${l.xp} XP` : ''].filter(Boolean).join(' ')
}
</script>

<div class="pf-toasts">
    {#each small as e (e.id)}
        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <div class="toast {e.kind}" in:fly={{ y: -12, duration: 250 }} out:fade={{ duration: 200 }} on:click={() => dismiss(e.id)}>
            <span class="t-icon">{e.kind === 'task' ? '✅' : '🍵'}</span>
            <span class="t-text">{e.title}</span>
            <span class="t-amt">{@html amounts(e)}</span>
        </div>
    {/each}
</div>

{#if card}
    {#key card.id}
        <div class="pf-card-wrap" transition:fade={{ duration: 180 }}>
            <div class="pf-card {card.kind}" in:scale={{ start: 0.7, duration: 420, easing: backOut }}>
                {#if card.kind !== 'wither'}<div class="rays"></div>{/if}
                <div class="art {card.kind === 'harvest' ? 'grow' : ''}">{@html art(card)}</div>
                {#if card.levelUp}<div class="lvl-num">Level {card.levelUp}</div>{/if}
                <h3>{card.title}</h3>
                {#if card.subtitle}<p class="sub">{card.subtitle}</p>{/if}
                {#if card.sunlight || card.coins || card.xp}
                    <div class="totals">
                        {#if card.sunlight}<span class="tot sun">+{card.sunlight} {@html ICONS.sunlight}</span>{/if}
                        {#if card.coins}<span class="tot coin">+{card.coins} {@html ICONS.coin}</span>{/if}
                        {#if card.xp}<span class="tot xp">+{card.xp} XP</span>{/if}
                    </div>
                {/if}
                {#if card.lines.length}
                    <ul class="lines">
                        {#each card.lines as l, i}
                            <li style="animation-delay:{150 + i * 90}ms"><span>{l.label}</span><em>{@html amounts(l)}</em></li>
                        {/each}
                    </ul>
                {/if}
                <button class="ok" on:click={() => dismiss(card?.id ?? '')}>
                    {card.kind === 'wither' ? 'Plant another seed' : card.kind === 'levelup' ? 'Wonderful!' : 'Lovely'}
                </button>
            </div>
        </div>
    {/key}
{/if}

<style>
.pf-toasts {
    position: absolute;
    top: 6px;
    left: 8px;
    right: 8px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    z-index: 40;
    pointer-events: none;
}
.toast {
    pointer-events: auto;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 10px;
    font-size: 0.75rem;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
}
.t-text {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text-muted);
    text-decoration: line-through;
    text-decoration-color: rgba(102, 187, 106, 0.7);
}
.toast.break .t-text { text-decoration: none; }
.t-amt :global(svg), .lines em :global(svg), .tot :global(svg) {
    width: 13px;
    height: 13px;
    vertical-align: -2px;
}
.t-amt {
    font-weight: 700;
    color: #e0a800;
    white-space: nowrap;
}
.pf-card-wrap {
    position: absolute;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 18px 10px;
    background: rgba(8, 12, 10, 0.35);
    backdrop-filter: blur(2px);
}
.pf-card {
    position: relative;
    overflow: hidden;
    width: min(320px, 100%);
    text-align: center;
    padding: 18px 16px 14px;
    border-radius: 18px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
}
.pf-card.levelup, .pf-card.chest { border-color: #ffc94a; }
.pf-card.achievement { border-color: #b39ddb; }
.rays {
    position: absolute;
    top: -120px;
    left: 50%;
    width: 300px;
    height: 300px;
    margin-left: -150px;
    background: repeating-conic-gradient(from 0deg, rgba(255, 213, 79, 0.16) 0 12deg, transparent 12deg 24deg);
    animation: pf-rays 14s linear infinite;
    pointer-events: none;
}
.art {
    position: relative;
    width: 96px;
    height: 96px;
    margin: 0 auto 4px;
}
.art :global(svg) { width: 100%; height: 100%; }
.art.grow { animation: pf-pop 0.7s cubic-bezier(0.3, 1.6, 0.5, 1) both; transform-origin: 50% 88%; }
.lvl-num {
    position: relative;
    font-size: 1.6rem;
    font-weight: 900;
    background: linear-gradient(180deg, #ffe082, #ff8f00);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
}
h3 {
    position: relative;
    margin: 2px 0 2px;
    font-size: 1.02rem;
}
.sub {
    position: relative;
    margin: 0 0 8px;
    font-size: 0.78rem;
    color: var(--text-muted);
}
.totals {
    position: relative;
    display: flex;
    justify-content: center;
    gap: 8px;
    margin: 6px 0 8px;
}
.tot {
    font-weight: 800;
    font-size: 0.95rem;
    padding: 3px 9px;
    border-radius: 99px;
    background: var(--background-secondary);
    animation: pf-bump 0.5s 0.25s both;
}
.tot.sun { color: #f57c00; }
.tot.coin { color: #c79100; }
.tot.xp { color: #8e6bd8; }
.lines {
    position: relative;
    list-style: none;
    margin: 0 0 10px;
    padding: 0;
    text-align: left;
    font-size: 0.74rem;
}
.lines li {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 3px 2px;
    border-bottom: 1px dashed var(--background-modifier-border);
    opacity: 0;
    animation: pf-line-in 0.3s ease-out forwards;
}
.lines em {
    font-style: normal;
    font-weight: 600;
    color: var(--text-muted);
    white-space: nowrap;
}
.ok {
    position: relative;
    width: 100%;
    padding: 7px;
    border-radius: 10px;
    font-weight: 700;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    cursor: pointer;
}
@keyframes pf-rays { to { transform: rotate(360deg); } }
@keyframes pf-pop { from { transform: scale(0.2); } to { transform: scale(1); } }
@keyframes pf-bump { 0% { transform: scale(0.6); opacity: 0; } 70% { transform: scale(1.12); opacity: 1; } 100% { transform: scale(1); } }
@keyframes pf-line-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
</style>
