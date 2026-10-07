import { TimerView, VIEW_TYPE_TIMER } from 'TimerView'
import { HomesteadView, VIEW_TYPE_HOMESTEAD } from 'HomesteadView'
import { Notice, Plugin, TFile, TFolder, WorkspaceLeaf, normalizePath } from 'obsidian'
import PomodoroSettings, { type Settings } from 'Settings'
import StatusBar from 'StatusBarComponent.svelte'
import Timer from 'Timer'
import Tasks from 'Tasks'
import TaskTracker from 'TaskTracker'
import StorageManager from './services/StorageManager'
import ForestEngine from './services/ForestEngine'
import TaskRewardWatcher from './services/TaskRewardWatcher'
import BoardWatcher from './board/BoardWatcher'
import BoardOpening, { VIEW_TYPE_BOARD } from './board/BoardOpening'
import { BoardView } from './board/BoardView'
import { newBoardText } from './board/BoardModel'
import { obsidianLanguage } from './board/cards'
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
    public boardWatcher?: BoardWatcher
    public boardOpening?: BoardOpening
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
        this.registerView(VIEW_TYPE_BOARD, (leaf) => new BoardView(leaf, this))
        this.registerHoverLinkSource(VIEW_TYPE_BOARD, { display: 'Forest boards', defaultMod: true })
        // Installed once every plugin has loaded, so board notes open where the settings say
        this.boardOpening = new BoardOpening(this)
        this.app.workspace.onLayoutReady(() => this.boardOpening?.install())
        this.registerBoardCommands()

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

    private registerBoardCommands(): void {
        const activeBoard = () => this.app.workspace.getActiveViewOfType(BoardView)
        const boardFile = () => {
            const file = this.app.workspace.getActiveFile()
            return file && this.boardOpening?.isBoardPath(file.path) ? file : null
        }

        this.addCommand({
            id: 'create-board',
            name: 'Create a new board',
            callback: () => void this.createBoard(),
        })

        this.addCommand({
            id: 'open-as-board',
            name: 'Open this note as a Forest board',
            checkCallback: (checking) => {
                const file = boardFile()
                if (!file || activeBoard()) return false
                if (!checking) void this.boardOpening?.openAsBoard(this.app.workspace.getLeaf(false), file)
                return true
            },
        })

        this.addCommand({
            id: 'open-board-as-markdown',
            name: 'Open this board as markdown',
            checkCallback: (checking) => {
                const view = activeBoard()
                if (!view) return false
                if (!checking) void view.openAsMarkdown()
                return true
            },
        })

        this.addCommand({
            id: 'archive-finished-cards',
            name: 'Archive the finished cards on this board',
            checkCallback: (checking) => {
                const view = activeBoard()
                if (!view) return false
                if (!checking) view.archiveFinished()
                return true
            },
        })

        this.addCommand({
            id: 'focus-next-card',
            name: 'Focus on the next card in progress',
            checkCallback: (checking) => {
                const view = activeBoard()
                if (!view) return false
                const doc = view.getDoc()
                const lanes = doc.lanes.map((lane) => ({ lane, role: view.roleOf(lane) }))
                const pick =
                    lanes.find((l) => l.role === 'active' && l.lane.cards.some((c) => !c.checked))?.lane ??
                    lanes.find((l) => l.role === 'backlog' && l.lane.cards.some((c) => !c.checked))?.lane
                const card = pick?.cards.find((c) => !c.checked)
                if (!card) return false
                if (!checking) void view.focusCard(card.key, true)
                return true
            },
        })

        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file, source, leaf) => {
                if (file instanceof TFolder) {
                    menu.addItem((i) =>
                        i
                            .setTitle('New board')
                            .setIcon('kanban')
                            .onClick(() => void this.createBoard(file)),
                    )
                    return
                }
                if (!(file instanceof TFile) || !this.boardOpening?.isBoardPath(file.path)) return
                if (leaf?.view instanceof BoardView) return
                menu.addItem((i) =>
                    i
                        .setTitle('Open as Forest board')
                        .setIcon('kanban')
                        .setSection('pane')
                        .onClick(() => void this.boardOpening?.openAsBoard(leaf ?? this.app.workspace.getLeaf(false), file)),
                )
            }),
        )
    }

    /** Creates "Untitled board.md" (numbered when taken) and opens it as a board. */
    public async createBoard(folder?: TFolder): Promise<void> {
        const parent = folder ?? this.app.fileManager.getNewFileParent(this.app.workspace.getActiveFile()?.path ?? '')
        const base = parent.isRoot() ? '' : `${parent.path}/`
        let path = normalizePath(`${base}Untitled board.md`)
        for (let n = 1; this.app.vault.getAbstractFileByPath(path); n++) path = normalizePath(`${base}Untitled board ${n}.md`)
        try {
            const text = newBoardText([{ title: 'To do' }, { title: 'Doing', maxItems: 3 }, { title: 'Done', complete: true }], obsidianLanguage())
            const file = await this.app.vault.create(path, text)
            await this.boardOpening?.openAsBoard(this.app.workspace.getLeaf(true), file)
        } catch (err) {
            console.error('[Pomodoro Timer Forest] Could not create the board', err)
            new Notice('Could not create the board.')
        }
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
        this.boardWatcher = new BoardWatcher(this)

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
        return [
            ...workspace.getLeavesOfType(VIEW_TYPE_TIMER),
            ...workspace.getLeavesOfType(VIEW_TYPE_HOMESTEAD),
            ...workspace.getLeavesOfType(VIEW_TYPE_BOARD),
        ].some(
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
