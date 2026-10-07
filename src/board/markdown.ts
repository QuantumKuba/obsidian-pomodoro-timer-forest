import type { Component } from 'obsidian'

type Params = { text: string; render: (text: string, el: HTMLElement) => Component }

/** Svelte action: renders markdown into the node, again only when the text changes. */
export function markdown(node: HTMLElement, params: Params) {
    let text = params.text
    let component = params.render(text, node)
    return {
        update(next: Params) {
            if (next.text === text) return
            text = next.text
            component.unload()
            node.replaceChildren()
            component = next.render(text, node)
        },
        destroy() {
            component.unload()
        },
    }
}
