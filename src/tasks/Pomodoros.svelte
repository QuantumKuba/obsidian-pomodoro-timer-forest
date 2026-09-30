<script lang="ts">
/** A row of dots: filled for finished pomodoros, hollow for the ones still planned. */
export let actual = 0
export let expected = 0
/** More than this many dots are written as a number instead. */
export let max = 8

$: total = Math.max(actual, expected)
$: label =
    expected > 0
        ? `${actual} of ${expected} pomodoros done`
        : `${actual} pomodoros done`
</script>

{#if total > 0}
    {#if total > max}
        <span class="count" title={label}>🍅 {actual}{expected > 0 ? `/${expected}` : ''}</span>
    {:else}
        <span class="dots" role="img" aria-label={label} title={label}>
            {#each Array(total) as _, i}
                <span
                    class="dot"
                    class:done={i < actual && (expected === 0 || i < expected)}
                    class:over={expected > 0 && i >= expected && i < actual}
                ></span>
            {/each}
        </span>
    {/if}
{/if}

<style>
.dots {
    display: inline-flex;
    align-items: center;
    gap: 3px;
}
.dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1.5px solid var(--text-faint);
    box-sizing: border-box;
    transition: background-color 0.2s, border-color 0.2s, transform 0.2s;
}
.dot.done {
    background: var(--color-red);
    border-color: var(--color-red);
}
.dot.over {
    background: var(--color-orange, #e0a030);
    border-color: var(--color-orange, #e0a030);
}
.count {
    font-size: 0.7rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
}
</style>
