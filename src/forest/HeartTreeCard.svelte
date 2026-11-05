<script lang="ts">
import { gamificationStore, pluginInstance, clockMinute } from '../stores'
import { SPECIES_SVGS } from '../assets/floraAssets'
import { getSpecies } from '../assets/floraCatalog'
import { CARE_FOR, CARE_ITEMS, ORNAMENTS, getTreasure } from '../assets/treasureCatalog'
import { HEART_BLESSING_PCT, HEART_STAGES, NEEDS, careFor, heartNeed, heartStageIndex, heartTreeItem, nextHeartStage } from '../services/HeartTree'
import { dateKey } from '../services/Progression'
import type { PlacedHomesteadItem } from '../types/forest'

/** The short version, for the village's inspector: no collection, no list of finds. */
export let compact = false

const engine = pluginInstance?.forestEngine

$: g = $gamificationStore
$: today = dateKey($clockMinute)
$: ht = g.heartTree
$: tree = heartTreeItem(g)
$: bond = ht?.bond ?? 0
$: stage = HEART_STAGES[heartStageIndex(bond)]
$: next = nextHeartStage(bond)
$: progress = next ? (bond - stage.bond) / (next.bond - stage.bond) : 1
$: need = heartNeed(today)
$: needItem = getTreasure(CARE_FOR[need])
$: tended = ht?.tendedOn === today
$: use = careFor(g, need)
$: waiting = g.pickups ?? []
$: needWaiting = !use && waiting.some((p) => p.itemId === CARE_FOR[need] || getTreasure(p.itemId)?.meets === 'any')
$: speciesName = getSpecies(ht?.speciesId ?? '')?.name ?? 'Tree'
$: slots = Array.from({ length: stage.slots }, (_, i) => ht?.hung[i])
// A few trees to choose from right here: the most cared-for first, one of each kind
$: candidates = g.homestead
    .filter((i) => i.itemType === 'tree' && i.gridX < g.landSize && i.gridY < g.landSize)
    .sort((a, b) => b.level - a.level)
    .filter((i, n, all) => all.findIndex((o) => o.itemId === i.itemId) === n)
    .slice(0, 4)

const name = (i: PlacedHomesteadItem) => getSpecies(i.itemId)?.name ?? i.itemId
</script>

<section class="pf-heart" class:compact>
    {#if !ht}
        <div class="head">
            <span class="portrait empty">{@html SPECIES_SVGS.ancient_oak}</span>
            <div class="title">
                <span class="eyebrow">Heart Tree</span>
                <strong class="name">Choose a tree to look after</strong>
            </div>
        </div>
        <p class="story">
            One tree in your village, cared for a little each day. It grows with you, carries the ornaments you find, and never wilts.
        </p>
        {#if candidates.length}
            <div class="choose">
                {#each candidates as c (c.id)}
                    <button class="pick" title="Make this {name(c)} your Heart Tree" on:click={() => engine?.chooseHeartTree(c.id)}>
                        <span class="pick-art">{@html SPECIES_SVGS[c.itemId] ?? ''}</span>
                        <span class="pick-name">{name(c)}</span>
                    </button>
                {/each}
            </div>
            <p class="hint">Or select any tree in your village and choose <em>Make this my Heart Tree</em>.</p>
        {:else}
            <p class="hint">Plant a sapling from your inventory first, then choose it here.</p>
        {/if}
    {:else}
        <div class="head">
            {#if !compact}<span class="portrait" class:aura={stage.aura}>{@html SPECIES_SVGS[ht.speciesId] ?? SPECIES_SVGS.classic_pine}</span>{/if}
            <div class="title">
                <span class="eyebrow">Heart Tree · {stage.name}</span>
                {#if !compact}<strong class="name">{speciesName}</strong>{/if}
                <div class="bar" title="Bond grows by one for every day its need is met. It never goes down.">
                    <div class="fill" style="width:{Math.round(progress * 100)}%"></div>
                </div>
                <span class="meta">{`Bond ${bond} · ${next ? `${next.bond - bond} more to ${next.name}` : 'fully grown'}`}</span>
            </div>
        </div>

        {#if !tree}
            <p class="hint">Packed away in your inventory. Plant it again and it carries on where it left off, or choose another tree: the bond comes along.</p>
        {/if}

        <div class="today" class:done={tended}>
            <span class="need-art" class:soft={tended}>{@html needItem?.iconSvg ?? ''}</span>
            <div class="t-body">
                {#if tended}
                    <strong>Looked after today</strong>
                    <span>{ht.blessing ? `Its blessing waits for your next session: +${HEART_BLESSING_PCT}% Sunlight.` : 'Its blessing went into your last session.'}</span>
                {:else}
                    <strong>Today: {NEEDS[need].label.toLowerCase()}</strong>
                    <span>It would like {NEEDS[need].ask}.</span>
                {/if}
            </div>
            {#if !tended}
                <button
                    class="tend"
                    disabled={!use || !tree}
                    title={use ? `Use ${getTreasure(use)?.name}: +1 bond and a blessing on your next session` : 'Nothing in the satchel for this yet'}
                    on:click={() => engine?.tendHeartTree()}>{use && use !== CARE_FOR[need] ? 'Use salve' : 'Tend'}</button>
            {/if}
        </div>
        {#if !tended && !use}
            <p class="hint">{needWaiting ? 'What it needs is waiting in the village to be picked up.' : 'Daily quests bring care items; it will happily wait.'}</p>
        {/if}

        <div class="satchel" aria-label="Satchel">
            <span class="label">Satchel</span>
            {#each CARE_ITEMS as c (c.id)}
                <span class="care" class:none={!g.satchel?.[c.id]} title="{c.name}: {c.description} From: {c.from}.">
                    <span class="care-art">{@html c.iconSvg}</span><b>{g.satchel?.[c.id] || 0}</b>
                </span>
            {/each}
        </div>

        {#if compact}
            <div class="slots" title="Ornaments hung on it. Hang or take them down in the Journey tab.">
                {#each slots as id, i (i)}
                    <span class="slot" class:filled={!!id}>{@html id ? getTreasure(id)?.iconSvg ?? '' : ''}</span>
                {/each}
                <span class="meta">{g.ornaments.length} of {ORNAMENTS.length} ornaments found</span>
            </div>
        {:else}
            <div class="orn-head">
                <span>Ornaments · {ht.hung.length}/{stage.slots} hung</span>
                <span class="meta">{g.ornaments.length} of {ORNAMENTS.length} found</span>
            </div>
            <div class="orns">
                {#each ORNAMENTS as o (o.id)}
                    {@const found = g.ornaments.includes(o.id)}
                    {@const hung = ht.hung.includes(o.id)}
                    <button
                        class="orn"
                        class:found
                        class:hung
                        disabled={!found}
                        aria-label={found ? `${o.name}${hung ? ', hung' : ''}` : 'Not found yet'}
                        title={found ? `${o.name}. ${o.description} ${hung ? 'Click to take it down.' : 'Click to hang it.'}` : `Not found yet. ${o.from}.`}
                        on:click={() => engine?.toggleOrnament(o.id)}>{@html o.iconSvg}</button>
                {/each}
            </div>
        {/if}
        <p class="perk">
            ☀️ +{stage.sunlightPct}% Sunlight on every session{#if next}<span class="dim">{` · at ${next.name}: +${next.sunlightPct}% and ${next.slots} ornaments`}</span>{/if}
        </p>
    {/if}

    {#if waiting.length && !compact}
        <div class="waiting">
            <span class="w-icons">{#each waiting.slice(0, 4) as p (p.id)}<span class="w-art">{@html getTreasure(p.itemId)?.iconSvg ?? ''}</span>{/each}</span>
            <span class="w-text">{waiting.length} find{waiting.length === 1 ? '' : 's'} waiting in the village</span>
            <button class="collect" on:click={() => engine?.collectPickups()}>Collect all</button>
        </div>
    {/if}
</section>

<style>
.pf-heart {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 11px 12px 12px;
    border-radius: 14px;
    border: 1px solid rgba(122, 170, 96, 0.5);
    background:
        linear-gradient(180deg, rgba(140, 200, 103, 0.13), rgba(140, 200, 103, 0) 70%),
        var(--background-secondary);
}
.pf-heart.compact {
    margin-top: 10px;
    padding: 9px 10px 10px;
    background: var(--background-primary);
}
.head { display: flex; align-items: center; gap: 10px; }
.portrait {
    width: 48px;
    height: 48px;
    flex-shrink: 0;
    border-radius: 12px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
}
.portrait :global(svg) { width: 100%; height: 100%; display: block; }
.portrait.empty { opacity: 0.45; filter: grayscale(0.6); }
.portrait.aura {
    border-color: rgba(232, 194, 122, 0.7);
    background: radial-gradient(circle at 50% 45%, rgba(255, 236, 170, 0.55), transparent 70%), var(--background-primary);
}
.compact .portrait { width: 38px; height: 38px; }
.title { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.eyebrow {
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #6f9a50;
}
.name { font-size: 1.02rem; line-height: 1.15; }
.compact .name { font-size: 0.88rem; }
.meta { font-size: 0.66rem; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.bar { height: 5px; margin-top: 2px; border-radius: 99px; background: var(--background-modifier-border); overflow: hidden; }
.fill { height: 100%; border-radius: 99px; background: linear-gradient(90deg, #b5df8a, #4f9a4a); transition: width 0.6s ease; }
.story { margin: 0; font-size: 0.72rem; line-height: 1.35; color: var(--text-muted); font-style: italic; }
.hint { margin: 0; font-size: 0.68rem; line-height: 1.35; color: var(--text-muted); }
.choose { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.pick {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    height: auto;
    padding: 5px 3px 4px;
    border-radius: 10px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    box-shadow: none;
    cursor: pointer;
    min-width: 0;
}
.pick:hover { border-color: rgba(122, 170, 96, 0.8); }
.pick-art { width: 36px; height: 36px; }
.pick-art :global(svg) { width: 100%; height: 100%; }
.pick-name { font-size: 0.6rem; color: var(--text-muted); max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.today {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 7px 9px;
    border-radius: 10px;
    background: var(--background-primary);
    border: 1px dashed rgba(122, 170, 96, 0.6);
}
.today.done { border-style: solid; border-color: var(--background-modifier-border); }
.need-art { width: 28px; height: 28px; flex-shrink: 0; }
.need-art :global(svg) { width: 100%; height: 100%; }
.need-art.soft { opacity: 0.55; }
.t-body { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; font-size: 0.72rem; line-height: 1.3; }
.t-body strong { font-size: 0.76rem; }
.t-body span { color: var(--text-muted); }
.tend {
    height: auto;
    padding: 4px 12px;
    font-size: 0.74rem;
    font-weight: 700;
    border-radius: 99px;
    color: #fff;
    background: linear-gradient(180deg, #7cbf5a, #4f9a4a);
    box-shadow: none;
    cursor: pointer;
}
.tend:disabled { opacity: 0.45; cursor: default; }
.satchel { display: flex; align-items: center; gap: 6px; }
.label { font-size: 0.66rem; font-weight: 700; color: var(--text-muted); margin-right: auto; }
.care {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px 6px 2px 3px;
    border-radius: 99px;
    font-size: 0.7rem;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    font-variant-numeric: tabular-nums;
}
.care.none { opacity: 0.5; }
.care-art { width: 18px; height: 18px; }
.care-art :global(svg) { width: 100%; height: 100%; display: block; }
.orn-head { display: flex; justify-content: space-between; align-items: baseline; font-size: 0.74rem; font-weight: 700; }
.orns { display: grid; grid-template-columns: repeat(6, 1fr); gap: 5px; }
.orn {
    position: relative;
    height: auto;
    aspect-ratio: 1;
    padding: 4px;
    border-radius: 10px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    box-shadow: none;
    cursor: pointer;
}
.orn :global(svg) { width: 100%; height: 100%; display: block; }
.orn:disabled { cursor: default; }
.orn:not(.found) :global(svg) { filter: grayscale(1) brightness(0.55); opacity: 0.28; }
.orn.found:hover { border-color: rgba(122, 170, 96, 0.8); }
.orn.hung {
    border-color: #c9a25a;
    box-shadow: inset 0 0 0 1px rgba(201, 162, 90, 0.6);
    background: radial-gradient(circle at 50% 40%, rgba(255, 236, 170, 0.45), transparent 75%), var(--background-primary);
}
.orn.hung::after {
    content: '';
    position: absolute;
    top: 3px;
    right: 3px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #c9a25a;
}
.slots { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.slot {
    width: 26px;
    height: 26px;
    padding: 2px;
    border-radius: 8px;
    border: 1px dashed var(--background-modifier-border);
}
.slot.filled { border-style: solid; border-color: rgba(201, 162, 90, 0.7); }
.slot :global(svg) { width: 100%; height: 100%; display: block; }
.slots .meta { margin-left: auto; }
.perk { margin: 0; font-size: 0.68rem; font-weight: 600; color: #c98a2e; }
.perk .dim { font-weight: 400; color: var(--text-muted); }
.waiting {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 10px;
    background: linear-gradient(90deg, rgba(255, 224, 130, 0.2), rgba(255, 224, 130, 0.04));
    border: 1px solid rgba(232, 194, 122, 0.55);
}
.w-icons { display: flex; }
.w-art { width: 20px; height: 20px; margin-right: -5px; }
.w-art :global(svg) { width: 100%; height: 100%; display: block; }
.w-text { flex: 1; min-width: 0; padding-left: 6px; font-size: 0.7rem; }
.collect {
    height: auto;
    padding: 3px 10px;
    font-size: 0.7rem;
    font-weight: 700;
    border-radius: 99px;
    color: #4a2d00;
    background: #ffc94a;
    box-shadow: none;
    cursor: pointer;
}
</style>
