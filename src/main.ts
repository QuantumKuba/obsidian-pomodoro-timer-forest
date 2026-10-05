import { TimerView, VIEW_TYPE_TIMER } from 'TimerView'
import { HomesteadView, VIEW_TYPE_HOMESTEAD } from 'HomesteadView'
import { Notice, Plugin, WorkspaceLeaf } from 'obsidian'
import PomodoroSettings, { type Settings } from 'Settings'
import StatusBar from 'StatusBarComponent.svelte'
import Timer from 'Timer'
import Tasks from 'Tasks'
import TaskTracker from 'TaskTracker'
import StorageManager from './services/StorageManager'
import ForestEngine from './services/ForestEngine'
import TaskRewardWatcher from './services/TaskRewardWatcher'
import { setPlugin, resetStoresForDebug } from './stores'
import { get } from 'svelte/store'

export default class PomodoroTimerPlugin extends Plugin {
    private settingTab?: PomodoroSettings
    private statusBar?: StatusBar
    private statusBarItem?: HTMLElement
    public timer?: Timer
    public tasks?: Tasks
    public tracker?: TaskTracker
    public storageManager!: StorageManager
    public forestEngine!: ForestEngine
    public taskRewards?: TaskRewardWatcher
    /** Resolves once saved data is loaded and the timer, tasks and game engine exist. */
    public ready!: Promise<void>

    onload(): void {
        // Unified storage is created first so settings and forest data are never overwritten
        this.storageManager = new StorageManager(this)

        // Views, ribbon icons and commands are registered immediately. Everything that needs
        // the saved data is set up in initialize(); the views wait for `ready` before rendering.
        this.ready = this.initialize()
        this.ready.catch((err) => console.error('[Pomodoro Timer Forest] Failed to initialize', err))

        this.registerView(VIEW_TYPE_TIMER, (leaf) => new TimerView(this, leaf))
        this.registerView(VIEW_TYPE_HOMESTEAD, (leaf) => new HomesteadView(this, leaf))

        this.addRibbonIcon('trees', 'Open homestead village', () => {
            void this.activateHomesteadView()
        })
        this.addRibbonIcon('timer', 'Toggle timer panel', () => {
            this.toggleTimerPanel()
        })

        // The status bar item is created now; its timer component is mounted once the timer exists
        this.statusBarItem = this.addStatusBarItem()
        this.statusBarItem.addClass('mod-clickable')

        this.addCommand({
            id: 'open-pomodoro-timer-view',
            name: 'Open timer panel in the right sidebar',
            callback: () => {
                void this.activateView()
            },
        })

        this.addCommand({
            id: 'open-pomodoro-homestead-village',
            name: 'Open homestead village (full view)',
            callback: () => {
                void this.activateHomesteadView()
            },
        })

        this.addCommand({
            id: 'export-pomodoro-forest',
            name: 'Copy forest data as JSON (for a web dashboard)',
            callback: () => {
                void this.copyExportToClipboard()
            },
        })

        this.addCommand({
            id: 'reset-pomodoro-forest-debug',
            name: 'Reset forest progress (debug)',
            callback: () => {
                resetStoresForDebug()
                new Notice('Forest progress has been reset.')
            },
        })

        this.addCommand({
            id: 'toggle-timer',
            name: 'Start / pause timer',
            callback: () => {
                this.timer?.toggleTimer()
            },
        })

        this.addCommand({
            id: 'toggle-timer-panel',
            name: 'Toggle timer panel',
            callback: () => {
                this.toggleTimerPanel()
            },
        })

        this.addCommand({
            id: 'reset-timer',
            name: 'Reset timer',
            callback: () => {
                this.timer?.reset()
                new Notice('Timer reset')
            },
        })

        this.addCommand({
            id: 'harvest-early',
            name: 'Harvest focus session early (focused task is done)',
            checkCallback: (checking) => {
                const t = this.timer ? get(this.timer) : null
                if (!t?.taskDone) return false
                if (!checking) this.timer?.harvestEarly()
                return true
            },
        })

        this.addCommand({
            id: 'toggle-mode',
            name: 'Switch timer mode (work / break)',
            callback: () => {
                this.timer?.toggleMode((t) => {
                    new Notice(`Timer mode: ${t.mode}`)
                })
            },
        })
    }

    /** Everything that depends on the saved data. */
    private async initialize(): Promise<void> {
        await this.storageManager.initialize()
        this.forestEngine = new ForestEngine(this, this.storageManager)

        setPlugin(this)

        this.forestEngine.ensureToday()
        // Roll quests / streak / vitality over at midnight even if Obsidian stays open
        this.registerInterval(window.setInterval(() => this.forestEngine.ensureToday(), 60_000))
        this.watchDataFile()

        this.settingTab = new PomodoroSettings(this, this.storageManager.getSettings())
        this.addSettingTab(this.settingTab)
        this.tracker = new TaskTracker(this)
        this.timer = new Timer(this)
        this.tasks = new Tasks(this)
        this.taskRewards = new TaskRewardWatcher(this)

        if (this.statusBarItem) {
            this.statusBar = new StatusBar({ target: this.statusBarItem, props: { store: this.timer } })
        }
    }

    /**
     * Syncing between devices is done by the user's sync tool. When it replaces data.json, load
     * the new progress instead of carrying on with (and later saving) the old copy. Obsidian
     * reports most such changes through onExternalSettingsChange(); these checks cover sync
     * tools it does not see. Pending changes are written before the app goes to the background
     * so the sync tool picks them up.
     */
    private watchDataFile(): void {
        const reload = () => void this.reloadData()
        this.registerInterval(window.setInterval(reload, 30_000))
        this.registerDomEvent(window, 'focus', reload)
        this.registerDomEvent(document, 'visibilitychange', () => {
            if (document.visibilityState === 'hidden') void this.storageManager.flush()
            else reload()
        })
        this.app.workspace.onLayoutReady(reload)
    }

    private async reloadData(): Promise<void> {
        if (await this.storageManager.reloadFromDisk()) this.forestEngine.ensureToday()
    }

    /** Called by Obsidian when data.json was changed by something other than this plugin. */
    onExternalSettingsChange(): void {
        this.ready.then(() => this.reloadData()).catch(() => undefined)
    }

    private async copyExportToClipboard(): Promise<void> {
        if (!this.forestEngine) return
        try {
            const payload = this.forestEngine.generateExportPayload()
            await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
            new Notice('📋 Forest & homestead export copied to clipboard!')
        } catch {
            new Notice('Could not copy the export to the clipboard.')
        }
    }

    private toggleTimerPanel(): void {
        const { workspace } = this.app
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_TIMER)
        if (leaves.length > 0 && !workspace.rightSplit?.collapsed) {
            workspace.detachLeavesOfType(VIEW_TYPE_TIMER)
        } else {
            void this.activateView()
        }
    }

    public getSettings(): Settings {
        return (
            this.storageManager?.getSettings() ||
            this.settingTab?.getSettings() ||
            PomodoroSettings.DEFAULT_SETTINGS
        )
    }

    /** True when a timer or village view is open, so rewards can be celebrated in-view. */
    public hasVisibleForestView(): boolean {
        const { workspace } = this.app
        return [...workspace.getLeavesOfType(VIEW_TYPE_TIMER), ...workspace.getLeavesOfType(VIEW_TYPE_HOMESTEAD)].some(
            (leaf) => leaf.view.containerEl.isShown(),
        )
    }

    onunload() {
        // Write anything still waiting in the save debounce
        void this.storageManager?.flush()
        this.statusBar?.$destroy()
        this.forestEngine?.soundManager?.stopAmbient()
        this.forestEngine?.confettiEngine?.destroy()
        this.settingTab?.unload()
        this.timer?.destroy()
        this.tasks?.destroy()
        this.tracker?.destory()
    }

    async activateView(): Promise<void> {
        const { workspace } = this.app
        let leaf: WorkspaceLeaf
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_TIMER)

        if (leaves.length > 0) {
            leaf = leaves[0]
        } else {
            leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true)
            await leaf.setViewState({
                type: VIEW_TYPE_TIMER,
                active: true,
            })
        }

        void workspace.revealLeaf(leaf)

        if (workspace.rightSplit?.collapsed) {
            workspace.rightSplit.expand()
        }
    }

    async activateHomesteadView(): Promise<void> {
        const { workspace } = this.app
        let leaf: WorkspaceLeaf
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_HOMESTEAD)

        if (leaves.length > 0) {
            leaf = leaves[0]
        } else {
            leaf = workspace.getLeaf(true) // Open in center workspace tab
            await leaf.setViewState({
                type: VIEW_TYPE_HOMESTEAD,
                active: true,
            })
        }

        void workspace.revealLeaf(leaf)
    }
}
