<script lang="ts">
import { gamificationStore, pluginInstance, clockMinute, settings } from '../stores'
import { renderGrove } from '../render/VillageScene'
import { SPECIES_SVGS, GROWTH_STAGE_SVGS } from '../assets/floraAssets'
import { getSpecies } from '../assets/floraCatalog'
import { addDays, dateKey, parseDateKey } from '../services/Progression'
import type { PlantedTree } from '../types/forest'

export let full = false

const sceneId = `pfg${Math.random().toString(36).slice(2, 7)}`

$: todayKey = dateKey($clockMinute)
let selectedDateKey = dateKey()
let focusTreeId: string | null = null

$: log = $gamificationStore.dailyLogs[selectedDateKey]
$: trees = log?.trees || []
$: grown = trees.filter((t) => t.status === 'mature').length
$: withered = trees.length - grown
$: skySlot = Math.floor($clockMinute.getTime() / 300_000)
$: sceneHtml = renderGrove(trees, $gamificationStore.activeBiome, { date: new Date(skySlot * 300_000), idPrefix: sceneId, still: $settings.lowFps })
$: focusTree = trees.find((t) => t.id === focusTreeId) || null

// Last 4 weeks, oldest first, for the activity strip
$: weeks = Array.from({ length: 28 }, (_, i) => {
    const key = addDays(todayKey, i - 27)
    const l = $gamificationStore.dailyLogs[key]
    return { key, count: l?.completedPomodoros || 0 }
})
$: goal = $settings.dailyGoal || 4

function go(offset: number) {
    selectedDateKey = addDays(selectedDateKey, offset)
    focusTreeId = null
}

function label(key: string): string {
    if (key === todayKey) return 'Today'
    if (key === addDays(todayKey, -1)) return 'Yesterday'
    return parseDateKey(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function onSceneClick(e: MouseEvent) {
    const el = (e.target as Element).closest('[data-item]')
    focusTreeId = el ? el.getAttribute('data-item') : null
}

function open(tree: PlantedTree) {
    if (tree.notePath) pluginInstance?.app.workspace.openLinkText(tree.notePath, '')
}

function time(t: PlantedTree) {
    return new Date(t.plantedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function heat(count: number): number {
    return count === 0 ? 0 : Math.min(4, Math.ceil((count / goal) * 4))
}
</script>

<div class="pf-grove" class:full>
    <div class="nav">
        <button class="arrow" on:click={() => go(-1)} aria-label="Previous day">‹</button>
        <div class="date">
            <strong>{label(selectedDateKey)}</strong>
            {#if selectedDateKey !== todayKey}
                <button class="today" on:click={() => { selectedDateKey = todayKey; focusTreeId = null }}>Today</button>
            {/if}
        </div>
        <button class="arrow" on:click={() => go(1)} disabled={selectedDateKey >= todayKey} aria-label="Next day">›</button>
    </div>

    <div class="summary">
        <div><span class="num">{log?.totalMinutes || 0}m</span><span class="lbl">focused</span></div>
        <div><span class="num grown">{grown}</span><span class="lbl">trees</span></div>
        <div><span class="num">{log?.tasksCompleted || 0}</span><span class="lbl">tasks</span></div>
        {#if withered}<div><span class="num wither">{withered}</span><span class="lbl">withered</span></div>{/if}
    </div>

    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="island" on:click={onSceneClick}>
        {@html sceneHtml}
        {#if trees.length === 0}
            <div class="empty-note">
                {selectedDateKey === todayKey ? 'Your grove is waiting. Start a focus session to plant today’s first tree.' : 'A quiet day — rest is part of the rhythm.'}
            </div>
        {/if}
    </div>

    {#if focusTree}
        {@const sp = getSpecies(focusTree.speciesId)}
        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <div class="tree-card {focusTree.notePath ? 'link' : ''}" on:click={() => focusTree && open(focusTree)}>
            <div class="tc-art">{@html focusTree.status === 'withered' ? GROWTH_STAGE_SVGS.withered : SPECIES_SVGS[focusTree.speciesId] || ''}</div>
            <div class="tc-body">
                <strong>{focusTree.status === 'withered' ? `Withered ${sp?.name || ''}` : sp?.name}</strong>
                <span>{time(focusTree)} · {focusTree.durationMinutes}m</span>
                {#if focusTree.taskText}<span class="task">✔ {focusTree.taskText}</span>{/if}
                {#if focusTree.notePath}<span class="note">📄 {focusTree.notePath.split('/').pop()?.replace(/\.md$/, '')} — open</span>{/if}
            </div>
        </div>
    {/if}

    {#if trees.length}
        <div class="list">
            {#each [...trees].reverse() as t (t.id)}
                <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
                <div class="row {t.status}" class:active={t.id === focusTreeId} on:click={() => (focusTreeId = t.id)} on:dblclick={() => open(t)}>
                    <span class="r-art">{@html t.status === 'withered' ? GROWTH_STAGE_SVGS.withered : SPECIES_SVGS[t.speciesId] || ''}</span>
                    <span class="r-time">{time(t)}</span>
                    <span class="r-text">{t.taskText || t.notePath?.split('/').pop()?.replace(/\.md$/, '') || getSpecies(t.speciesId)?.name}</span>
                    <span class="r-dur">{t.durationMinutes}m</span>
                </div>
            {/each}
        </div>
    {/if}

    <div class="heat">
        <div class="heat-head"><span>Last 4 weeks</span><span class="muted">goal {goal}/day</span></div>
        <div class="heat-grid">
            {#each weeks as d (d.key)}
                <button
                    class="cell h{heat(d.count)}"
                    class:sel={d.key === selectedDateKey}
                    title="{label(d.key)}: {d.count} pomodoro{d.count === 1 ? '' : 's'}"
                    on:click={() => { selectedDateKey = d.key; focusTreeId = null }}></button>
            {/each}
        </div>
    </div>
</div>

<style>
.pf-grove {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 6px;
    border-radius: 10px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
}
.arrow {
    background: none;
    box-shadow: none;
    border: none;
    font-size: 1.3rem;
    padding: 0 10px;
    cursor: pointer;
    color: var(--text-muted);
}
.arrow:disabled { opacity: 0.3; }
.date { display: flex; gap: 8px; align-items: center; font-size: 0.85rem; }
.today { font-size: 0.68rem; padding: 1px 8px; }
.summary {
    display: flex;
    justify-content: space-around;
    text-align: center;
}
.summary div { display: flex; flex-direction: column; }
.num { font-size: 1.15rem; font-weight: 800; }
.num.grown { color: #43a047; }
.num.wither { color: #a1887f; }
.lbl { font-size: 0.68rem; color: var(--text-muted); }
.island {
    position: relative;
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid var(--background-modifier-border);
}
.full .island { max-width: 560px; margin: 0 auto; width: 100%; }
.empty-note {
    position: absolute;
    left: 10px;
    right: 10px;
    bottom: 10px;
    padding: 6px 10px;
    font-size: 0.74rem;
    text-align: center;
    border-radius: 10px;
    color: #fff;
    background: rgba(20, 24, 22, 0.65);
}
.tree-card {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 8px 10px;
    border-radius: 12px;
    background: var(--background-secondary);
    border: 1px solid var(--interactive-accent);
}
.tree-card.link { cursor: pointer; }
.tc-art { width: 48px; height: 48px; flex-shrink: 0; }
.tc-art :global(svg), .r-art :global(svg) { width: 100%; height: 100%; }
.tc-body { display: flex; flex-direction: column; gap: 1px; font-size: 0.75rem; min-width: 0; }
.tc-body span { color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tc-body .note { color: var(--text-accent); }
.list { display: flex; flex-direction: column; gap: 3px; max-height: 220px; overflow-y: auto; }
.row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 8px;
    border-radius: 8px;
    font-size: 0.74rem;
    cursor: pointer;
}
.row:hover, .row.active { background: var(--background-modifier-hover); }
.row.withered { opacity: 0.6; }
.r-art { width: 22px; height: 22px; flex-shrink: 0; }
.r-time { color: var(--text-faint); font-variant-numeric: tabular-nums; }
.r-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.r-dur { color: var(--text-muted); }
.heat { padding: 8px 10px; border-radius: 12px; background: var(--background-secondary); }
.heat-head { display: flex; justify-content: space-between; font-size: 0.74rem; font-weight: 700; margin-bottom: 6px; }
.muted { color: var(--text-muted); font-weight: 400; }
.heat-grid { display: grid; grid-template-columns: repeat(14, 1fr); gap: 3px; }
.cell {
    aspect-ratio: 1;
    height: auto;
    padding: 0;
    border-radius: 3px;
    border: none;
    box-shadow: none;
    cursor: pointer;
    background: var(--background-modifier-border);
}
.cell.h1 { background: #c5e1a5; }
.cell.h2 { background: #9ccc65; }
.cell.h3 { background: #689f38; }
.cell.h4 { background: #33691e; }
.cell.sel { outline: 2px solid var(--interactive-accent); outline-offset: 1px; }
</style>
