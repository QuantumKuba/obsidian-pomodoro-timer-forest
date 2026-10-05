<script lang="ts">
import TasksComponent from 'TasksComponent.svelte'
import TimerSettingsComponent from 'TimerSettingsComponent.svelte'
import type Timer from 'Timer'
import type Tasks from 'Tasks'
import type TaskTracker from 'TaskTracker'
import ForestComponent from './forest/ForestComponent.svelte'
import HudBar from './forest/HudBar.svelte'
import RewardToasts from './forest/RewardToasts.svelte'
import { gamificationStore, activePlantStore, pluginInstance, settings, todayLog, questBoard } from './stores'
import { FLORA_SPECIES, getSpecies } from './assets/floraCatalog'
import { SPECIES_SVGS, growthSvg } from './assets/floraAssets'
import type { AmbientSoundType } from './services/SoundManager'
import { onMount, onDestroy } from 'svelte'
import { slide } from 'svelte/transition'
import { EARLY_HARVEST_RATE } from './services/Progression'

export let timer: Timer
export let tasks: Tasks
export let tracker: TaskTracker
export let render: (content: string, el: HTMLElement) => void

type Extra = 'settings' | 'forest' | 'tasks' | 'close'
let extra: Extra = 'forest'
let forestTab: 'village' | 'grove' | 'market' | 'journey' = 'village'
let showSpeciesPicker = false
let confirmAbandon = false
let confettiCanvas: HTMLCanvasElement

const engine = pluginInstance?.forestEngine

onMount(() => {
    if (confettiCanvas && engine?.confettiEngine) engine.confettiEngine.attach(confettiCanvas)
})
onDestroy(() => {
    // The confetti engine is shared; only detach if it is still drawing on our canvas
    if (confettiCanvas) engine?.confettiEngine?.detach(confettiCanvas)
})

// Dial geometry
const R = 88
const C = 2 * Math.PI * R
$: progress = $timer.count > 0 ? $timer.elapsed / $timer.count : 0
$: dashOffset = C * (1 - progress)
$: isBreak = $timer.mode === 'BREAK'

$: plant = $activePlantStore
$: species = getSpecies(plant?.speciesId || $gamificationStore.selectedSpeciesId) || FLORA_SPECIES[0]
$: ringColor = isBreak ? '#4fc3f7' : species.color
$: stage = isBreak ? 'break' : plant ? plant.currentStage : 'idle'

// Grow smoothly within each of the four stages, then pop into the next
$: ratio = plant?.progressRatio ?? 0
$: withinStage = Math.min(1, (ratio % 0.25) / 0.25)
$: plantScale = stage === 'idle' || stage === 'break' ? 1 : stage === 'mature' ? 0.86 + 0.14 * Math.min(1, (ratio - 0.75) / 0.25) : 0.78 + 0.22 * withinStage
$: plantSvg =
    stage === 'break'
        ? TEA_SVG
        : stage === 'idle' || stage === 'mature'
          ? SPECIES_SVGS[species.id] || SPECIES_SVGS.classic_pine
          : growthSvg(stage as 'seed' | 'sprout' | 'sapling', species.id)

$: stageLabel =
    stage === 'break'
        ? 'Rest · stretch, sip, breathe'
        : stage === 'idle'
          ? `${species.name} · tap to change`
          : { seed: 'Seed planted', sprout: 'Sprouting', sapling: 'Sapling', mature: 'Almost grown', withered: '' }[stage]

// The focused task was checked off mid-session: offer to end it early
let dismissedAt: number | null = null
$: showTaskDone = $timer.taskDone && dismissedAt !== $timer.taskDoneAt
$: harvestReady = $timer.elapsed >= $timer.earlyHarvestAt
$: focusedMin = Math.floor($timer.elapsed / 60000)
$: readyIn = clock($timer.earlyHarvestAt - $timer.elapsed)
$: spare = clock($timer.remained.millis)
const earlyPct = `${Math.round(EARLY_HARVEST_RATE * 100)}%`

function clock(ms: number): string {
    const total = Math.max(0, Math.ceil(ms / 1000))
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function keepGoing() {
    dismissedAt = $timer.taskDoneAt
}

function pickNextTask() {
    keepGoing()
    extra = 'tasks'
}

$: goal = $settings.dailyGoal || 4
$: doneToday = $todayLog.completedPomodoros
$: questsDone = $questBoard ? $questBoard.quests.filter((q) => q.claimed).length : 0

const TEA_SVG = `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="32" cy="56" rx="20" ry="4" fill="#000" opacity=".15"/>
    <path class="steam" d="M26 20c-3-4 3-6 0-10M33 18c-3-4 3-6 0-10M40 20c-3-4 3-6 0-10" stroke="#b0bec5" stroke-width="2" stroke-linecap="round" opacity=".8"/>
    <path d="M16 28h32v10c0 9-7 15-16 15S16 47 16 38V28z" fill="#e8f1f2" stroke="#2b2118" stroke-opacity=".35"/>
    <path d="M18 30h28v4H18z" fill="#8d6e63" opacity=".55"/>
    <path d="M48 32h3a5 5 0 010 10h-4" stroke="#e8f1f2" stroke-width="3.5" fill="none"/>
    <path d="M22 44c3 4 17 4 20 0" stroke="#81c784" stroke-width="2" stroke-linecap="round"/>
</svg>`

function toggleExtra(value: Exclude<Extra, 'close'>) {
    extra = extra === value ? 'close' : value
}

function openForest(tab: typeof forestTab) {
    forestTab = tab
    extra = 'forest'
}

function onMainButton() {
    confirmAbandon = false
    timer.toggleTimer()
}

function onReset() {
    const s = $timer
    const wouldWither = s.inSession && s.mode === 'WORK' && s.elapsed >= 60000 && $settings.hardcoreMode && !s.taskDone
    if (wouldWither && !confirmAbandon) {
        confirmAbandon = true
        return
    }
    confirmAbandon = false
    timer.reset()
}

function pickSpecies(id: string) {
    engine?.selectSpecies(id)
    showSpeciesPicker = false
}

function onAmbient(e: Event) {
    engine?.setAmbientSound((e.currentTarget as HTMLSelectElement).value as AmbientSoundType, $gamificationStore.ambientVolume || 0.3)
}
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="container">
    <canvas bind:this={confettiCanvas} class="confetti-canvas"></canvas>
    <RewardToasts />

    <div class="main">
        <HudBar compact />

        <div class="dial" class:running={$timer.running} class:break={isBreak} style="--ring:{ringColor}">
            <svg class="ring" viewBox="0 0 200 200" aria-hidden="true">
                <defs>
                    <linearGradient id="pf-ring-grad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stop-color={ringColor} stop-opacity=".55" />
                        <stop offset="1" stop-color={ringColor} />
                    </linearGradient>
                </defs>
                <circle class="track" cx="100" cy="100" r={R} />
                {#each Array(60) as _, i}
                    <line
                        class="tick {i % 5 === 0 ? 'major' : ''}"
                        x1="100" y1={100 - R - 7} x2="100" y2={100 - R - (i % 5 === 0 ? 11 : 9)}
                        transform="rotate({i * 6} 100 100)" />
                {/each}
                <circle
                    class="progress"
                    cx="100" cy="100" r={R}
                    stroke="url(#pf-ring-grad)"
                    stroke-dasharray={C}
                    stroke-dashoffset={dashOffset}
                    transform="rotate(-90 100 100)" />
                {#if progress > 0}
                    <circle class="head" cx={100 + R * Math.sin(progress * 2 * Math.PI)} cy={100 - R * Math.cos(progress * 2 * Math.PI)} r="5" fill={ringColor} />
                {/if}
            </svg>

            <div class="face">
                <button class="mode-chip" on:click={() => timer.toggleMode()} title="Switch between focus and break">
                    {#if $timer.running}<span class="breath"></span>{/if}
                    {isBreak ? 'Break' : 'Focus'}
                </button>

                <div
                    class="plant-bed"
                    class:pickable={!$timer.inSession && !isBreak}
                    on:click={() => { if (!$timer.inSession && !isBreak) showSpeciesPicker = !showSpeciesPicker }}
                    title={$timer.inSession ? stageLabel : 'Choose what to grow'}>
                    <div class="soil"></div>
                    {#key stage}
                        <div class="plant pf-scene stage-{stage}" class:idle={stage === 'idle'} style="transform: scale({plantScale})">
                            {@html plantSvg}
                        </div>
                    {/key}
                </div>

                <button class="time" on:click={onMainButton} title={$timer.running ? 'Pause' : 'Start'}>{$timer.remained.human}</button>
                <span class="stage-label">{stageLabel}</span>
            </div>

            {#if showSpeciesPicker && !$timer.inSession}
                <div class="picker">
                    <div class="picker-head">
                        <span>What will you grow?</span>
                        <button class="x" on:click={() => (showSpeciesPicker = false)}>✕</button>
                    </div>
                    <div class="picker-grid">
                        {#each FLORA_SPECIES.filter((s) => $gamificationStore.unlockedSpecies.includes(s.id)) as sp (sp.id)}
                            <button class="pick {sp.id === $gamificationStore.selectedSpeciesId ? 'active' : ''}" on:click={() => pickSpecies(sp.id)}>
                                <span class="pick-art">{@html sp.iconSvg}</span>
                                <span class="pick-name">{sp.name}</span>
                            </button>
                        {/each}
                    </div>
                    <button class="more" on:click={() => { showSpeciesPicker = false; openForest('market') }}>🌱 More seeds in the market →</button>
                </div>
            {/if}
        </div>

        {#if confirmAbandon}
            <div class="abandon">
                <span>Give up now? This tree will wither.</span>
                <div>
                    <button class="keep" on:click={() => (confirmAbandon = false)}>Keep growing</button>
                    <button class="give-up" on:click={onReset}>Give up</button>
                </div>
            </div>
        {/if}

        {#if showTaskDone}
            <div class="task-done" transition:slide={{ duration: 200 }} role="status">
                <div class="td-head">
                    <span class="td-title">✅ Task done with {spare} to spare</span>
                    <button class="x" on:click={keepGoing} aria-label="Keep focusing" title="Keep focusing">✕</button>
                </div>
                {#if harvestReady}
                    <p>Harvest a young tree now for your {focusedMin} focused minutes at {earlyPct} of the usual rewards, or keep going for the full tree and its sapling.</p>
                    <div class="td-actions">
                        <button class="td-main" on:click={() => timer.harvestEarly()}>🌿 Harvest early</button>
                        <button on:click={keepGoing}>Keep going</button>
                    </div>
                {:else}
                    <p>Early harvest opens in {readyIn}. Pick your next task and keep this tree growing, or end the session now. It won't wither.</p>
                    <div class="td-actions">
                        <button class="td-main" on:click={pickNextTask}>Pick next task</button>
                        <button on:click={() => timer.harvestEarly()}>End session</button>
                    </div>
                {/if}
            </div>
        {/if}

        <div class="btn-group">
            <span on:click={() => toggleExtra('tasks')} class="control {extra === 'tasks' ? 'active-icon' : ''}" title="Tasks">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="6" height="6" rx="1" /><path d="m3 17 2 2 4-4" /><path d="M13 6h8" /><path d="M13 12h8" /><path d="M13 18h8" /></svg>
            </span>
            <span on:click={onReset} class="control" title={$timer.inSession && !isBreak ? 'Give up (reset)' : 'Reset'}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
            </span>
            <span on:click={onMainButton} class="control main-action-btn" title={$timer.running ? 'Pause' : 'Start'}>
                {#if $timer.running}
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect width="4" height="16" x="6" y="4" rx="1" /><rect width="4" height="16" x="14" y="4" rx="1" /></svg>
                {:else}
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" /></svg>
                {/if}
            </span>
            <span on:click={() => toggleExtra('forest')} class="control {extra === 'forest' ? 'active-icon' : ''}" title="Village & forest">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z" /><path d="M7 16v6" /><path d="M13 19v3" /><path d="M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-1.4 1.5" /></svg>
            </span>
            <span on:click={() => toggleExtra('settings')} class="control {extra === 'settings' ? 'active-icon' : ''}" title="Timer settings">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7h-9" /><path d="M14 17H5" /><circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" /></svg>
            </span>
        </div>

        <div class="today">
            <button class="goal" on:click={() => openForest('grove')} title="{doneToday} of {goal} trees today">
                {#each Array(Math.max(goal, doneToday)) as _, i}
                    <span class="seedling {i < doneToday ? 'done' : ''} {i >= goal ? 'extra' : ''}"></span>
                {/each}
                <span class="goal-text">{doneToday}/{goal}</span>
            </button>
            <button class="quests-chip" on:click={() => openForest('journey')} title="Today's quests">
                📯 {questsDone}/{$questBoard?.quests.length ?? 3}
            </button>
            <select class="ambient" value={$gamificationStore.ambientSound || 'none'} on:change={onAmbient} title="Ambient sound while focusing">
                <option value="none">🔇</option>
                <option value="rain">🌧️</option>
                <option value="forest_stream">🏞️</option>
                <option value="breeze">🍃</option>
            </select>
        </div>
    </div>

    <div class="pomodoro-extra">
        {#if extra == 'tasks'}
            <TasksComponent {tasks} {tracker} {render} />
        {:else if extra == 'settings'}
            <TimerSettingsComponent />
        {:else if extra == 'forest'}
            <ForestComponent bind:activeTab={forestTab} />
        {/if}
    </div>
</div>

<style>
.container {
    width: 100%;
    min-width: 220px;
    display: flex;
    flex-direction: column;
    height: 100%;
    position: relative;
}
.confetti-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 45;
}
.main {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    z-index: 2;
}

/* Dial */
.dial {
    position: relative;
    width: 220px;
    height: 220px;
    margin-top: 4px;
}
.ring {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
}
.track {
    fill: none;
    stroke: var(--pomodoro-timer-color);
    stroke-width: 6;
    opacity: 0.45;
}
.tick {
    stroke: var(--text-faint);
    stroke-width: 1;
    opacity: 0.4;
}
.tick.major {
    stroke-width: 1.6;
    opacity: 0.7;
}
.progress {
    fill: none;
    stroke-width: 9;
    stroke-linecap: round;
    transition: stroke-dashoffset 0.35s linear;
}
.head {
    filter: drop-shadow(0 0 4px var(--ring));
}
.running .head {
    animation: pf-head 1.6s ease-in-out infinite;
}
@keyframes pf-head {
    50% { r: 6.5; }
}
.face {
    position: absolute;
    inset: 22px;
    border-radius: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: radial-gradient(circle at 50% 35%, color-mix(in srgb, var(--ring) 14%, transparent), transparent 70%);
}
.mode-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: auto;
    padding: 2px 10px;
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    border-radius: 99px;
    border: none;
    box-shadow: none;
    background: color-mix(in srgb, var(--ring) 18%, transparent);
    color: var(--text-normal);
    cursor: pointer;
}
.plant-bed {
    position: relative;
    width: 96px;
    height: 84px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
}
.plant-bed.pickable { cursor: pointer; }
.plant-bed.pickable:hover .plant { filter: brightness(1.08) drop-shadow(0 0 6px color-mix(in srgb, var(--ring) 60%, transparent)); }
.soil {
    position: absolute;
    bottom: 2px;
    width: 64px;
    height: 12px;
    border-radius: 50%;
    background: radial-gradient(ellipse at 50% 40%, #8d6e63, #5d4037 70%);
    opacity: 0.55;
}
.plant {
    position: relative;
    width: 84px;
    height: 84px;
    transform-origin: 50% 88%;
    transition: transform 0.9s ease;
    animation: pf-plant-pop 0.6s cubic-bezier(0.3, 1.6, 0.5, 1);
}
.plant :global(svg) { width: 100%; height: 100%; }
.plant.idle { opacity: 0.9; }
.running .plant :global(svg) { animation: pf-breathe 3.2s ease-in-out infinite; transform-origin: 50% 88%; }
.plant :global(.steam) { animation: pf-steam 2.4s ease-in-out infinite; }
@keyframes pf-plant-pop { from { transform: scale(0.3); } }
@keyframes pf-breathe { 50% { transform: scale(1.035) rotate(0.6deg); } }
@keyframes pf-steam { 0%, 100% { opacity: 0.2; transform: translateY(2px); } 50% { opacity: 0.9; transform: translateY(-2px); } }
.time {
    height: auto;
    padding: 0 6px;
    border: none;
    box-shadow: none;
    background: none;
    font-size: 1.55rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
    color: var(--pomodoro-timer-text-color);
    cursor: pointer;
}
.stage-label {
    font-size: 0.66rem;
    color: var(--text-muted);
    max-width: 150px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* Seed picker */
.picker {
    position: absolute;
    top: 6px;
    left: -24px;
    right: -24px;
    z-index: 20;
    padding: 10px;
    border-radius: 14px;
    background: var(--background-primary);
    border: 1px solid var(--interactive-accent);
    box-shadow: 0 14px 36px rgba(0, 0, 0, 0.35);
}
.picker-head {
    display: flex;
    justify-content: space-between;
    font-size: 0.78rem;
    font-weight: 700;
    margin-bottom: 8px;
}
.x { height: auto; padding: 0 6px; background: none; border: none; box-shadow: none; cursor: pointer; color: var(--text-muted); }
.picker-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    max-height: 170px;
    overflow-y: auto;
}
.pick {
    display: flex;
    flex-direction: column;
    align-items: center;
    height: auto;
    padding: 5px 2px;
    border-radius: 10px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    cursor: pointer;
}
.pick.active { border-color: var(--interactive-accent); box-shadow: 0 0 0 1px var(--interactive-accent); }
.pick-art { width: 36px; height: 36px; }
.pick-art :global(svg) { width: 100%; height: 100%; }
.pick-name { font-size: 0.6rem; color: var(--text-muted); text-align: center; line-height: 1.1; }
.more { width: 100%; margin-top: 8px; font-size: 0.72rem; }

.abandon {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: center;
    padding: 8px 10px;
    border-radius: 12px;
    font-size: 0.76rem;
    background: rgba(161, 136, 127, 0.15);
    border: 1px solid rgba(161, 136, 127, 0.5);
}
.abandon div { display: flex; gap: 6px; }

.task-done {
    width: 100%;
    max-width: 280px;
    padding: 8px 10px;
    border-radius: 12px;
    font-size: 0.74rem;
    background: color-mix(in srgb, #43a047 12%, transparent);
    border: 1px solid color-mix(in srgb, #43a047 45%, transparent);
}
.td-head { display: flex; justify-content: space-between; align-items: center; }
.td-title { font-weight: 700; font-variant-numeric: tabular-nums; }
.task-done p { margin: 4px 0 8px; color: var(--text-muted); line-height: 1.35; }
.td-actions { display: flex; gap: 6px; justify-content: center; }
.td-actions button { font-size: 0.72rem; padding: 3px 10px; }
.td-main { background: #43a047; color: #fff; }
.td-main:hover { background: #388e3c; }
.abandon button { font-size: 0.72rem; padding: 3px 10px; }
.keep { background: var(--interactive-accent); color: var(--text-on-accent); }

/* Controls */
.btn-group {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 220px;
}
.control {
    cursor: pointer;
    color: var(--text-muted);
    transition: color 0.15s, transform 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
}
.control:hover { color: var(--text-normal); background: var(--background-modifier-hover); }
.control.active-icon { color: var(--interactive-accent); }
.main-action-btn {
    width: 48px;
    height: 48px;
    color: #fff !important;
    background: var(--ring, var(--interactive-accent));
    box-shadow: 0 4px 14px color-mix(in srgb, var(--ring, #4caf50) 45%, transparent);
}
.main-action-btn:hover { transform: scale(1.07); background: var(--ring, var(--interactive-accent)); }

/* Today strip */
.today {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    max-width: 300px;
    justify-content: center;
}
.goal, .quests-chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 26px;
    padding: 0 9px;
    border-radius: 99px;
    font-size: 0.7rem;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    box-shadow: none;
    cursor: pointer;
}
.seedling {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1.5px solid #81c784;
}
.seedling.done { background: #43a047; border-color: #43a047; }
.seedling.extra { border-color: #ffb300; background: #ffb300; }
.goal-text { margin-left: 3px; font-weight: 700; font-variant-numeric: tabular-nums; }
.ambient {
    height: 26px;
    padding: 0 4px;
    font-size: 0.75rem;
    border-radius: 99px;
}
.pomodoro-extra {
    width: 100%;
    margin-top: 1rem;
}
.breath {
    width: 6px;
    height: 6px;
    display: inline-block;
    background-color: var(--pomodoro-timer-dot-color);
    border-radius: 50%;
    animation: blink 1.2s ease-in-out infinite;
}
@keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.2; }
}
</style>
