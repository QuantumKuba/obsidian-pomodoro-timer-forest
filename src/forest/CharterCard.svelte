<script lang="ts">
import { charter, gamificationStore } from '../stores'
import { ICONS } from '../assets/floraAssets'
import { charterLandmark } from '../assets/floraCatalog'
import { CHARTER_RANKS, residentJoining } from '../services/Charter'

$: c = $charter
$: reachedOn = $gamificationStore.charter?.reachedOn ?? {}
$: landmark = c.chapter ? charterLandmark(c.rank + 1) : undefined
$: newcomer = c.chapter ? residentJoining(c.rank + 1) : undefined

function rankTitle(i: number): string {
    const r = CHARTER_RANKS[i]
    if (i > c.rank) return `${r.name}: ${r.blurb}`
    const on = reachedOn[i]
    return `${r.name}${on ? ` · reached ${on}` : ''}: ${r.blurb}`
}
</script>

<section class="pf-charter">
    <div class="head">
        <span class="crest">{@html ICONS.charter}</span>
        <div class="title">
            <span class="eyebrow">Village Charter · rank {c.rank + 1} of {CHARTER_RANKS.length}</span>
            <strong class="name">{c.rankName}</strong>
        </div>
    </div>

    <ol class="ladder">
        {#each CHARTER_RANKS as r, i}
            <li class:reached={i <= c.rank} class:current={i === c.rank} title={rankTitle(i)}>
                <span class="dot"></span>
                <span class="sr">{r.name}</span>
            </li>
        {/each}
    </ol>

    {#if c.chapter}
        <div class="chapter">
            <div class="ch-head">
                <span>Chapter {c.rank + 1} · {c.chapter.title}</span>
                <span class="count">{c.done}/{c.total}</span>
            </div>
            <p class="story">{c.chapter.story}</p>
            <ul class="goals">
                {#each c.goals as s (s.goal.id)}
                    <li class:done={s.done}>
                        <span class="tick">{s.done ? '✓' : ''}</span>
                        <div class="g-body">
                            <span class="g-label">{s.goal.label}</span>
                            {#if !s.done && s.target > 1}
                                <div class="bar"><div class="fill" style="width:{Math.min(100, Math.round((s.current / s.target) * 100))}%"></div></div>
                            {/if}
                        </div>
                        {#if !s.done && s.target > 1}<span class="g-meta">{s.current}/{s.target}</span>{/if}
                    </li>
                {/each}
            </ul>
            <div class="reward">
                {#if landmark}<span class="r-art">{@html landmark.iconSvg}</span>{/if}
                <div class="r-body">
                    <span class="eyebrow">On becoming a {c.nextRankName}</span>
                    {#if landmark}<strong>{landmark.name}</strong>{/if}
                    <span class="r-sub">
                        +{c.chapter.reward.sunlight}{@html ICONS.sunlight} +{c.chapter.reward.coins}{@html ICONS.coin} +{c.chapter.reward.xp} XP{#if newcomer}
                            · {newcomer.name}, {newcomer.role}, moves in{/if}
                    </span>
                </div>
            </div>
        </div>
    {:else}
        <p class="story done-all">Every chapter is signed. The city stands, grown one focused session at a time. Nothing more to prove; just keep tending it.</p>
    {/if}
</section>

<style>
.pf-charter {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 11px 12px 12px;
    border-radius: 14px;
    border: 1px solid rgba(201, 162, 90, 0.5);
    background:
        linear-gradient(180deg, rgba(232, 194, 122, 0.13), rgba(232, 194, 122, 0) 70%),
        var(--background-secondary);
}
.head { display: flex; align-items: center; gap: 10px; }
.crest :global(svg) { width: 34px; height: 34px; display: block; }
.title { display: flex; flex-direction: column; min-width: 0; }
.eyebrow {
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #a8834a;
}
.name { font-size: 1.12rem; line-height: 1.15; letter-spacing: 0.01em; }
.ladder {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 2px 4px;
    padding: 0;
    list-style: none;
    position: relative;
}
.ladder::before {
    content: '';
    position: absolute;
    left: 4px;
    right: 4px;
    top: 50%;
    height: 2px;
    margin-top: -1px;
    background: var(--background-modifier-border);
}
.ladder li { position: relative; display: grid; place-items: center; width: 14px; height: 14px; }
.dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--background-primary);
    border: 2px solid var(--background-modifier-border);
}
.reached .dot { background: #c9a25a; border-color: #c9a25a; }
.current .dot {
    width: 13px;
    height: 13px;
    background: #e8c27a;
    border-color: #a8742e;
    box-shadow: 0 0 0 3px rgba(232, 194, 122, 0.3);
}
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.chapter { display: flex; flex-direction: column; gap: 6px; }
.ch-head { display: flex; justify-content: space-between; gap: 8px; font-size: 0.8rem; font-weight: 700; }
.count { color: var(--text-muted); font-variant-numeric: tabular-nums; font-weight: 600; }
.story { margin: 0; font-size: 0.72rem; line-height: 1.35; color: var(--text-muted); font-style: italic; }
.done-all { font-style: normal; }
.goals { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.goals li { display: flex; align-items: center; gap: 8px; font-size: 0.75rem; }
.tick {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border-radius: 50%;
    font-size: 0.62rem;
    font-weight: 900;
    color: #fff;
    border: 2px solid var(--background-modifier-border);
}
.done .tick { background: #c9a25a; border-color: #c9a25a; }
.done .g-label { color: var(--text-muted); }
.g-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.g-meta { font-size: 0.68rem; color: var(--text-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.bar { height: 4px; border-radius: 99px; background: var(--background-modifier-border); overflow: hidden; }
.fill { height: 100%; border-radius: 99px; background: linear-gradient(90deg, #e8c27a, #b8862f); transition: width 0.6s ease; }
.reward {
    display: flex;
    align-items: center;
    gap: 9px;
    margin-top: 2px;
    padding: 7px 9px;
    border-radius: 10px;
    background: var(--background-primary);
    border: 1px dashed rgba(201, 162, 90, 0.55);
}
.r-art { width: 44px; height: 44px; flex-shrink: 0; }
.r-art :global(svg) { width: 100%; height: 100%; }
.r-body { display: flex; flex-direction: column; gap: 1px; min-width: 0; font-size: 0.76rem; }
.r-sub { font-size: 0.68rem; color: var(--text-muted); }
.r-sub :global(svg) { width: 12px; height: 12px; vertical-align: -2px; }
</style>
