<script lang="ts">
import { Notice } from 'obsidian'
import { gamificationStore, pluginInstance, questBoard, levelInfo } from '../stores'
import { ICONS } from '../assets/floraAssets'
import { FLORA_SPECIES } from '../assets/floraCatalog'
import { ACHIEVEMENTS, CHEST_REWARD, dateKey, xpForLevel } from '../services/Progression'
import { generateStandaloneForestHtml } from '../services/HtmlExportService'

export let full = false

const engine = pluginInstance?.forestEngine

$: g = $gamificationStore
$: board = $questBoard
$: allDone = !!board && board.quests.every((q) => q.claimed)
$: stats = g.lifetimeStats
$: health = stats.treesGrown + stats.treesWithered > 0 ? Math.round((stats.treesGrown / (stats.treesGrown + stats.treesWithered)) * 100) : 100

function hoursUntilMidnight(): string {
    const now = new Date()
    const mid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const mins = Math.round((mid.getTime() - now.getTime()) / 60000)
    return mins > 90 ? `${Math.floor(mins / 60)}h left` : `${mins}m left`
}

async function copyJson() {
    const payload = engine?.generateExportPayload()
    if (!payload) return
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
    new Notice('📋 Export JSON copied to clipboard')
}

function downloadHtml() {
    const html = generateStandaloneForestHtml(g, pluginInstance?.app.vault.getName())
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `homestead-${dateKey()}.html`
    a.click()
    URL.revokeObjectURL(url)
    new Notice('💾 Village snapshot downloaded')
}
</script>

<div class="pf-journey" class:full>
    <section class="quests">
        <div class="sec-head">
            <h4>📯 Today's quests</h4>
            <span class="muted">{hoursUntilMidnight()}</span>
        </div>
        {#if board}
            {#each board.quests as q (q.id)}
                <div class="quest" class:done={q.claimed}>
                    <span class="check">{q.claimed ? '✓' : ''}</span>
                    <div class="q-body">
                        <span class="q-title">{q.title}</span>
                        <div class="bar"><div class="fill" style="width:{Math.round((q.progress / q.target) * 100)}%"></div></div>
                    </div>
                    <span class="q-meta">{q.progress}/{q.target}</span>
                    <span class="q-reward" title="Reward">+{q.rewardSunlight}{@html ICONS.sunlight} +{q.rewardCoins}{@html ICONS.coin}</span>
                </div>
            {/each}
            <button class="chest" class:ready={allDone && !board.chestClaimed} disabled={!allDone || board.chestClaimed} on:click={() => engine?.openDailyChest()}>
                <span class="chest-icon">{@html ICONS.chest}</span>
                {#if board.chestClaimed}
                    Chest opened — new quests at midnight
                {:else if allDone}
                    Open the daily chest! (+{CHEST_REWARD.sunlight}{@html ICONS.sunlight} +{CHEST_REWARD.coins}{@html ICONS.coin} + a sapling)
                {:else}
                    Finish all three to open the daily chest
                {/if}
            </button>
        {:else}
            <p class="muted">Quests appear each morning.</p>
        {/if}
    </section>

    <section>
        <div class="sec-head">
            <h4>🏆 Achievements</h4>
            <span class="muted">{g.achievements.length}/{ACHIEVEMENTS.length}</span>
        </div>
        <div class="ach-grid">
            {#each ACHIEVEMENTS as a (a.id)}
                {@const got = g.achievements.includes(a.id)}
                {@const prog = a.progress ? a.progress(g) : null}
                <div class="ach" class:got title="{a.description} — reward +{a.reward.sunlight}☀️ +{a.reward.coins}🪙">
                    <span class="ach-icon">{a.icon}</span>
                    <div class="ach-body">
                        <strong>{a.title}</strong>
                        <span>{a.description}</span>
                        {#if !got && prog}
                            <div class="bar small"><div class="fill" style="width:{Math.min(100, Math.round((prog[0] / prog[1]) * 100))}%"></div></div>
                        {/if}
                    </div>
                </div>
            {/each}
        </div>
    </section>

    <section>
        <div class="sec-head"><h4>📊 Lifetime</h4></div>
        <div class="stat-grid">
            <div class="stat"><b>{Math.floor(stats.totalFocusMinutes / 60)}h {stats.totalFocusMinutes % 60}m</b><span>focused</span></div>
            <div class="stat"><b>{stats.treesGrown}</b><span>trees grown</span></div>
            <div class="stat"><b>{stats.tasksCompleted}</b><span>tasks done</span></div>
            {#if stats.cardsCompleted}<div class="stat"><b>{stats.cardsCompleted}</b><span>board cards finished</span></div>{/if}
            <div class="stat"><b>{g.streak.longest}d</b><span>longest streak</span></div>
            <div class="stat"><b>{health}%</b><span>forest health</span></div>
            <div class="stat"><b>{stats.questsCompleted}</b><span>quests</span></div>
            <div class="stat"><b>{stats.breaksCompleted}</b><span>breaks taken</span></div>
            {#if stats.cropsHarvested}<div class="stat"><b>{stats.cropsHarvested}</b><span>crops harvested</span></div>{/if}
            <div class="stat"><b>{g.xp}</b><span>XP · next lvl at {xpForLevel($levelInfo.level + 1)}</span></div>
        </div>
    </section>

    <section>
        <div class="sec-head"><h4>🏷️ Smart seeds</h4></div>
        <p class="muted small">A tag on the note or task you focus on picks the tree automatically (if you've unlocked it):</p>
        <div class="tags">
            {#each g.tagMappings as tm}
                {@const sp = FLORA_SPECIES.find((s) => s.id === tm.speciesId)}
                <span class="tag-chip" class:off={!g.unlockedSpecies.includes(tm.speciesId)}><code>{tm.tag}</code> → {sp?.name || tm.speciesId}</span>
            {/each}
        </div>
    </section>

    <section>
        <div class="sec-head"><h4>🌐 Share & export</h4></div>
        <div class="export">
            <button on:click={downloadHtml}>💾 Download village snapshot (.html)</button>
            <button on:click={copyJson}>📋 Copy dashboard JSON</button>
        </div>
    </section>
</div>

<style>
.pf-journey { display: flex; flex-direction: column; gap: 14px; }
.full.pf-journey { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); align-items: start; }
section { display: flex; flex-direction: column; gap: 6px; }
.sec-head { display: flex; justify-content: space-between; align-items: baseline; }
h4 { margin: 0; font-size: 0.88rem; }
.muted { color: var(--text-muted); font-size: 0.72rem; }
.small { margin: 0; }
.quest {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 9px;
    border-radius: 10px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    font-size: 0.76rem;
}
.quest.done { border-color: rgba(102, 187, 106, 0.55); }
.quest.done .q-title { color: var(--text-muted); text-decoration: line-through; }
.check {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border-radius: 50%;
    font-size: 0.7rem;
    font-weight: 900;
    color: #fff;
    border: 2px solid var(--background-modifier-border);
}
.done .check { background: #66bb6a; border-color: #66bb6a; }
.q-body { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.q-meta { color: var(--text-muted); font-variant-numeric: tabular-nums; }
.q-reward { font-size: 0.66rem; color: var(--text-muted); white-space: nowrap; }
.q-reward :global(svg) { width: 12px; height: 12px; vertical-align: -2px; }
.bar { height: 5px; border-radius: 99px; background: var(--background-modifier-border); overflow: hidden; }
.bar.small { height: 3px; margin-top: 3px; }
.fill { height: 100%; border-radius: 99px; background: linear-gradient(90deg, #9ccc65, #43a047); transition: width 0.6s ease; }
.chest {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: auto;
    padding: 8px;
    font-size: 0.75rem;
    border-radius: 10px;
    cursor: default;
}
.chest-icon :global(svg) { width: 22px; height: 22px; }
.chest:disabled { opacity: 0.75; }
.chest.ready {
    cursor: pointer;
    font-weight: 700;
    color: #5d3a00;
    background: linear-gradient(180deg, #ffe082, #ffb300);
    animation: pf-wiggle 1.8s ease-in-out infinite;
}
@keyframes pf-wiggle {
    0%, 80%, 100% { transform: rotate(0); }
    85% { transform: rotate(-2deg); }
    90% { transform: rotate(2deg); }
    95% { transform: rotate(-1deg); }
}
.ach-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; }
.ach {
    display: flex;
    gap: 7px;
    padding: 7px;
    border-radius: 10px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    opacity: 0.6;
    filter: grayscale(0.8);
}
.ach.got { opacity: 1; filter: none; border-color: rgba(179, 157, 219, 0.7); }
.ach-icon { font-size: 1.2rem; }
.ach-body { display: flex; flex-direction: column; min-width: 0; font-size: 0.68rem; }
.ach-body strong { font-size: 0.74rem; }
.ach-body span { color: var(--text-muted); line-height: 1.2; }
.stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
.stat { display: flex; flex-direction: column; padding: 8px 10px; border-radius: 10px; background: var(--background-secondary); }
.stat b { font-size: 1rem; }
.stat span { font-size: 0.68rem; color: var(--text-muted); }
.tags { display: flex; flex-wrap: wrap; gap: 5px; }
.tag-chip { font-size: 0.7rem; padding: 2px 7px; border-radius: 6px; background: var(--background-secondary); }
.tag-chip.off { opacity: 0.5; }
.export { display: flex; flex-direction: column; gap: 6px; }
.export button { font-size: 0.76rem; }
</style>
