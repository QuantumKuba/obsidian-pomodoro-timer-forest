<script lang="ts">
import type { BoardMemory } from '../types/forest'
import { BOARD_MILESTONES, addDays, dateKey, daysBetween, estimateOnTarget, parseDateKey } from '../services/Progression'
import Icon from '../tasks/Icon.svelte'

export let memory: BoardMemory | undefined
/** Cards on the board now, by role. */
export let counts: { backlog: number; active: number; done: number }
/** Lanes over their card limit. */
export let overLimit: string[] = []

$: history = memory?.history ?? []
$: shipped = memory?.shipped ?? 0
$: today = dateKey()
$: days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13))
$: perDay = days.map((d) => history.filter((h) => h.date === d).length)
$: peak = Math.max(1, ...perDay)
$: ago = (date: string) => daysBetween(date, today)
$: thisWeek = history.filter((h) => ago(h.date) < 7)
$: lastWeek = history.filter((h) => ago(h.date) >= 7 && ago(h.date) < 14).length
$: trend = thisWeek.length - lastWeek
$: cycles = history.filter((h) => h.days !== null).map((h) => h.days as number)
$: cycle = cycles.length ? cycles.reduce((a, b) => a + b, 0) / cycles.length : null
$: estimated = history.filter((h) => h.expected > 0 && h.actual > 0)
$: onTarget = estimated.filter((h) => estimateOnTarget(h.actual, h.expected)).length
$: withDue = history.filter((h) => h.onTime !== null)
$: onTime = withDue.filter((h) => h.onTime).length
$: focusWeek = thisWeek.reduce((a, h) => a + h.actual, 0)
$: next = BOARD_MILESTONES.find((m) => m > shipped) ?? null
$: prev = [...BOARD_MILESTONES].reverse().find((m) => m <= shipped) ?? 0
$: wip = counts.active

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '–')
const weekday = (d: string) => parseDateKey(d).toLocaleDateString(undefined, { weekday: 'narrow' })
const long = (d: string) => parseDateKey(d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
</script>

<section class="pf-stats" aria-label="Board statistics">
    <div class="tiles">
        <div class="tile">
            <span class="k">Finished this week</span>
            <span class="v">{thisWeek.length}</span>
            <span class="d" class:up={trend > 0} class:down={trend < 0}>
                {#if trend !== 0}<Icon name={trend > 0 ? 'trending-up' : 'trending-down'} size={11} />{/if}
                {trend === 0 ? 'same as last week' : `${Math.abs(trend)} ${trend > 0 ? 'more' : 'fewer'} than last week`}
            </span>
        </div>
        <div class="tile">
            <span class="k">Cycle time</span>
            <span class="v">{cycle === null ? '–' : cycle < 1 ? '<1' : cycle.toFixed(cycle < 10 ? 1 : 0)}<small>{cycle === null ? '' : ' days'}</small></span>
            <span class="d">from in progress to done</span>
        </div>
        <div class="tile">
            <span class="k">Estimates on target</span>
            <span class="v">{pct(onTarget, estimated.length)}</span>
            <span class="d">{estimated.length ? `${onTarget} of ${estimated.length} estimated cards` : 'plan 🍅 on cards to see this'}</span>
        </div>
        <div class="tile">
            <span class="k">On time</span>
            <span class="v">{pct(onTime, withDue.length)}</span>
            <span class="d">{withDue.length ? `${onTime} of ${withDue.length} cards with a due date` : 'no due dates yet'}</span>
        </div>
        <div class="tile">
            <span class="k">Focus behind them</span>
            <span class="v">{focusWeek}<small> 🍅</small></span>
            <span class="d">on cards finished this week</span>
        </div>
        <div class="tile">
            <span class="k">In progress</span>
            <span class="v" class:warn={overLimit.length > 0}>{wip}</span>
            <span class="d" class:warn={overLimit.length > 0}>{overLimit.length ? `over the limit in ${overLimit.join(', ')}` : 'within every limit'}</span>
        </div>
    </div>

    <div class="chart" role="img" aria-label="Cards finished each day for the last two weeks">
        {#each days as d, i}
            <div class="col" title="{long(d)}: {perDay[i]} finished">
                <div class="bar" class:today={d === today} class:zero={perDay[i] === 0} style="height:{Math.max(3, (perDay[i] / peak) * 100)}%"></div>
                <span class="day">{weekday(d)}</span>
            </div>
        {/each}
    </div>

    <div class="milestone">
        <Icon name="trophy" size={13} />
        <span><b>{shipped}</b> finished on this board{next ? ` · next milestone at ${next}` : ''}</span>
        {#if next}
            <div class="track"><div class="fill" style="width:{Math.round(((shipped - prev) / (next - prev)) * 100)}%"></div></div>
        {/if}
    </div>
</section>

<style>
.pf-stats {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(200px, 280px);
    gap: 10px 18px;
    padding: 12px 14px;
    margin: 0 16px;
    border-radius: 14px;
    border: 1px solid var(--pf-lane-border);
    background: var(--pf-lane-bg);
}
.tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 8px;
}
.tile {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 8px 10px;
    border-radius: 10px;
    background: var(--pf-card-bg);
    border: 1px solid var(--pf-card-border);
}
.k {
    font-size: 0.64rem;
    font-weight: 650;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-faint);
}
.v {
    font-size: 1.3rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--text-normal);
    line-height: 1.25;
}
.v small {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--text-muted);
}
.d {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.68rem;
    color: var(--text-muted);
}
.d.up {
    color: var(--color-green);
}
.d.down {
    color: var(--color-orange);
}
.warn {
    color: var(--color-orange);
}
.chart {
    grid-row: span 2;
    display: grid;
    grid-template-columns: repeat(14, 1fr);
    align-items: end;
    gap: 4px;
    min-height: 120px;
    padding: 8px 4px 0;
}
.col {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    height: 100%;
}
.bar {
    width: 100%;
    max-width: 16px;
    border-radius: 4px 4px 2px 2px;
    background: color-mix(in srgb, var(--color-green) 55%, transparent);
    transition: height 0.3s ease;
}
.bar.zero {
    background: var(--background-modifier-border);
}
.bar.today {
    background: var(--color-green);
}
.day {
    font-size: 0.6rem;
    color: var(--text-faint);
}
.milestone {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.74rem;
    color: var(--text-muted);
}
.milestone :global(.pf-icon) {
    color: var(--color-yellow);
}
.milestone .track {
    flex: 1;
    max-width: 220px;
    height: 4px;
    border-radius: 4px;
    background: var(--background-modifier-border);
    overflow: hidden;
}
.milestone .fill {
    height: 100%;
    border-radius: 4px;
    background: var(--color-yellow);
}
@media (max-width: 720px) {
    .pf-stats {
        grid-template-columns: 1fr;
    }
    .chart {
        grid-row: auto;
        min-height: 90px;
    }
}
</style>
