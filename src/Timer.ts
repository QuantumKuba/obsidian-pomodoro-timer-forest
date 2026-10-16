import PomodoroTimerPlugin from 'main'
// @ts-ignore: replaced at build time by the inline-worker esbuild plugin
import createClockWorker from 'clock.worker'
import { writable, derived } from 'svelte/store'
import type { Readable } from 'svelte/store'
import { Notice, TFile, moment } from 'obsidian'
import Logger, { type LogContext } from 'Logger'
import DEFAULT_NOTIFICATION from 'Notification'
import type { Unsubscriber } from 'svelte/motion'
import type { TaskItem } from 'Tasks'
import {
    earlyHarvestMinMinutes,
    pomodoroEquivalents,
    recoveryBreakMinutes,
    HYPERFOCUS_MIN_MINUTES,
} from './services/Progression'

export type Mode = 'WORK' | 'BREAK'

export type TimerRemained = {
    millis: number
    human: string
}

const DEFAULT_TASK: TaskItem = {
    actual: 0,
    expected: 0,
    path: '',
    fileName: '',
    text: '',
    name: '',
    status: '',
    blockLink: '',
    checked: false,
    done: '',
    due: '',
    created: '',
    cancelled: '',
    scheduled: '',
    start: '',
    description: '',
    priority: '',
    recurrence: '',
    tags: [],
    line: -1,
}

export type TimerState = {
    autostart: boolean
    running: boolean
    // lastTick: number
    mode: Mode
    elapsed: number
    startTime: number | null
    inSession: boolean
    workLen: number
    breakLen: number
    count: number
    duration: number
    /** Elapsed millis when the focused task was checked off during this work session. */
    taskDoneAt: number | null
    /** True during an open-ended hyperfocus session. */
    hyperfocus: boolean
    /** Elapsed millis when the last body check-in was triggered. */
    lastCheckInAt: number
    /** Optional wall-clock epoch ms for hard stop. */
    hardStopAt: number | null
    /** Number of body check-ins acknowledged during this session. */
    checkInsAcked: number
    /** Pending body check-in prompt shown to the user. */
    checkInPending: { time: string; minutes: number } | null
    /** Session is at timeup and offering "Ride the wave" extension into hyperfocus. */
    extendOffered: boolean
}

export type TimerStore = TimerState & {
    remained: TimerRemained
    elapsedHuman: string
    finished: boolean
    /** The focused task is done and the work session can end early without withering. */
    taskDone: boolean
    /** Elapsed millis from which ending early harvests a young tree. */
    earlyHarvestAt: number
}

export default class Timer implements Readable<TimerStore> {
    static DEFAULT_NOTIFICATION_AUDIO = new Audio(DEFAULT_NOTIFICATION)

    private plugin: PomodoroTimerPlugin

    private logger: Logger

    private state: TimerState

    private store: Readable<TimerStore>

    private clock: Worker

    private update

    private unsubscribers: Unsubscriber[] = []

    public subscribe

    constructor(plugin: PomodoroTimerPlugin) {
        this.plugin = plugin
        this.logger = new Logger(plugin)
        let count = this.toMillis(plugin.getSettings().workLen)
        this.state = {
            autostart: plugin.getSettings().autostart,
            workLen: plugin.getSettings().workLen,
            breakLen: plugin.getSettings().breakLen,
            running: false,
            // lastTick: 0,
            mode: 'WORK',
            elapsed: 0,
            startTime: null,
            inSession: false,
            duration: plugin.getSettings().workLen,
            count,
            taskDoneAt: null,
            hyperfocus: false,
            lastCheckInAt: 0,
            hardStopAt: null,
            checkInsAcked: 0,
            checkInPending: null,
            extendOffered: false,
        }

        let store = writable(this.state)

        this.update = store.update

        this.store = derived(store, ($state) => ({
            ...$state,
            remained: this.remain($state.count, $state.elapsed),
            elapsedHuman: this.formatElapsed($state.elapsed),
            finished: $state.count == $state.elapsed,
            taskDone: $state.inSession && $state.mode === 'WORK' && $state.taskDoneAt !== null,
            earlyHarvestAt: this.earlyHarvestAt($state),
        }))

        this.subscribe = this.store.subscribe
        this.unsubscribers.push(
            this.store.subscribe((state) => {
                this.state = state
            }),
        )
        this.clock = (createClockWorker as () => Worker)()
        this.clock.onmessage = ({ data }: MessageEvent<number>) => {
            this.tick(data)
        }
    }

    private remain(count: number, elapsed: number): TimerRemained {
        let remained = count - elapsed
        let min = Math.floor(remained / 60000)
        let sec = Math.floor((remained % 60000) / 1000)
        let minStr = min < 10 ? `0${min}` : min.toString()
        let secStr = sec < 10 ? `0${sec}` : sec.toString()
        return {
            millis: remained,
            human: `${minStr} : ${secStr}`,
        }
    }

    private formatElapsed(elapsed: number): string {
        const sec = Math.floor((elapsed / 1000) % 60)
        const min = Math.floor((elapsed / 60000) % 60)
        const hr = Math.floor(elapsed / 3600000)
        const secStr = sec < 10 ? `0${sec}` : sec.toString()
        const minStr = min < 10 ? `0${min}` : min.toString()
        if (hr > 0) {
            return `${hr}:${minStr}:${secStr}`
        }
        return `${minStr} : ${secStr}`
    }

    private toMillis(minutes: number) {
        return minutes * 60 * 1000
    }

    private tick(t: number) {
        let timeup: boolean = false
        let pause: boolean = false
        let triggerCheckIn: number | null = null
        let triggerHardStop = false

        this.update((s) => {
            if (s.running) {
                s.elapsed += t
                if (s.elapsed >= s.count) {
                    s.elapsed = s.count
                }
                timeup = s.elapsed >= s.count

                if (s.mode === 'WORK') {
                    this.plugin.forestEngine?.updateProgress(s.elapsed, s.count)
                }

                if (s.hyperfocus) {
                    const checkInMin = this.plugin.getSettings().hyperfocusCheckInMin ?? 45
                    if (checkInMin > 0) {
                        const intervalMs = this.toMillis(checkInMin)
                        if (s.elapsed - s.lastCheckInAt >= intervalMs) {
                            s.lastCheckInAt = s.elapsed
                            const minutes = Math.round(s.elapsed / 60000)
                            s.checkInPending = { time: moment().format('HH:mm'), minutes }
                            triggerCheckIn = minutes
                        }
                    }

                    if (s.hardStopAt && Date.now() >= s.hardStopAt) {
                        triggerHardStop = true
                    }
                }
            } else {
                pause = true
            }
            return s
        })

        if (triggerCheckIn !== null) {
            this.notifyCheckIn(triggerCheckIn)
        }

        if (triggerHardStop) {
            this.notifyHardStop()
            void this.land()
            return
        }

        if (!pause && timeup) {
            this.timeup()
        }
    }

    private timeup() {
        const s = this.state
        if (s.hyperfocus) {
            new Notice('🛡️ Safety cap reached: landing your hyperfocus session.')
            void this.land()
            return
        }

        const settings = this.plugin.getSettings()
        if (s.mode === 'WORK' && settings.hyperfocusEnabled && settings.hyperfocusOfferExtend && !s.autostart) {
            this.update((state) => {
                state.running = false
                state.extendOffered = true
                this.clock.postMessage({
                    start: false,
                    lowFps: this.plugin.getSettings().lowFps,
                })
                return state
            })
            const fragment = new DocumentFragment()
            fragment.createSpan({
                text: `🍅 ${s.duration}m focus complete! Take a break, or keep going in Hyperfocus mode.`,
            })
            new Notice(fragment, 12000)
            if (this.plugin.getSettings().notificationSound) {
                this.playAudio()
            }
            return
        }

        let autostart = false
        this.update((state) => {
            const ctx = this.createLogContext(state)
            this.processLog(ctx).catch((err) =>
                console.error('[Pomodoro Timer Forest] Failed to log the finished session', err),
            )
            autostart = state.autostart
            return this.endSession(state)
        })
        if (autostart) {
            this.start()
        }
    }

    private notifyCheckIn(minutes: number) {
        const text = `💧 ${minutes}m of focus. Time for water, a stretch, or a breath?`
        const style = this.plugin.getSettings().hyperfocusCheckInStyle || 'quiet'

        if (style === 'chime' || this.plugin.getSettings().forestSounds) {
            this.plugin.forestEngine?.soundManager?.playCheckIn()
        }

        if (
            style === 'system' &&
            this.plugin.getSettings().useSystemNotification &&
            typeof window.Notification !== 'undefined' &&
            window.Notification.permission === 'granted'
        ) {
            new window.Notification('Hyperfocus Check-in', { body: text, silent: true })
        } else {
            const fragment = new DocumentFragment()
            const span = fragment.createSpan()
            span.setText(text)
            new Notice(fragment, 8000)
        }
    }

    private notifyHardStop() {
        const text = "⏰ Hard stop reached! It's time to transition to your next commitment."
        new Notice(text, 10000)
        this.playAudio()
    }

    private createLogContext(s: TimerState): LogContext {
        let state = { ...s }
        let task = this.plugin.tracker?.task
            ? { ...this.plugin.tracker.task }
            : { ...DEFAULT_TASK }

        if (!task.path) {
            task.path = this.plugin.tracker?.file?.path ?? ''
            task.fileName = this.plugin.tracker?.file?.name ?? ''
        }

        return { ...state, task }
    }

    private async processLog(ctx: LogContext) {
        if (ctx.mode == 'WORK') {
            await this.plugin.tracker?.updateActual()
            this.plugin.forestEngine?.completeSession(ctx.duration, {
                taskText: ctx.task.name || ctx.task.text,
                notePath: ctx.task.path,
                tags: ctx.task.tags,
            })
        } else {
            this.plugin.forestEngine?.completeBreak()
        }
        const logFile = await this.logger.log(ctx)
        this.notify(ctx, logFile)
    }

    public start() {
        this.update((s) => {
            let now = new Date().getTime()
            if (!s.inSession) {
                // new session
                s.elapsed = 0
                s.startTime = now
                s.taskDoneAt = null
                s.lastCheckInAt = 0
                s.checkInsAcked = 0
                s.checkInPending = null
                s.extendOffered = false

                if (s.mode === 'WORK' && s.hyperfocus) {
                    const capMin = this.plugin.getSettings().hyperfocusCapMin || 180
                    s.duration = capMin
                    s.count = this.toMillis(capMin)
                    const task = this.plugin.tracker?.task
                    const file = this.plugin.tracker?.file
                    this.plugin.forestEngine?.startSession(
                        capMin,
                        task?.name || task?.text,
                        task?.path || file?.path,
                        task?.tags,
                        true,
                    )
                } else {
                    s.duration = s.mode === 'WORK' ? s.workLen : s.breakLen
                    s.count = s.duration * 60 * 1000
                    if (s.mode === 'WORK') {
                        const task = this.plugin.tracker?.task
                        const file = this.plugin.tracker?.file
                        this.plugin.forestEngine?.startSession(
                            s.workLen,
                            task?.name || task?.text,
                            task?.path || file?.path,
                            task?.tags,
                            false,
                        )
                    }
                }
            }
            s.inSession = true
            s.running = true
            this.clock.postMessage({
                start: true,
                lowFps: this.plugin.getSettings().lowFps,
            })
            return s
        })
    }

    private endSession(state: TimerState) {
        // setup new session
        if (state.breakLen == 0) {
            state.mode = 'WORK'
        } else {
            state.mode = state.mode == 'WORK' ? 'BREAK' : 'WORK'
        }
        state.hyperfocus = false
        state.duration = state.mode == 'WORK' ? state.workLen : state.breakLen
        state.count = state.duration * 60 * 1000
        state.inSession = false
        state.running = false
        this.clock.postMessage({
            start: false,
            lowFps: this.plugin.getSettings().lowFps,
        })
        state.startTime = null
        state.elapsed = 0
        state.taskDoneAt = null
        state.lastCheckInAt = 0
        state.checkInsAcked = 0
        state.checkInPending = null
        state.extendOffered = false
        state.hardStopAt = null
        return state
    }

    private openLog(logFile: TFile | void) {
        if (logFile) {
            void this.plugin.app.workspace.getLeaf('split').openFile(logFile)
        }
    }

    private notify(state: TimerState, logFile: TFile | void) {
        const emoji = state.mode == 'WORK' ? '🍅' : '🥤'
        const text = `${emoji} You have been ${
            state.mode === 'WORK' ? 'working' : 'breaking'
        } for ${state.duration} minutes.`

        const inApp = () => {
            const fragment = new DocumentFragment()
            const span = fragment.createSpan()
            span.setText(`${text}`)
            fragment.addEventListener('click', () => this.openLog(logFile))
            new Notice(fragment)
        }

        if (this.plugin.getSettings().useSystemNotification && typeof window.Notification !== 'undefined') {
            // Standard Web Notification API (no Electron), falling back to an in-app notice
            const show = () => {
                const n = new window.Notification('Pomodoro Timer', { body: text, silent: true })
                n.onclick = () => {
                    this.openLog(logFile)
                    n.close()
                }
            }
            if (window.Notification.permission === 'granted') {
                show()
            } else if (window.Notification.permission === 'denied') {
                inApp()
            } else {
                window.Notification.requestPermission().then(
                    (p) => (p === 'granted' ? show() : inApp()),
                    () => inApp(),
                )
            }
        } else {
            inApp()
        }

        if (this.plugin.getSettings().notificationSound) {
            this.playAudio()
        }
    }

    public pause() {
        this.update((state) => {
            state.running = false
            this.clock.postMessage({
                start: false,
                lowFps: this.plugin.getSettings().lowFps,
            })
            return state
        })
    }

    public reset() {
        this.update((state) => {
            if (state.hyperfocus) {
                const focusedMin = Math.floor(state.elapsed / 60000)
                if (focusedMin >= HYPERFOCUS_MIN_MINUTES) {
                    const workLen = state.workLen || 25
                    const poms = pomodoroEquivalents(focusedMin, workLen)
                    const ctx = this.createLogContext(state)
                    this.plugin.forestEngine?.landHyperfocus(
                        focusedMin,
                        {
                            taskText: ctx.task.name || ctx.task.text,
                            notePath: ctx.task.path,
                            tags: ctx.task.tags,
                        },
                        {
                            pomodoros: poms,
                            checkInsAcked: state.checkInsAcked,
                        },
                    )
                    this.logger
                        .log(ctx)
                        .catch((err) => console.error('[Pomodoro Timer Forest] Failed to log the session', err))
                }
            } else if (state.elapsed > 0) {
                this.logger
                    .log(this.createLogContext(state))
                    .catch((err) => console.error('[Pomodoro Timer Forest] Failed to log the session', err))
                this.abandonGrowingTree(state)
            }

            state.hyperfocus = false
            state.extendOffered = false
            state.checkInPending = null
            state.hardStopAt = null
            state.duration =
                state.mode == 'WORK' ? state.workLen : state.breakLen
            state.count = state.duration * 60 * 1000
            state.inSession = false
            state.running = false

            if (!this.plugin.tracker!.taskPinned) {
                this.plugin.tracker!.clear()
            }
            this.clock.postMessage({
                start: false,
                lowFps: this.plugin.getSettings().lowFps,
            })
            state.startTime = null
            state.elapsed = 0
            state.taskDoneAt = null
            return state
        })
    }

    /**
     * Leaving a work session early withers the tree (after the first minute, if enabled),
     * unless its task was done or it was a hyperfocus session (hyperfocus never withers).
     */
    private abandonGrowingTree(state: TimerState) {
        if (!state.inSession || state.mode !== 'WORK' || state.hyperfocus) return
        const task = this.plugin.tracker?.task
        const file = this.plugin.tracker?.file
        this.plugin.forestEngine?.abortSession(
            state.elapsed / 60000,
            {
                taskText: task?.name || task?.text,
                notePath: task?.path || file?.path,
            },
            state.taskDoneAt !== null,
        )
    }

    private earlyHarvestAt(state: TimerState): number {
        return this.toMillis(earlyHarvestMinMinutes(state.count / 60000))
    }

    /**
     * Starts an open-ended hyperfocus session that counts up and never withers.
     */
    public startHyperfocus(opts?: { until?: number }) {
        this.update((s) => {
            const capMin = this.plugin.getSettings().hyperfocusCapMin || 180
            s.mode = 'WORK'
            s.hyperfocus = true
            s.elapsed = 0
            s.duration = capMin
            s.count = this.toMillis(capMin)
            s.startTime = Date.now()
            s.taskDoneAt = null
            s.lastCheckInAt = 0
            s.checkInsAcked = 0
            s.checkInPending = null
            s.extendOffered = false
            s.hardStopAt = opts?.until ?? null
            s.inSession = true
            s.running = true

            const task = this.plugin.tracker?.task
            const file = this.plugin.tracker?.file
            this.plugin.forestEngine?.startSession(
                capMin,
                task?.name || task?.text,
                task?.path || file?.path,
                task?.tags,
                true,
            )

            this.clock.postMessage({
                start: true,
                lowFps: this.plugin.getSettings().lowFps,
            })
            return s
        })
    }

    /**
     * Extends a just-completed work session directly into hyperfocus.
     */
    public extendIntoHyperfocus() {
        this.update((s) => {
            const capMin = this.plugin.getSettings().hyperfocusCapMin || 180
            s.hyperfocus = true
            s.extendOffered = false
            s.mode = 'WORK'
            s.duration = capMin
            s.count = this.toMillis(capMin)
            s.lastCheckInAt = s.elapsed
            s.checkInsAcked = 0
            s.checkInPending = null
            s.inSession = true
            s.running = true
            this.plugin.forestEngine?.extendToHyperfocus(s.elapsed)
            this.clock.postMessage({
                start: true,
                lowFps: this.plugin.getSettings().lowFps,
            })
            return s
        })
    }

    /**
     * Closes out a work session that was held at timeup and transitions to break.
     */
    public finishHeldSession() {
        let autostart = false
        this.update((state) => {
            state.extendOffered = false
            const ctx = this.createLogContext(state)
            this.processLog(ctx).catch((err) =>
                console.error('[Pomodoro Timer Forest] Failed to log the finished session', err),
            )
            autostart = state.autostart
            return this.endSession(state)
        })
        if (autostart) {
            this.start()
        }
    }

    /**
     * Lands a hyperfocus session: stopping is finishing, never withering.
     */
    public async land(breadcrumb?: string) {
        const s = this.state
        if (!s.inSession || !s.hyperfocus) return
        const focusedMin = Math.floor(s.elapsed / 60000)
        const workLen = s.workLen || 25
        const poms = pomodoroEquivalents(focusedMin, workLen)

        const ctx = this.createLogContext(s)
        if (breadcrumb) ctx.breadcrumb = breadcrumb

        if (breadcrumb && this.plugin.tracker?.task) {
            await this.plugin.tracker.appendBreadcrumb(this.plugin.tracker.task, breadcrumb)
        }

        if (this.plugin.tracker?.task) {
            await this.plugin.tracker.updateActual(poms)
        }

        this.plugin.forestEngine?.landHyperfocus(
            focusedMin,
            {
                taskText: ctx.task.name || ctx.task.text,
                notePath: ctx.task.path,
                tags: ctx.task.tags,
            },
            {
                pomodoros: poms,
                checkInsAcked: s.checkInsAcked,
            },
        )

        const logFile = await this.logger.log(ctx)
        this.notify(ctx, logFile)

        const recBreak = this.plugin.getSettings().hyperfocusRecoveryBreak
            ? recoveryBreakMinutes(focusedMin, s.breakLen)
            : s.breakLen

        this.update((state) => {
            state.hyperfocus = false
            state.extendOffered = false
            state.checkInPending = null
            state.breakLen = recBreak
            return this.endSession(state)
        })
    }

    public ackCheckIn() {
        this.update((s) => {
            s.checkInsAcked = (s.checkInsAcked || 0) + 1
            s.checkInPending = null
            return s
        })
        new Notice('💧 Hydrated and checked in! +5 Sunlight, +2 XP')
        if (this.plugin.getSettings().forestSounds) {
            this.plugin.forestEngine?.soundManager?.playCoin()
        }
    }

    public snoozeCheckIn(minutes = 10) {
        this.update((s) => {
            s.checkInPending = null
            const intervalMs = this.toMillis(this.plugin.getSettings().hyperfocusCheckInMin || 45)
            s.lastCheckInAt = s.elapsed - intervalMs + this.toMillis(minutes)
            return s
        })
    }

    public dismissCheckIn() {
        this.update((s) => {
            s.checkInPending = null
            return s
        })
    }

    /**
     * Called when the focused task is checked off. During a work session this offers to end
     * the session early (see harvestEarly) instead of sitting out the rest of the timer.
     */
    public markTaskDone() {
        if (!this.plugin.getSettings().earlyHarvest) return
        const s = this.state
        if (!s.inSession || s.mode !== 'WORK' || s.taskDoneAt !== null) return
        this.update((state) => ({ ...state, taskDoneAt: state.elapsed }))
        if (!this.plugin.hasVisibleForestView()) this.noticeTaskDone()
    }

    /** The focused task was unchecked again, or the focus moved on to another task. */
    public forgetTaskDone() {
        if (this.state.taskDoneAt === null) return
        this.update((state) => ({ ...state, taskDoneAt: null }))
    }

    private noticeTaskDone() {
        const s = this.state as TimerStore
        const ready = s.elapsed >= this.earlyHarvestAt(s)
        const fragment = new DocumentFragment()
        fragment.createSpan({
            text: ready
                ? `✅ Task done with ${s.remained.human.replace(/ /g, '')} to spare. Open the timer to harvest your tree early, or keep focusing for the full tree.`
                : '✅ Task done! Open the timer to end the session without withering, or pick your next task and keep focusing.',
        })
        fragment.addEventListener('click', () => void this.plugin.activateView())
        new Notice(fragment, 10000)
    }

    /**
     * Ends a work session whose task is done. With enough focus behind it a young tree is
     * harvested for the minutes focused; before that the session simply ends. It never
     * withers. Past halfway it counts on the task as a pomodoro and a break follows.
     */
    public harvestEarly() {
        const s = this.state
        if (!s.inSession || s.mode !== 'WORK' || s.taskDoneAt === null) return
        const ctx = this.createLogContext(s)
        const harvest = s.elapsed >= this.earlyHarvestAt(s)
        const halfway = s.elapsed * 2 >= s.count

        // Before anything else can start a new plant
        if (harvest) {
            this.plugin.forestEngine?.harvestEarly(ctx.elapsed / 60000, ctx.duration, {
                taskText: ctx.task.name || ctx.task.text,
                notePath: ctx.task.path,
                tags: ctx.task.tags,
            })
        }
        this.finishDoneTask(ctx, halfway, harvest).catch((err) =>
            console.error('[Pomodoro Timer Forest] Failed to log the early finish', err),
        )

        let autostart = false
        this.update((state) => {
            if (!harvest) this.abandonGrowingTree(state)
            if (halfway) {
                autostart = state.autostart
                return this.endSession(state)
            }
            // Too short for a pomodoro and its break: ready for the next task's session
            this.endSession(state)
            state.mode = 'WORK'
            state.duration = state.workLen
            state.count = this.toMillis(state.workLen)
            return state
        })
        if (autostart) this.start()
    }

    private async finishDoneTask(ctx: LogContext, countPomodoro: boolean, harvested: boolean) {
        const tracker = this.plugin.tracker
        if (countPomodoro) await tracker?.updateActual()
        // The task is done: don't carry it into the next session
        const current = tracker?.task
        if (current && current.path === ctx.task.path && current.blockLink === ctx.task.blockLink) {
            tracker?.clear()
        }
        await this.logger.log({ ...ctx, early: harvested })
    }

    public toggleMode(callback?: (state: TimerState) => void) {
        this.update((s) => {
            const settings = this.plugin.getSettings()
            if (!s.inSession) {
                // Idle mode cycle: Focus -> (Hyperfocus if enabled) -> Break -> Focus
                if (s.mode === 'WORK' && !s.hyperfocus) {
                    if (settings.hyperfocusEnabled) {
                        s.hyperfocus = true
                        s.duration = settings.hyperfocusCapMin || 180
                        s.count = this.toMillis(s.duration)
                    } else {
                        s.mode = 'BREAK'
                        s.duration = s.breakLen
                        s.count = this.toMillis(s.duration)
                    }
                } else if (s.mode === 'WORK' && s.hyperfocus) {
                    s.hyperfocus = false
                    s.mode = 'BREAK'
                    s.duration = s.breakLen
                    s.count = this.toMillis(s.duration)
                } else {
                    s.mode = 'WORK'
                    s.hyperfocus = false
                    s.duration = s.workLen
                    s.count = this.toMillis(s.duration)
                }
                if (callback) callback(s)
                return s
            }

            if (s.hyperfocus) {
                void this.land()
                return s
            }

            this.abandonGrowingTree(s)
            let updated = this.endSession(s)
            if (callback) {
                callback(updated)
            }
            return updated
        })
    }

    public toggleTimer() {
        if (this.state.extendOffered) {
            this.extendIntoHyperfocus()
            return
        }
        this.state.running ? this.pause() : this.start()
    }

    public playAudio() {
        let audio = Timer.DEFAULT_NOTIFICATION_AUDIO
        let customSound = this.plugin.getSettings().customSound
        if (customSound) {
            const soundFile =
                this.plugin.app.vault.getAbstractFileByPath(customSound)
            if (soundFile && soundFile instanceof TFile) {
                const soundSrc =
                    this.plugin.app.vault.getResourcePath(soundFile)
                audio = new Audio(soundSrc)
            }
        }
        // Playback can be blocked (e.g. before any user interaction); that's not worth surfacing
        audio.play().catch(() => {})
    }

    public setupTimer() {
        this.update((state) => {
            const { workLen, breakLen, autostart, hyperfocusCapMin } = this.plugin.getSettings()
            state.workLen = workLen
            state.breakLen = breakLen
            state.autostart = autostart
            if (!state.running && !state.inSession) {
                if (state.hyperfocus) {
                    state.duration = hyperfocusCapMin || 180
                } else {
                    state.duration = state.mode == 'WORK' ? state.workLen : state.breakLen
                }
                state.count = state.duration * 60 * 1000
            }

            return state
        })
    }

    public destroy() {
        this.pause()
        this.clock?.terminate()
        for (let unsub of this.unsubscribers) {
            unsub()
        }
    }
}
