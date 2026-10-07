/**
 * The board view on a sample board, for README screenshots and for driving it in a browser.
 * The real BoardView runs against the obsidian stub, so edits (drags, ticks, new cards) go
 * through the real board model; the note's text is on `window.__board.text()`.
 */
import { writable, readable, get } from 'svelte/store'
import BoardApp from '../../src/board/BoardApp.svelte'
import { BoardView } from '../../src/board/BoardView'
import { gamificationStore, settings } from '../../src/stores'
import { addDays, dateKey } from '../../src/services/Progression'
import type { BoardMemory, GamificationData, RewardEvent } from '../../src/types/forest'

const D = (n: number) => addDays(dateKey(), n)

export const SAMPLE_BOARD = () =>
    [
        '---',
        '',
        'kanban-plugin: board',
        '',
        '---',
        '',
        '## Backlog',
        '',
        '- [ ] Audit old blog posts for redirects #seo',
        `- [ ] Write copy for the pricing page [🍅:: 0/3] @{${D(6)}}`,
        '- [ ] Choose an analytics provider #research',
        '- [ ] Compress the hero images',
        '',
        '',
        '## This week',
        '',
        `- [ ] Migrate the newsletter archive [🍅:: 1/4] @{${D(2)}}`,
        '\t- [x] Export from the old service',
        '\t- [ ] Map the tags',
        '\t- [ ] Import and spot-check',
        '- [ ] Fix the mobile nav overlap ⏫ #bug',
        '',
        '',
        '## In progress (3)',
        '',
        `- [ ] Design the new onboarding flow [🍅:: 3/5] @{${D(1)}} ^onb1`,
        '- [ ] Set up staging deploys [🍅:: 2/2] #devops ^stg1',
        '- [ ] Rewrite the [[About page]] ^abt1',
        '',
        '',
        '## Review (2)',
        '',
        `- [ ] Accessibility pass on checkout [🍅:: 2/3] @{${D(-1)}} ^a11y`,
        '',
        '',
        '## Done',
        '',
        '**Complete**',
        '- [x] Pick the typeface [🍅:: 1/1] ^typ1',
        '- [x] Set up the new domain ^dom1',
        '- [x] Agree on the sitemap with marketing [🍅:: 2/2]',
        '',
        '',
        '%% kanban:settings',
        '```',
        '{"kanban-plugin":"board"}',
        '```',
        '%%',
    ].join('\n')

function sampleMemory(): BoardMemory {
    const history: BoardMemory['history'] = []
    const perDay = [1, 0, 2, 1, 3, 0, 0, 2, 1, 2, 3, 1, 0, 2]
    perDay.forEach((n, i) => {
        for (let k = 0; k < n; k++) {
            const actual = (i + k) % 4
            history.push({ date: D(i - 13), days: ((i * 3 + k) % 5) + 0.5, actual, expected: actual ? actual + ((i + k) % 3 === 0 ? 1 : 0) : 0, onTime: (i + k) % 5 !== 0 })
        }
    })
    return {
        title: 'Website relaunch',
        shipped: 44,
        milestones: [10, 25],
        history,
        cards: {
            '^onb1': { lane: 'In progress', since: D(-2), seen: D(-9), started: D(-2) },
            '^stg1': { lane: 'In progress', since: D(-1), seen: D(-12), started: D(-1) },
            '^abt1': { lane: 'In progress', since: D(-7), seen: D(-20), started: D(-7) },
            '^a11y': { lane: 'Review', since: D(-1), seen: D(-10), started: D(-4) },
        },
    }
}

export function mountBoard(target: HTMLElement, q: URLSearchParams, g: GamificationData, rewardEvents: ReturnType<typeof writable<RewardEvent[]>>) {
    const path = 'Projects/Website relaunch.md'
    gamificationStore.set({ ...g, boards: { [path]: sampleMemory() }, dailyLogs: { ...g.dailyLogs, [dateKey()]: { date: dateKey(), trees: [], totalMinutes: 75, completedPomodoros: 3, cardsCompleted: 3 } } })
    settings.update((s) => ({ ...s, boardStaleDays: 5 }))

    const focused = q.get('focus') !== '0'
    const running = q.get('running') !== '0'
    const count = 25 * 60_000
    const elapsed = focused ? Math.round(count * 0.62) : 0
    const left = count - elapsed
    const human = `${String(Math.floor(left / 60000)).padStart(2, '0')} : ${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`
    const timerState = writable({
        count, elapsed, running: focused && running, inSession: focused, mode: 'WORK', workLen: 25, breakLen: 5,
        remained: { millis: left, human }, finished: false, taskDone: false, taskDoneAt: null, earlyHarvestAt: 5 * 60_000,
    })
    const timer: any = {
        subscribe: timerState.subscribe,
        toggleTimer: () => timerState.update((t) => ({ ...t, running: !t.running, inSession: true })),
        start: () => timerState.update((t) => ({ ...t, running: true, inSession: true })),
        toggleMode() {},
        harvestEarly() {},
    }
    const trackerState = writable<any>({
        pinned: [],
        task: focused ? { path, blockLink: ' ^onb1', name: 'Design the new onboarding flow', description: 'Design the new onboarding flow', tags: [] } : undefined,
    })
    const tracker: any = {
        subscribe: trackerState.subscribe,
        get task() {
            return get(trackerState).task
        },
        active: async (task: any) => trackerState.update((t) => ({ ...t, task })),
    }

    const plugin: any = {
        timer,
        tracker,
        forestEngine: {
            rewardEvents,
            dismissReward: (id: string) => rewardEvents.update((q) => q.filter((e) => e.id !== id)),
            setLaneRole() {},
        },
        getSettings: () => get(settings),
        storageManager: { getGamification: () => get(gamificationStore) },
        boardOpening: { openInKanban() {}, openAsMarkdown() {} },
        boardWatcher: { observe() {} },
        ready: Promise.resolve(),
    }
    const app: any = { plugins: { plugins: q.get('kanban') === '1' ? { 'obsidian-kanban': {} } : {} }, vault: { getConfig: () => true }, workspace: { trigger() {}, getLeaf() {} } }
    const view = new BoardView({ app } as any, plugin)
    ;(view as any).file = { path, name: 'Website relaunch.md', basename: 'Website relaunch' }
    // ?long=1 fills the backlog, to see a lane scroll
    const extra = q.get('long') ? Array.from({ length: 18 }, (_, i) => `- [ ] Backlog idea ${i + 1}`).join('\n') + '\n' : ''
    view.setViewData(q.get('empty') === '1' ? '' : SAMPLE_BOARD().replace('- [ ] Compress the hero images\n', `- [ ] Compress the hero images\n${extra}`), true)

    if (q.get('burst')) {
        // Late in the page's virtual time, so the burst is still showing when the screenshot is taken
        window.setTimeout(() => {
            rewardEvents.set([{ id: 'b1', kind: 'task', title: 'Pick the typeface', ref: `${path}::^typ1`, coins: 7, xp: 14, sunlight: 0, lines: [], at: 0 }])
        }, 10_800)
    }

    new BoardApp({ target, props: { view } })
    ;(window as any).__board = { view, text: () => view.getViewData(), timer: timerState, tracker: trackerState }

    const press = q.get('press')
    if (press) {
        window.setTimeout(() => {
            ;(document.querySelectorAll(press)[Number(q.get('nth') || 0)] as HTMLElement | undefined)?.click()
        }, 60)
    }
}
