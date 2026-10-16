import { FuzzySuggestModal, type App, type FuzzyMatch, type TFile } from 'obsidian'

export type BoardChoice = { file: TFile } | { create: true }

/** Lists the vault's boards, most recently changed first, with "Create a new board" at the end. */
export class BoardPicker extends FuzzySuggestModal<BoardChoice> {
    constructor(
        app: App,
        private boards: TFile[],
        private onPick: (choice: BoardChoice) => void,
    ) {
        super(app)
        this.setPlaceholder(boards.length ? 'Open a board…' : 'No boards yet')
        this.setInstructions([
            { command: '↑↓', purpose: 'to navigate' },
            { command: '↵', purpose: 'to open' },
            { command: 'esc', purpose: 'to dismiss' },
        ])
    }

    getItems(): BoardChoice[] {
        return [...this.boards.map((file) => ({ file })), { create: true as const }]
    }

    getItemText(choice: BoardChoice): string {
        return 'file' in choice ? `${choice.file.basename} ${choice.file.parent?.path ?? ''}` : 'Create a new board'
    }

    renderSuggestion(match: FuzzyMatch<BoardChoice>, el: HTMLElement): void {
        const choice = match.item
        el.addClass('mod-complex')
        const content = el.createDiv({ cls: 'suggestion-content' })
        if ('file' in choice) {
            content.createDiv({ cls: 'suggestion-title', text: choice.file.basename })
            const folder = choice.file.parent?.path
            if (folder && folder !== '/') content.createDiv({ cls: 'suggestion-note', text: folder })
        } else {
            content.createDiv({ cls: 'suggestion-title', text: 'Create a new board' })
            content.createDiv({ cls: 'suggestion-note', text: 'To do, Doing and Done, as a note the Kanban plugin can open too' })
        }
    }

    onChooseItem(choice: BoardChoice): void {
        this.onPick(choice)
    }
}
