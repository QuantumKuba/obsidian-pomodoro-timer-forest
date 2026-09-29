<script lang="ts">
import { sunlight, coins, streak, levelInfo, vitality } from '../stores'
import { ICONS } from '../assets/floraAssets'
import { tweened } from 'svelte/motion'
import { cubicOut } from 'svelte/easing'

export let compact = false

// Counters roll up smoothly instead of jumping — small, satisfying feedback
const sun = tweened($sunlight, { duration: 900, easing: cubicOut })
const coin = tweened($coins, { duration: 900, easing: cubicOut })
const xpRatio = tweened($levelInfo.ratio, { duration: 900, easing: cubicOut })
$: sun.set($sunlight)
$: coin.set($coins)
$: xpRatio.set($levelInfo.ratio)
</script>

<div class="pf-hud" class:compact>
    <div class="level" title="{$levelInfo.title} · {$levelInfo.into}/{$levelInfo.needed} XP to level {$levelInfo.level + 1}">
        <span class="lvl-badge">{$levelInfo.level}</span>
        <div class="lvl-meta">
            {#if !compact}<span class="lvl-title">{$levelInfo.title}</span>{/if}
            <div class="xp-track"><div class="xp-fill" style="width:{Math.round($xpRatio * 100)}%"></div></div>
        </div>
    </div>
    <div class="res">
        <span class="chip sun" title="Sunlight — earned by focusing">{@html ICONS.sunlight}<b>{Math.round($sun)}</b></span>
        <span class="chip coin" title="Coins — earned by finishing tasks, quests and focus">{@html ICONS.coin}<b>{Math.round($coin)}</b></span>
        <span class="chip streak {$streak.current > 0 ? 'lit' : ''}" title="Focus streak · longest {$streak.longest} days">{@html ICONS.flame}<b>{$streak.current}</b></span>
        {#if !compact}
            <span class="chip vit {$vitality.mood}" title="Village vitality: {$vitality.label}. {$vitality.blurb}">
                <span class="vit-dot"></span><b>{$vitality.value}%</b>
            </span>
        {/if}
    </div>
</div>

<style>
.pf-hud {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    padding: 6px 10px;
    border-radius: 14px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
}
.level {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    flex: 1;
}
.lvl-badge {
    flex-shrink: 0;
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    font-weight: 800;
    font-size: 0.8rem;
    color: #3b2a07;
    background: radial-gradient(circle at 35% 30%, #fff1b8, #ffc94a 55%, #e19b16);
    box-shadow: 0 0 0 2px rgba(255, 201, 74, 0.25);
}
.lvl-meta {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 40px;
    flex: 1;
}
.lvl-title {
    font-size: 0.68rem;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.xp-track {
    height: 5px;
    border-radius: 99px;
    background: var(--background-modifier-border);
    overflow: hidden;
}
.xp-fill {
    height: 100%;
    border-radius: 99px;
    background: linear-gradient(90deg, #ffd54f, #ffb300);
}
.res {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-shrink: 0;
}
.chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 0.78rem;
    font-variant-numeric: tabular-nums;
}
.chip :global(svg) {
    width: 15px;
    height: 15px;
}
.chip.sun b { color: var(--pomodoro-forest-sunlight, #ffa726); }
.chip.coin b { color: var(--pomodoro-forest-coin, #e0a800); }
.chip.streak { filter: grayscale(1); opacity: 0.6; }
.chip.streak.lit { filter: none; opacity: 1; }
.chip.streak b { color: var(--pomodoro-forest-streak, #ff7043); }
.vit-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #9e9e9e;
}
.vit.thriving .vit-dot { background: #66bb6a; box-shadow: 0 0 6px #66bb6a; }
.vit.healthy .vit-dot { background: #aed581; }
.vit.sleepy .vit-dot { background: #ffb74d; }
.vit.dormant .vit-dot { background: #90a4ae; }
.compact {
    padding: 5px 8px;
}
</style>
