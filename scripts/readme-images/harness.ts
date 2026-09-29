/**
 * Browser entry: mounts the plugin's REAL Svelte components against sample data
 * (no Obsidian needed) so they can be screenshotted for the README.
 * Scene is chosen with ?scene=…&tab=…&select=…
 */
import { readable, writable } from 'svelte/store'
import TimerViewComponent from '../../src/TimerViewComponent.svelte'
import ForestComponent from '../../src/forest/ForestComponent.svelte'
import { activePlantStore, gamificationStore, setPlugin } from '../../src/stores'
import { getBuilding } from '../../src/assets/floraCatalog'
import { upgradeCost, xpForLevel } from '../../src/services/Progression'
import type { PlacedHomesteadItem, RewardEvent } from '../../src/types/forest'
import { SCENE_CSS } from '../../src/render/VillageScene'
import { village } from './sample-data'

// main.ts injects this once for every view in the real plugin
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: SCENE_CSS }))

const q = new URLSearchParams(location.search)
const scene = q.get('scene') || 'sidebar'
// ?player=mid → a level-6 player, to show locked / affordable / owned states in the market
const mid = q.get('player') === 'mid'
const g = mid
    ? village({
          xp: xpForLevel(6) + 120, sunlight: 520, coins: 58, streak: { current: 6, longest: 9, lastCheckInDate: '', shieldMonth: '', shieldsUsed: 0 },
          unlockedSpecies: ['classic_pine', 'sunflower', 'ancient_oak', 'lavender'],
          unlockedBuildings: ['campfire', 'stone_well', 'lantern', 'bench', 'gazebo', 'cabin'],
      })
    : village()
gamificationStore.set(g)

const rewardEvents = writable<RewardEvent[]>([])
setPlugin({
    app: { workspace: {} },
    forestEngine: {
        rewardEvents,
        dismissReward() {},
        selectSpecies() {},
        confettiEngine: { attach() {}, detach() {}, destroy() {} },
        getUpgradeInfo(item: PlacedHomesteadItem) {
            if (item.itemType === 'tree') return { sunlight: 40 * item.level, coins: 4 * item.level, maxed: item.level >= 3 }
            const b = getBuilding(item.itemId)!
            return { ...upgradeCost(b, item.level), maxed: item.level >= b.maxLevel }
        },
    },
} as any)

const harvest: RewardEvent = {
    id: 'h1', kind: 'harvest', at: 0, title: 'Cherry Blossom fully grown!', subtitle: 'Write chapter 3 draft',
    speciesId: 'sakura', sunlight: 84, coins: 7, xp: 74,
    lines: [
        { label: '25m of focus', sunlight: 30, coins: 2, xp: 25 },
        { label: '🔥 23-day streak +20%', sunlight: 6 },
        { label: '🏡 Cozy Cabin +25%', sunlight: 8 },
        { label: '🌅 First tree of the day', xp: 10 },
        { label: '🎯 Daily goal reached (4)', sunlight: 40, coins: 5, xp: 20 },
        { label: '🌱 Cherry Blossom sapling added to your village inventory' },
    ],
}
const levelup: RewardEvent = {
    id: 'l1', kind: 'levelup', at: 0, title: 'Your village grew!', subtitle: 'New things to discover:', levelUp: 14,
    sunlight: 350, coins: 42, xp: 0,
    lines: [{ label: '🌳 Celestial Gold Tree in the nursery' }, { label: '🧭 Land expansion to 8×8' }],
}

// Chrome's CSS animations ignore virtual time; settle entrance animations for still captures.
if (q.get('settle')) document.head.appendChild(Object.assign(document.createElement('style'), { textContent: '.pf-card *{animation-delay:0s!important;animation-duration:.001s!important}' }))

const app = document.getElementById('app')!
const cloneTimer = (elapsed: number, running: boolean, inSession: boolean) => {
    const count = 25 * 60_000
    const left = count - elapsed
    const human = `${String(Math.floor(left / 60000)).padStart(2, '0')} : ${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`
    return readable({ count, elapsed, running, inSession, mode: 'WORK', remained: { millis: left, human }, finished: false } as any)
}

if (scene === 'sidebar' || scene === 'sidebar-reward' || scene === 'sidebar-levelup') {
    const ratio = 0.62
    activePlantStore.set({ speciesId: 'sakura', startTime: 0, totalDurationMillis: 25 * 60000, currentStage: 'sapling', progressRatio: ratio, taskText: 'Write chapter 3 draft' })
    if (scene === 'sidebar-reward') { activePlantStore.set(null); rewardEvents.set([harvest]) }
    if (scene === 'sidebar-levelup') { activePlantStore.set(null); rewardEvents.set([levelup]) }
    const idle = scene !== 'sidebar'
    new TimerViewComponent({
        target: app,
        props: { timer: cloneTimer(idle ? 0 : ratio * 25 * 60000, !idle, !idle) as any, tasks: {} as any, tracker: {} as any, render: () => {} },
    })
} else {
    const full = scene === 'homestead'
    if (scene === 'homestead') rewardEvents.set([])
    new ForestComponent({ target: app, props: { full, activeTab: (q.get('tab') as any) || 'village' } })
    const click = q.get('click')
    if (click) {
        requestAnimationFrame(() => setTimeout(() => {
            ;Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes(click))?.click()
        }, 50))
    }
    const select = q.get('select')
    if (select) {
        requestAnimationFrame(() => setTimeout(() => {
            const id = g.homestead.find((i) => i.itemId === select)?.id
            document.querySelector(`[data-item="${id}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        }, 50))
    }
}
