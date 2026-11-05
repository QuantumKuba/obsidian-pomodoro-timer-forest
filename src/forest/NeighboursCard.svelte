<script lang="ts">
import { gamificationStore, pluginInstance, clockMinute } from '../stores'
import { ICONS, VILLAGER_SVGS } from '../assets/floraAssets'
import { CHARTER_RANKS } from '../services/Charter'
import { KEEPSAKE_HEARTS, MAX_HEARTS, RESIDENTS, hearts, requestSlots, residentsPresent, type Resident } from '../services/Neighbours'
import { dateKey } from '../services/Progression'

const engine = pluginInstance?.forestEngine

$: g = $gamificationStore
$: present = residentsPresent(g)
$: open = g.requests ?? []
$: slots = requestSlots(g)
$: today = dateKey($clockMinute)

const portrait = (r: Resident) => VILLAGER_SVGS[r.variant % VILLAGER_SVGS.length]

function idleLine(r: Resident): string {
    if (open.length >= slots) return `${r.name} is waiting for a free spot on the notice board.`
    if (g.lastRequestDate === today) return `${r.name} may have something for you another day.`
    return `${r.name} may ask for something after your next session.`
}
</script>

<section class="pf-neighbours">
    <div class="sec-head">
        <h4>✉️ Neighbours</h4>
        <span class="muted" title="Open requests, and how many can be open at once">{open.length}/{slots} requests</span>
    </div>
    {#each RESIDENTS as r (r.id)}
        {@const here = present.includes(r)}
        {@const req = open.find((q) => q.residentId === r.id)}
        {@const h = hearts(g, r.id)}
        {#if here}
            <div class="resident" class:asking={!!req}>
                <span class="portrait">{@html portrait(r)}</span>
                <div class="r-body">
                    <div class="r-head">
                        <strong>{r.name}</strong><span class="role">{r.role}</span>
                        <span class="hearts" title="{h} of {MAX_HEARTS} hearts. One for every request you fulfil.">{'♥'.repeat(h)}<span class="dim">{'♥'.repeat(MAX_HEARTS - h)}</span></span>
                    </div>
                    {#if req}
                        <p class="quote">“{req.quote}”</p>
                        <div class="req-row">
                            <span class="req-title">{req.title}</span>
                            <span class="q-meta">{req.progress}/{req.target}</span>
                        </div>
                        <div class="bar"><div class="fill" style="width:{Math.min(100, Math.round((req.progress / Math.max(1, req.target)) * 100))}%"></div></div>
                        <div class="req-foot">
                            <span class="q-reward">+{req.reward.sunlight}{@html ICONS.sunlight} +{req.reward.coins}{@html ICONS.coin}{#if h < MAX_HEARTS} · +1 ♥{/if}</span>
                            <button class="later" title="Let this one go. Nothing is lost." on:click={() => engine?.declineRequest(req.id)}>Not now</button>
                        </div>
                    {:else}
                        <p class="idle">{idleLine(r)}</p>
                    {/if}
                    <p class="keepsake" class:on={h >= KEEPSAKE_HEARTS}>
                        🎁 {h >= KEEPSAKE_HEARTS ? 'Keepsake' : `At ${'♥'.repeat(KEEPSAKE_HEARTS)}`}: {r.keepsake.text}
                    </p>
                </div>
            </div>
        {:else}
            <div class="resident away">
                <span class="portrait">{@html portrait(r)}</span>
                <p class="idle">{r.name}, {r.role}, moves in when the village becomes a {CHARTER_RANKS[r.joinsAtRank].name}.</p>
            </div>
        {/if}
    {/each}
</section>

<style>
.pf-neighbours { display: flex; flex-direction: column; gap: 6px; }
.sec-head { display: flex; justify-content: space-between; align-items: baseline; }
h4 { margin: 0; font-size: 0.88rem; }
.muted { color: var(--text-muted); font-size: 0.72rem; }
.resident {
    display: flex;
    gap: 9px;
    padding: 8px 10px;
    border-radius: 10px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
}
.resident.asking { border-color: rgba(232, 128, 140, 0.55); }
.resident.away { align-items: center; opacity: 0.6; }
.resident.away .portrait { filter: grayscale(1); height: 30px; width: 20px; }
.portrait { width: 26px; height: 39px; flex-shrink: 0; }
.portrait :global(svg) { width: 100%; height: 100%; }
.r-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.r-head { display: flex; align-items: baseline; gap: 6px; font-size: 0.8rem; }
.role { font-size: 0.68rem; color: var(--text-muted); }
.hearts { margin-left: auto; font-size: 0.72rem; letter-spacing: 1px; color: #e06a7a; white-space: nowrap; }
.hearts .dim { color: var(--background-modifier-border); }
.quote { margin: 0; font-size: 0.73rem; line-height: 1.35; font-style: italic; }
.req-row { display: flex; justify-content: space-between; gap: 8px; font-size: 0.72rem; font-weight: 600; }
.q-meta { color: var(--text-muted); font-variant-numeric: tabular-nums; font-weight: 400; }
.bar { height: 4px; border-radius: 99px; background: var(--background-modifier-border); overflow: hidden; }
.fill { height: 100%; border-radius: 99px; background: linear-gradient(90deg, #f3a6b0, #d9576b); transition: width 0.6s ease; }
.req-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.q-reward { font-size: 0.66rem; color: var(--text-muted); white-space: nowrap; }
.q-reward :global(svg) { width: 12px; height: 12px; vertical-align: -2px; }
.later {
    font-size: 0.66rem;
    padding: 1px 8px;
    height: auto;
    background: transparent;
    box-shadow: none;
    border: 1px solid var(--background-modifier-border);
    color: var(--text-muted);
    cursor: pointer;
}
.later:hover { color: var(--text-normal); }
.idle { margin: 0; font-size: 0.7rem; color: var(--text-muted); line-height: 1.3; }
.keepsake { margin: 0; font-size: 0.66rem; color: var(--text-faint, var(--text-muted)); }
.keepsake.on { color: #c98a2e; font-weight: 600; }
</style>
