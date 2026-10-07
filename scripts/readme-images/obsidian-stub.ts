/**
 * Minimal stand-in for the `obsidian` module so the plugin's real Svelte
 * components and renderer can be bundled and screenshotted in a plain browser.
 * Only what the imported code touches at load/render time is implemented.
 */
export class Notice { constructor(_msg?: unknown) {} }
export class TFile {}
export class TFolder {}
export class Vault {}
export class Menu {
    addItem() { return this }
    showAtMouseEvent() {}
}
export class Plugin {}
export class ItemView {}
export class PluginSettingTab { constructor(..._a: unknown[]) {} }
export class Setting {}
export class DropdownComponent {}
export class WorkspaceLeaf {}
export class Modal {
    constructor(public app: unknown) {}
    open() {}
    close() {}
}
export class Scope {
    constructor(_parent?: unknown) {}
    register() {}
}
export class Component {
    load() {}
    unload() {}
}
/** Enough of TextFileView for the board view to run on sample data. */
export class TextFileView {
    data = ''
    app: any
    file: any = null
    contentEl: any
    constructor(public leaf: any) {
        this.app = leaf?.app
    }
    async save() {}
    requestSave() {}
    addAction() {}
}
export const Keymap = { isModEvent: () => false }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const inline = (s: string) =>
    esc(s)
        .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '<a class="internal-link" data-href="$1">$2</a>')
        .replace(/\[\[([^\]]+)\]\]/g, '<a class="internal-link" data-href="$1">$1</a>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/(^|\s)#([\w/-]+)/g, '$1<a class="tag" href="#$2">#$2</a>')

/** A small markdown renderer producing the markup Obsidian does for links, tags and checklists. */
export const MarkdownRenderer = {
    render: async (_app: unknown, md: string, el: HTMLElement) => {
        const out: string[] = []
        let list: string[] | null = null
        for (const line of md.split('\n')) {
            const task = line.match(/^\s*[-*] \[(.)\] (.*)$/)
            const item = line.match(/^\s*[-*] (.*)$/)
            if (task || item) {
                list ??= []
                list.push(
                    task
                        ? `<li class="task-list-item${task[1] !== ' ' ? ' is-checked' : ''}"><input type="checkbox" class="task-list-item-checkbox"${task[1] !== ' ' ? ' checked' : ''}>${inline(task[2])}</li>`
                        : `<li>${inline(item![1])}</li>`,
                )
                continue
            }
            if (list) {
                out.push(`<ul class="contains-task-list">${list.join('')}</ul>`)
                list = null
            }
            if (line.trim()) out.push(`<p>${inline(line)}</p>`)
        }
        if (list) out.push(`<ul class="contains-task-list">${list.join('')}</ul>`)
        el.innerHTML = out.join('')
    },
}
export const moment: any = () => ({ format: () => '', isValid: () => false })
export const normalizePath = (p: string) => p
export const getAllTags = () => []
export type App = any
