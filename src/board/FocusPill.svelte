<script lang="ts">
import type Timer from '../Timer'
import type TaskTracker from '../TaskTracker'
import Icon from '../tasks/Icon.svelte'

export let timer: Timer
export let tracker: TaskTracker
/** The board's note: its focused card can be scrolled to. */
export let path: string
export let onShowCard: (blockId: string) => void

const R = 9
const C = 2 * Math.PI * R

$: t = $timer
$: task = $tracker.task
$: working = t.mode === 'WORK'
$: ratio = t.count > 0 ? t.elapsed / t.count : 0
$: time = t.remained.human.replace(/\s/g, '')
$: here = !!task && task.path === path
$: label = working ? task?.name || task?.description || 'Focus session' : 'Break'
$: idle = !t.inSession

function showCard() {
    if (here && task?.blockLink) onShowCard(task.blockLink.trim().replace(/^\^/, ''))
}
</script>

<div class="pf-focus" class:idle class:break={!working} class:running={t.running} class:done={t.taskDone}>
    {#if idle && !task}
        <span class="hint"><Icon name="target" size={13} />Press <Icon name="play" size={9} filled /> on a card to focus on it</span>
        <button class="go" title="Start a focus session without a card" aria-label="Start a focus session" on:click={() => timer.start()}>
            <Icon name="play" size={11} filled />
        </button>
    {:else}
        <svg class="ring" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r={R} class="track" />
            <circle cx="12" cy="12" r={R} class="fill" stroke-dasharray={C} stroke-dashoffset={C * (1 - ratio)} transform="rotate(-90 12 12)" />
        </svg>
        <div class="body">
            <span class="time">{idle ? `${working ? t.workLen : t.breakLen}:00` : time}</span>
            <button class="label" class:link={here} title={here ? 'Show this card' : label} on:click={showCard}>
                {#if !working}Break{:else if idle}Next: {label}{:else}{label}{/if}
            </button>
        </div>
        {#if t.taskDone}
            <button class="harvest" title="The card is done: end the session now" on:click={() => timer.harvestEarly()}>
                <Icon name="check" size={12} />Harvest
            </button>
        {/if}
        <button class="go" aria-label={t.running ? 'Pause' : 'Start'} title={t.running ? 'Pause' : idle ? 'Start the session' : 'Resume'} on:click={() => timer.toggleTimer()}>
            <Icon name={t.running ? 'pause' : 'play'} size={11} filled />
        </button>
    {/if}
</div>

<style>
.pf-focus {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    max-width: 360px;
    height: 38px;
    padding: 0 5px 0 8px;
    border-radius: 12px;
    border: 1px solid var(--pf-lane-border);
    background: var(--pf-card-bg);
    box-shadow: var(--pf-card-shadow);
}
.pf-focus.running:not(.break) {
    border-color: color-mix(in srgb, var(--interactive-accent) 50%, var(--pf-lane-border));
}
.ring {
    flex: none;
    width: 24px;
    height: 24px;
}
.ring circle {
    fill: none;
    stroke-width: 2.6;
}
.track {
    stroke: var(--background-modifier-border);
}
.fill {
    stroke: var(--interactive-accent);
    stroke-linecap: round;
    transition: stroke-dashoffset 1s linear;
}
.break .fill {
    stroke: var(--color-cyan, var(--color-blue));
}
.body {
    display: flex;
    flex-direction: column;
    min-width: 0;
    line-height: 1.15;
}
.time {
    font-size: 0.84rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--text-normal);
}
.label {
    max-width: 220px;
    height: auto;
    padding: 0;
    border: none;
    box-shadow: none;
    background: none;
    font-size: 0.7rem;
    color: var(--text-muted);
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: default;
}
.label.link {
    cursor: pointer;
}
.label.link:hover {
    color: var(--text-accent, var(--interactive-accent));
}
.hint {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding-right: 2px;
    font-size: 0.74rem;
    color: var(--text-faint);
    white-space: nowrap;
}
.go,
.harvest {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    height: 28px;
    border: none;
    border-radius: 9px;
    box-shadow: none;
    cursor: pointer;
}
.go {
    width: 28px;
    padding: 0;
    color: var(--text-on-accent, #fff);
    background: var(--interactive-accent);
}
.go:hover {
    background: var(--interactive-accent-hover, var(--interactive-accent));
}
.harvest {
    padding: 0 9px;
    font-size: 0.72rem;
    font-weight: 650;
    color: var(--color-green);
    background: color-mix(in srgb, var(--color-green) 14%, transparent);
}
.harvest:hover {
    background: color-mix(in srgb, var(--color-green) 22%, transparent);
}
</style>
