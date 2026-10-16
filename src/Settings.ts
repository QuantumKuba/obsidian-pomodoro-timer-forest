import type PomodoroTimerPlugin from 'main'
import { PluginSettingTab, Setting, moment, type SettingDefinitionItem } from 'obsidian'
import type { Unsubscriber } from 'svelte/motion'
import { writable, type Writable } from 'svelte/store'
import {
    appHasDailyNotesPluginLoaded,
    appHasWeeklyNotesPluginLoaded,
    getTemplater,
} from 'utils'

type LogFileType = 'DAILY' | 'WEEKLY' | 'FILE' | 'NONE'
type LogLevel = 'ALL' | 'WORK' | 'BREAK'
type LogFormat = 'SIMPLE' | 'VERBOSE' | 'CUSTOM'
export type TaskFormat = 'TASKS' | 'DATAVIEW'
/**
 * Which view Kanban board notes open in. `auto`: the Kanban plugin's when it is enabled,
 * otherwise this plugin's board. `forest`: always this plugin's board. `manual`: never switch.
 */
export type BoardOpenMode = 'auto' | 'forest' | 'manual'

export interface Settings {
    workLen: number
    breakLen: number
    autostart: boolean
    useStatusBarTimer: boolean
    notificationSound: boolean
    enableTaskTracking: boolean
    showTaskProgress: boolean
    customSound: string
    logFile: LogFileType
    logFocused: boolean
    logPath: string
    logLevel: LogLevel
    logTemplate: string
    logFormat: LogFormat
    useSystemNotification: boolean
    taskFormat: TaskFormat
    /** Notes whose tasks stay in the task list while working in other notes. */
    pinnedNotes?: string[]
    lowFps: boolean
    hardcoreMode: boolean
    enableCelebrationParticles: boolean
    dailyGoal: number
    rewardTaskCompletion: boolean
    /** Offer to end a work session early once its focused task is checked off. */
    earlyHarvest: boolean
    logForestToDailyNote: boolean
    forestSounds: boolean
    boardOpenMode: BoardOpenMode
    /** Count finished sessions on board cards even when task tracking is off. */
    boardTaskTracking: boolean
    /** Ticking a card off on the board also moves it into the done lane. */
    boardMoveChecked: boolean
    /** Cards waiting this many days in an in-progress lane are marked; 0 turns it off. */
    boardStaleDays: number
    /** Hyperfocus (open-ended ADHD-friendly focus sessions) */
    hyperfocusEnabled: boolean
    /** Show "Keep going →" prompt when a work session ends to ride the hyperfocus wave */
    hyperfocusOfferExtend: boolean
    /** Safety cap in minutes before auto-landing hyperfocus */
    hyperfocusCapMin: number
    /** Interval in minutes for gentle body check-ins (water, stretch, time); 0 = off */
    hyperfocusCheckInMin: number
    /** Check-in style: 'quiet' (notice) | 'chime' (soft sound) | 'system' (system notification) */
    hyperfocusCheckInStyle: 'quiet' | 'chime' | 'system'
    /** Ask for a quick breadcrumb note ("Where was I?") on landing */
    hyperfocusBreadcrumb: boolean
    /** Suggest a longer recovery break after a deep hyperfocus session */
    hyperfocusRecoveryBreak: boolean
}

export default class PomodoroSettings extends PluginSettingTab {
    static readonly DEFAULT_SETTINGS: Settings = {
        workLen: 25,
        breakLen: 5,
        autostart: false,
        useStatusBarTimer: false,
        notificationSound: true,
        customSound: '',
        showTaskProgress: true,
        enableTaskTracking: false,
        logFile: 'NONE',
        logFocused: false,
        logPath: '',
        logLevel: 'ALL',
        logTemplate: '',
        logFormat: 'VERBOSE',
        useSystemNotification: false,
        taskFormat: 'TASKS',
        lowFps: false,
        hardcoreMode: true,
        enableCelebrationParticles: true,
        dailyGoal: 4,
        rewardTaskCompletion: true,
        earlyHarvest: true,
        logForestToDailyNote: false,
        forestSounds: true,
        boardOpenMode: 'auto',
        boardTaskTracking: true,
        boardMoveChecked: true,
        boardStaleDays: 5,
        hyperfocusEnabled: true,
        hyperfocusOfferExtend: true,
        hyperfocusCapMin: 180,
        hyperfocusCheckInMin: 45,
        hyperfocusCheckInStyle: 'quiet',
        hyperfocusBreadcrumb: true,
        hyperfocusRecoveryBreak: true,
    }

    static settings: Writable<Settings> = writable(
        PomodoroSettings.DEFAULT_SETTINGS,
    )

    private _settings: Settings

    private plugin: PomodoroTimerPlugin

    private unsubscribe: Unsubscriber

    constructor(plugin: PomodoroTimerPlugin, settings: Settings) {
        super(plugin.app, plugin)
        this.plugin = plugin
        this._settings = { ...PomodoroSettings.DEFAULT_SETTINGS, ...settings }
        PomodoroSettings.settings.set(this._settings)
        this.unsubscribe = PomodoroSettings.settings.subscribe((settings) => {
            this._settings = settings
            if (this.plugin.storageManager) {
                this.plugin.storageManager.requestSave()
            } else {
                void this.plugin.saveData(settings)
            }
            this.plugin.timer?.setupTimer()
        })
    }

    public getSettings(): Settings {
        return this._settings
    }

    public getSettingDefinitions(): SettingDefinitionItem[] {
        return []
    }

    public updateSettings = (
        newSettings: Partial<Settings>,
        refreshUI = false,
    ) => {
        PomodoroSettings.settings.update((settings) => {
            this._settings = { ...settings, ...newSettings }
            if (refreshUI) {
                this.renderSettings()
            }
            return this._settings
        })
    }

    public unload() {
        this.unsubscribe()
    }

    public display(): void {
        this.renderSettings()
    }

    private renderSettings(): void {
        const { containerEl } = this
        containerEl.empty()

        new Setting(containerEl)
            .setName('Enable status bar timer')
            .addToggle((toggle) => {
                toggle.setValue(this._settings.useStatusBarTimer)
                toggle.onChange((value) => {
                    this.updateSettings({ useStatusBarTimer: value })
                })
            })

		new Setting(containerEl)
			.setName('Low animation frame rate')
			.setDesc('If you encounter high CPU usage, enable this option to lower the animation frame rate and save CPU resources. It also pauses the village animations.')
			.addToggle((toggle) => {
				toggle.setValue(this._settings.lowFps)
				toggle.onChange((value: boolean) => {
					this.updateSettings({ lowFps: value })
				})
			})

        new Setting(containerEl).setHeading().setName('Forest & homestead')

        new Setting(containerEl)
            .setName('Daily focus goal')
            .setDesc('How many pomodoros make a "full" day. Used for the daily goal meter and quest sizes — pick something kind to yourself.')
            .addSlider((slider) => {
                slider.setLimits(1, 12, 1)
                slider.setValue(this._settings.dailyGoal ?? 4)
                slider.onChange((value) => {
                    this.updateSettings({ dailyGoal: value })
                })
            })

        new Setting(containerEl)
            .setName('Reward checked-off tasks')
            .setDesc('Earn coins and experience when you complete a Markdown task in any note (each task counts once per day).')
            .addToggle((toggle) => {
                toggle.setValue(this._settings.rewardTaskCompletion ?? true)
                toggle.onChange((value) => {
                    this.updateSettings({ rewardTaskCompletion: value })
                })
            })

        new Setting(containerEl)
            .setName('Early harvest when the task is done')
            .setDesc('Checking off the task you are focusing on during a session lets you end it early without withering. After 5 minutes of focus this grows a young tree worth ¾ of the rewards for the minutes focused; finishing the session still earns the most.')
            .addToggle((toggle) => {
                toggle.setValue(this._settings.earlyHarvest ?? true)
                toggle.onChange((value) => {
                    this.updateSettings({ earlyHarvest: value })
                })
            })

        new Setting(containerEl)
            .setName('Withering (hardcore mode)')
            .setDesc('Abandoning a work session after the first minute leaves a withered tree in today\'s grove.')
            .addToggle((toggle) => {
                toggle.setValue(this._settings.hardcoreMode ?? true)
                toggle.onChange((value) => {
                    this.updateSettings({ hardcoreMode: value })
                })
            })

        new Setting(containerEl)
            .setName('Celebration effects')
            .setDesc('Petals, sparkles and the reward card when a tree finishes growing.')
            .addToggle((toggle) => {
                toggle.setValue(this._settings.enableCelebrationParticles ?? true)
                toggle.onChange((value) => {
                    this.updateSettings({ enableCelebrationParticles: value })
                })
            })

        new Setting(containerEl)
            .setName('Forest chimes')
            .setDesc('Soft synthesized chimes when planting, harvesting and levelling up.')
            .addToggle((toggle) => {
                toggle.setValue(this._settings.forestSounds ?? true)
                toggle.onChange((value) => {
                    this.updateSettings({ forestSounds: value })
                })
            })

        new Setting(containerEl)
            .setName('Log trees to daily note')
            .setDesc('Add a line of inline fields (duration, tree, rewards) to today\'s daily note for every tree grown.')
            .addToggle((toggle) => {
                toggle.setValue(this._settings.logForestToDailyNote ?? false)
                toggle.onChange((value) => {
                    this.updateSettings({ logForestToDailyNote: value })
                })
            })

        new Setting(containerEl).setHeading().setName('Hyperfocus (open-ended focus)')

        new Setting(containerEl)
            .setName('Enable hyperfocus mode')
            .setDesc('Allows open-ended, count-up focus sessions specifically designed for ADHD hyperfocus. Hyperfocus sessions never wither when stopped.')
            .addToggle((toggle) => {
                toggle.setValue(this._settings.hyperfocusEnabled ?? true)
                toggle.onChange((value) => {
                    this.updateSettings({ hyperfocusEnabled: value }, true)
                })
            })

        if (this._settings.hyperfocusEnabled) {
            new Setting(containerEl)
                .setName('Ride the wave (extend into hyperfocus)')
                .setDesc('When a normal work session finishes, offer to keep going directly into hyperfocus without resetting or breaking flow.')
                .addToggle((toggle) => {
                    toggle.setValue(this._settings.hyperfocusOfferExtend ?? true)
                    toggle.onChange((value) => {
                        this.updateSettings({ hyperfocusOfferExtend: value })
                    })
                })

            new Setting(containerEl)
                .setName('Safety cap (maximum minutes)')
                .setDesc('Automatically lands and harvests the tree when this duration is reached, to prevent accidental overnight sessions.')
                .addSlider((slider) => {
                    slider.setLimits(60, 300, 15)
                    slider.setValue(this._settings.hyperfocusCapMin ?? 180)
                    slider.onChange((value) => {
                        this.updateSettings({ hyperfocusCapMin: value })
                    })
                })

            new Setting(containerEl)
                .setName('Gentle body check-in interval')
                .setDesc('Minutes between non-blocking prompts to stretch, drink water, and check the current time. 0 turns check-ins off.')
                .addSlider((slider) => {
                    slider.setLimits(0, 120, 15)
                    slider.setValue(this._settings.hyperfocusCheckInMin ?? 45)
                    slider.onChange((value) => {
                        this.updateSettings({ hyperfocusCheckInMin: value })
                    })
                })

            new Setting(containerEl)
                .setName('Check-in nudge style')
                .setDesc('How body check-ins alert you without interrupting your concentration.')
                .addDropdown((dropdown) => {
                    dropdown.selectEl.addClass('pomodoro-select-compact')
                    dropdown.addOptions({
                        quiet: 'Quiet in-app notice',
                        chime: 'Soft chime + notice',
                        system: 'System notification',
                    })
                    dropdown.setValue(this._settings.hyperfocusCheckInStyle ?? 'quiet')
                    dropdown.onChange((value: string) => {
                        this.updateSettings({ hyperfocusCheckInStyle: value as 'quiet' | 'chime' | 'system' })
                    })
                })

            new Setting(containerEl)
                .setName('Prompt for breadcrumb ("Where was I?")')
                .setDesc('When landing a session, offer a 1-line prompt to record where you stopped so re-entry is easy next time.')
                .addToggle((toggle) => {
                    toggle.setValue(this._settings.hyperfocusBreadcrumb ?? true)
                    toggle.onChange((value) => {
                        this.updateSettings({ hyperfocusBreadcrumb: value })
                    })
                })

            new Setting(containerEl)
                .setName('Suggest recovery break')
                .setDesc('Scale the subsequent break length to the depth of the hyperfocus session (e.g. up to 20 minutes) to ease task switching.')
                .addToggle((toggle) => {
                    toggle.setValue(this._settings.hyperfocusRecoveryBreak ?? true)
                    toggle.onChange((value) => {
                        this.updateSettings({ hyperfocusRecoveryBreak: value })
                    })
                })
        }

        new Setting(containerEl).setHeading().setName('Notification')

        new Setting(containerEl)
            .setName('Use system notification')
            .addToggle((toggle) => {
                toggle.setValue(this._settings.useSystemNotification)
                toggle.onChange((value) => {
                    this.updateSettings({ useSystemNotification: value })
                })
            })
        new Setting(containerEl)
            .setName('Sound notification')
            .addToggle((toggle) => {
                toggle.setValue(this._settings.notificationSound)
                toggle.onChange((value) => {
                    this.updateSettings({ notificationSound: value }, true)
                })
            })

        if (this._settings.notificationSound) {
            new Setting(containerEl)
                .setName('Custom notification audio')
                .addText((text) => {
                    text.inputEl.addClass('pomodoro-input-full')
                    text.setPlaceholder('path/to/sound.mp3')
                    text.setValue(this._settings.customSound)
                    text.onChange((value) => {
                        this.updateSettings({ customSound: value })
                    })
                })
                .addExtraButton((button) => {
                    button.setIcon('play')
                    button.setTooltip('Play')
                    button.onClick(() => {
                        this.plugin.timer?.playAudio()
                    })
                })
        }

        new Setting(containerEl).setHeading().setName('Task')
        new Setting(containerEl)
            .setName('Enable task tracking')
            .setDesc(
                'Adds one to the 🍅 count on the task you are focusing on each time a focus session finishes. Focusing on a task adds a block ID (like ^a1b2) to its line, unless it already has one, so the task can be found again.',
            )
            .addToggle((toggle) => {
                toggle.setValue(this._settings.enableTaskTracking)
                toggle.onChange((value) => {
                    this.updateSettings({ enableTaskTracking: value })
                })
            })
        new Setting(containerEl)
            .setName('Show task progress background')
            .addToggle((toggle) => {
                toggle.setValue(this._settings.showTaskProgress)
                toggle.onChange((value) => {
                    this.updateSettings({ showTaskProgress: value })
                })
            })
        new Setting(containerEl)
            .setName('Task format')
            .addDropdown((dropdown) => {
                dropdown.selectEl.addClass('pomodoro-select-compact')
                dropdown.addOptions({
                    TASKS: 'Tasks Emoji Format',
                    DATAVIEW: 'Dataview',
                })
                dropdown.setValue(this._settings.taskFormat)
                dropdown.onChange((value: string) => {
                    this.updateSettings(
                        { taskFormat: value as TaskFormat },
                        true,
                    )
                })
            })

        new Setting(containerEl).setHeading().setName('Boards')

        const kanbanInstalled = !!this.app.plugins?.plugins?.['obsidian-kanban']
        new Setting(containerEl)
            .setName('Open Kanban boards in')
            .setDesc(
                'Boards use the Kanban plugin\'s file format, so either plugin can open them. ' +
                    (kanbanInstalled
                        ? 'The Kanban plugin is enabled: with Automatic it keeps opening boards, and you can switch with “Open as Forest board”.'
                        : 'With Automatic, boards open here unless the Kanban plugin is enabled.'),
            )
            .addDropdown((dropdown) => {
                dropdown.selectEl.addClass('pomodoro-select-compact')
                dropdown.addOptions({
                    auto: 'Automatic',
                    forest: 'Forest board',
                    manual: 'Leave as they are',
                })
                dropdown.setValue(this._settings.boardOpenMode ?? 'auto')
                dropdown.onChange((value: string) => {
                    this.updateSettings({ boardOpenMode: value as BoardOpenMode })
                })
            })

        new Setting(containerEl)
            .setName('Count pomodoros on cards')
            .setDesc('Each finished focus session adds one to the 🍅 count of the card you focused on, even with task tracking turned off.')
            .addToggle((toggle) => {
                toggle.setValue(this._settings.boardTaskTracking ?? true)
                toggle.onChange((value) => {
                    this.updateSettings({ boardTaskTracking: value })
                })
            })

        new Setting(containerEl)
            .setName('Move ticked-off cards to the done lane')
            .setDesc('Ticking a card off on the board also moves it to the top of the first done lane.')
            .addToggle((toggle) => {
                toggle.setValue(this._settings.boardMoveChecked ?? true)
                toggle.onChange((value) => {
                    this.updateSettings({ boardMoveChecked: value })
                })
            })

        new Setting(containerEl)
            .setName('Mark cards as stale after')
            .setDesc('Days a card can wait in an in-progress lane before it is marked, as a nudge to finish or move it. 0 turns this off.')
            .addSlider((slider) => {
                slider.setLimits(0, 21, 1)
                slider.setValue(this._settings.boardStaleDays ?? 5)
                slider.onChange((value) => {
                    this.updateSettings({ boardStaleDays: value })
                })
            })

        new Setting(containerEl).setHeading().setName('Log')
        new Setting(containerEl).setName('Log file').addDropdown((dropdown) => {
            dropdown.selectEl.addClass('pomodoro-select-compact')
            dropdown.addOptions({ NONE: 'None' })
            if (appHasDailyNotesPluginLoaded()) {
                dropdown.addOptions({ DAILY: 'Daily note' })
            }
            if (appHasWeeklyNotesPluginLoaded()) {
                dropdown.addOptions({ WEEKLY: 'Weekly note' })
            }
            dropdown.addOptions({ FILE: 'File' })
            dropdown.setValue(this._settings.logFile)
            dropdown.onChange((value: string) => {
                this.updateSettings({ logFile: value as LogFileType }, true)
            })
        })

        if (this._settings.logFile != 'NONE') {
            if (this._settings.logFile === 'FILE') {
                new Setting(containerEl)
                    .setName('Log file path')
                    .setDesc('The file to log pomodoro sessions to')
                    .addText((text) => {
                        text.inputEl.addClass('pomodoro-input-medium')
                        text.setValue(this._settings.logPath)
                        text.onChange((value) => {
                            this.updateSettings({ logPath: value })
                        })
                    })
            }

            new Setting(containerEl)
                .setName('Log level')
                .addDropdown((dropdown) => {
                    dropdown.selectEl.addClass('pomodoro-select-compact')
                    dropdown.addOptions({
                        ALL: 'All',
                        WORK: 'Work',
                        BREAK: 'Break',
                    })
                    dropdown.setValue(this._settings.logLevel)
                    dropdown.onChange((value: string) => {
                        this.updateSettings({ logLevel: value as LogLevel })
                    })
                })

            const hasTemplater = !!getTemplater(this.app)

            let example = ''
            if (this._settings.logFormat == 'SIMPLE') {
                example = `**WORK(25m)**: from ${moment()
                    .subtract(25, 'minutes')
                    .format('HH:mm')} - ${moment().format('HH:mm')}`
            }
            if (this._settings.logFormat == 'VERBOSE') {
                example = `- 🍅 (pomodoro::WORK) (duration:: 25m) (begin:: ${moment()
                    .subtract(25, 'minutes')
                    .format('YYYY-MM-DD HH:mm')}) - (end:: ${moment().format(
                    'YYYY-MM-DD HH:mm',
                )})`
            }
            new Setting(containerEl)
                .setName('Log format')
                .setDesc(example)
                .addDropdown((dropdown) => {
                    dropdown.selectEl.addClass('pomodoro-select-compact')
                    dropdown.addOptions({
                        SIMPLE: 'Simple',
                        VERBOSE: 'Verbose',
                        CUSTOM: 'Custom',
                    })
                    dropdown.setValue(this._settings.logFormat)

                    dropdown.onChange((value: string) => {
                        this.updateSettings(
                            { logFormat: value as LogFormat },
                            true,
                        )
                    })
                })


            if (this._settings.logFormat == 'CUSTOM') {
                const logTemplate = new Setting(containerEl).setName(
                    'Log template',
                )
                if (hasTemplater) {
                    logTemplate.addTextArea((text) => {
                        text.inputEl.addClass('pomodoro-input-full', 'pomodoro-textarea-vertical')
                        text.setPlaceholder('<% templater script goes here %>')
                        text.setValue(this._settings.logTemplate)
                        text.onChange((value) => {
                            this.updateSettings({ logTemplate: value })
                        })
                    })
                } else {
                    logTemplate
                        .setDesc(
                            createFragment((fragment) => {
                                fragment.createSpan({
                                    text: 'Requires ',
                                    cls: 'pomodoro-text-error',
                                })
                                fragment.createEl('a', {
                                    text: 'Templater',
                                    href: 'obsidian://show-plugin?id=templater-obsidian',
                                })
                                fragment.createSpan({
                                    text: ' plugin to be enabled, then click the refresh button',
                                    cls: 'pomodoro-text-error',
                                })
                            }),
                        )
                        .addButton((button) => {
                            button.setIcon('refresh-ccw')
                            button.onClick(() => {
                                this.renderSettings()
                            })
                        })
                }
            }
        }

        new Setting(containerEl).addButton((button) => {
            button.setButtonText('Restore settings')
            button.onClick(() => {
                this.updateSettings(PomodoroSettings.DEFAULT_SETTINGS, true)
            })
        })
    }
}
