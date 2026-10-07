import { writable, type Writable } from 'svelte/store'

export type CardPlace = { lane: number; index: number }

export type DragState = {
    key: string
    from: CardPlace
    /** Size of the card being dragged, for its placeholder. */
    height: number
}

/**
 * Drags cards between lanes with pointer events, so it works the same with a mouse, a pen
 * and a finger (where a drag starts with a short press, so the board can still be scrolled).
 *
 * The card follows the pointer as a floating copy; the lanes render a placeholder where it
 * would land. Positions are counted without the dragged card, which is what the board model
 * expects. Near the edges of the board or of a lane, the view scrolls.
 */
export class CardDragger {
    public readonly drag: Writable<DragState | null> = writable(null)
    public readonly target: Writable<CardPlace | null> = writable(null)
    /** True right after a drag, so the click that ends it does not open the card. */
    public justDragged = false

    private pending: {
        key: string
        from: CardPlace
        el: HTMLElement
        x: number
        y: number
        pointerId: number
        touch: boolean
        timer: number | null
    } | null = null
    private ghost: HTMLElement | null = null
    private offset = { x: 0, y: 0 }
    private pointer = { x: 0, y: 0 }
    private current: CardPlace | null = null
    private state: DragState | null = null
    private frame: number | null = null
    private doc: Document = document

    constructor(
        private board: () => HTMLElement | null,
        private onDrop: (from: CardPlace, to: CardPlace) => void,
    ) {}

    /** A drag is starting or under way: a long press's context menu must not open now. */
    public get busy(): boolean {
        return !!this.state || !!this.pending?.touch
    }

    public pointerDown(e: PointerEvent, key: string, from: CardPlace, el: HTMLElement): void {
        if (e.button !== 0) return
        // A drag whose release happened outside the window is over
        if (this.pending || this.state) this.cleanup()
        const t = e.target as HTMLElement
        if (t.closest('a, button, input, textarea, select, [contenteditable="true"], .no-drag')) return
        this.doc = el.ownerDocument
        const touch = e.pointerType === 'touch'
        this.pending = { key, from, el, x: e.clientX, y: e.clientY, pointerId: e.pointerId, touch, timer: null }
        if (touch) this.pending.timer = window.setTimeout(() => this.begin(), 280)
        const win = this.doc.defaultView ?? window
        win.addEventListener('pointermove', this.onMove, { passive: false })
        win.addEventListener('pointerup', this.onUp)
        win.addEventListener('pointercancel', this.onCancel)
        win.addEventListener('keydown', this.onKey)
        win.addEventListener('touchmove', this.onTouchMove, { passive: false })
    }

    private onMove = (e: PointerEvent) => {
        if (this.pending && e.pointerId !== this.pending.pointerId) return
        this.pointer = { x: e.clientX, y: e.clientY }
        if (this.pending && !this.state) {
            const dist = Math.hypot(e.clientX - this.pending.x, e.clientY - this.pending.y)
            if (this.pending.touch) {
                // Moving before the press is long enough is scrolling
                if (dist > 8) this.cleanup()
                return
            }
            if (dist < 5) return
            this.begin()
        }
        if (!this.state) return
        e.preventDefault()
        this.moveGhost()
        this.locate()
    }

    private onTouchMove = (e: TouchEvent) => {
        if (this.state) e.preventDefault()
    }

    private onUp = () => {
        const state = this.state
        const to = this.current
        this.cleanup()
        if (!state || !to) return
        this.justDragged = true
        window.setTimeout(() => (this.justDragged = false), 50)
        if (to.lane !== state.from.lane || to.index !== state.from.index) this.onDrop(state.from, to)
    }

    private onCancel = () => this.cleanup()

    private onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && this.state) {
            e.preventDefault()
            this.cleanup()
        }
    }

    private begin() {
        const p = this.pending
        if (!p || this.state) return
        if (p.timer !== null) window.clearTimeout(p.timer)
        p.timer = null
        const rect = p.el.getBoundingClientRect()
        this.offset = { x: p.x - rect.left, y: p.y - rect.top }
        if (!this.pointer.x && !this.pointer.y) this.pointer = { x: p.x, y: p.y }
        const ghost = p.el.cloneNode(true) as HTMLElement
        ghost.classList.add('pf-drag-ghost')
        Object.assign(ghost.style, {
            position: 'fixed',
            left: '0px',
            top: '0px',
            width: `${rect.width}px`,
            margin: '0',
            pointerEvents: 'none',
            zIndex: '1000',
        })
        this.board()?.appendChild(ghost)
        this.ghost = ghost
        this.state = { key: p.key, from: p.from, height: rect.height }
        this.current = p.from
        this.drag.set(this.state)
        this.target.set(p.from)
        this.doc.body.classList.add('pf-dragging')
        if (p.touch) navigator.vibrate?.(8)
        this.moveGhost()
        this.frame = window.requestAnimationFrame(this.autoScroll)
    }

    private moveGhost() {
        if (!this.ghost) return
        this.ghost.style.transform = `translate(${this.pointer.x - this.offset.x}px, ${this.pointer.y - this.offset.y}px) rotate(1.5deg)`
    }

    /** Finds the lane under the pointer and where in it the card would go. */
    private locate() {
        const el = this.doc.elementFromPoint(this.pointer.x, this.pointer.y) as HTMLElement | null
        const lane = el?.closest<HTMLElement>('[data-lane]')
        if (!lane) return
        const laneIndex = Number(lane.dataset.lane)
        if (Number.isNaN(laneIndex)) return
        let index = 0
        const cards = lane.querySelectorAll<HTMLElement>('[data-card]:not(.pf-dragged)')
        for (const card of Array.from(cards)) {
            const r = card.getBoundingClientRect()
            if (this.pointer.y > r.top + r.height / 2) index++
        }
        if (this.current?.lane === laneIndex && this.current.index === index) return
        this.current = { lane: laneIndex, index }
        this.target.set(this.current)
    }

    private autoScroll = () => {
        this.frame = null
        if (!this.state) return
        const board = this.board()?.querySelector<HTMLElement>('.pf-lanes')
        const edge = 56
        const speed = (d: number) => Math.ceil(((edge - d) / edge) * 14)
        let moved = false
        if (board) {
            const r = board.getBoundingClientRect()
            if (this.pointer.x < r.left + edge && board.scrollLeft > 0) {
                board.scrollLeft -= speed(this.pointer.x - r.left)
                moved = true
            } else if (this.pointer.x > r.right - edge && board.scrollLeft < board.scrollWidth - board.clientWidth) {
                board.scrollLeft += speed(r.right - this.pointer.x)
                moved = true
            }
        }
        const el = this.doc.elementFromPoint(this.pointer.x, this.pointer.y) as HTMLElement | null
        const body = el?.closest<HTMLElement>('.pf-lane-body')
        if (body) {
            const r = body.getBoundingClientRect()
            if (this.pointer.y < r.top + edge && body.scrollTop > 0) {
                body.scrollTop -= speed(this.pointer.y - r.top)
                moved = true
            } else if (this.pointer.y > r.bottom - edge && body.scrollTop < body.scrollHeight - body.clientHeight) {
                body.scrollTop += speed(r.bottom - this.pointer.y)
                moved = true
            }
        }
        if (moved) this.locate()
        this.frame = window.requestAnimationFrame(this.autoScroll)
    }

    private cleanup() {
        if (this.pending?.timer != null) window.clearTimeout(this.pending.timer)
        const win = this.doc.defaultView ?? window
        win.removeEventListener('pointermove', this.onMove)
        win.removeEventListener('pointerup', this.onUp)
        win.removeEventListener('pointercancel', this.onCancel)
        win.removeEventListener('keydown', this.onKey)
        win.removeEventListener('touchmove', this.onTouchMove)
        if (this.frame !== null) window.cancelAnimationFrame(this.frame)
        this.frame = null
        this.ghost?.remove()
        this.ghost = null
        this.pending = null
        this.state = null
        this.current = null
        this.pointer = { x: 0, y: 0 }
        this.drag.set(null)
        this.target.set(null)
        this.doc.body.classList.remove('pf-dragging')
    }

    public destroy(): void {
        this.cleanup()
    }
}
