import type { Component } from 'obsidian'
import type { BoardCard } from './BoardModel'
import type { BoardView } from './BoardView'

/** The focused card's session, as its card shows it. */
export interface FocusInfo {
    running: boolean
    /** `12:34` */
    remaining: string
    /** Share of the session done, 0–1. */
    ratio: number
}

/** What every lane and card of a board shares. */
export interface BoardContext {
    view: BoardView
    render: (text: string, el: HTMLElement) => Component
    /** Days in an in-progress lane before a card is marked as stale; 0 for never. */
    staleDays: number
    filterTag: (tag: string) => void
    /** Opens a card's editor. */
    edit: (key: string) => void
    cardMenu: (card: BoardCard, e: MouseEvent) => void
    toggleTimer: () => void
}
