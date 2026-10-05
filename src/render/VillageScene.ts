/**
 * Pure SVG renderer for the isometric "floating island" dioramas used by the
 * village builder, the daily grove and the standalone HTML export.
 *
 * Everything is returned as a string so the same output works in Svelte
 * (`{@html}`) and in exported files. Interactive scenes carry `data-x`/`data-y`
 * (tiles) and `data-item` (placed objects) attributes for event delegation.
 */
import type { BiomeType, GamificationData, PlacedHomesteadItem, PlantedTree } from '../types/forest'
import {
    BUILDING_SVGS,
    DECOR_SVGS,
    HEN_SVGS,
    LIGHT_SOURCES,
    SPECIES_SVGS,
    VILLAGER_SVGS,
    cropSvg,
    plantedTreeSvg,
} from '../assets/floraAssets'
import { GARDEN_PLOT_ID, cropProgress, getBuilding, getCrop } from '../assets/floraCatalog'
import { SCENE_CSS } from './sceneCss'
import { buildGrid, mainArea, type Tile, type VillageGrid } from './villageGrid'

const TW = 64 // tile width
const TH = 32 // tile height
const CLIFF = 26
const SKY = 96 // headroom above the island for tall sprites and the sky

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------

export interface BiomePalette {
    tileA: string
    tileB: string
    tileEdge: string
    cliffL: string
    cliffR: string
    strata: string
    hillsFar: string
    hillsNear: string
    scatter: string[] // DECOR_SVGS keys
    petal?: string // coloured petals / leaves sprinkled on the grass
    alwaysGlow?: boolean
}

export const BIOME_PALETTES: Record<BiomeType, BiomePalette> = {
    meadow: {
        tileA: '#93c96d', tileB: '#86bf62', tileEdge: '#6fa34f',
        cliffL: '#8d6444', cliffR: '#6f4d33', strata: '#5c3f2a',
        hillsFar: '#a9cf9a', hillsNear: '#7fb37a',
        scatter: ['flowers_a', 'grass', 'flowers_b', 'bush'],
    },
    sakura_garden: {
        tileA: '#b8d88e', tileB: '#abcf83', tileEdge: '#90b56c',
        cliffL: '#93705f', cliffR: '#77584a', strata: '#624538',
        hillsFar: '#f3c6d8', hillsNear: '#e7a3c0',
        scatter: ['flowers_b', 'grass', 'bush'], petal: '#f7a8c8',
    },
    autumn_valley: {
        tileA: '#d8b35e', tileB: '#cda853', tileEdge: '#b48d3e',
        cliffL: '#83573a', cliffR: '#68432b', strata: '#553522',
        hillsFar: '#e2a36a', hillsNear: '#c6743f',
        scatter: ['mushroom', 'grass', 'rock'], petal: '#e0622d',
    },
    alpine_frost: {
        tileA: '#eaf2f6', tileB: '#dde9ef', tileEdge: '#c3d4de',
        cliffL: '#7d8f9c', cliffR: '#64747f', strata: '#55636d',
        hillsFar: '#c9d9e6', hillsNear: '#a4bccd',
        scatter: ['rock', 'grass'],
    },
    twilight_moss: {
        tileA: '#46559a', tileB: '#3f4d8f', tileEdge: '#323e78',
        cliffL: '#3e3160', cliffR: '#30264d', strata: '#241c3b',
        hillsFar: '#3b3f7a', hillsNear: '#2d2f60',
        scatter: ['mushroom', 'grass', 'flowers_b'], petal: '#7df9ff', alwaysGlow: true,
    },
}

type Phase = 'dawn' | 'day' | 'dusk' | 'night'

interface Sky {
    phase: Phase
    top: string
    bottom: string
    shade: number // 0..1 darkness overlay
    lights: boolean
    haze: string // ground haze below the horizon hills
}

export function skyFor(date: Date): Sky {
    const h = date.getHours() + date.getMinutes() / 60
    if (h >= 5 && h < 8) return { phase: 'dawn', top: '#8fb0e0', bottom: '#fbd7b5', haze: '#c9c6d0', shade: 0.12, lights: true }
    if (h >= 8 && h < 17.5) return { phase: 'day', top: '#79c1ee', bottom: '#d9f1ff', haze: '#b7dccb', shade: 0, lights: false }
    if (h >= 17.5 && h < 20.5) return { phase: 'dusk', top: '#5d5a9e', bottom: '#f5a36e', haze: '#8a6f9a', shade: 0.22, lights: true }
    return { phase: 'night', top: '#0b1333', bottom: '#27386a', haze: '#26356a', shade: 0.45, lights: true }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hash(...n: (number | string)[]): number {
    let h = 2166136261
    const s = n.join('|')
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i)
        h = Math.imul(h, 16777619)
    }
    // Final mix: without it, inputs that differ only in their last character land next to
    // each other, and "scattered" stars or fireflies line up in a row.
    h ^= h >>> 16
    h = Math.imul(h, 0x85ebca6b)
    h ^= h >>> 13
    h = Math.imul(h, 0xc2b2ae35)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
}

const f = (n: number) => Math.round(n * 10) / 10

/** Seconds since local midnight — shared phase origin for every animation. */
function wallClock(): number {
    return (Date.now() / 1000) % 86400
}

/** Nest a 0..64 sprite so its ground point (32,56) lands on (cx, cy). */
function placeSprite(svg: string, cx: number, cy: number, scale: number, anchorY = 56, boxW = 64, boxH = boxW): string {
    const x = cx - (boxW / 2) * scale
    const y = cy - anchorY * scale
    return svg.replace(
        /^\s*<svg /,
        `<svg x="${f(x)}" y="${f(y)}" width="${f(boxW * scale)}" height="${f(boxH * scale)}" overflow="visible" `,
    )
}

function diamond(cx: number, cy: number, w = TW, h = TH): string {
    return `${f(cx)},${f(cy - h / 2)} ${f(cx + w / 2)},${f(cy)} ${f(cx)},${f(cy + h / 2)} ${f(cx - w / 2)},${f(cy)}`
}

export interface Layout {
    size: number
    width: number
    height: number
    top: number
    /** Centre of a tile in viewBox units. Fractional tiles work too. */
    tile: (x: number, y: number) => { cx: number; cy: number }
}

export function sceneLayout(size: number): Layout {
    const width = size * TW + 48
    const top = SKY
    const height = top + size * TH + CLIFF + 34
    return {
        size,
        width,
        height,
        top,
        tile: (x, y) => ({ cx: width / 2 + ((x - y) * TW) / 2, cy: top + ((x + y) * TH) / 2 + TH / 2 }),
    }
}

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

function skyLayer(L: Layout, sky: Sky, pal: BiomePalette, id: string, date: Date): string {
    const { width: W, top } = L
    let out = `<defs>
        <linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky.top}"/><stop offset="1" stop-color="${sky.bottom}"/></linearGradient>
        <radialGradient id="${id}-glow"><stop offset="0" stop-color="#ffe9a8" stop-opacity=".85"/><stop offset=".45" stop-color="#ffc56b" stop-opacity=".35"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
        <radialGradient id="${id}-sun"><stop offset="0" stop-color="#fffbe6"/><stop offset=".5" stop-color="#ffe89a" stop-opacity=".6"/><stop offset="1" stop-color="#ffe89a" stop-opacity="0"/></radialGradient>
    </defs>
    <rect class="pf-sky" width="${W}" height="${L.height}" fill="url(#${id}-sky)"/>`

    // Sun / moon travelling across the sky
    const h = date.getHours() + date.getMinutes() / 60
    if (sky.phase === 'night') {
        for (let i = 0; i < 28; i++) {
            const sx = hash(id, 'star', i) * W
            const sy = hash(id, 'stary', i) * (top + 10)
            out += `<circle class="pf-twinkle" style="--d:-${f(hash(i, 'd') * 3)}s" cx="${f(sx)}" cy="${f(sy)}" r="${f(0.5 + hash(i) * 0.9)}" fill="#fff"/>`
        }
        const t = ((h + 24 - 20.5) % 24) / 8.5
        const mx = W * (0.15 + 0.7 * t)
        const my = 34 - Math.sin(Math.PI * t) * 18
        out += `<circle cx="${f(mx)}" cy="${f(my)}" r="16" fill="url(#${id}-sun)" opacity=".5"/>
            <circle cx="${f(mx)}" cy="${f(my)}" r="8" fill="#f4f1de"/><circle cx="${f(mx + 3.5)}" cy="${f(my - 2)}" r="7" fill="${sky.top}"/>`
    } else {
        const t = Math.max(0, Math.min(1, (h - 5) / 15.5))
        const sx = W * (0.1 + 0.8 * t)
        const sy = 46 - Math.sin(Math.PI * t) * 30
        out += `<circle cx="${f(sx)}" cy="${f(sy)}" r="26" fill="url(#${id}-sun)"/><circle cx="${f(sx)}" cy="${f(sy)}" r="9" fill="#fff4c2"/>`
    }

    // Drifting clouds
    const clouds = sky.phase === 'night' ? 2 : 4
    for (let i = 0; i < clouds; i++) {
        const cy = 14 + hash(id, 'cloud', i) * 44
        const s = 0.7 + hash(i, 'cs') * 0.6
        const dur = 70 + hash(i, 'cd') * 60
        const op = sky.phase === 'night' ? 0.18 : 0.85
        out += `<g class="pf-cloud" style="animation-duration:${f(dur)}s;--d:-${f(hash(i, 'cdl') * dur)}s" opacity="${op}">
            <g transform="translate(0 ${f(cy)}) scale(${f(s)})"><ellipse cx="0" cy="0" rx="20" ry="7" fill="#fff"/><ellipse cx="-9" cy="-4" rx="10" ry="7" fill="#fff"/><ellipse cx="7" cy="-6" rx="12" ry="9" fill="#fff"/></g></g>`
    }

    // Distant hills on the horizon
    const hy = top + L.size * TH * 0.35
    const hills = (y: number, amp: number, color: string, seed: string) => {
        let d = `M0 ${f(L.height)} L0 ${f(y)}`
        const steps = 8
        for (let i = 1; i <= steps; i++) {
            const x = (W / steps) * i
            const py = y - amp * (0.4 + hash(seed, i) * 0.8)
            d += ` Q${f(x - W / steps / 2)} ${f(py - amp * 0.6)} ${f(x)} ${f(py)}`
        }
        return `<path d="${d} L${W} ${f(L.height)} Z" fill="${color}"/>`
    }
    out += `<g class="pf-hills" opacity="${sky.phase === 'night' ? 0.45 : 0.9}">${hills(hy - 26, 16, pal.hillsFar, id + 'far')}${hills(hy, 12, pal.hillsNear, id + 'near')}</g>`
    out += `<rect y="${f(hy + 10)}" width="${W}" height="${f(L.height - hy)}" fill="${sky.haze}" opacity=".7"/>`
    return out
}

function islandBase(L: Layout, pal: BiomePalette): string {
    const n = L.size
    const T = { x: L.width / 2, y: L.top }
    const R = { x: L.width / 2 + (n * TW) / 2, y: L.top + (n * TH) / 2 }
    const B = { x: L.width / 2, y: L.top + n * TH }
    const Lf = { x: L.width / 2 - (n * TW) / 2, y: L.top + (n * TH) / 2 }
    let out = `<ellipse cx="${f(B.x)}" cy="${f(B.y + CLIFF + 14)}" rx="${f((n * TW) / 2.4)}" ry="10" fill="#000" opacity=".12"/>`
    out += `<polygon points="${f(Lf.x)},${f(Lf.y)} ${f(B.x)},${f(B.y)} ${f(B.x)},${f(B.y + CLIFF)} ${f(Lf.x)},${f(Lf.y + CLIFF * 0.7)}" fill="${pal.cliffL}"/>`
    out += `<polygon points="${f(B.x)},${f(B.y)} ${f(R.x)},${f(R.y)} ${f(R.x)},${f(R.y + CLIFF * 0.7)} ${f(B.x)},${f(B.y + CLIFF)}" fill="${pal.cliffR}"/>`
    // Soil strata and a grassy lip
    for (const k of [0.38, 0.7]) {
        out += `<polyline points="${f(Lf.x)},${f(Lf.y + CLIFF * 0.7 * k)} ${f(B.x)},${f(B.y + CLIFF * k)} ${f(R.x)},${f(R.y + CLIFF * 0.7 * k)}" fill="none" stroke="${pal.strata}" stroke-width="1.2" opacity=".55" stroke-dasharray="6 4"/>`
    }
    out += `<polyline points="${f(Lf.x)},${f(Lf.y + 2)} ${f(B.x)},${f(B.y + 3)} ${f(R.x)},${f(R.y + 2)}" fill="none" stroke="${pal.tileEdge}" stroke-width="4" stroke-linejoin="round"/>`
    out += `<polygon points="${f(T.x)},${f(T.y)} ${f(R.x)},${f(R.y)} ${f(B.x)},${f(B.y)} ${f(Lf.x)},${f(Lf.y)}" fill="${pal.tileA}"/>`
    return out
}

type GroundKind = 'path' | 'water' | 'soil'

function groundTile(kind: 'grass' | GroundKind, cx: number, cy: number, pal: BiomePalette, x: number, y: number): string {
    if (kind === 'water') {
        return `<g><polygon points="${diamond(cx, cy)}" fill="#3f9fd8"/><polygon points="${diamond(cx, cy + 1.5, TW - 8, TH - 4)}" fill="#5bb8ea"/>
            <path class="pf-water" d="M${f(cx - 16)} ${f(cy - 2)} q6 -3 12 0 t12 0" stroke="#d6f2ff" stroke-width="1.4" fill="none" stroke-linecap="round"/>
            <path class="pf-water" style="--d:-1.2s" d="M${f(cx - 4)} ${f(cy + 5)} q5 -2.5 10 0 t10 0" stroke="#d6f2ff" stroke-width="1.2" fill="none" stroke-linecap="round"/></g>`
    }
    if (kind === 'path') {
        let stones = ''
        for (let i = 0; i < 7; i++) {
            const u = hash(x, y, 'u', i) - 0.5
            const v = hash(x, y, 'v', i) - 0.5
            const sx = cx + u * TW * 0.55 - v * TW * 0.1
            const sy = cy + v * TH * 0.55
            const shade = ['#b9ada0', '#a89b8d', '#c8bdb1'][i % 3]
            stones += `<ellipse cx="${f(sx)}" cy="${f(sy)}" rx="${f(4.5 + hash(x, y, i) * 3)}" ry="${f(2.4 + hash(y, x, i) * 1.5)}" fill="${shade}" stroke="#6f6358" stroke-opacity=".35" stroke-width=".6"/>`
        }
        return `<g><polygon points="${diamond(cx, cy)}" fill="#9a8a78"/><polygon points="${diamond(cx, cy, TW - 6, TH - 3)}" fill="#8b7b6a"/>${stones}</g>`
    }
    const fill = (x + y) % 2 === 0 ? pal.tileA : pal.tileB
    const grass = `<polygon points="${diamond(cx, cy)}" fill="${fill}" stroke="${pal.tileEdge}" stroke-opacity=".35" stroke-width=".6"/>`
    if (kind === 'soil') {
        // Tilled earth with two raised ridges; cropSvg() plants along the same ridges
        const p = (u: number, v: number) => `${f(cx + (u - v) * (TW / 2))} ${f(cy + (u + v) * (TH / 2))}`
        let ridges = ''
        for (const v of [-0.22, 0.22]) {
            ridges += `<path d="M${p(-0.36, v)}L${p(0.36, v)}" stroke="#8a6240" stroke-width="5.5" stroke-linecap="round"/><path d="M${p(-0.36, v - 0.06)}L${p(0.36, v - 0.06)}" stroke="#a67c52" stroke-width="1.3" stroke-linecap="round"/>`
        }
        return `<g>${grass}<polygon points="${diamond(cx, cy + 1, TW - 7, TH - 3.5)}" fill="#4a3120"/><polygon points="${diamond(cx, cy, TW - 8, TH - 4)}" fill="#644529"/>${ridges}</g>`
    }
    return grass
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

export interface SceneItem {
    x: number
    y: number
    svg: string
    scale: number
    key?: string
    level?: number
    light?: { x: number; y: number; r: number; color: string }
    /** Shows a bobbing "ready" marker above the item. */
    ripe?: boolean
}

/** A villager or animal standing in the scene. `x`/`y` are tile coordinates and may be fractional. */
export interface SceneActor {
    x: number
    y: number
    svg: string
    className: string
    flip?: boolean
}

export interface SceneOptions {
    size: number
    biome: BiomeType
    items: SceneItem[]
    ground?: Map<string, GroundKind>
    date?: Date
    vitality?: number
    /** Drawn between the items, so an actor behind a tree is hidden by it. */
    actors?: SceneActor[]
    /** Tiles nothing stands on, for ambient life. Defaults to every tile without an item. */
    open?: Tile[]
    interactive?: boolean
    selected?: { x: number; y: number } | null
    highlightEmpty?: boolean
    still?: boolean
    idPrefix?: string
    showSky?: boolean
    className?: string
    /** Inline the animation CSS (for standalone exports; the plugin injects it once globally). */
    embedCss?: boolean
}

export function renderIsoScene(opts: SceneOptions): string {
    const L = sceneLayout(opts.size)
    const date = opts.date || new Date()
    const sky = skyFor(date)
    const pal = BIOME_PALETTES[opts.biome] || BIOME_PALETTES.meadow
    const id = opts.idPrefix || `pf${Math.floor(hash(Date.now(), Math.random()) * 1e6)}`
    const vitality = opts.vitality ?? 70
    const mood = vitality >= 75 ? 'thriving' : vitality >= 45 ? 'healthy' : vitality >= 20 ? 'sleepy' : 'dormant'
    const occupied = new Set(opts.items.map((i) => `${i.x},${i.y}`))
    const ground = opts.ground || new Map<string, GroundKind>()

    // Animation phases are anchored to the wall clock (--t), so a re-rendered scene
    // continues exactly where the previous one was instead of restarting.
    const clock = wallClock()
    let svg = `<svg class="pf-scene pf-${sky.phase} pf-mood-${mood}${opts.still ? ' pf-still' : ''} ${opts.className || ''}" style="--t:-${f(clock)}s" viewBox="0 0 ${L.width} ${L.height}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">`
    if (opts.embedCss) svg += `<style>${SCENE_CSS}</style>`
    svg += opts.showSky === false ? `<defs><radialGradient id="${id}-glow"><stop offset="0" stop-color="#ffe9a8" stop-opacity=".85"/><stop offset=".45" stop-color="#ffc56b" stop-opacity=".35"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient></defs>` : skyLayer(L, sky, pal, id, date)
    svg += islandBase(L, pal)

    // Ground tiles + scatter
    const saturate = mood === 'dormant' ? 0.55 : mood === 'sleepy' ? 0.8 : 1
    svg += `<g class="pf-ground" style="filter:saturate(${saturate})">`
    for (let y = 0; y < L.size; y++) {
        for (let x = 0; x < L.size; x++) {
            const { cx, cy } = L.tile(x, y)
            const kind = ground.get(`${x},${y}`) || 'grass'
            svg += groundTile(kind, cx, cy, pal, x, y)
            if (kind === 'grass' && !occupied.has(`${x},${y}`)) {
                const count = mood === 'thriving' ? 3 : mood === 'healthy' ? 2 : 1
                for (let i = 0; i < count; i++) {
                    if (hash(x, y, 'sc', i) < 0.45) continue
                    const keys = pal.scatter.filter((k) => mood !== 'dormant' || !k.startsWith('flowers'))
                    const key = keys[Math.floor(hash(x, y, 'k', i) * keys.length)]
                    const dx = (hash(x, y, 'dx', i) - 0.5) * TW * 0.5
                    const dy = (hash(x, y, 'dy', i) - 0.5) * TH * 0.45
                    if (DECOR_SVGS[key]) svg += placeSprite(DECOR_SVGS[key], cx + dx, cy + dy, 0.6, 14, 16)
                }
                if (pal.petal && hash(x, y, 'petal') > 0.35) {
                    for (let i = 0; i < 3; i++) {
                        const px = cx + (hash(x, y, 'px', i) - 0.5) * TW * 0.6
                        const py = cy + (hash(x, y, 'py', i) - 0.5) * TH * 0.5
                        svg += `<ellipse cx="${f(px)}" cy="${f(py)}" rx="1.6" ry="1" fill="${pal.petal}" opacity=".85" transform="rotate(${Math.round(hash(x, y, i) * 180)} ${f(px)} ${f(py)})"/>`
                    }
                }
            }
        }
    }
    svg += `</g>`

    // Clickable tile layer (under the sprites, so clicking a sprite selects the object)
    if (opts.interactive) {
        svg += `<g class="pf-tiles">`
        for (let y = 0; y < L.size; y++) {
            for (let x = 0; x < L.size; x++) {
                const { cx, cy } = L.tile(x, y)
                const isSel = opts.selected && opts.selected.x === x && opts.selected.y === y
                const isTarget = opts.highlightEmpty && !occupied.has(`${x},${y}`)
                svg += `<polygon class="pf-hit${isSel ? ' pf-selected' : ''}${isTarget ? ' pf-target' : ''}" data-x="${x}" data-y="${y}" points="${diamond(cx, cy, TW - 3, TH - 1.5)}"/>`
            }
        }
        svg += `</g>`
    }

    // Objects and actors in one list, painter-sorted back to front. Each carries its depth so
    // the live village (VillageLife) can slot walking villagers in between them.
    type Drawn = { depth: number; order: number; item?: SceneItem; actor?: SceneActor }
    const drawn: Drawn[] = [
        ...opts.items.map((item) => ({ depth: item.x + item.y, order: item.x, item })),
        ...(opts.actors || []).map((actor) => ({ depth: actor.x + actor.y + 0.01, order: actor.x, actor })),
    ].sort((a, b) => a.depth - b.depth || a.order - b.order)
    const lights: string[] = []
    svg += `<g class="pf-objects">`
    for (const { depth, item, actor } of drawn) {
        if (actor) {
            const { cx, cy } = L.tile(actor.x, actor.y)
            svg += `<g class="pf-actor ${actor.className}" data-depth="${f(depth)}" transform="translate(${f(cx)} ${f(cy)})"><g class="pf-actor-body"${actor.flip ? ' transform="scale(-1 1)"' : ''}>${actor.svg}</g></g>`
            continue
        }
        if (!item) continue
        const { cx, cy } = L.tile(item.x, item.y)
        const delay = f(-hash(item.x, item.y, 'sway') * 5)
        svg += `<g class="pf-item" data-depth="${depth}" style="--d:${delay}s"${item.key ? ` data-item="${item.key}" data-x="${item.x}" data-y="${item.y}"` : ''}>`
        svg += placeSprite(item.svg, cx, cy + 3, item.scale)
        if (item.level && item.level > 1) {
            svg += `<text x="${f(cx)}" y="${f(cy + 13)}" class="pf-stars" text-anchor="middle">${'★'.repeat(Math.min(5, item.level))}</text>`
        }
        if (item.ripe) {
            svg += `<g transform="translate(${f(cx)} ${f(cy - 21)})"><g class="pf-ripe" style="--d:${delay}s"><circle r="5.6" fill="#fff8e1" stroke="#e39b2d" stroke-width="1"/><path d="M0 -3.8Q0 0 3.8 0Q0 0 0 3.8Q0 0 -3.8 0Q0 0 0 -3.8Z" fill="#ffb300"/></g></g>`
        }
        svg += `</g>`
        if (item.light) {
            const lx = cx - 32 * item.scale + item.light.x * item.scale
            const ly = cy + 3 - 56 * item.scale + item.light.y * item.scale
            lights.push(`<circle class="pf-halo" cx="${f(lx)}" cy="${f(ly)}" r="${f(item.light.r * item.scale * 2.2)}" fill="url(#${id}-glow)"/>`)
        }
    }
    svg += `</g>`

    const openTiles = opts.open || allTiles(L.size).filter((t) => !occupied.has(`${t.x},${t.y}`))
    const walkable = openTiles.map((t) => L.tile(t.x, t.y))

    // Mist settles in while the village rests. Soft wisps under the night shade, so they
    // read as haze in every light instead of as shapes.
    if (mood === 'dormant' || mood === 'sleepy') {
        svg += `<defs><radialGradient id="${id}-mist"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset=".55" stop-color="#fff" stop-opacity=".3"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>`
        svg += `<g class="pf-mist-layer" opacity="${mood === 'dormant' ? 0.5 : 0.24}">`
        for (let i = 0; i < L.size + 1; i++) {
            const { cx, cy } = L.tile(hash(id, 'mx', i) * (L.size - 1), hash(id, 'my', i) * (L.size - 1))
            const rx = 30 + hash(id, 'mr', i) * 28
            svg += `<ellipse class="pf-mist" style="--d:-${f(hash(i, 'md') * 12)}s" cx="${f(cx)}" cy="${f(cy - 3)}" rx="${f(rx)}" ry="${f(rx * 0.24)}" fill="url(#${id}-mist)"/>`
        }
        svg += `</g>`
    }

    // Night shading + warm light halos
    if (sky.shade > 0 && opts.showSky !== false) {
        svg += `<rect class="pf-shade" width="${L.width}" height="${L.height}" fill="#0a1030" opacity="${sky.shade}"/>`
    }
    if (sky.lights || pal.alwaysGlow) svg += `<g class="pf-lights">${lights.join('')}</g>`

    // Ambient life: fireflies at night, butterflies by day
    if ((sky.phase === 'night' || sky.phase === 'dusk' || pal.alwaysGlow) && vitality >= 45) {
        const n = mood === 'thriving' ? 14 : 7
        for (let i = 0; i < n; i++) {
            const p = walkable.length ? walkable[Math.floor(hash(id, 'ff', i) * walkable.length)] : L.tile(0, 0)
            svg += `<circle class="pf-firefly" style="--d:-${f(hash(i, 'ffd') * 6)}s" cx="${f(p.cx + (hash(i, 'fx') - 0.5) * 30)}" cy="${f(p.cy - 10 - hash(i, 'fy') * 20)}" r="1.3" fill="#fff59d"/>`
        }
    } else if (sky.phase === 'day' && mood === 'thriving') {
        for (let i = 0; i < 4; i++) {
            const p = walkable.length ? walkable[Math.floor(hash(id, 'bf', i) * walkable.length)] : L.tile(0, 0)
            const color = ['#ffd54f', '#f48fb1', '#b39ddb', '#ffffff'][i]
            svg += `<g class="pf-butterfly" style="--d:-${f(hash(i, 'bfd') * 8)}s"><g transform="translate(${f(p.cx)} ${f(p.cy - 16)})">
                <ellipse class="pf-wing" cx="-2" cy="0" rx="2.2" ry="1.6" fill="${color}"/><ellipse class="pf-wing" cx="2" cy="0" rx="2.2" ry="1.6" fill="${color}"/></g></g>`
        }
    }
    svg += `</svg>`
    return svg
}

function allTiles(size: number): Tile[] {
    const tiles: Tile[] = []
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) tiles.push({ x, y })
    return tiles
}

// ---------------------------------------------------------------------------
// Villagers and animals
// ---------------------------------------------------------------------------

/** An actor's sprite with its feet at the origin, ready to be moved with a translate. */
export function actorSprite(kind: 'villager' | 'hen', variant: number): string {
    return kind === 'hen'
        ? placeSprite(HEN_SVGS[variant % HEN_SVGS.length], 0, 0, 0.8, 11, 12, 12)
        : placeSprite(VILLAGER_SVGS[variant % VILLAGER_SVGS.length], 0, 0, 0.8, 23, 16, 24)
}

/** Villagers come out as the village gets livelier and gains buildings. */
export function villagerCount(g: GamificationData): number {
    const buildings = g.homestead.filter((i) => {
        const category = i.itemType === 'building' ? getBuilding(i.itemId)?.category : 'path'
        return category !== 'path' && category !== 'farm'
    }).length
    const moodVillagers = g.vitality >= 75 ? 5 : g.vitality >= 45 ? 3 : g.vitality >= 20 ? 1 : 0
    return Math.min(moodVillagers, 1 + buildings, VILLAGER_SVGS.length * 2)
}

export function findCoop(g: GamificationData): PlacedHomesteadItem | undefined {
    return g.homestead.find((i) => i.itemType === 'building' && i.itemId === 'chicken_coop' && i.gridX < g.landSize && i.gridY < g.landSize)
}

/** A coop keeps a hen per level, plus one. They stay in while the village is dormant. */
export function henCount(g: GamificationData): number {
    const coop = findCoop(g)
    return coop && g.vitality >= 20 ? 1 + coop.level : 0
}

/** Walkable tiles within a short waddle of the coop. */
export function henRange(tiles: Tile[], coop: Tile): Tile[] {
    return tiles.filter((t) => Math.max(Math.abs(t.x - coop.x), Math.abs(t.y - coop.y)) <= 2)
}

/** Where everyone stands when nothing moves: still scenes and exported snapshots. */
function standingActors(g: GamificationData, grid: VillageGrid, seed: string, day: number): SceneActor[] {
    const area = mainArea(grid)
    const taken = new Set<string>()
    const actors: SceneActor[] = []
    const stand = (pool: Tile[], kind: 'villager' | 'hen', n: number) => {
        if (!pool.length) return
        for (let attempt = 0; attempt < 6; attempt++) {
            const tile = pool[Math.floor(hash(seed, kind, n, attempt, day) * pool.length)]
            const key = `${tile.x},${tile.y}`
            if (taken.has(key)) continue
            taken.add(key)
            actors.push({
                x: tile.x + (hash(seed, kind, n, 'ox') - 0.5) * 0.3,
                y: tile.y + (hash(seed, kind, n, 'oy') - 0.5) * 0.3,
                svg: actorSprite(kind, n),
                className: kind === 'hen' ? 'pf-hen' : 'pf-villager',
                flip: hash(seed, kind, n, 'flip') > 0.5,
            })
            return
        }
    }
    const villagers = Math.min(villagerCount(g), Math.floor(area.length / 2))
    for (let v = 0; v < villagers; v++) stand(area, 'villager', v)
    const coop = findCoop(g)
    if (coop) {
        const range = henRange(area, { x: coop.gridX, y: coop.gridY })
        for (let h = 0; h < henCount(g); h++) stand(range, 'hen', h)
    }
    return actors
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

function speciesSprite(id: string): string {
    return SPECIES_SVGS[id] || SPECIES_SVGS.classic_pine
}

export function homesteadItemSprite(item: Pick<PlacedHomesteadItem, 'itemType' | 'itemId'>): string {
    return item.itemType === 'tree' ? speciesSprite(item.itemId) : BUILDING_SVGS[item.itemId] || BUILDING_SVGS.cabin
}

export interface VillageRenderOptions {
    interactive?: boolean
    selected?: { x: number; y: number } | null
    highlightEmpty?: boolean
    date?: Date
    still?: boolean
    idPrefix?: string
    className?: string
    embedCss?: boolean
    /** Leave villagers and animals out: VillageLife adds them and walks them around. */
    liveActors?: boolean
}

export function renderVillage(g: GamificationData, opts: VillageRenderOptions = {}): string {
    const { liveActors, ...sceneOpts } = opts
    const ground = new Map<string, GroundKind>()
    const items: SceneItem[] = []
    for (const item of g.homestead) {
        if (item.gridX >= g.landSize || item.gridY >= g.landSize) continue
        const key = `${item.gridX},${item.gridY}`
        if (item.itemType === 'building' && item.itemId === 'cobblestone_path') {
            ground.set(key, 'path')
            items.push({ x: item.gridX, y: item.gridY, svg: '<svg viewBox="0 0 64 64"></svg>', scale: 1, key: item.id })
            continue
        }
        if (item.itemType === 'building' && (item.itemId === 'water_stream' || item.itemId === 'bridge')) {
            ground.set(key, 'water')
            if (item.itemId === 'water_stream') {
                items.push({ x: item.gridX, y: item.gridY, svg: '<svg viewBox="0 0 64 64"></svg>', scale: 1, key: item.id })
                continue
            }
        }
        if (item.itemType === 'building' && item.itemId === GARDEN_PLOT_ID) {
            const progress = cropProgress(item)
            ground.set(key, 'soil')
            items.push({ x: item.gridX, y: item.gridY, svg: cropSvg(getCrop(item.cropId).id, progress), scale: 1, key: item.id, ripe: progress >= 1 })
            continue
        }
        const isTree = item.itemType === 'tree'
        items.push({
            x: item.gridX,
            y: item.gridY,
            svg: homesteadItemSprite(item),
            scale: isTree ? 0.95 + 0.12 * (item.level - 1) : getBuilding(item.itemId)?.category === 'decoration' ? 0.95 : 1.2,
            key: item.id,
            level: isTree ? undefined : item.level,
            light: LIGHT_SOURCES[item.itemId],
        })
    }

    const grid = buildGrid(g.homestead, g.landSize)
    const seed = opts.idPrefix || 'pf'
    return renderIsoScene({
        size: g.landSize,
        biome: g.activeBiome,
        items,
        ground,
        vitality: g.vitality,
        actors: liveActors ? [] : standingActors(g, grid, seed, (opts.date || new Date()).getDate()),
        open: mainArea(grid),
        ...sceneOpts,
    })
}

/** A small island showing one day's trees, Forest-app style. */
export function renderGrove(
    trees: PlantedTree[],
    biome: BiomeType,
    opts: { date?: Date; idPrefix?: string; still?: boolean; embedCss?: boolean } = {},
): string {
    const size = Math.max(3, Math.ceil(Math.sqrt(trees.length)))
    // Fill tiles from the front-centre outward so a few trees look deliberate
    const cells: { x: number; y: number; d: number }[] = []
    const c = (size - 1) / 2
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) cells.push({ x, y, d: Math.hypot(x - c, y - c) + hash(x, y) * 0.3 })
    cells.sort((a, b) => a.d - b.d)
    const items: SceneItem[] = trees.slice(0, cells.length).map((t, i) => ({
        x: cells[i].x,
        y: cells[i].y,
        svg: plantedTreeSvg(t),
        scale: t.status === 'withered' ? 0.85 : t.status === 'young' ? 0.7 : 0.8 + Math.min(0.35, t.durationMinutes / 150),
        key: t.id,
        light: t.status === 'mature' ? LIGHT_SOURCES[t.speciesId] : undefined,
    }))
    return renderIsoScene({ size, biome, items, vitality: 80, interactive: false, ...opts, className: 'pf-grove' })
}
