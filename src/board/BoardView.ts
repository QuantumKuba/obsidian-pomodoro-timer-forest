import { Component, Keymap, MarkdownRenderer, Menu, Modal, Notice, Scope, Setting, TextFileView, TFile, WorkspaceLeaf } from 'obsidian'
import { get, writable } from 'svelte/store'
import type PomodoroTimerPlugin from '../main'
import type { BoardLaneRole } from '../types/forest'
import BoardApp from './BoardApp.svelte'
import * as Board from './BoardModel'
import type { BoardCard, BoardDoc, BoardLane } from './BoardModel'
import { VIEW_TYPE_BOARD } from './BoardOpening'
import { boardUsesKanbanDates, cardIndent, cardToTask, kanbanPluginEnabled, newBlockId, obsidianLanguage, withDue, withEstimate } from './cards'

/**
 * A Kanban board note, shown as lanes of cards. The note's text is the only state: every
 * change goes through the board model, which edits just the lines it has to, and is saved
 * right away so the Kanban plugin, the task panel and the rewards all see it at once.
 */
export class BoardView extends TextFileView {
    public readonly doc = writable<BoardDoc>(Board.parseBoard(''))
    public readonly note = writable<{ path: string; name: string }>({ path: '', name: '' })
    private component?: BoardApp
    private undoStack: string[] = []
    private redoStack: string[] = []
    private saveTimer: number | null = null

    constructor(
        leaf: WorkspaceLeaf,
        public readonly plugin: PomodoroTimerPlugin,
    ) {
        super(leaf)
        // Undo and redo while the board has focus (and not while typing in it)
        const scope = new Scope(this.app.scope)
        ;(this as unknown as { scope: Scope }).scope = scope
        const typing = () => {
            const el = document.activeElement
            return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable)
        }
        scope.register(['Mod'], 'z', () => {
            if (typing()) return true
            this.undo()
            return false
        })
        scope.register(['Mod', 'Shift'], 'z', () => {
            if (typing()) return true
            this.redo()
            return false
        })
    }

    getViewType(): string {
        return VIEW_TYPE_BOARD
    }

    getDisplayText(): string {
        return this.file?.basename ?? 'Board'
    }

    getIcon(): string {
        return 'kanban'
    }

    async onOpen(): Promise<void> {
        await this.plugin.ready
        this.contentEl.empty()
        this.contentEl.addClass('pf-board-view')
        this.component = new BoardApp({ target: this.contentEl, props: { view: this } })
        this.addAction('file-text', 'Open as markdown', () => void this.openAsMarkdown())
    }

    async onClose(): Promise<void> {
        await this.flush()
        this.component?.$destroy()
    }

    async onRename(file: TFile): Promise<void> {
        await super.onRename(file)
        this.note.set({ path: file.path, name: file.basename })
    }

    onPaneMenu(menu: Menu, source: string): void {
        menu.addItem((i) =>
            i
                .setTitle('Open as markdown')
                .setIcon('file-text')
                .setSection('pane')
                .onClick(() => void this.openAsMarkdown()),
        )
        if (kanbanPluginEnabled(this.app)) {
            menu.addItem((i) =>
                i
                    .setTitle('Open in the Kanban plugin')
                    .setIcon('square-kanban')
                    .setSection('pane')
                    .onClick(() => {
                        if (this.file) void this.plugin.boardOpening?.openInKanban(this.leaf, this.file)
                    }),
            )
        }
        menu.addItem((i) =>
            i
                .setTitle('Archive finished cards')
                .setIcon('archive')
                .setSection('pane')
                .onClick(() => this.archiveFinished()),
        )
        super.onPaneMenu(menu, source)
    }

    getViewData(): string {
        return this.data
    }

    setViewData(data: string, clear: boolean): void {
        if (!clear && data === this.data) return
        // A new note, or a change made outside this view: undo must not write over it
        this.undoStack = []
        this.redoStack = []
        this.data = data
        const doc = Board.parseBoard(data)
        if (this.file) this.note.set({ path: this.file.path, name: this.file.basename })
        // The frontmatter key was removed in another view: this is a note again
        if (!doc.isBoard && data.trim()) {
            window.setTimeout(() => void this.openAsMarkdown(), 0)
            return
        }
        this.doc.set(doc)
        if (this.file && doc.isBoard) this.plugin.boardWatcher?.observe(this.file, data)
    }

    clear(): void {
        this.doc.set(Board.parseBoard(''))
    }

    // -----------------------------------------------------------------------
    // Editing
    // -----------------------------------------------------------------------

    private get editOptions(): Board.EditOptions {
        return { indent: cardIndent(this.app), language: obsidianLanguage() }
    }

    /** Applies a change to the note. Returns false when nothing changed. */
    public edit(change: (doc: BoardDoc) => string): boolean {
        const before = this.data
        const next = change(get(this.doc))
        if (next === before) return false
        this.undoStack.push(before)
        if (this.undoStack.length > 100) this.undoStack.shift()
        this.redoStack = []
        this.apply(next)
        return true
    }

    private apply(text: string) {
        this.data = text
        this.doc.set(Board.parseBoard(text))
        if (this.saveTimer !== null) window.clearTimeout(this.saveTimer)
        this.saveTimer = window.setTimeout(() => {
            this.saveTimer = null
            void this.save()
        }, 120)
    }

    /** Writes a pending change now. */
    public async flush(): Promise<void> {
        if (this.saveTimer === null) return
        window.clearTimeout(this.saveTimer)
        this.saveTimer = null
        await this.save()
    }

    public undo(): void {
        const prev = this.undoStack.pop()
        if (prev === undefined) return
        this.redoStack.push(this.data)
        this.apply(prev)
    }

    public redo(): void {
        const next = this.redoStack.pop()
        if (next === undefined) return
        this.undoStack.push(this.data)
        this.apply(next)
    }

    /** The board as it is now. */
    public getDoc(): BoardDoc {
        return get(this.doc)
    }

    private card(key: string): BoardCard | undefined {
        const doc = get(this.doc)
        for (const lane of doc.lanes) for (const card of lane.cards) if (card.key === key) return card
        return doc.archive?.cards.find((c) => c.key === key)
    }

    /** Runs a change on the current version of a card, found again by its key. */
    private onCard(key: string, change: (doc: BoardDoc, card: BoardCard) => string): boolean {
        return this.edit((doc) => {
            const card = [...doc.lanes.flatMap((l) => l.cards), ...(doc.archive?.cards ?? [])].find((c) => c.key === key)
            return card ? change(doc, card) : doc.lines.join(doc.eol)
        })
    }

    public roles(): Record<string, BoardLaneRole> | undefined {
        const path = this.file?.path
        return path ? this.plugin.storageManager.getGamification().boards?.[path]?.laneRoles : undefined
    }

    public roleOf(lane: BoardLane): BoardLaneRole {
        return Board.laneRole(lane, this.roles())
    }

    public moveCard(from: { lane: number; index: number }, to: { lane: number; index: number }): void {
        this.edit((doc) => Board.moveCard(doc, from, to))
    }

    public addCard(lane: number, text: string, position: 'top' | 'bottom' = 'bottom'): void {
        this.edit((doc) => Board.addCard(doc, lane, text, { ...this.editOptions, position }))
    }

    public updateCard(key: string, text: string): void {
        this.onCard(key, (doc, card) => Board.updateCardText(doc, card, text, this.editOptions))
    }

    public deleteCard(key: string): void {
        this.onCard(key, (doc, card) => Board.deleteCard(doc, card))
    }

    public archiveCard(key: string): void {
        this.onCard(key, (doc, card) => Board.archiveCards(doc, [card], this.editOptions))
    }

    public restoreCard(key: string): void {
        const doc = get(this.doc)
        const index = doc.archive?.cards.findIndex((c) => c.key === key) ?? -1
        if (index < 0 || doc.lanes.length === 0) return
        const target = doc.lanes.findIndex((l) => this.roleOf(l) !== 'done')
        this.moveCard({ lane: -1, index }, { lane: Math.max(0, target), index: 0 })
    }

    /** Every finished card on the board goes to the archive. */
    public archiveFinished(): void {
        const doc = get(this.doc)
        const done = doc.lanes.flatMap((l) => l.cards.filter((c) => Board.cardDone(c, this.roleOf(l))))
        if (done.length === 0) {
            new Notice('No finished cards to archive.')
            return
        }
        this.edit((d) => {
            const keys = new Set(done.map((c) => c.key))
            return Board.archiveCards(d, d.lanes.flatMap((l) => l.cards.filter((c) => keys.has(c.key))), this.editOptions)
        })
        new Notice(`Archived ${done.length} finished card${done.length === 1 ? '' : 's'}.`)
    }

    /**
     * Finishes a card or opens it again. Finishing ticks it off and, with the setting on, moves
     * it to the top of the first done lane. A card that is done because of its lane is reopened
     * by moving it back to the first lane that is not a done lane.
     */
    public toggleCard(key: string): void {
        const doc = get(this.doc)
        const card = this.card(key)
        if (!card || card.lane < 0) return
        const role = this.roleOf(doc.lanes[card.lane])
        const firstOpen = () => {
            const active = doc.lanes.findIndex((l) => this.roleOf(l) === 'active')
            return active >= 0 ? active : doc.lanes.findIndex((l) => this.roleOf(l) !== 'done')
        }
        if (Board.cardDone(card, role)) {
            this.edit((d) => {
                let text = card.checked ? Board.setCardChecked(d, card, false) : d.lines.join(d.eol)
                if (role === 'done') {
                    const to = firstOpen()
                    if (to >= 0) text = Board.moveCard(Board.parseBoard(text), { lane: card.lane, index: card.index }, { lane: to, index: 0 })
                }
                return text
            })
            return
        }
        const doneLane = doc.lanes.findIndex((l) => this.roleOf(l) === 'done')
        this.edit((d) => {
            const text = Board.setCardChecked(d, card, true)
            if (!this.plugin.getSettings().boardMoveChecked || doneLane < 0 || doneLane === card.lane) return text
            return Board.moveCard(Board.parseBoard(text), { lane: card.lane, index: card.index }, { lane: doneLane, index: 0 })
        })
    }

    public toggleSubtask(key: string, n: number): void {
        this.onCard(key, (doc, card) => Board.toggleSubtask(doc, card, n))
    }

    public setEstimate(key: string, expected: number): void {
        const format = this.plugin.getSettings().taskFormat
        this.onCard(key, (doc, card) => Board.replaceCardLine(doc, card, withEstimate(doc.lines[card.start], Math.max(0, expected), format)))
    }

    public setDue(key: string, iso: string | null): void {
        const format = this.plugin.getSettings().taskFormat
        this.onCard(key, (doc, card) =>
            Board.replaceCardLine(
                doc,
                card,
                withDue(doc.lines[card.start], iso, {
                    format,
                    kanbanDates: boardUsesKanbanDates(doc) || kanbanPluginEnabled(this.app),
                    settings: doc.settings?.data,
                }),
            ),
        )
    }

    /**
     * Makes the card the timer's task, and starts a focus session unless one is running. The
     * card gets a block id first (the Kanban plugin keeps those), so its pomodoros can be
     * counted wherever it moves.
     */
    public async focusCard(key: string, start: boolean): Promise<void> {
        const file = this.file
        const tracker = this.plugin.tracker
        if (!file || !tracker) return
        let card = this.card(key)
        if (!card || card.lane < 0) return
        if (!card.blockId) {
            const id = newBlockId(get(this.doc))
            this.onCard(key, (doc, c) => Board.setCardBlockId(doc, c, id))
            card = this.card(`^${id}`)
            if (!card) return
        }
        await this.flush()
        await tracker.active(cardToTask(file, get(this.doc), card, this.plugin.getSettings().taskFormat))
        const timer = this.plugin.timer
        if (!start || !timer) return
        const t = get(timer)
        if (t.running) return
        if (!t.inSession && t.mode === 'BREAK') timer.toggleMode()
        timer.start()
    }

    // -----------------------------------------------------------------------
    // Lanes
    // -----------------------------------------------------------------------

    public addLane(title: string): void {
        if (!title.trim()) return
        this.edit((doc) => Board.addLane(doc, title.trim(), this.editOptions))
    }

    public renameLane(index: number, title: string): void {
        this.edit((doc) => {
            const lane = doc.lanes[index]
            if (!lane || !title.trim() || title.trim() === lane.title) return doc.lines.join(doc.eol)
            return Board.renameLane(doc, lane, title.trim())
        })
    }

    public setLaneLimit(index: number, maxItems: number): void {
        this.edit((doc) => {
            const lane = doc.lanes[index]
            return lane ? Board.renameLane(doc, lane, lane.title, Math.max(0, Math.floor(maxItems))) : doc.lines.join(doc.eol)
        })
    }

    /**
     * Sets what a lane is for. A done lane gets the Complete marker, so the Kanban plugin ticks
     * off its cards too; other roles are remembered for this board when the title says otherwise.
     */
    public setLaneRole(index: number, role: BoardLaneRole): void {
        const file = this.file
        const lane = get(this.doc).lanes[index]
        if (!file || !lane) return
        if (lane.complete !== (role === 'done')) this.edit((doc) => Board.setLaneComplete(doc, doc.lanes[index], role === 'done', this.editOptions))
        const fromTitle = Board.laneRole({ title: lane.title, complete: false })
        this.plugin.forestEngine.setLaneRole(file.path, file.basename, lane.title, role === 'done' || role === fromTitle ? null : role)
    }

    public deleteLane(index: number): void {
        const lane = get(this.doc).lanes[index]
        if (!lane) return
        const go = () => this.edit((doc) => Board.deleteLane(doc, doc.lanes[index]))
        if (lane.cards.length === 0) {
            go()
            return
        }
        new ConfirmModal(
            this.app,
            `Delete “${lane.title}”?`,
            `Its ${lane.cards.length} card${lane.cards.length === 1 ? '' : 's'} will be deleted with it. You can undo this with ${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Z while the board is open.`,
            'Delete lane',
            go,
        ).open()
    }

    public moveLane(from: number, to: number): void {
        this.edit((doc) => Board.moveLane(doc, from, to))
    }

    public askLaneLimit(index: number): void {
        const lane = get(this.doc).lanes[index]
        if (!lane) return
        new PromptModal(
            this.app,
            `Card limit for “${lane.title}”`,
            'Keeping work in progress small is how cards get finished. 0 removes the limit.',
            String(lane.maxItems || ''),
            (value) => this.setLaneLimit(index, parseInt(value) || 0),
        ).open()
    }

    public toggleCollapsed(index: number): void {
        this.edit((doc) => {
            const current = Array.isArray(doc.settings?.data['list-collapse']) ? (doc.settings!.data['list-collapse'] as boolean[]) : []
            const next = doc.lanes.map((_, i) => !!current[i])
            next[index] = !next[index]
            return Board.setBoardSetting(doc, 'list-collapse', next)
        })
    }

    /** Turns an empty note into a board with three lanes. */
    public setUp(): void {
        this.edit(() => Board.newBoardText(DEFAULT_LANES, obsidianLanguage()))
    }

    // -----------------------------------------------------------------------
    // Opening things
    // -----------------------------------------------------------------------

    public async openAsMarkdown(): Promise<void> {
        await this.flush()
        if (this.file) await this.plugin.boardOpening?.openAsMarkdown(this.leaf, this.file)
    }

    /** Opens the card's line in the note, in a new tab when a modifier key is held. */
    public async openCardInNote(key: string, evt?: MouseEvent): Promise<void> {
        const card = this.card(key)
        if (!card || !this.file) return
        await this.flush()
        const leaf = this.app.workspace.getLeaf(evt && Keymap.isModEvent(evt) ? 'tab' : 'split')
        await this.plugin.boardOpening?.openAsMarkdown(leaf, this.file, { line: card.start })
    }

    public openLink(linktext: string, evt: MouseEvent): void {
        void this.app.workspace.openLinkText(linktext, this.file?.path ?? '', Keymap.isModEvent(evt))
    }

    public hoverLink(linktext: string, evt: MouseEvent, targetEl: HTMLElement): void {
        this.app.workspace.trigger('hover-link', {
            event: evt,
            source: VIEW_TYPE_BOARD,
            hoverParent: this,
            targetEl,
            linktext,
            sourcePath: this.file?.path ?? '',
        })
    }

    /** Renders a card's markdown; the returned component is unloaded when the card goes away. */
    public renderMarkdown(text: string, el: HTMLElement): Component {
        const component = new Component()
        component.load()
        void MarkdownRenderer.render(this.app, text, el, this.file?.path ?? '', component)
        return component
    }
}

const DEFAULT_LANES = [{ title: 'To do' }, { title: 'Doing', maxItems: 3 }, { title: 'Done', complete: true }]

export class ConfirmModal extends Modal {
    constructor(
        app: BoardView['app'],
        private heading: string,
        private message: string,
        private cta: string,
        private onConfirm: () => void,
    ) {
        super(app)
    }

    onOpen(): void {
        this.titleEl.setText(this.heading)
        this.contentEl.createEl('p', { text: this.message })
        new Setting(this.contentEl)
            .addButton((b) => b.setButtonText('Cancel').onClick(() => this.close()))
            .addButton((b) =>
                b
                    .setButtonText(this.cta)
                    .setWarning()
                    .onClick(() => {
                        this.close()
                        this.onConfirm()
                    }),
            )
    }

    onClose(): void {
        this.contentEl.empty()
    }
}

export class PromptModal extends Modal {
    constructor(
        app: BoardView['app'],
        private heading: string,
        private message: string,
        private value: string,
        private onSubmit: (value: string) => void,
    ) {
        super(app)
    }

    onOpen(): void {
        this.titleEl.setText(this.heading)
        this.contentEl.createEl('p', { text: this.message, cls: 'setting-item-description' })
        const submit = () => {
            this.close()
            this.onSubmit(this.value)
        }
        new Setting(this.contentEl).addText((t) => {
            t.setValue(this.value).onChange((v) => (this.value = v))
            t.inputEl.type = 'number'
            t.inputEl.min = '0'
            t.inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault()
                    submit()
                }
            })
            window.setTimeout(() => t.inputEl.select(), 0)
        })
        new Setting(this.contentEl)
            .addButton((b) => b.setButtonText('Cancel').onClick(() => this.close()))
            .addButton((b) => b.setButtonText('Save').setCta().onClick(submit))
    }

    onClose(): void {
        this.contentEl.empty()
    }
}
