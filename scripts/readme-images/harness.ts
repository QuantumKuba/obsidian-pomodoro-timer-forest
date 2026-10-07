/**
 * Browser entry: mounts the plugin's REAL Svelte components against sample data
 * (no Obsidian needed) so they can be screenshotted for the README.
 * Scene is chosen with ?scene=…&tab=…&select=…
 */
import { readable, writable } from 'svelte/store'
import TimerViewComponent from '../../src/TimerViewComponent.svelte'
import TasksComponent from '../../src/TasksComponent.svelte'
import type { TaskItem, TaskGroup } from '../../src/Tasks'
import { addDays, today } from '../../src/tasks/dates'
import { settings } from '../../src/stores'
import STYLES_CSS from '../../styles.css'
import ForestComponent from '../../src/forest/ForestComponent.svelte'
import { activePlantStore, gamificationStore, setPlugin } from '../../src/stores'
import { getBuilding } from '../../src/assets/floraCatalog'
import { upgradeCost, xpForLevel } from '../../src/services/Progression'
import type { PlacedHomesteadItem, RewardEvent } from '../../src/types/forest'
import { SCENE_CSS } from '../../src/render/sceneCss'
import { village } from './sample-data'
import { mountBoard } from './board-scene'

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
        harvestCrops() { return [] },
        plantCrop() { return true },
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

/** Obsidian's default light theme, near enough. */
const LIGHT_THEME = `:root{--background-primary:#fff;--background-primary-alt:#fafafa;--background-secondary:#f6f6f6;--background-secondary-alt:#e3e3e3;
--background-modifier-border:#e0e0e0;--background-modifier-border-hover:#d4d4d4;--background-modifier-hover:rgba(0,0,0,.045);--background-modifier-form-field:#fff;
--text-normal:#222;--text-muted:#5c5c5c;--text-faint:#ababab;--text-accent:#8a5cf5;--interactive-normal:#fff;--interactive-accent:#8a5cf5;--interactive-accent-hover:#7b4ef0;
--color-red:#e93147;--color-orange:#ec7500;--color-yellow:#e0ac00;--color-green:#08b94e;--color-blue:#086ddd;--color-cyan:#00bfbc}
button,input,select{color:var(--text-normal)} button{box-shadow:0 1px 2px rgba(0,0,0,.08),0 0 0 1px rgba(0,0,0,.06)} input{background:var(--background-modifier-form-field);border:1px solid var(--background-modifier-border)}`

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
} else if (scene === 'tasks') {
    mountTasks()
} else if (scene === 'board') {
    document.head.appendChild(Object.assign(document.createElement('style'), { textContent: STYLES_CSS }))
    const light = q.get('theme') === 'light'
    document.body.classList.add(light ? 'theme-light' : 'theme-dark')
    if (light) document.head.appendChild(Object.assign(document.createElement('style'), { textContent: LIGHT_THEME }))
    // Obsidian's own styling for tags and links, which the cards' markdown uses
    document.head.appendChild(Object.assign(document.createElement('style'), {
        textContent: `a.tag{display:inline-block;padding:0 7px;border-radius:99px;text-decoration:none;color:var(--text-accent);background:color-mix(in srgb,var(--interactive-accent) 14%,transparent);line-height:1.5}
        a.internal-link{color:var(--text-accent);text-decoration:underline;text-decoration-color:color-mix(in srgb,var(--text-accent) 40%,transparent)}
        .pf-card .burst{animation-play-state:paused!important;animation-delay:-.7s!important}`,
    }))
    ;(HTMLElement.prototype as any).empty = function () { this.textContent = '' }
    rewardEvents.set([])
    mountBoard(app, q, g, rewardEvents)
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

/** The task panel, with a few notes of sample tasks. Edits apply to the sample data. */
function mountTasks() {
    document.head.appendChild(Object.assign(document.createElement('style'), { textContent: STYLES_CSS }))
    if (q.get('theme') === 'light') {
        document.head.appendChild(Object.assign(document.createElement('style'), {
            textContent: `:root{--background-primary:#fff;--background-primary-alt:#f5f6f8;--background-secondary:#f2f3f5;--background-secondary-alt:#e3e5e8;
            --background-modifier-border:#dcdde0;--background-modifier-hover:rgba(0,0,0,.05);--background-modifier-form-field:#fff;
            --text-normal:#222;--text-muted:#5c5c5c;--text-faint:#a0a0a0;--interactive-normal:#f2f3f5;--color-red:#e93147;--color-orange:#e9973f;--color-green:#08b94e;--color-blue:#086ddd}
            button,input,select{color:var(--text-normal)} input{background:var(--background-modifier-form-field);border:1px solid var(--background-modifier-border)}`,
        }))
    }
    // Obsidian adds these to every element
    ;(HTMLElement.prototype as any).empty = function () { this.textContent = '' }
    settings.update((s) => ({ ...s, enableTaskTracking: q.get('tracking') === '1' }))

    const D = (n: number) => addDays(today(), n)
    const item = (path: string, line: number, description: string, o: Partial<TaskItem> = {}): TaskItem => ({
        path, fileName: path.split('/').pop()!, text: '', name: description, status: ' ', blockLink: '', checked: false, done: '', due: '', created: '',
        cancelled: '', scheduled: '', start: '', description, priority: '', recurrence: '', expected: 0, actual: 0, tags: [], line, ...o,
    })
    const weekly = 'Journal/Weekly review.md', thesis = 'Projects/Thesis chapter 3.md', garden = 'Home/Garden plan.md'
    const data: Record<string, { name: string; tasks: TaskItem[] }> = {
        [weekly]: { name: 'Weekly review', tasks: [
            item(weekly, 4, 'Clear the inbox', { expected: 2, actual: 2, checked: true, status: 'x', due: D(-1) }),
            item(weekly, 5, 'Plan next week around the **deep work** blocks', { expected: 3, actual: 1, due: D(0) }),
            item(weekly, 6, 'Reply to the grant committee #admin', { due: D(-3), tags: ['#admin'] }),
            item(weekly, 7, 'Book dentist', { start: D(4) }),
            item(weekly, 8, 'Tidy the reading list'),
        ] },
        [thesis]: { name: 'Thesis chapter 3', tasks: [
            item(thesis, 2, 'Draft the methods section', { expected: 6, actual: 4, due: D(2), start: D(-5) }),
            item(thesis, 3, 'Re-run the regression with the new dataset', { expected: 2, actual: 0, due: D(9) }),
            item(thesis, 4, 'Send figures to the co-author', { expected: 1, actual: 3, due: D(1) }),
        ] },
        [garden]: { name: 'Garden plan', tasks: [item(garden, 1, 'Order tulip bulbs', { start: D(30), due: D(45) })] },
    }
    const pinnedOnly = q.get('pins') === '2' ? [thesis, garden] : [thesis]
    const tracker = writable<any>({
        file: { path: weekly, name: 'Weekly review.md', basename: 'Weekly review' },
        pinned: pinnedOnly,
        task: q.get('focus') === '0' ? undefined : { ...data[thesis].tasks[0], name: data[thesis].tasks[0].description, fileName: 'Thesis chapter 3.md' },
    })
    const store = writable<{ groups: TaskGroup[]; list: TaskItem[] }>({ groups: [], list: [] })
    const publish = () => {
        let t: any; tracker.subscribe((v) => (t = v))()
        const order = [...(t.pinned.includes(weekly) ? [] : [weekly]), ...t.pinned]
        const groups: TaskGroup[] = order.map((path) => ({ path, name: data[path].name, current: path === weekly, pinned: t.pinned.includes(path), loading: false, tasks: data[path].tasks }))
        store.set({ groups, list: groups.flatMap((g) => g.tasks) })
    }
    publish()
    const tasks: any = {
        subscribe: store.subscribe,
        writer: { tasksPluginAvailable: () => q.get('tasksplugin') !== '0', editWithTasksPlugin: async () => true },
        async update(task: TaskItem, edits: any) {
            const target = data[task.path].tasks.find((x) => x.line === task.line)!
            if (edits.expected !== undefined) target.expected = edits.expected ?? 0
            if (edits.actual !== undefined) target.actual = edits.actual
            if (edits.start !== undefined) target.start = edits.start ?? ''
            if (edits.due !== undefined) target.due = edits.due ?? ''
            data[task.path].tasks = [...data[task.path].tasks]
            publish()
            return true
        },
    }
    const fake: any = {
        subscribe: tracker.subscribe,
        togglePinned(path: string) { tracker.update((t) => ({ ...t, pinned: t.pinned.includes(path) ? t.pinned.filter((p: string) => p !== path) : [...t.pinned, path] })); publish() },
        active(task: TaskItem) { tracker.update((t) => ({ ...t, task: { ...task } })) },
        clear() { tracker.update((t) => ({ ...t, task: undefined })) },
        setTaskName(name: string) { tracker.update((t) => ({ ...t, task: { ...t.task, name } })) },
        openNote() {}, openTask() {},
    }
    const render = (content: string, el: HTMLElement) => {
        const esc = content.replace(/&/g, '&amp;').replace(/</g, '&lt;')
        el.innerHTML = `<p>${esc.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(#[\w-]+)/g, '<a style="color:var(--text-accent,#a99cf7)">$1</a>')}</p>`
    }
    new TasksComponent({ target: app, props: { tasks, tracker: fake, render } })

    // ?click=<css selector>[&nth=n] presses a control before the screenshot
    const sel = q.get('press')
    if (sel) {
        const nth = Number(q.get('nth') || 0)
        requestAnimationFrame(() => setTimeout(() => {
            ;(document.querySelectorAll(sel)[nth] as HTMLElement | undefined)?.click()
        }, 50))
    }
}
