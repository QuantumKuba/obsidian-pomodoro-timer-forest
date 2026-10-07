<script lang="ts">
import type { BoardCard } from './BoardModel'
import type { BoardLaneRole } from '../types/forest'
import type { CardDragger } from './dnd'
import type { BoardContext, FocusInfo } from './context'
import Icon from '../tasks/Icon.svelte'
import Pomodoros from '../tasks/Pomodoros.svelte'
import { describeDue, describeStart, longDate, daysFromToday } from '../tasks/dates'
import { ICONS } from '../assets/floraAssets'
import { markdown } from './markdown'

export let card: BoardCard
export let role: BoardLaneRole
export let ctx: BoardContext
export let dragger: CardDragger
/** `YYYY-MM-DD`, read in the board's date format. */
export let due = ''
/** The day the card entered its lane. */
export let since: string | undefined = undefined
export let dragged = false
export let focus: FocusInfo | null = null
export let burst: { coins: number; xp: number } | null = null
export let canDrag = true

let el: HTMLDivElement

$: done = card.checked || role === 'done'
$: dueInfo = due ? describeDue(due, done) : null
$: startInfo = card.meta.start && !done ? describeStart(card.meta.start) : null
$: age = since ? Math.max(0, -daysFromToday(since)) : 0
$: staleAfter = ctx.staleDays
$: stale = !done && role === 'active' && staleAfter > 0 && age >= staleAfter
$: showAge = !done && role === 'active' && age >= 1
$: sub = card.meta.subtasks
$: hasMeta = card.meta.actual > 0 || card.meta.expected > 0 || !!dueInfo || !!startInfo || !!card.meta.time || sub.total > 0 || showAge

function onPointerDown(e: PointerEvent) {
    if (canDrag) dragger.pointerDown(e, card.key, { lane: card.lane, index: card.index }, el)
}

function onClick(e: MouseEvent) {
    if (dragger.justDragged) return
    const t = e.target as HTMLElement
    const link = t.closest<HTMLAnchorElement>('a.internal-link')
    if (link) {
        e.preventDefault()
        e.stopPropagation()
        ctx.view.openLink(link.dataset.href ?? link.getAttribute('href') ?? '', e)
        return
    }
    const tag = t.closest<HTMLAnchorElement>('a.tag')
    if (tag) {
        e.preventDefault()
        e.stopPropagation()
        ctx.filterTag(tag.textContent ?? '')
        return
    }
    if (t.closest('a')) return
    const box = t.closest<HTMLInputElement>('input.task-list-item-checkbox')
    if (box) {
        e.preventDefault()
        const all = Array.from(el.querySelectorAll('input.task-list-item-checkbox'))
        ctx.view.toggleSubtask(card.key, all.indexOf(box))
        return
    }
    ctx.edit(card.key)
}

function onHover(e: MouseEvent) {
    const link = (e.target as HTMLElement).closest<HTMLAnchorElement>('a.internal-link')
    if (link) ctx.view.hoverLink(link.dataset.href ?? link.getAttribute('href') ?? '', e, link)
}

function onKey(e: KeyboardEvent) {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter') {
        e.preventDefault()
        ctx.edit(card.key)
    } else if (e.key === ' ') {
        e.preventDefault()
        ctx.view.toggleCard(card.key)
    }
}

const coinSvg = ICONS.coin
</script>

<!-- svelte-ignore a11y-no-static-element-interactions a11y-mouse-events-have-key-events -->
<div
    bind:this={el}
    class="pf-card"
    class:done
    class:focused={!!focus}
    class:running={focus?.running}
    class:stale
    class:pf-dragged={dragged}
    class:no-drag-hint={!canDrag}
    data-card={card.key}
    data-priority={card.meta.priority || null}
    role="button"
    tabindex="0"
    aria-label={card.meta.label}
    on:pointerdown={onPointerDown}
    on:click={onClick}
    on:mouseover={onHover}
    on:keydown={onKey}
    on:contextmenu|preventDefault={(e) => {
        if (!dragger.busy) ctx.cardMenu(card, e)
    }}
>
    {#if focus}
        <div class="focus-bar" aria-hidden="true"><div class="focus-fill" style="width:{Math.round(focus.ratio * 100)}%"></div></div>
    {/if}
    <div class="top">
        <button
            class="check"
            class:on={done}
            aria-label={done ? 'Open this card again' : 'Finish this card'}
            title={done ? 'Open again' : 'Finish'}
            on:click|stopPropagation={() => ctx.view.toggleCard(card.key)}
        >
            <svg viewBox="0 0 20 20" aria-hidden="true">
                <circle cx="10" cy="10" r="8.2" />
                <path d="M6.2 10.4l2.5 2.5 5.2-5.6" />
            </svg>
        </button>
        <div class="text" use:markdown={{ text: card.meta.title, render: ctx.render }}></div>
        {#if focus}
            <button
                class="timer"
                class:paused={!focus.running}
                title={focus.running ? 'Pause the timer' : 'Resume the timer'}
                aria-label={focus.running ? 'Pause the timer' : 'Resume the timer'}
                on:click|stopPropagation={ctx.toggleTimer}
            >
                <span class="pulse" aria-hidden="true"></span>{focus.remaining}
            </button>
        {:else if !done}
            <button class="play" title="Focus on this card" aria-label="Focus on this card" on:click|stopPropagation={() => ctx.view.focusCard(card.key, true)}>
                <Icon name="play" size={11} filled />
            </button>
        {/if}
    </div>

    {#if hasMeta}
        <div class="meta">
            <Pomodoros actual={card.meta.actual} expected={card.meta.expected} max={6} />
            {#if dueInfo}
                <span class="chip {dueInfo.tone}" title="Due {longDate(due)}"><Icon name="calendar" size={10} />{dueInfo.text}</span>
            {/if}
            {#if card.meta.time}
                <span class="chip"><Icon name="clock" size={10} />{card.meta.time}</span>
            {/if}
            {#if startInfo && startInfo.tone === 'future'}
                <span class="chip future" title="Starts {longDate(card.meta.start)}"><Icon name="play" size={9} filled />{startInfo.text}</span>
            {/if}
            {#if sub.total > 0}
                <span class="chip sub" class:all={sub.done === sub.total} title="{sub.done} of {sub.total} checklist items done">
                    <Icon name="check-square" size={10} />{sub.done}/{sub.total}
                </span>
            {/if}
            {#if showAge}
                <span class="chip age" class:stale title={stale ? `Waiting ${age} days in this lane: finish it, split it or move it back` : `${age} day${age === 1 ? '' : 's'} in this lane`}>
                    <Icon name="hourglass" size={10} />{age}d
                </span>
            {/if}
        </div>
    {/if}

    {#if burst}
        <div class="burst" aria-live="polite">
            {#if burst.coins}<span>+{burst.coins}{@html coinSvg}</span>{/if}
            {#if burst.xp}<span>+{burst.xp} XP</span>{/if}
        </div>
    {/if}
</div>

<style>
.pf-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 9px 10px 9px 8px;
    border-radius: 10px;
    background: var(--pf-card-bg);
    border: 1px solid var(--pf-card-border);
    box-shadow: var(--pf-card-shadow);
    cursor: grab;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
    outline: none;
    transition: box-shadow 0.16s ease, border-color 0.16s ease, transform 0.16s ease, opacity 0.2s ease;
}
.pf-card.no-drag-hint {
    cursor: pointer;
}
.pf-card:hover {
    border-color: var(--pf-card-border-hover);
    box-shadow: var(--pf-card-shadow-hover);
}
.pf-card:focus-visible {
    box-shadow: 0 0 0 2px var(--interactive-accent);
}
.pf-card.pf-dragged {
    display: none;
}
:global(.pf-drag-ghost).pf-card {
    cursor: grabbing;
    box-shadow: 0 18px 40px -12px rgba(0, 0, 0, 0.35), 0 0 0 1px var(--interactive-accent);
    opacity: 0.96;
}

/* Priority shows as a thin rule on the left edge */
.pf-card[data-priority]::before {
    content: '';
    position: absolute;
    left: -1px;
    top: 9px;
    bottom: 9px;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: var(--pf-prio, transparent);
}
.pf-card[data-priority='highest'] { --pf-prio: var(--color-red); }
.pf-card[data-priority='high'] { --pf-prio: var(--color-orange); }
.pf-card[data-priority='medium'] { --pf-prio: var(--color-yellow); }
.pf-card[data-priority='low'] { --pf-prio: var(--color-blue); }
.pf-card[data-priority='lowest'] { --pf-prio: var(--text-faint); }

.top {
    display: flex;
    align-items: flex-start;
    gap: 6px;
}
.text {
    flex: 1;
    min-width: 0;
    font-size: var(--pf-card-font);
    line-height: 1.42;
    color: var(--text-normal);
    overflow-wrap: anywhere;
}
.text :global(p) {
    margin: 0;
}
.text :global(p + p),
.text :global(ul),
.text :global(ol) {
    margin: 4px 0 0;
}
.text :global(ul),
.text :global(ol) {
    padding-left: 18px;
}
.text :global(ul.contains-task-list) {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 6px 0 0;
    padding: 0;
}
.text :global(li.task-list-item) {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    margin: 0;
    padding: 0;
    font-size: 0.92em;
    line-height: 1.38;
    color: var(--text-muted);
}
.text :global(li.task-list-item.is-checked) {
    color: var(--text-faint);
    text-decoration: line-through;
}
.text :global(.task-list-item-checkbox) {
    flex: none;
    width: 13px;
    height: 13px;
    margin: 2px 0 0 !important;
    cursor: pointer;
}
.text :global(a.tag) {
    font-size: 0.86em;
    padding: 0 6px;
    cursor: pointer;
}
.text :global(img) {
    border-radius: 6px;
    max-height: 160px;
    object-fit: cover;
}
.text :global(pre) {
    font-size: 0.8em;
    margin: 4px 0 0;
}

.check {
    flex: none;
    display: inline-grid;
    place-items: center;
    width: 20px;
    height: 20px;
    margin-top: -0.5px;
    padding: 0;
    border: none;
    border-radius: 50%;
    box-shadow: none;
    background: transparent;
    color: var(--text-faint);
    cursor: pointer;
}
.check svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
}
.check path {
    stroke-dasharray: 14;
    stroke-dashoffset: 14;
    transition: stroke-dashoffset 0.28s ease;
}
.check:hover {
    color: var(--color-green);
}
.check:hover path {
    stroke-dashoffset: 0;
    opacity: 0.55;
}
.check.on {
    color: var(--color-green);
}
.check.on circle {
    fill: color-mix(in srgb, var(--color-green) 16%, transparent);
}
.check.on path {
    stroke-dashoffset: 0;
    opacity: 1;
    stroke-width: 2;
}

.play,
.timer {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: 22px;
    padding: 0 7px;
    margin: -1px -2px 0 0;
    border: none;
    border-radius: 99px;
    box-shadow: none;
    cursor: pointer;
    font-size: 0.72rem;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
}
.play {
    width: 22px;
    padding: 0;
    background: transparent;
    color: var(--text-faint);
    opacity: 0;
    transition: opacity 0.14s, background-color 0.14s, color 0.14s;
}
.pf-card:hover .play,
.pf-card:focus-within .play,
.play:focus-visible {
    opacity: 1;
}
@media (hover: none) {
    .play {
        opacity: 0.6;
    }
}
.play:hover {
    background: color-mix(in srgb, var(--interactive-accent) 16%, transparent);
    color: var(--interactive-accent);
}
.timer {
    color: var(--text-on-accent, #fff);
    background: var(--interactive-accent);
}
.timer.paused {
    color: var(--interactive-accent);
    background: color-mix(in srgb, var(--interactive-accent) 14%, transparent);
}
.pulse {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
}
@media (prefers-reduced-motion: no-preference) {
    .running .pulse {
        animation: pf-card-pulse 1.6s ease-in-out infinite;
    }
}
@keyframes pf-card-pulse {
    50% {
        opacity: 0.35;
    }
}

.pf-card.focused {
    border-color: color-mix(in srgb, var(--interactive-accent) 60%, var(--pf-card-border));
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--interactive-accent) 16%, transparent), var(--pf-card-shadow);
    overflow: hidden;
}
.focus-bar {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 2px;
    background: color-mix(in srgb, var(--interactive-accent) 14%, transparent);
}
.focus-fill {
    height: 100%;
    background: var(--interactive-accent);
    transition: width 1s linear;
}

.pf-card.done .text {
    color: var(--text-muted);
}
.pf-card.done {
    background: var(--pf-card-done-bg);
    box-shadow: none;
}

.meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 6px;
    padding-left: 26px;
    min-height: 16px;
}
.chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 18px;
    padding: 0 6px;
    border-radius: 6px;
    font-size: 0.68rem;
    font-weight: 600;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
    background: var(--background-modifier-hover);
}
.chip.soon,
.chip.today {
    color: var(--color-orange);
    background: color-mix(in srgb, var(--color-orange) 14%, transparent);
}
.chip.overdue {
    color: var(--color-red);
    background: color-mix(in srgb, var(--color-red) 14%, transparent);
}
.chip.past {
    color: var(--text-faint);
    font-weight: 500;
}
.chip.future {
    color: var(--color-blue);
    background: color-mix(in srgb, var(--color-blue) 12%, transparent);
}
.chip.sub.all {
    color: var(--color-green);
    background: color-mix(in srgb, var(--color-green) 12%, transparent);
}
.chip.age {
    color: var(--text-faint);
    background: transparent;
    padding: 0 2px;
}
.chip.age.stale {
    color: var(--color-orange);
    background: color-mix(in srgb, var(--color-orange) 12%, transparent);
    padding: 0 6px;
}
.pf-card.stale {
    border-color: color-mix(in srgb, var(--color-orange) 40%, var(--pf-card-border));
}

.burst {
    position: absolute;
    right: 8px;
    top: 7px;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    border-radius: 99px;
    font-size: 0.7rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--text-normal);
    background: var(--background-primary);
    box-shadow: 0 6px 18px -6px rgba(0, 0, 0, 0.3), 0 0 0 1px var(--background-modifier-border);
    pointer-events: none;
    animation: pf-burst 1.9s ease-out forwards;
}
.burst span {
    display: inline-flex;
    align-items: center;
    gap: 2px;
}
.burst :global(svg) {
    width: 12px;
    height: 12px;
}
@keyframes pf-burst {
    0% {
        opacity: 0;
        transform: translateY(8px) scale(0.92);
    }
    14% {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
    78% {
        opacity: 1;
        transform: translateY(-2px);
    }
    100% {
        opacity: 0;
        transform: translateY(-8px);
    }
}
@media (prefers-reduced-motion: reduce) {
    .burst {
        animation-duration: 2.4s;
        animation-timing-function: steps(1, end);
    }
}
</style>
