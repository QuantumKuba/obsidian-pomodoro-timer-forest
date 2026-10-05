/**
 * The village's inhabitants: villagers who stroll between the things you built
 * and hens that potter around their coop.
 *
 * renderVillage() draws a scene without them (`liveActors`), and this class adds
 * them to its SVG and moves them every frame. They walk tile to tile around
 * anything solid, keep to paths and bridges where they can, and are re-slotted
 * between the scene's objects as they go, so a villager behind a tree is hidden
 * by it. Their state lives here, not in the markup: when the scene is rendered
 * again they carry on from where they were.
 */
import type { GamificationData, PlacedHomesteadItem } from '../types/forest'
import { getBuilding, getCrop, isRipePlot } from '../assets/floraCatalog'
import { dateKey } from '../services/Progression'
import { actorSprite, findCoop, henCount, henRange, sceneLayout, skyFor, villagerCount, type Layout } from './VillageScene'
import { buildGrid, findPath, isWalkable, mainArea, nearestWalkable, neighbours, reachableFrom, type Tile, type VillageGrid } from './villageGrid'

const SVG_NS = 'http://www.w3.org/2000/svg'
/** Seconds one hop takes. */
const HOP = 0.42

type ActorKind = 'villager' | 'hen'

interface Actor {
    id: string
    kind: ActorKind
    variant: number
    /** Position in tile coordinates; whole numbers are tile centres. */
    x: number
    y: number
    /** Tiles still to walk through, next first. */
    route: Tile[]
    /** Seconds left to stand around before setting off again. */
    wait: number
    speed: number
    face: 1 | -1
    hop: number
    stride: number
    walking: boolean
    /** Hens stay near their coop. */
    home?: Tile
    /** What the actor is heading for, to remark on when it gets there. */
    visiting?: PlacedHomesteadItem
    el: SVGGElement | null
    body: SVGGElement | null
    /** The scene object this actor is currently drawn just behind. */
    before: Element | null | undefined
    speech: { el: HTMLElement; left: number } | null
}

const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)]
const same = (a: Tile, b: Tile) => a.x === b.x && a.y === b.y

/** Things worth walking up to, and what a villager might say there. */
const REMARKS: Record<string, string[]> = {
    campfire: ['Cosy.', 'Nothing beats a fire.'],
    stone_well: ['Fresh water!'],
    bench: ['A good spot for a break.'],
    gazebo: ['Tea time soon?'],
    chicken_coop: ['Hello, ladies.'],
    scarecrow: ['He does good work.'],
    greenhouse: ['It smells wonderful in there.'],
    cabin: ['Home sweet home.'],
}

export default class VillageLife {
    private frame: HTMLElement | null = null
    private layer: HTMLElement | null = null
    private svg: SVGSVGElement | null = null
    private objects: SVGGElement | null = null
    /** The scene's objects in drawing order, to slot actors between. */
    private slots: { el: Element; depth: number }[] = []
    private grid: VillageGrid = { size: 0, kinds: [] }
    private L: Layout = sceneLayout(5)
    private g: GamificationData | null = null
    private dailyGoal = 4
    private actors: Actor[] = []
    private sprites = new Map<string, Element>()
    private raf = 0
    private last = 0
    private observer: IntersectionObserver | null = null
    private onScreen = true

    /**
     * Call after every render of the scene. `frame` holds the scene's SVG and `layer` is an
     * empty element laid over it for speech bubbles. Cheap when nothing changed.
     */
    public sync(frame: HTMLElement, layer: HTMLElement, g: GamificationData, dailyGoal: number): void {
        const svg = frame.querySelector<SVGSVGElement>('svg.pf-scene')
        const objects = svg?.querySelector<SVGGElement>('.pf-objects') ?? null
        if (!svg || !objects) return
        this.layer = layer
        this.dailyGoal = dailyGoal
        if (frame !== this.frame) this.watch(frame)
        if (svg === this.svg && g === this.g) return

        this.svg = svg
        this.objects = objects
        this.g = g
        this.L = sceneLayout(g.landSize)
        this.grid = buildGrid(g.homestead, g.landSize)
        this.slots = Array.from(objects.children)
            .filter((el) => !el.classList.contains('pf-actor'))
            .map((el) => ({ el, depth: Number(el.getAttribute('data-depth')) || 0 }))
        this.cast()
        for (const actor of this.actors) this.mount(actor)
        if (this.actors.length) this.start()
        else this.stop()
    }

    /** Take everyone off the scene, e.g. when animations are switched off. */
    public clear(): void {
        this.stop()
        for (const actor of this.actors) this.unmount(actor)
        this.actors = []
        this.svg = null
        this.g = null
    }

    public destroy(): void {
        this.clear()
        this.observer?.disconnect()
        this.observer = null
        this.frame = null
        this.layer = null
    }

    /** A villager or hen was clicked: it stops, hops and says something. */
    public poke(id: string): void {
        const actor = this.actors.find((a) => a.id === id)
        if (!actor) return
        actor.route = []
        actor.wait = 0.8
        actor.hop = HOP
        this.speak(actor, actor.kind === 'hen' ? pick(['Bawk!', 'Cluck cluck.', 'Bawk bawk!']) : this.greeting())
    }

    /** Everyone hops for joy; one villager may say why. */
    public cheer(words?: string): void {
        const villagers = this.actors.filter((a) => a.kind === 'villager')
        this.actors.forEach((actor, i) => {
            actor.hop = HOP * 2 + (i % 3) * 0.08
        })
        if (words && villagers.length) this.speak(pick(villagers), words)
    }

    /** A small "+3" floating up from a tile, for a harvest. */
    public pop(tile: Tile, text: string): void {
        if (!this.layer || !this.frame) return
        const { cx, cy } = this.L.tile(tile.x, tile.y)
        const scale = this.frame.clientWidth / this.L.width
        // The view may live in a popout window, so elements come from its own document
        const doc = this.layer.ownerDocument
        const el = doc.createElement('div')
        el.className = 'pf-pop'
        el.textContent = text
        el.appendChild(Object.assign(doc.createElement('span'), { className: 'pf-pop-coin' }))
        el.style.left = `${cx * scale}px`
        el.style.top = `${(cy - 12) * scale}px`
        this.layer.appendChild(el)
        this.win.setTimeout(() => el.remove(), 1500)
    }

    // -----------------------------------------------------------------------
    // Cast: who is in the village
    // -----------------------------------------------------------------------

    /** Match the actors to the current village: add newcomers, drop extras, move anyone built over. */
    private cast(): void {
        const g = this.g
        if (!g) return
        const area = mainArea(this.grid)
        const coop = findCoop(g)
        const home = coop ? { x: coop.gridX, y: coop.gridY } : undefined
        const coopYard = home ? henRange(area, home) : []
        const wanted: Record<ActorKind, number> = {
            villager: Math.min(villagerCount(g), Math.floor(area.length / 2)),
            hen: coopYard.length ? henCount(g) : 0,
        }

        this.actors = this.actors.filter((actor) => {
            if (actor.variant < wanted[actor.kind]) return true
            this.unmount(actor)
            return false
        })
        for (const kind of ['villager', 'hen'] as ActorKind[]) {
            for (let n = 0; n < wanted[kind]; n++) {
                if (this.actors.some((a) => a.kind === kind && a.variant === n)) continue
                const pool = (kind === 'hen' ? coopYard : area).filter((t) => !this.actors.some((a) => same(a, t)))
                const tile = pool.length ? pick(pool) : pick(area)
                this.actors.push({
                    id: `${kind}${n}`, kind, variant: n, x: tile.x, y: tile.y, route: [],
                    wait: Math.random() * 3, speed: kind === 'hen' ? 0.55 : 0.42 + Math.random() * 0.1,
                    face: Math.random() < 0.5 ? 1 : -1, hop: 0, stride: 0, walking: false,
                    el: null, body: null, before: undefined, speech: null,
                })
            }
        }

        for (const actor of this.actors) {
            if (actor.kind === 'hen') actor.home = home
            const here = { x: Math.round(actor.x), y: Math.round(actor.y) }
            // The village changed, so any route may now lead through something solid
            actor.route = []
            actor.visiting = undefined
            if (isWalkable(this.grid, here.x, here.y)) continue
            // Something was just built where this actor stood: hop out of the way
            const free = nearestWalkable(this.grid, here)
            if (free) {
                actor.x = free.x
                actor.y = free.y
                actor.hop = HOP
            }
        }
    }

    private sprite(kind: ActorKind, variant: number): Element | null {
        const key = `${kind}${variant}`
        if (!this.sprites.has(key)) {
            const parsed = new DOMParser().parseFromString(actorSprite(kind, variant), 'image/svg+xml').documentElement
            if (parsed.nodeName !== 'svg') return null
            this.sprites.set(key, this.win.document.importNode(parsed, true))
        }
        return this.sprites.get(key)?.cloneNode(true) as Element
    }

    /** Give an actor fresh elements in the current scene. */
    private mount(actor: Actor): void {
        actor.el?.remove()
        if (!this.objects) return
        const doc = this.objects.ownerDocument
        const el = doc.createElementNS(SVG_NS, 'g')
        el.setAttribute('class', `pf-actor pf-${actor.kind}`)
        el.setAttribute('data-actor', actor.id)
        const body = doc.createElementNS(SVG_NS, 'g')
        body.setAttribute('class', 'pf-actor-body')
        const sprite = this.sprite(actor.kind, actor.variant)
        if (sprite) body.appendChild(sprite)
        el.appendChild(body)
        actor.el = el
        actor.body = body
        actor.before = undefined
        actor.walking = false
        this.place(actor)
    }

    private unmount(actor: Actor): void {
        actor.el?.remove()
        actor.el = null
        actor.body = null
        this.hush(actor)
    }

    // -----------------------------------------------------------------------
    // Frame loop
    // -----------------------------------------------------------------------

    private watch(frame: HTMLElement): void {
        this.frame = frame
        this.observer?.disconnect()
        if (typeof IntersectionObserver === 'undefined') return
        // No point walking anyone around a village nobody is looking at
        this.observer = new IntersectionObserver((entries) => {
            this.onScreen = entries.some((e) => e.isIntersecting)
            if (this.onScreen) this.start()
            else this.stop()
        })
        this.observer.observe(frame)
    }

    /** The window the scene is shown in: frames must come from it to run while it is visible. */
    private get win(): Window {
        return this.frame?.ownerDocument.defaultView ?? window
    }

    private start(): void {
        if (this.raf || !this.onScreen || !this.actors.length) return
        this.last = performance.now()
        this.raf = this.win.requestAnimationFrame(this.tick)
    }

    private stop(): void {
        if (this.raf) this.win.cancelAnimationFrame(this.raf)
        this.raf = 0
    }

    private tick = (now: number): void => {
        this.raf = this.win.requestAnimationFrame(this.tick)
        // A long gap means the window was in the background; don't leap ahead
        const dt = Math.max(0, Math.min(0.1, (now - this.last) / 1000))
        this.last = now
        if (!this.svg?.isConnected) return
        for (const actor of this.actors) {
            this.step(actor, dt)
            this.place(actor)
        }
        this.placeSpeech()
    }

    private step(actor: Actor, dt: number): void {
        if (actor.speech) {
            actor.speech.left -= dt
            if (actor.speech.left <= 0) this.hush(actor)
        }
        if (actor.hop > 0) {
            actor.hop = Math.max(0, actor.hop - dt)
            return
        }
        if (actor.speech) return // stands still while talking

        if (!actor.route.length) {
            actor.wait -= dt
            if (actor.wait > 0) return
            this.chooseRoute(actor)
            if (!actor.route.length) {
                actor.wait = 2 + Math.random() * 3
                return
            }
        }

        const target = actor.route[0]
        const dx = target.x - actor.x
        const dy = target.y - actor.y
        const distance = Math.hypot(dx, dy)
        const reach = actor.speed * dt
        if (distance <= reach) {
            actor.x = target.x
            actor.y = target.y
            actor.route.shift()
            if (!actor.route.length) this.arrive(actor)
        } else {
            actor.x += (dx / distance) * reach
            actor.y += (dy / distance) * reach
        }
        // On screen, x runs down-right and y down-left
        if (Math.abs(dx - dy) > 0.01) actor.face = dx - dy > 0 ? 1 : -1
        actor.stride += dt * (actor.kind === 'hen' ? 16 : 11)
    }

    private arrive(actor: Actor): void {
        actor.wait = actor.kind === 'hen' ? 1 + Math.random() * 4 : 3 + Math.random() * 5
        const place = actor.visiting
        actor.visiting = undefined
        if (!place || Math.random() > 0.3 || this.actors.some((a) => a.speech)) return
        const words = place.itemId === 'garden_plot'
            ? [isRipePlot(place) ? `The ${getCrop(place.cropId).name.toLowerCase()} are ready to pick!` : 'Coming along nicely.']
            : REMARKS[place.itemId]
        if (words) this.speak(actor, pick(words), 2.6)
    }

    /** Move the actor's elements to where it stands, and slot it between the scene's objects. */
    private place(actor: Actor): void {
        const { el, body } = actor
        if (!el || !body || !this.objects) return
        const { cx, cy } = this.L.tile(actor.x, actor.y)
        el.setAttribute('transform', `translate(${cx.toFixed(1)} ${cy.toFixed(1)})`)

        const walking = actor.route.length > 0 && actor.hop <= 0 && !actor.speech
        const lift = actor.hop > 0 ? Math.abs(Math.sin((actor.hop / HOP) * Math.PI)) * 4 : walking ? Math.abs(Math.sin(actor.stride)) * 0.7 : 0
        body.setAttribute('transform', `translate(0 ${(-lift).toFixed(2)}) scale(${actor.face} 1)`)
        if (walking !== actor.walking) {
            actor.walking = walking
            el.classList.toggle('pf-walking', walking)
        }

        const depth = actor.x + actor.y + 0.01
        const before = this.slots.find((slot) => slot.depth > depth)?.el ?? null
        if (before !== actor.before || el.parentNode !== this.objects) {
            this.objects.insertBefore(el, before)
            actor.before = before
        }
    }

    // -----------------------------------------------------------------------
    // Where to go
    // -----------------------------------------------------------------------

    private chooseRoute(actor: Actor): void {
        const g = this.g
        if (!g) return
        const here = { x: Math.round(actor.x), y: Math.round(actor.y) }
        let options = reachableFrom(this.grid, here).filter((t) => !same(t, here))
        if (actor.kind === 'hen' && actor.home) options = henRange(options, actor.home)
        // Don't crowd a tile someone else is standing on or heading for
        const taken = this.actors.filter((a) => a !== actor).map((a) => a.route[a.route.length - 1] || { x: Math.round(a.x), y: Math.round(a.y) })
        options = options.filter((t) => !taken.some((other) => same(other, t)))
        if (!options.length) return

        let goal: Tile | undefined
        if (actor.kind === 'villager') {
            const place = this.somewhereToVisit(g)
            const spots = place ? neighbours(this.grid, { x: place.gridX, y: place.gridY }).filter((t) => options.some((o) => same(o, t))) : []
            if (place && spots.length) {
                goal = pick(spots)
                actor.visiting = place
            }
        }
        // Otherwise a stroll, with a liking for paths and bridges
        if (!goal) {
            const paved = options.filter((t) => this.grid.kinds[t.y * this.grid.size + t.x] !== 'grass')
            goal = paved.length && Math.random() < 0.5 ? pick(paved) : pick(options)
        }
        const route = findPath(this.grid, here, goal) || []
        actor.route = actor.kind === 'hen' ? route.slice(0, 3) : route
    }

    /** A placed building to walk up to: the fire after dark, ripe crops, or anything homely. */
    private somewhereToVisit(g: GamificationData): PlacedHomesteadItem | undefined {
        const placed = g.homestead.filter((i) => i.itemType === 'building' && i.gridX < g.landSize && i.gridY < g.landSize)
        const phase = skyFor(new Date()).phase
        const fire = placed.find((i) => i.itemId === 'campfire')
        if (fire && (phase === 'night' || phase === 'dusk') && Math.random() < 0.6) return fire
        if (Math.random() > 0.5) return undefined
        const ripe = placed.filter(isRipePlot)
        if (ripe.length && Math.random() < 0.4) return pick(ripe)
        const homely = placed.filter((i) => {
            const category = getBuilding(i.itemId)?.category
            return category === 'building' || category === 'landmark' || category === 'farm' || i.itemId in REMARKS
        })
        return homely.length ? pick(homely) : undefined
    }

    // -----------------------------------------------------------------------
    // Speech
    // -----------------------------------------------------------------------

    /** What a villager says when clicked: mostly about how today is going, never a telling-off. */
    private greeting(): string {
        const g = this.g
        if (!g) return 'Hello!'
        const trees = g.dailyLogs[dateKey()]?.completedPomodoros || 0
        const left = this.dailyGoal - trees
        const today: string[] = []
        const ripe = g.homestead.filter(isRipePlot)
        if (ripe.length) today.push(`The ${getCrop(ripe[0].cropId).name.toLowerCase()} are ready to pick!`)
        if (left <= 0) today.push('Daily goal done. Put your feet up!')
        else if (trees > 0) today.push(`${trees} tree${trees > 1 ? 's' : ''} today already. Lovely.`, left === 1 ? "One more tree and today's goal is yours." : `${left} more trees to today's goal.`)
        else today.push('Fancy growing a tree today?', 'A fresh seed is waiting for you.')
        if (g.streak.current >= 2) today.push(`${g.streak.current} days in a row. We noticed!`)
        if (Object.values(g.inventory).some((n) => n > 0)) today.push('You have things waiting to be placed.')
        if (g.vitality < 45) today.push('Good to see you! We kept everything tidy.')
        const phase = skyFor(new Date()).phase
        if (phase === 'night') today.push('Lovely night for a fire.')
        if (phase === 'dawn') today.push('Up early! The best light of the day.')
        const always = ['One task at a time.', 'Rest counts too, you know.', 'The village grows with you.', 'Nice day for a stroll.']
        return Math.random() < 0.75 ? pick(today) : pick(always)
    }

    private speak(actor: Actor, text: string, seconds = 3.4): void {
        if (!this.layer) return
        // One voice at a time keeps the scene calm
        for (const other of this.actors) this.hush(other)
        const el = this.layer.ownerDocument.createElement('div')
        el.className = 'pf-bubble'
        el.textContent = text
        this.layer.appendChild(el)
        actor.speech = { el, left: seconds }
        this.placeSpeech()
    }

    private hush(actor: Actor): void {
        actor.speech?.el.remove()
        actor.speech = null
    }

    /** Keep each bubble above its speaker's head, inside the frame. */
    private placeSpeech(): void {
        const speaking = this.actors.filter((a) => a.speech)
        if (!speaking.length || !this.frame) return
        const width = this.frame.clientWidth
        const scale = width / this.L.width
        for (const actor of speaking) {
            const { cx, cy } = this.L.tile(actor.x, actor.y)
            const margin = Math.min(80, width / 2)
            const left = Math.max(margin, Math.min(width - margin, cx * scale))
            const top = (cy - (actor.kind === 'hen' ? 11 : 21)) * scale
            actor.speech!.el.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px) translate(-50%, -100%)`
        }
    }
}
