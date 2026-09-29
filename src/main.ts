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
import { SCENE_CSS } from './render/VillageScene'

export default class PomodoroTimerPlugin extends Plugin {
	private settingTab?: PomodoroSettings
	public timer?: Timer
	public tasks?: Tasks
	public tracker?: TaskTracker
	public storageManager!: StorageManager
	public forestEngine!: ForestEngine
	public taskRewards?: TaskRewardWatcher

	async onload() {
		// Initialize unified storage first to prevent settings/forest overwrites
		this.storageManager = new StorageManager(this)
		await this.storageManager.initialize()
		this.forestEngine = new ForestEngine(this, this.storageManager)

		setPlugin(this)

		// Scene animations are shared by every view (and the timer's growing plant)
		const sceneStyle = document.head.createEl('style', { text: SCENE_CSS })
		this.register(() => sceneStyle.remove())
		this.forestEngine.ensureToday()
		// Roll quests / streak / vitality over at midnight even if Obsidian stays open
		this.registerInterval(window.setInterval(() => this.forestEngine.ensureToday(), 60_000))

		const settings = this.storageManager.getSettings()
		this.settingTab = new PomodoroSettings(this, settings)
		this.addSettingTab(this.settingTab)
		this.tracker = new TaskTracker(this)
		this.timer = new Timer(this)
		this.tasks = new Tasks(this)
		this.taskRewards = new TaskRewardWatcher(this)

		this.registerView(VIEW_TYPE_TIMER, (leaf) => new TimerView(this, leaf))
		this.registerView(VIEW_TYPE_HOMESTEAD, (leaf) => new HomesteadView(this, leaf))

		// Ribbon icon (Obsidian left ribbon)
		this.addRibbonIcon('trees', 'Open Homestead Village', () => {
			this.activateHomesteadView()
		})

		this.addRibbonIcon('timer', 'Pomodoro Timer Forest', () => {
			let { workspace } = this.app
			let leaves = workspace.getLeavesOfType(VIEW_TYPE_TIMER)
			const isRightCollapsed = workspace.rightSplit && (workspace.rightSplit as any).collapsed

			if (leaves.length > 0 && !isRightCollapsed) {
				workspace.detachLeavesOfType(VIEW_TYPE_TIMER)
			} else {
				this.activateView()
			}
		})

		// Status bar
		const status = this.addStatusBarItem()
		status.className = `${status.className} mod-clickable`
		new StatusBar({ target: status, props: { store: this.timer } })

		// Commands
		this.addCommand({
			id: 'open-pomodoro-timer-view',
			name: 'Open Pomodoro Forest (Right Sidebar)',
			callback: () => {
				this.activateView()
			},
		})

		this.addCommand({
			id: 'open-pomodoro-homestead-village',
			name: 'Open Homestead Village (Full View)',
			callback: () => {
				this.activateHomesteadView()
			},
		})

		this.addCommand({
			id: 'export-pomodoro-forest',
			name: 'Export Forest Data (JSON for Web Dashboard)',
			callback: async () => {
				const payload = this.forestEngine.generateExportPayload()
				const jsonStr = JSON.stringify(payload, null, 2)
				await navigator.clipboard.writeText(jsonStr)
				new Notice('📋 Forest & Homestead export copied to clipboard!')
			},
		})

		this.addCommand({
			id: 'reset-pomodoro-forest-debug',
			name: 'Reset Pomodoro Forest (Debug)',
			callback: () => {
				resetStoresForDebug()
				new Notice('Pomodoro Forest has been reset for debugging')
			},
		})

		this.addCommand({
			id: 'toggle-timer',
			name: 'Start / Pause Timer',
			callback: () => {
				this.timer?.toggleTimer()
			},
		})

		this.addCommand({
			id: 'toggle-timer-panel',
			name: 'Toggle Timer Panel',
			callback: () => {
				let { workspace } = this.app
				let leaves = workspace.getLeavesOfType(VIEW_TYPE_TIMER)
				const isRightCollapsed = workspace.rightSplit && (workspace.rightSplit as any).collapsed
				if (leaves.length > 0 && !isRightCollapsed) {
					workspace.detachLeavesOfType(VIEW_TYPE_TIMER)
				} else {
					this.activateView()
				}
			},
		})

		this.addCommand({
			id: 'reset-timer',
			name: 'Reset Timer',
			callback: () => {
				this.timer?.reset()
				new Notice('Timer reset')
			},
		})

		this.addCommand({
			id: 'toggle-mode',
			name: 'Switch Timer Mode (Work / Break)',
			callback: () => {
				this.timer?.toggleMode((t) => {
					new Notice(`Timer mode: ${t.mode}`)
				})
			},
		})
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
		this.forestEngine?.soundManager?.stopAmbient()
		this.forestEngine?.confettiEngine?.destroy()
		this.settingTab?.unload()
		this.timer?.destroy()
		this.tasks?.destroy()
		this.tracker?.destory()
	}

	async activateView() {
		let { workspace } = this.app
		let leaf: WorkspaceLeaf | null = null
		let leaves = workspace.getLeavesOfType(VIEW_TYPE_TIMER)

		if (leaves.length > 0) {
			leaf = leaves[0]
		} else {
			leaf = workspace.getRightLeaf(false)
			if (!leaf) {
				leaf = workspace.getLeaf(true)
			}
			await leaf.setViewState({
				type: VIEW_TYPE_TIMER,
				active: true,
			})
		}

		if (leaf) {
			workspace.revealLeaf(leaf)
		}

		if (workspace.rightSplit && (workspace.rightSplit as any).collapsed) {
			(workspace.rightSplit as any).expand()
		}
	}

	async activateHomesteadView() {
		let { workspace } = this.app
		let leaf: WorkspaceLeaf | null = null
		let leaves = workspace.getLeavesOfType(VIEW_TYPE_HOMESTEAD)

		if (leaves.length > 0) {
			leaf = leaves[0]
		} else {
			leaf = workspace.getLeaf(true) // Open in center workspace tab
			await leaf.setViewState({
				type: VIEW_TYPE_HOMESTEAD,
				active: true,
			})
		}

		workspace.revealLeaf(leaf)
	}
}
