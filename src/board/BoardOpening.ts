import { TFile, WorkspaceLeaf, type OpenViewState, type ViewState } from 'obsidian'
import type PomodoroTimerPlugin from '../main'
import { BOARD_FRONTMATTER_KEY } from './BoardModel'
import { KANBAN_PLUGIN_ID, kanbanPluginEnabled } from './cards'

export const VIEW_TYPE_BOARD = 'pomodoro-forest-board'
const KANBAN_VIEW_TYPE = 'kanban'

type LeafWithId = WorkspaceLeaf & { id?: string }

/**
 * Decides which view a board note opens in, and gets along with the Kanban plugin, which
 * opens board notes in its own view by wrapping `WorkspaceLeaf.setViewState`. This wrapper is
 * installed once the layout is ready, after every plugin has loaded, so it runs first:
 *
 * - opening a board note (as markdown, or as a Kanban board when this plugin is preferred)
 *   shows it as a Forest board instead, when the "Open Kanban boards in" setting says so;
 * - switching an open note to another view (markdown, Kanban, Forest) is always respected;
 * - with the setting on Automatic and the Kanban plugin enabled, nothing is redirected.
 */
export default class BoardOpening {
    /** Leaves whose next view change must not be redirected. */
    private bypass = new Set<string>()

    constructor(private plugin: PomodoroTimerPlugin) {}

    public install(): void {
        const proto = WorkspaceLeaf.prototype as unknown as { setViewState: (state: ViewState, ...rest: unknown[]) => Promise<void> }
        const original = proto.setViewState
        const redirect = (leaf: WorkspaceLeaf, state: ViewState) => this.redirect(leaf, state)
        let active = true
        const wrapper = function (this: WorkspaceLeaf, state: ViewState, ...rest: unknown[]) {
            return original.call(this, active ? redirect(this, state) : state, ...rest)
        }
        proto.setViewState = wrapper
        this.plugin.register(() => {
            // Another plugin may have wrapped ours since; then ours just steps aside
            if (proto.setViewState === wrapper) proto.setViewState = original
            else active = false
        })
    }

    /** Boards open here when the setting asks for it, or on Automatic without the Kanban plugin. */
    public opensHere(): boolean {
        const mode = this.plugin.getSettings().boardOpenMode ?? 'auto'
        if (mode === 'manual') return false
        if (mode === 'forest') return true
        return !kanbanPluginEnabled(this.plugin.app)
    }

    public isBoardPath(path: string): boolean {
        return !!this.plugin.app.metadataCache.getCache(path)?.frontmatter?.[BOARD_FRONTMATTER_KEY]
    }

    private redirect(leaf: WorkspaceLeaf, state: ViewState): ViewState {
        const file = state.state?.file
        if (typeof file !== 'string') return state
        const id = (leaf as LeafWithId).id ?? ''
        if (id && this.bypass.delete(id)) return state
        const preferred = this.plugin.getSettings().boardOpenMode === 'forest'
        if (state.type !== 'markdown' && !(state.type === KANBAN_VIEW_TYPE && preferred)) return state
        if (!this.opensHere()) return state
        // The note is already open in this leaf: showing it another way is the user's choice
        const current = (leaf.view as { file?: TFile | null } | undefined)?.file?.path
        if (current === file) return state
        if (!this.isBoardPath(file)) return state
        return { ...state, type: VIEW_TYPE_BOARD }
    }

    /** Tells the Kanban plugin to leave this leaf as markdown too, if it is installed. */
    private keepKanbanAway(leaf: WorkspaceLeaf, path: string) {
        const kanban = this.plugin.app.plugins?.plugins?.[KANBAN_PLUGIN_ID] as { kanbanFileModes?: Record<string, string> } | undefined
        const modes = kanban?.kanbanFileModes
        if (!modes || typeof modes !== 'object') return
        modes[(leaf as LeafWithId).id || path] = 'markdown'
    }

    /** Shows a note as markdown, whatever would normally open it. */
    public async openAsMarkdown(leaf: WorkspaceLeaf, file: TFile, eState?: OpenViewState['eState']): Promise<void> {
        const id = (leaf as LeafWithId).id
        if (id) this.bypass.add(id)
        this.keepKanbanAway(leaf, file.path)
        try {
            await leaf.openFile(file, { eState, active: true })
        } finally {
            if (id) this.bypass.delete(id)
        }
    }

    public async openAsBoard(leaf: WorkspaceLeaf, file: TFile): Promise<void> {
        await leaf.setViewState({ type: VIEW_TYPE_BOARD, state: { file: file.path }, active: true } as ViewState)
    }

    public async openInKanban(leaf: WorkspaceLeaf, file: TFile): Promise<void> {
        await leaf.setViewState({ type: KANBAN_VIEW_TYPE, state: { file: file.path }, active: true } as ViewState)
    }
}
