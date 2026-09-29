import { ItemView, WorkspaceLeaf } from 'obsidian'
import ForestComponent from './forest/ForestComponent.svelte'
import PomodoroTimerPlugin from 'main'

export const VIEW_TYPE_HOMESTEAD = 'pomodoro-homestead-view'

export class HomesteadView extends ItemView {
    private component?: ForestComponent
    private plugin: PomodoroTimerPlugin

    constructor(plugin: PomodoroTimerPlugin, leaf: WorkspaceLeaf) {
        super(leaf)
        this.plugin = plugin
        this.icon = 'tree-deciduous'
    }

    getViewType(): string {
        return VIEW_TYPE_HOMESTEAD
    }

    getDisplayText(): string {
        return 'Homestead Village'
    }

    getIcon(): string {
        return 'trees'
    }

    async onOpen() {
        this.contentEl.empty()
        this.contentEl.addClass('pomodoro-homestead-page-view')
        this.component = new ForestComponent({
            target: this.contentEl,
            props: { full: true },
        })
    }

    async onClose() {
        this.component?.$destroy()
    }
}
