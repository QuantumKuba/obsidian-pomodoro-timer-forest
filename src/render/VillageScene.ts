/**
 * Pure SVG renderer for the isometric "floating island" dioramas used by the
 * village builder, the daily grove and the standalone HTML export.
 *
 * Everything is returned as a string so the same output works in Svelte
 * (`{@html}`) and in exported files. Interactive scenes carry `data-x`/`data-y`
 * (tiles) and `data-item` (placed objects) attributes for event delegation.
 */
import type { BiomeType, CareNeed, GamificationData, PlacedHomesteadItem, PlantedTree } from '../types/forest'
import {
    BUILDING_SVGS,
    DECOR_SVGS,
    HEN_SVGS,
    LIGHT_SOURCES,
    SPECIES_SVGS,
    VILLAGER_SVGS,
    TREASURE_SVGS,
    bridgeDeckRise,
    bridgeSpanSvg,
    cropSvg,
    ornamentAt,
    pickupSvg,
    plantedTreeSvg,
} from '../assets/floraAssets'
import { CARE_FOR, getTreasure, type OrnamentMount } from '../assets/treasureCatalog'
import { dateKey } from '../services/Progression'
import { heartNeed, heartStage, heartTreeItem, tendedToday } from '../services/HeartTree'
import { pickupSpots } from '../services/Treasures'
import { GARDEN_PLOT_ID, cropProgress, getBuilding, getCrop, getSpecies } from '../assets/floraCatalog'
import { SCENE_CSS } from './sceneCss'
import { bridgeLayout, buildGrid, isWater, kindAt, mainArea, waterEdges, waterSides, type Tile, type TileSide, type VillageGrid, type WaterSide } from './villageGrid'

const TW = 64 // tile width
const TH = 32 // tile height
const SKY = 96 // headroom above the island for tall sprites and the sky
const SEA = 28 // room under the island's lowest rock for the clouds below
const LINK_PAD = 76 // extra width on both sides when bridges lead to neighbouring islands

/** How far the island's rock hangs below its edge: a bigger island is a deeper one. */
function islandDepth(size: number): number {
    return 40 + size * 11
}

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
    coral_lagoon: {
        tileA: '#f1dfae', tileB: '#e9d39c', tileEdge: '#cdb27a',
        cliffL: '#c79a6b', cliffR: '#a87c52', strata: '#8c6440',
        hillsFar: '#9fdcd6', hillsNear: '#63c1bd',
        scatter: ['grass', 'rock', 'flowers_a', 'bush'], petal: '#ff8f7a',
    },
    ember_highlands: {
        tileA: '#6d5a57', tileB: '#63514f', tileEdge: '#4b3c3b',
        cliffL: '#4a3836', cliffR: '#382a29', strata: '#281d1c',
        hillsFar: '#b0705a', hillsNear: '#8a4c3f',
        scatter: ['rock', 'mushroom', 'grass'], petal: '#ff9a3d', alwaysGlow: true,
    },
    jade_marsh: {
        tileA: '#5fae93', tileB: '#55a288', tileEdge: '#3f866f',
        cliffL: '#5a6b5c', cliffR: '#465548', strata: '#37443a',
        hillsFar: '#a8d8c4', hillsNear: '#6fb59c',
        scatter: ['grass', 'bush', 'mushroom', 'flowers_b'], petal: '#d8f5a2',
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

/* A day butterfly, about 10 x 8 units, centred on its body. The wings are the right-hand
   pair with their hinge on x = 0, so they can be mirrored and fold in about the body. */
const FOREWING = 'M.4-.3C.9-3.2 3.6-4.6 4.9-3.6C5.6-2.8 4.4-.7.4 0Z'
const HINDWING = 'M.4-.1C3.2 0 4 1.6 3.3 2.7C2.7 3.6.9 2.9.4.6Z'
const BUTTERFLY_BODY =
    '<path d="M-.2-2.5Q-.6-3.8-1.4-4.3M.2-2.5Q.6-3.8 1.4-4.3" fill="none" stroke="#3b2c27" stroke-width=".25" stroke-linecap="round"/>'
    + '<ellipse cx="0" cy=".4" rx=".55" ry="2.3" fill="#3b2c27"/><circle cx="0" cy="-2.1" r=".65" fill="#3b2c27"/>'
/** [forewing, hindwing, edge]: marigold, rose, lavender and a cabbage white. */
const BUTTERFLY_COLORS: [string, string, string][] = [
    ['#ffcf5c', '#f2a93b', '#8a5a1c'],
    ['#f6a5c0', '#e07a9e', '#7d3b55'],
    ['#c9b8e6', '#9c86cc', '#4f3f73'],
    ['#fbfaf3', '#e6e0cc', '#7a7466'],
]

/** `a` mixed with `b` (both `#rrggbb`), `t` = 0 all `a`, 1 all `b`. */
function mix(a: string, b: string, t: number): string {
    const ch = (c: string, i: number) => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16)
    return '#' + [0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0')).join('')
}

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
    const height = top + size * TH + islandDepth(size) + SEA
    return {
        size,
        width,
        height,
        top,
        tile: (x, y) => ({ cx: width / 2 + ((x - y) * TW) / 2, cy: top + ((x + y) * TH) / 2 + TH / 2 }),
    }
}

/** Tile coordinate at an (x, y) point in the scene viewBox, or null if off the island. */
export function tileAtPoint(L: Layout, cx: number, cy: number): { x: number; y: number } | null {
    const dx = cx - L.width / 2
    const dy = cy - (L.top + TH / 2)
    const fx = dx / TW + dy / TH
    const fy = dy / TH - dx / TW
    const x = Math.floor(fx + 0.5)
    const y = Math.floor(fy + 0.5)
    if (x < 0 || y < 0 || x >= L.size || y >= L.size) return null
    return { x, y }
}

/**
 * The scene's viewBox. Bridges to neighbouring islands need room at the sides, so a scene with
 * links is wider: the extra is added left of x = 0 and right of `L.width`, and tile
 * coordinates (`L.tile`, `tileAtPoint`) stay exactly where they are.
 */
export function sceneViewBox(L: Layout, hasLinks = false): string {
    const pad = hasLinks ? LINK_PAD : 0
    return `${-pad} 0 ${L.width + pad * 2} ${L.height}`
}

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

function skyLayer(L: Layout, sky: Sky, pal: BiomePalette, id: string, date: Date, pad: number, farIsles: boolean): string {
    const { width: W, top } = L
    const night = sky.phase === 'night'
    let out = `<defs>
        <linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky.top}"/><stop offset=".62" stop-color="${sky.bottom}"/><stop offset="1" stop-color="${mix(sky.bottom, sky.haze, 0.55)}"/></linearGradient>
        <radialGradient id="${id}-glow"><stop offset="0" stop-color="#ffe9a8" stop-opacity=".85"/><stop offset=".45" stop-color="#ffc56b" stop-opacity=".35"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
        <radialGradient id="${id}-sun"><stop offset="0" stop-color="#fffbe6"/><stop offset=".5" stop-color="#ffe89a" stop-opacity=".6"/><stop offset="1" stop-color="#ffe89a" stop-opacity="0"/></radialGradient>
    </defs>
    <rect class="pf-sky" x="${-pad}" width="${W + pad * 2}" height="${L.height}" fill="url(#${id}-sky)"/>`

    // Sun / moon travelling across the sky
    const h = date.getHours() + date.getMinutes() / 60
    if (night) {
        for (let i = 0; i < 28; i++) {
            const sx = -pad + hash(id, 'star', i) * (W + pad * 2)
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

    // Other islands far off in the haze: the village is one of many
    if (farIsles) {
        const base = top + L.size * TH
        const k = Math.min(1, 0.4 + L.size * 0.08)
        const spots: [number, number, number, string][] = [
            [W * 0.085, top + L.size * TH * 0.14, 15 * k, pal.hillsFar],
            [W * 0.93, top + L.size * TH * 0.1 - 6, 11 * k, pal.hillsFar],
            [W * 0.9, base * 0.6 + L.height * 0.4 - 8, 17 * k, pal.hillsNear],
        ]
        out += `<g class="pf-far" opacity="${night ? 0.4 : 0.8}">`
        spots.forEach(([x, y, r, color], i) => {
            const tone = mix(color, sky.bottom, 0.35)
            const under = mix(tone, '#4a4f63', 0.4)
            const tip = r * (1.1 + hash(id, 'fart', i) * 0.5)
            const lean = (hash(id, 'farl', i) - 0.5) * r * 0.8
            out += `<g class="pf-float" style="--d:-${f(hash(id, 'fard', i) * 9)}s">
                <path d="M${f(x - r)} ${f(y)}L${f(x - r * 0.45)} ${f(y + tip * 0.5)}L${f(x + lean)} ${f(y + tip)}L${f(x + r * 0.5)} ${f(y + tip * 0.42)}L${f(x + r)} ${f(y)}Z" fill="${under}"/>
                <ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(r)}" ry="${f(r * 0.3)}" fill="${tone}"/>
                <path d="M${f(x - r * 0.3)} ${f(y - 1)}l${f(r * 0.22)} ${f(-r * 0.75)}l${f(r * 0.22)} ${f(r * 0.75)}Z" fill="${mix(tone, '#2f5d46', 0.35)}"/>
                <circle cx="${f(x + r * 0.32)} " cy="${f(y - r * 0.32)}" r="${f(r * 0.3)}" fill="${mix(tone, '#2f5d46', 0.25)}"/></g>`
        })
        out += `</g>`
    }

    // Drifting clouds
    const clouds = night ? 2 : 4
    for (let i = 0; i < clouds; i++) {
        const cy = 14 + hash(id, 'cloud', i) * 44
        const s = 0.7 + hash(i, 'cs') * 0.6
        const dur = 70 + hash(i, 'cd') * 60
        const op = night ? 0.18 : 0.85
        out += `<g class="pf-cloud" style="animation-duration:${f(dur)}s;--d:-${f(hash(i, 'cdl') * dur)}s" opacity="${op}">
            <g transform="translate(0 ${f(cy)}) scale(${f(s)})"><ellipse cx="0" cy="0" rx="20" ry="7" fill="#fff"/><ellipse cx="-9" cy="-4" rx="10" ry="7" fill="#fff"/><ellipse cx="7" cy="-6" rx="12" ry="9" fill="#fff"/></g></g>`
    }

    // A sea of cloud far below: the island floats, there is no ground under it
    const cloud = mix('#ffffff', sky.haze, night ? 0.75 : 0.22)
    const full = W + pad * 2
    out += `<g class="pf-cloudsea" opacity="${night ? 0.55 : 0.9}">`
    for (const [row, lift, op] of [[0, 30, 0.45], [1, 15, 0.7], [2, 2, 1]] as const) {
        const n = Math.ceil(full / 46) + 1
        for (let i = 0; i < n; i++) {
            const x = -pad + (i + hash(id, 'sea', row, i) * 0.7 - 0.2) * (full / (n - 1))
            const r = 24 + hash(id, 'sear', row, i) * 20
            // Only the nearest bank of cloud drifts: the rest is far enough away to seem still
            const drift = row === 2 ? ` class="pf-billow" style="--d:-${f(hash(id, 'sead', i) * 14)}s"` : ''
            out += `<ellipse${drift} cx="${f(x)}" cy="${f(L.height - lift + r * 0.32)}" rx="${f(r)}" ry="${f(r * 0.42)}" fill="${cloud}" opacity="${op}"/>`
        }
    }
    out += `</g>`
    return out
}

/** The island's silhouette, shared by its body and by anything that hangs off it. */
interface IslandShape {
    T: Pt2
    R: Pt2
    B: Pt2
    Lf: Pt2
    /** The front edge's height at `u` (0 at the left corner, 0.5 at the front corner, 1 at the right). */
    edgeY: (u: number) => number
    x: (u: number) => number
    /** How thick the earth is under the edge at `u`. */
    earth: (u: number) => number
}
type Pt2 = { x: number; y: number }

function islandShape(L: Layout, seed: string): IslandShape {
    const n = L.size
    const T = { x: L.width / 2, y: L.top }
    const R = { x: L.width / 2 + (n * TW) / 2, y: L.top + (n * TH) / 2 }
    const B = { x: L.width / 2, y: L.top + n * TH }
    const Lf = { x: L.width / 2 - (n * TW) / 2, y: L.top + (n * TH) / 2 }
    return {
        T, R, B, Lf,
        x: (u) => Lf.x + u * n * TW,
        edgeY: (u) => Lf.y + ((n * TH) / 2) * (1 - Math.abs(2 * u - 1)),
        earth: (u) => 10 + 13 * Math.pow(Math.sin(Math.PI * u), 0.6) + (hash(seed, 'earth', Math.round(u * 40)) - 0.5) * 3,
    }
}

/**
 * A chunky floating island: a grassy lip, a layer of earth, and rock that tapers in jagged
 * steps to a point far below. Everything about its outline comes from `seed`, so the same
 * village always floats on the same rock.
 */
function islandBase(L: Layout, pal: BiomePalette, seed: string): string {
    const n = L.size
    const S = islandShape(L, seed)
    const { B, Lf, R, T } = S
    const depth = islandDepth(n)
    const rockL = mix(pal.cliffL, '#7b8794', 0.5)
    const rockR = mix(pal.cliffR, '#4c5563', 0.55)
    const rockDark = mix(rockR, '#1f2430', 0.45)
    const pt = (x: number, y: number) => `${f(x)} ${f(y)}`

    // Rock underside: spikes and notches in turn, deepest a little off centre
    const N = 4 * Math.ceil((n + 3) / 2)
    const peak = 0.4 + hash(seed, 'peak') * 0.2
    const profile = (u: number) => Math.pow(Math.sin(Math.PI * u), 1.15) * (0.72 + 0.28 * Math.exp(-Math.pow((u - peak) / 0.16, 2)))
    const under: (Pt2 & { u: number; spike: boolean })[] = []
    for (let i = 0; i <= N; i++) {
        const spike = i % 2 === 0
        const u = i === 0 || i === N || i === N / 2 ? i / N : (i + (hash(seed, 'ju', i) - 0.5) * 0.5) / N
        const k = spike ? 0.92 + hash(seed, 'sp', i) * 0.2 : 0.5 + hash(seed, 'no', i) * 0.2
        const rock = (depth - 24) * profile(u) * k
        under.push({ u, spike, x: S.x(u), y: S.edgeY(u) + S.earth(u) + rock })
    }
    // Keep the lowest point inside the layout whatever the dice say
    const lowest = Math.max(...under.map((p) => p.y))
    const limit = B.y + depth
    if (lowest > limit) for (const p of under) p.y = S.edgeY(p.u) + (p.y - S.edgeY(p.u)) * ((limit - B.y) / (lowest - B.y))

    const mid = N / 2
    const earthAt = (u: number) => S.edgeY(u) + S.earth(u)
    const earthLine = (from: number, to: number) => {
        const pts: string[] = []
        const step = from < to ? 1 : -1
        for (let i = from; i !== to + step; i += step) pts.push(pt(S.x(i / N), earthAt(i / N) + (i % 2 ? 1.6 : -1)))
        return pts
    }
    const underLine = (from: number, to: number) => {
        const pts: string[] = []
        const step = from < to ? 1 : -1
        for (let i = from; i !== to + step; i += step) pts.push(pt(under[i].x, under[i].y))
        return pts
    }

    let out = ''
    // Small rocks adrift around the island, each with a cap of turf
    const adrift: [number, number, number][] = [
        [0.07, depth * 0.62, 9], [0.93, depth * 0.5, 7], [0.2, depth * 1.02, 5.5], [0.8, depth * 0.95, 8],
    ]
    adrift.slice(0, n >= 5 ? 4 : 2).forEach(([u, drop, r], i) => {
        const x = S.x(u) + (hash(seed, 'ax', i) - 0.5) * 14
        const y = S.edgeY(u) + drop + (hash(seed, 'ay', i) - 0.5) * 10
        out += `<g class="pf-float" style="--d:-${f(hash(seed, 'ad', i) * 9)}s">
            <path d="M${pt(x - r, y)}L${pt(x - r * 0.35, y + r * 0.9)}L${pt(x + r * 0.15, y + r * 1.5)}L${pt(x + r * 0.5, y + r * 0.7)}L${pt(x + r, y)}Z" fill="${rockR}"/>
            <path d="M${pt(x - r, y)}L${pt(x - r * 0.35, y + r * 0.9)}L${pt(x + r * 0.15, y + r * 1.5)}L${pt(x, y)}Z" fill="${rockL}"/>
            <path d="M${pt(x - r, y)}L${pt(x, y - r * 0.36)}L${pt(x + r, y)}L${pt(x, y + r * 0.36)}Z" fill="${pal.tileA}" stroke="${pal.tileEdge}" stroke-width="1"/></g>`
    })

    // Rock, lit on the left face and in shade on the right
    out += `<path d="M${earthLine(0, mid).join('L')}L${underLine(mid, 0).join('L')}Z" fill="${rockL}"/>`
    out += `<path d="M${earthLine(mid, N).join('L')}L${underLine(N, mid).join('L')}Z" fill="${rockR}"/>`
    // Facets: every spike has a lit flank and a crease running up from the notch beside it
    for (let i = 1; i < N; i++) {
        const p = under[i]
        const top = earthAt(p.u)
        if (p.spike) {
            const a = under[i - 1]
            out += `<path d="M${pt(p.x, p.y)}L${pt(a.x, a.y)}L${pt(a.x + (p.x - a.x) * 0.55, top + 2)}Z" fill="#fff" opacity="${i <= mid ? 0.1 : 0.05}"/>`
            const b = under[i + 1]
            out += `<path d="M${pt(p.x, p.y)}L${pt(b.x, b.y)}L${pt(p.x + (b.x - p.x) * 0.45, top + 2)}Z" fill="${rockDark}" opacity="${i < mid ? 0.16 : 0.3}"/>`
        } else {
            out += `<path d="M${pt(p.x, p.y)}L${pt(p.x + (hash(seed, 'cr', i) - 0.5) * 5, top + (p.y - top) * 0.25)}" stroke="${rockDark}" stroke-width="1" opacity=".4" fill="none"/>`
        }
    }

    // Earth over the rock, with strata and a few stones bedded in it
    const earthR = pal.cliffR
    out += `<path d="M${pt(Lf.x, Lf.y)}L${pt(B.x, B.y)}L${earthLine(mid, 0).join('L')}Z" fill="${pal.cliffL}"/>`
    out += `<path d="M${pt(B.x, B.y)}L${pt(R.x, R.y)}L${earthLine(N, mid).join('L')}Z" fill="${earthR}"/>`
    for (const k of [0.45, 0.74]) {
        const pts: string[] = []
        for (let i = 0; i <= N; i++) pts.push(pt(S.x(i / N), S.edgeY(i / N) + S.earth(i / N) * k))
        out += `<polyline points="${pts.join(' ')}" fill="none" stroke="${pal.strata}" stroke-width="1.2" opacity=".5" stroke-dasharray="7 5"/>`
    }
    for (let i = 0; i < n + 2; i++) {
        const u = 0.08 + hash(seed, 'su', i) * 0.84
        const y = S.edgeY(u) + S.earth(u) * (0.5 + hash(seed, 'sy', i) * 0.38)
        const r = 2 + hash(seed, 'sr', i) * 2.4
        out += `<ellipse cx="${f(S.x(u))}" cy="${f(y)}" rx="${f(r * 1.3)}" ry="${f(r * 0.8)}" fill="${u < 0.5 ? rockL : rockR}" stroke="${pal.strata}" stroke-opacity=".5" stroke-width=".6"/>`
    }
    // Roots hang out of the earth; vines trail from the turf
    for (let i = 0; i < n + 1; i++) {
        const u = 0.1 + hash(seed, 'ru', i) * 0.8
        const x = S.x(u)
        const y = earthAt(u) - 1.5
        const len = 7 + hash(seed, 'rl', i) * 13
        const sway = (hash(seed, 'rs', i) - 0.5) * 9
        out += `<path d="M${pt(x, y)}q${f(sway)} ${f(len * 0.5)} ${f(sway * 0.4)} ${f(len)}" stroke="${mix(pal.strata, '#3b2a1c', 0.4)}" stroke-width="${f(0.8 + hash(seed, 'rw', i) * 0.8)}" fill="none" stroke-linecap="round" opacity=".85"/>`
    }

    // The turf: a lip that hangs over the earth in uneven scallops
    const lip = (from: number, to: number, shade: string) => {
        const steps = Math.max(6, Math.round(Math.abs(to - from) * n * 7))
        let d = `M${pt(S.x(from), S.edgeY(from) - 0.5)}L${pt(S.x(to), S.edgeY(to) - 0.5)}`
        for (let i = steps; i > 0; i--) {
            const u0 = from + ((to - from) * i) / steps
            const u1 = from + ((to - from) * (i - 1)) / steps
            const um = (u0 + u1) / 2
            const hang = 3.2 + hash(seed, 'lip', Math.round(um * 500)) * 4.2
            if (i === steps) d += `L${pt(S.x(u0), S.edgeY(u0) + 3)}`
            d += `Q${pt(S.x(um), S.edgeY(um) + hang + 2.6)} ${pt(S.x(u1), S.edgeY(u1) + 3)}`
        }
        return `<path d="${d}Z" fill="${shade}"/>`
    }
    out += lip(0, 0.5, pal.tileEdge) + lip(0.5, 1, mix(pal.tileEdge, '#1d2a1a', 0.16))
    for (let i = 0; i < n; i++) {
        const u = 0.06 + hash(seed, 'vu', i) * 0.88
        const len = 6 + hash(seed, 'vl', i) * 10
        const x = S.x(u)
        const y = S.edgeY(u) + 4
        out += `<path d="M${pt(x, y)}q${f((hash(seed, 'vs', i) - 0.5) * 5)} ${f(len * 0.6)} 0 ${f(len)}" stroke="${mix(pal.tileEdge, '#1d2a1a', 0.2)}" stroke-width="1.1" fill="none" stroke-linecap="round"/><circle cx="${f(x)}" cy="${f(y + len)}" r="1.3" fill="${pal.tileA}"/>`
    }
    // The top, and a bright rim where it catches the light
    out += `<polygon points="${f(T.x)},${f(T.y)} ${f(R.x)},${f(R.y)} ${f(B.x)},${f(B.y)} ${f(Lf.x)},${f(Lf.y)}" fill="${pal.tileA}"/>`
    out += `<polyline points="${f(Lf.x)},${f(Lf.y)} ${f(B.x)},${f(B.y)} ${f(R.x)},${f(R.y)}" fill="none" stroke="${mix(pal.tileA, '#ffffff', 0.25)}" stroke-width="1" stroke-linejoin="round" opacity=".7"/>`
    return out
}

type GroundKind = 'path' | 'water' | 'soil'

/** A tile's four corners and anything between: `u` runs to the lower right, `v` to the lower left (±0.5). */
function tilePoint(cx: number, cy: number, u: number, v: number): string {
    return `${f(cx + (u - v) * (TW / 2))},${f(cy + (u + v) * (TH / 2))}`
}

/** Water joins the water next to it: banks are only drawn against land. */
function waterTile(cx: number, cy: number, sides: Record<TileSide, WaterSide>, x: number, y: number): string {
    const bank = 0.085
    const inset = (side: TileSide) => (sides[side] === 'bank' ? bank : 0)
    const u0 = -0.5 + inset('nw'), u1 = 0.5 - inset('se'), v0 = -0.5 + inset('ne'), v1 = 0.5 - inset('sw')
    const p = (u: number, v: number) => tilePoint(cx, cy, u, v)
    let out = `<g><polygon points="${diamond(cx, cy)}" fill="#2f86c2"/>`
    out += `<polygon points="${p(u0, v0)} ${p(u1, v0)} ${p(u1, v1)} ${p(u0, v1)}" fill="#5bb8ea"/>`
    // A paler shallow along each bank
    const shallow: Record<TileSide, [number, number, number, number]> = {
        nw: [u0, v0, u0, v1], ne: [u0, v0, u1, v0], se: [u1, v0, u1, v1], sw: [u0, v1, u1, v1],
    }
    for (const side of ['nw', 'ne', 'se', 'sw'] as TileSide[]) {
        if (sides[side] !== 'bank') continue
        const [a, b, c, d] = shallow[side]
        out += `<polyline points="${p(a, b)} ${p(c, d)}" fill="none" stroke="#a9defa" stroke-width="1.6" stroke-linecap="round" opacity=".75"/>`
    }
    const d1 = f(-hash(x, y, 'w1') * 2.4)
    const d2 = f(-hash(x, y, 'w2') * 2.4)
    out += `<path class="pf-water" style="--d:${d1}s" d="M${f(cx - 16)} ${f(cy - 2)} q6 -3 12 0 t12 0" stroke="#d6f2ff" stroke-width="1.4" fill="none" stroke-linecap="round"/>
        <path class="pf-water" style="--d:${d2}s" d="M${f(cx - 4)} ${f(cy + 5)} q5 -2.5 10 0 t10 0" stroke="#d6f2ff" stroke-width="1.2" fill="none" stroke-linecap="round"/></g>`
    return out
}

const NO_WATER: Record<TileSide, WaterSide> = { nw: 'bank', ne: 'bank', se: 'bank', sw: 'bank' }

function groundTile(kind: 'grass' | GroundKind, cx: number, cy: number, pal: BiomePalette, x: number, y: number, sides: Record<TileSide, WaterSide> = NO_WATER): string {
    if (kind === 'water') return waterTile(cx, cy, sides, x, y)
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
// Waterfalls and bridges to other islands
// ---------------------------------------------------------------------------

/** The two ends of each side of a tile, in the tile's own (u, v) coordinates. */
const SIDE_ENDS: Record<TileSide, [number, number, number, number]> = {
    nw: [-0.5, 0.5, -0.5, -0.5],
    ne: [-0.5, -0.5, 0.5, -0.5],
    se: [0.5, -0.5, 0.5, 0.5],
    sw: [0.5, 0.5, -0.5, 0.5],
}

/**
 * Water that reaches the island's edge pours over it. On the two front edges the whole fall
 * shows, running down the island's side and thinning to spray; on the back edges it drops out
 * of sight behind the island, so only the foam at the lip and a little mist give it away.
 */
function waterfalls(L: Layout, grid: VillageGrid, id: string): string {
    const depth = islandDepth(L.size)
    let out = ''
    waterEdges(grid).forEach((edge, i) => {
        const { cx, cy } = L.tile(edge.x, edge.y)
        const [ua, va, ub, vb] = SIDE_ENDS[edge.side]
        const at = (t: number) => {
            const u = ua + (ub - ua) * t
            const v = va + (vb - va) * t
            return { x: cx + (u - v) * (TW / 2), y: cy + (u + v) * (TH / 2) }
        }
        // Falls side by side run together: only the ends of a stretch of water are held in
        const [ex, ey] = edge.side === 'nw' || edge.side === 'se' ? [0, 1] : [1, 0]
        const toA = edge.side === 'nw' || edge.side === 'sw' ? 1 : -1
        const ta = isWater(grid, edge.x + ex * toA, edge.y + ey * toA) ? 0 : 0.13
        const tb = isWater(grid, edge.x - ex * toA, edge.y - ey * toA) ? 1 : 0.87
        const a = at(ta)
        const b = at(tb)
        const m = at(0.5)
        const foam = `<path class="pf-water" style="--d:-${f(hash(id, 'foam', i) * 2.4)}s" d="M${f(a.x)} ${f(a.y)}L${f(b.x)} ${f(b.y)}" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" opacity=".9"/>`
        if (!edge.front) {
            const ox = edge.side === 'nw' ? -5 : 5
            out += `<g class="pf-fall-back">${foam}`
            for (let k = 0; k < 2; k++) {
                out += `<circle class="pf-spray" style="--d:-${f(hash(id, 'bs', i, k) * 2.6)}s" cx="${f(m.x + ox + (k - 0.5) * 9)}" cy="${f(m.y - 5 - k * 2)}" r="${f(3.4 + k)}" fill="#ffffff" opacity=".4"/>`
            }
            out += `</g>`
            return
        }
        const fall = depth * (0.66 + hash(id, 'fall', edge.x, edge.y) * 0.22)
        const top = Math.min(a.y, b.y)
        const gid = `${id}-fall${i}`
        // The fall narrows a little on its way down, where it has an end of its own
        const drop = (t: number) => ({ x: at(t).x, y: at(t).y + fall })
        const a2 = drop(ta ? ta + 0.07 : 0)
        const b2 = drop(tb < 1 ? tb - 0.07 : 1)
        out += `<g class="pf-fall"><defs>
            <linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="0" y1="${f(top)}" x2="0" y2="${f(top + fall + 16)}"><stop offset="0" stop-color="#8fd6f7" stop-opacity=".96"/><stop offset=".3" stop-color="#5bb8ea" stop-opacity=".92"/><stop offset=".72" stop-color="#a9defa" stop-opacity=".6"/><stop offset="1" stop-color="#eaf8ff" stop-opacity="0"/></linearGradient>
            <linearGradient id="${gid}s" gradientUnits="userSpaceOnUse" x1="0" y1="${f(top)}" x2="0" y2="${f(top + fall + 16)}"><stop offset="0" stop-color="#ffffff" stop-opacity=".95"/><stop offset=".7" stop-color="#ffffff" stop-opacity=".55"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient></defs>`
        out += `<path d="M${f(a.x)} ${f(a.y)}L${f(b.x)} ${f(b.y)}L${f(b2.x)} ${f(b2.y)}L${f(a2.x)} ${f(a2.y)}Z" fill="url(#${gid})"/>`
        for (let k = 0; k < 4; k++) {
            const t = 0.16 + k * 0.23 + (hash(id, 'st', i, k) - 0.5) * 0.08
            const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
            const q = { x: a2.x + (b2.x - a2.x) * t, y: a2.y + (b2.y - a2.y) * t }
            out += `<path class="pf-falling" style="--d:-${f(hash(id, 'sd', i, k) * 1.2)}s" d="M${f(p.x)} ${f(p.y + 1)}L${f(q.x)} ${f(q.y)}" stroke="url(#${gid}s)" stroke-width="${f(1.1 + hash(id, 'sw', i, k) * 0.8)}" stroke-dasharray="7 9" stroke-linecap="round" fill="none"/>`
        }
        out += foam
        for (let k = 0; k < 3; k++) {
            out += `<circle class="pf-spray" style="--d:-${f(hash(id, 'sp', i, k) * 2.6)}s" cx="${f((a2.x + b2.x) / 2 + (k - 1) * 8)}" cy="${f((a2.y + b2.y) / 2 + 4 + (k % 2) * 4)}" r="${f(5 + hash(id, 'spr', i, k) * 3)}" fill="#ffffff" opacity=".42"/>`
        }
        out += `</g>`
    })
    return out
}

/** A bridge leaving this island toward a neighbouring one. */
export interface SceneLink {
    /** The island edge it leaves from, as seen on screen: 'nw' = upper-left (x = 0), 'ne' = upper-right (y = 0), 'se' = lower-right (x = size-1), 'sw' = lower-left (y = size-1). */
    side: 'nw' | 'ne' | 'se' | 'sw'
    /** 0..1: how much of the bridge is built. 1 = finished and walkable-looking. */
    progress: number
    /** The neighbour's biome, for the little island at the far end. */
    biome: BiomeType
    label?: string
    /** Emitted as `data-link="<key>"` on the group, so the UI can make it clickable. */
    key?: string
}

/** The tree a far island is known by. */
const ISLET_TREE: Record<BiomeType, string> = {
    meadow: 'ancient_oak', sakura_garden: 'sakura', autumn_valley: 'autumn_maple', alpine_frost: 'classic_pine',
    twilight_moss: 'willow', coral_lagoon: 'bamboo', ember_highlands: 'autumn_maple', jade_marsh: 'willow',
}

const LINK_DIR: Record<SceneLink['side'], [number, number]> = { nw: [-1, -1], ne: [1, -1], se: [1, 1], sw: [-1, 1] }

/** A small island of its own, seen across the gap. `(x, y)` is the centre of its top. */
function islet(x: number, y: number, biome: BiomeType, seed: string): string {
    const pal = BIOME_PALETTES[biome] || BIOME_PALETTES.meadow
    const w = 30
    const h = 15
    const rockL = mix(pal.cliffL, '#7b8794', 0.5)
    const rockR = mix(pal.cliffR, '#4c5563', 0.55)
    const tip = 30 + hash(seed, 'tip') * 10
    const lean = (hash(seed, 'lean') - 0.5) * 12
    const p = (dx: number, dy: number) => `${f(x + dx)} ${f(y + dy)}`
    let out = `<path d="M${p(-w, 0)}L${p(-w * 0.62, 13)}L${p(-w * 0.3, 11)}L${p(lean - 4, tip * 0.8)}L${p(lean, tip)}L${p(0, h)}Z" fill="${rockL}"/>`
    out += `<path d="M${p(w, 0)}L${p(w * 0.66, 12)}L${p(w * 0.36, 9)}L${p(lean + 7, tip * 0.62)}L${p(lean, tip)}L${p(0, h)}Z" fill="${rockR}"/>`
    out += `<path d="M${p(-w, 0)}L${p(0, h)}L${p(0, h + 8)}L${p(-w * 0.5, h * 0.5 + 9)}L${p(-w, 5)}Z" fill="${pal.cliffL}"/>`
    out += `<path d="M${p(w, 0)}L${p(0, h)}L${p(0, h + 8)}L${p(w * 0.5, h * 0.5 + 9)}L${p(w, 5)}Z" fill="${pal.cliffR}"/>`
    out += `<path d="M${p(-w, 0)}L${p(0, h)}L${p(w, 0)}L${p(w, 3.4)}Q${p(w * 0.5, h * 0.5 + 6)} ${p(0, h + 3.6)}Q${p(-w * 0.5, h * 0.5 + 6)} ${p(-w, 3.4)}Z" fill="${pal.tileEdge}"/>`
    out += `<path d="M${p(-w, 0)}L${p(0, -h)}L${p(w, 0)}L${p(0, h)}Z" fill="${pal.tileA}" stroke="${mix(pal.tileA, '#ffffff', 0.25)}" stroke-width=".8"/>`
    out += `<path d="M${p(-w * 0.5, 0)}L${p(0, -h * 0.5)}L${p(w * 0.5, 0)}L${p(0, h * 0.5)}Z" fill="${pal.tileB}"/>`
    const tree = SPECIES_SVGS[ISLET_TREE[biome]] || SPECIES_SVGS.classic_pine
    out += placeSprite(SPECIES_SVGS.classic_pine, x + 13, y - 3, 0.3)
    out += placeSprite(tree, x - 5, y + 3, 0.44 * speciesScale(ISLET_TREE[biome]) + 0.02)
    if (DECOR_SVGS.rock) out += placeSprite(DECOR_SVGS.rock, x + 9, y + 7, 0.5, 14, 16)
    return out
}

/**
 * Rope bridges out to the neighbouring islands. A bridge is laid plank by plank from this
 * island's edge; what is still to build shows as a guide rope. Returns the links behind the
 * island (leaving its two back edges) and those in front of it.
 */
function linkLayer(L: Layout, links: SceneLink[], id: string): { back: string; front: string } {
    const n = L.size
    const layers = { back: '', front: '' }
    const perSide = new Map<string, number>()
    for (const link of links) perSide.set(link.side, (perSide.get(link.side) || 0) + 1)
    const seen = new Map<string, number>()
    for (const link of links) {
        const k = seen.get(link.side) || 0
        seen.set(link.side, k + 1)
        // Spread several bridges along the same edge
        const along = (n - 1) * ((k + 1) / ((perSide.get(link.side) || 1) + 1))
        const from =
            link.side === 'nw' ? L.tile(-0.5, along) : link.side === 'ne' ? L.tile(along, -0.5) : link.side === 'se' ? L.tile(n - 0.5, along) : L.tile(along, n - 0.5)
        const [sx, sy] = LINK_DIR[link.side]
        const reach = 3.05
        const M = { x: from.cx, y: from.cy }
        const A = { x: M.x + sx * reach * (TW / 2) + sx * 20, y: M.y + sy * reach * (TH / 2) + sy * 10 }
        const E = { x: A.x - sx * 20, y: A.y - sy * 10 }
        const progress = Math.max(0, Math.min(1, link.progress || 0))
        const sag = 10
        const at = (t: number) => ({ x: M.x + (E.x - M.x) * t, y: M.y + (E.y - M.y) * t + sag * 4 * t * (1 - t) })
        // Planks lie across the bridge, along the island's other axis
        const wx = -sx * 5.6
        const wy = sy * 2.8
        const steps = 16
        const built = Math.round(progress * steps)
        const curve = (t0: number, t1: number, dx: number, dy: number) => {
            const pts: string[] = []
            for (let i = 0; i <= 12; i++) {
                const p = at(t0 + ((t1 - t0) * i) / 12)
                pts.push(`${f(p.x + dx)} ${f(p.y + dy)}`)
            }
            return `M${pts.join('L')}`
        }
        const label = link.label ? (link.label.length > 20 ? link.label.slice(0, 19) + '…' : link.label) : ''
        const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

        let g = `<g class="pf-link${progress >= 1 ? ' pf-link-open' : ''}"${link.key ? ` data-link="${esc(link.key).replace(/"/g, '&quot;')}"` : ''}>`
        g += `<g class="pf-islet"${progress <= 0 ? ' opacity=".82"' : ''}>${islet(A.x, A.y, link.biome, `${id}-${link.side}-${k}`)}</g>`
        // What is still to build: a guide rope across the gap
        if (progress < 1) {
            g += `<path d="${curve(built / steps, 1, 0, 0)}" stroke="#f3e6c8" stroke-width="1.1" stroke-dasharray="3 4" stroke-linecap="round" fill="none" opacity=".85"/>`
        }
        if (built > 0) {
            const t1 = built / steps
            // far hand rope, planks, near hand rope
            const farSign = wy < 0 ? 1 : -1
            const rope = (sign: number) =>
                `<path d="${curve(0, t1, wx * sign, wy * sign - 7)}" stroke="#5b4027" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".5"/><path d="${curve(0, t1, wx * sign, wy * sign - 7)}" stroke="#c9a56a" stroke-width="1.2" fill="none" stroke-linecap="round"/>`
            const hangers = (sign: number) => {
                let s = ''
                for (let i = 0; i <= built; i += 2) {
                    const p = at(i / steps)
                    s += `<path d="M${f(p.x + wx * sign)} ${f(p.y + wy * sign)}v-7" stroke="#8a6a44" stroke-width=".9"/>`
                }
                return s
            }
            g += hangers(farSign) + rope(farSign)
            for (let i = 0; i < built; i++) {
                const p = at((i + 0.5) / steps)
                const d = `M${f(p.x - wx)} ${f(p.y - wy)}L${f(p.x + wx)} ${f(p.y + wy)}`
                g += `<path d="${d}" stroke="#5b4027" stroke-width="5.2" stroke-linecap="round" opacity=".45"/><path d="${d}" stroke="${i % 2 ? '#c8925a' : '#b98250'}" stroke-width="3.8" stroke-linecap="round"/>`
            }
            g += hangers(-farSign) + rope(-farSign)
        }
        // Posts where the bridge is tied off
        const post = (p: { x: number; y: number }) =>
            [-1, 1].map((sign) => `<path d="M${f(p.x + wx * sign)} ${f(p.y + wy * sign + 1)}v-10" stroke="#5b4027" stroke-width="3.6" stroke-linecap="round" opacity=".5"/><path d="M${f(p.x + wx * sign)} ${f(p.y + wy * sign + 1)}v-10" stroke="#a06e40" stroke-width="2.4" stroke-linecap="round"/>`).join('')
        g += post(M)
        if (progress >= 1) g += post(E)
        // Islets behind the island are drawn under it, so a label below one would be covered
        // by whatever stands on the island's back edge: put theirs above the islet, in open sky.
        if (label) g += `<text class="pf-link-label" x="${f(A.x)}" y="${f(sy < 0 ? A.y - 40 : A.y + 50)}" text-anchor="middle">${esc(label)}</text>`
        // One generous target for the pointer: the bridge and the island it leads to
        g += `<path class="pf-link-hit" d="M${f(M.x)} ${f(M.y)}L${f(A.x)} ${f(A.y)}" stroke="transparent" stroke-width="22" stroke-linecap="round" fill="none"/><ellipse class="pf-link-hit" cx="${f(A.x)}" cy="${f(A.y + 6)}" rx="34" ry="30" fill="transparent"/>`
        g += `</g>`
        layers[sy < 0 ? 'back' : 'front'] += g
    }
    return layers
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
    /** The Heart Tree: what hangs on it, a soft aura at its later stages, and today's need while it waits. */
    heart?: { speciesId: string; ornaments: string[]; aura: boolean; need?: CareNeed }
    /** A find waiting to be picked up (its pickup id); clicking it picks it up. */
    pickup?: string
}

/** A villager or animal standing in the scene. `x`/`y` are tile coordinates and may be fractional. */
export interface SceneActor {
    x: number
    y: number
    svg: string
    className: string
    flip?: boolean
    /** Height above the ground, e.g. standing on a bridge's deck. */
    lift?: number
}

export interface SceneOptions {
    size: number
    biome: BiomeType
    items: SceneItem[]
    ground?: Map<string, GroundKind>
    /** What stands where, so water joins up, pours over the island's edge, and bridges line up. */
    grid?: VillageGrid
    /** Bridges out to neighbouring islands. With any, the scene is wider (see sceneViewBox). */
    links?: SceneLink[]
    /** Shapes the rock under the island. The same seed always gives the same island. */
    seed?: string
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
    const links = opts.links || []
    const pad = links.length ? LINK_PAD : 0
    const bridges = linkLayer(L, links, id)
    let svg = `<svg class="pf-scene pf-${sky.phase} pf-mood-${mood}${opts.still ? ' pf-still' : ''} ${opts.className || ''}" style="--t:-${f(clock)}s" viewBox="${sceneViewBox(L, links.length > 0)}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">`
    if (opts.embedCss) svg += `<style>${SCENE_CSS}</style>`
    svg += opts.showSky === false ? `<defs><radialGradient id="${id}-glow"><stop offset="0" stop-color="#ffe9a8" stop-opacity=".85"/><stop offset=".45" stop-color="#ffc56b" stop-opacity=".35"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient></defs>` : skyLayer(L, sky, pal, id, date, pad, links.length === 0)
    const saturate = mood === 'dormant' ? 0.55 : mood === 'sleepy' ? 0.8 : 1
    svg += `<g class="pf-island"${saturate < 1 ? ` style="filter:saturate(${saturate})"` : ''}>${bridges.back}${islandBase(L, pal, opts.seed || `isle${L.size}`)}</g>`

    // Ground tiles + scatter
    svg += `<g class="pf-ground" style="filter:saturate(${saturate})">`
    for (let y = 0; y < L.size; y++) {
        for (let x = 0; x < L.size; x++) {
            const { cx, cy } = L.tile(x, y)
            const kind = ground.get(`${x},${y}`) || 'grass'
            svg += groundTile(kind, cx, cy, pal, x, y, kind === 'water' && opts.grid ? waterSides(opts.grid, x, y) : undefined)
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
    if (opts.grid) svg += waterfalls(L, opts.grid, id)
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
            svg += `<g class="pf-actor ${actor.className}" data-depth="${f(depth)}" transform="translate(${f(cx)} ${f(cy - (actor.lift || 0))})"><g class="pf-actor-body"${actor.flip ? ' transform="scale(-1 1)"' : ''}>${actor.svg}</g></g>`
            continue
        }
        if (!item) continue
        const { cx, cy } = L.tile(item.x, item.y)
        const delay = f(-hash(item.x, item.y, 'sway') * 5)
        const hook = item.pickup
            ? ` data-pickup="${item.pickup}" data-px="${item.x}" data-py="${item.y}"`
            : item.key ? ` data-item="${item.key}" data-x="${item.x}" data-y="${item.y}"` : ''
        svg += `<g class="pf-item${item.pickup ? ' pf-pickup' : ''}${item.heart ? ' pf-heart' : ''}" data-depth="${depth}" style="--d:${delay}s"${hook}>`
        if (item.heart) svg += heartGround(item, cx, cy, id)
        svg += placeSprite(item.svg, cx, cy + 3, item.scale)
        if (item.heart) svg += heartOrnaments(item, cx, cy)
        if (item.level && item.level > 1) {
            svg += `<text x="${f(cx)}" y="${f(cy + 13)}" class="pf-stars" text-anchor="middle">${'★'.repeat(Math.min(5, item.level))}</text>`
        }
        if (item.heart?.need) {
            const care = TREASURE_SVGS[CARE_FOR[item.heart.need]]
            svg += `<g transform="translate(${f(cx)} ${f(cy - 56 * item.scale - 2)})"><g class="pf-ripe pf-need" style="--d:${delay}s"><circle r="6.4" fill="#fffdf6" stroke="#9cbf8a" stroke-width="1"/>${care ? care.replace(/^<svg /, '<svg x="-4.6" y="-4.8" width="9.2" height="9.2" ') : ''}</g></g>`
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
    if (bridges.front) svg += `<g class="pf-links">${bridges.front}</g>`

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
        svg += `<rect class="pf-shade" x="${-pad}" width="${L.width + pad * 2}" height="${L.height}" fill="#0a1030" opacity="${sky.shade}"/>`
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
            const [fore, hind, edge] = BUTTERFLY_COLORS[i]
            const tilt = (hash(i, 'bft') - 0.5) * 24
            // One wing, drawn to the right of the body with its hinge at x = 0; the left
            // wing is the same wing mirrored. Each flaps by folding in towards the body
            // (scaleX about the hinge, see .pf-wing), so the pair never comes apart.
            const wing = `<g class="pf-wing" stroke="${edge}" stroke-width=".25" stroke-linejoin="round"><path d="${HINDWING}" fill="${hind}"/><path d="${FOREWING}" fill="${fore}"/></g>`
            svg += `<g class="pf-butterfly" style="--d:-${f(hash(i, 'bfd') * 8)}s"><g transform="translate(${f(p.cx)} ${f(p.cy - 16)}) rotate(${f(tilt)})">`
                + `${wing}<g transform="scale(-1 1)">${wing}</g>${BUTTERFLY_BODY}</g></g>`
        }
    }
    svg += `</svg>`
    return svg
}

// ---------------------------------------------------------------------------
// The Heart Tree
// ---------------------------------------------------------------------------

/** Where a canopy hangs, in sprite coordinates, so ornaments sit on the tree and not in the air. */
const CANOPY: Record<string, { top: number; bottom: number; half: number }> = {
    classic_pine: { top: 10, bottom: 36, half: 12 },
    ancient_oak: { top: 10, bottom: 34, half: 22 },
    sakura: { top: 10, bottom: 31, half: 20 },
    willow: { top: 12, bottom: 38, half: 20 },
    bamboo: { top: 10, bottom: 40, half: 10 },
    sunflower: { top: 26, bottom: 44, half: 13 },
    lavender: { top: 30, bottom: 46, half: 14 },
    mushroom_circle: { top: 40, bottom: 50, half: 18 },
    bonsai: { top: 22, bottom: 38, half: 18 },
}
const CANOPY_DEFAULT = { top: 12, bottom: 35, half: 18 }

/** Ornament sizes (sprite units) and the spots each kind of mount takes, in turn. */
const MOUNT_SIZE: Record<OrnamentMount, number> = { hang: 13, trunk: 11.5, ground: 15, perch: 13, low: 17 }
function mountSpots(speciesId: string): Record<OrnamentMount, [number, number][]> {
    const c = CANOPY[speciesId] ?? CANOPY_DEFAULT
    const at = (fx: number, fy: number): [number, number] => [32 + fx * c.half, c.top + fy * (c.bottom - c.top)]
    return {
        hang: [at(-0.55, 0.95), at(0.55, 0.9), at(-0.2, 0.75), at(0.3, 1.0), at(0.8, 0.7)],
        trunk: [[30.5, c.bottom + 4], [36, c.bottom - 1]],
        ground: [[12.5, 44.5], [51.5, 45.5]],
        perch: [[32 + c.half * 0.25, c.top - 9]],
        low: [at(0.5, 0.8), at(-0.6, 0.8)],
    }
}

/** A soft ring on the ground under the Heart Tree, and its aura at the later stages. */
function heartGround(item: SceneItem, cx: number, cy: number, id: string): string {
    let out = `<ellipse cx="${f(cx)}" cy="${f(cy + 3)}" rx="${f(19 * item.scale)}" ry="${f(7.5 * item.scale)}" fill="#fff3c4" fill-opacity=".14" stroke="#ffe7a3" stroke-opacity=".6" stroke-width="1" pointer-events="none"/>`
    if (item.heart?.aura) {
        out += `<defs><radialGradient id="${id}-aura"><stop offset="0" stop-color="#fff2b8" stop-opacity=".55"/><stop offset=".6" stop-color="#ffe08a" stop-opacity=".18"/><stop offset="1" stop-color="#ffe08a" stop-opacity="0"/></radialGradient></defs>`
        out += `<circle class="pf-aura" cx="${f(cx)}" cy="${f(cy + 3 - 30 * item.scale)}" r="${f(34 * item.scale)}" fill="url(#${id}-aura)" pointer-events="none"/>`
    }
    return out
}

/** The ornaments hung on the Heart Tree, placed on its canopy, trunk and roots. */
function heartOrnaments(item: SceneItem, cx: number, cy: number): string {
    if (!item.heart?.ornaments.length) return ''
    const spots = mountSpots(item.heart.speciesId)
    const taken: Record<OrnamentMount, number> = { hang: 0, trunk: 0, ground: 0, perch: 0, low: 0 }
    let out = '<g class="pf-ornaments">'
    item.heart.ornaments.forEach((ornament, i) => {
        const mount = getTreasure(ornament)?.mount ?? 'hang'
        const list = spots[mount]
        const [ax, ay] = list[taken[mount]++ % list.length]
        const x = cx - 32 * item.scale + ax * item.scale
        const y = cy + 3 - 56 * item.scale + ay * item.scale
        const art = ornamentAt(ornament, x, y, MOUNT_SIZE[mount] * item.scale)
        // Hanging things turn a little in the breeze, each in its own time
        out += mount === 'hang' || mount === 'low'
            ? `<g class="pf-swing" style="transform-origin:${f(x)}px ${f(y)}px;--d:-${f(hash(ornament, i) * 4)}s">${art}</g>`
            : art
    })
    return out + '</g>'
}

function allTiles(size: number): Tile[] {
    const tiles: Tile[] = []
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) tiles.push({ x, y })
    return tiles
}

// ---------------------------------------------------------------------------
// Villagers and animals
// ---------------------------------------------------------------------------

/**
 * The village's one yardstick is a villager: 22 units from sole to hat at VILLAGER_SCALE.
 * Every `sceneScale` in the catalog is set against it (a scarecrow a head taller, a bench at
 * hip height, a cabin a little under three villagers), so nothing is sized by eye alone.
 */
export const VILLAGER_SCALE = 1
export const VILLAGER_HEIGHT = 22 * VILLAGER_SCALE
const HEN_SCALE = 0.8

/** An actor's sprite with its feet at the origin, ready to be moved with a translate. */
export function actorSprite(kind: 'villager' | 'hen', variant: number): string {
    return kind === 'hen'
        ? placeSprite(HEN_SVGS[variant % HEN_SVGS.length], 0, 0, HEN_SCALE, 11, 12, 12)
        : placeSprite(VILLAGER_SVGS[variant % VILLAGER_SVGS.length], 0, 0, VILLAGER_SCALE, 23, 16, 24)
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
            // On a bridge they stand mid-deck, where VillageLife would have them walk
            const onBridge = kindAt(grid, tile.x, tile.y) === 'bridge'
            actors.push({
                x: tile.x + (onBridge ? 0 : (hash(seed, kind, n, 'ox') - 0.5) * 0.3),
                y: tile.y + (onBridge ? 0 : (hash(seed, kind, n, 'oy') - 0.5) * 0.3),
                lift: onBridge ? bridgeDeckRise(bridgeLayout(grid, tile.x, tile.y).span, 0.5) : 0,
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

/** How tall a species stands next to a tree: flowers shouldn't tower over the oaks. */
export function speciesScale(id: string): number {
    return getSpecies(id)?.sceneScale ?? 1
}

/** A freshly planted tree, and how much each level it is nurtured adds. */
const TREE_SCALE = 1.08
const TREE_LEVEL_STEP = 0.1

/**
 * How large a placed item is drawn (1 = its sprite at tile size). Trees grow with their level
 * and, for the Heart Tree, with its stage; everything else has one size from the catalog.
 */
export function homesteadItemScale(item: Pick<PlacedHomesteadItem, 'itemType' | 'itemId' | 'level'>, heartScale = 1): number {
    if (item.itemType === 'tree') return (TREE_SCALE + TREE_LEVEL_STEP * (Math.max(1, item.level) - 1)) * speciesScale(item.itemId) * heartScale
    return getBuilding(item.itemId)?.sceneScale ?? 1
}

function speciesSprite(id: string): string {
    return SPECIES_SVGS[id] || SPECIES_SVGS.classic_pine
}

export function homesteadItemSprite(item: Pick<PlacedHomesteadItem, 'itemType' | 'itemId'>): string {
    return item.itemType === 'tree' ? speciesSprite(item.itemId) : BUILDING_SVGS[item.itemId] || BUILDING_SVGS.cabin
}

/** A find is a hand-sized thing; its glow keeps it easy to spot. */
const PICKUP_SCALE = 0.85

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
    /** Draw the finds waiting to be picked up (interactive village only). */
    pickups?: boolean
    /** Bridges out to neighbouring islands (see SceneLink). */
    links?: SceneLink[]
    /** Shapes the rock under the island; give each island its own. */
    seed?: string
    /** The island to draw (an `Island.id`); the home village when left out. */
    island?: string | null
}

export function renderVillage(data: GamificationData, opts: VillageRenderOptions = {}): string {
    const { liveActors, pickups, island = null, ...sceneOpts } = opts
    // A scene shows one island. Given the whole game rather than one island's view of it
    // (services/Islands.islandView), only what stands on that island is drawn.
    const g = data.homestead.some((i) => (i.island || null) !== island) ? { ...data, homestead: data.homestead.filter((i) => (i.island || null) === island) } : data
    const ground = new Map<string, GroundKind>()
    const items: SceneItem[] = []
    const heartId = heartTreeItem(g)?.id
    const today = dateKey(opts.date || new Date())
    const grid = buildGrid(g.homestead, g.landSize)
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
            // A bridge points the way the land lies: from bank to bank, in line with its neighbours
            const span = bridgeLayout(grid, item.gridX, item.gridY)
            items.push({ x: item.gridX, y: item.gridY, svg: bridgeSpanSvg(span.axis, span.span), scale: 1, key: item.id })
            continue
        }
        if (item.itemType === 'building' && item.itemId === GARDEN_PLOT_ID) {
            const progress = cropProgress(item)
            ground.set(key, 'soil')
            items.push({ x: item.gridX, y: item.gridY, svg: cropSvg(getCrop(item.cropId).id, progress), scale: 1, key: item.id, ripe: progress >= 1 })
            continue
        }
        const isTree = item.itemType === 'tree'
        const isHeart = isTree && item.id === heartId
        const stage = isHeart ? heartStage(g) : null
        items.push({
            x: item.gridX,
            y: item.gridY,
            svg: homesteadItemSprite(item),
            scale: homesteadItemScale(item, stage?.scale ?? 1),
            key: item.id,
            level: isTree ? undefined : item.level,
            light: LIGHT_SOURCES[item.itemId],
            ...(stage && g.heartTree
                ? {
                      heart: {
                          speciesId: item.itemId,
                          ornaments: g.heartTree.hung,
                          aura: stage.aura,
                          ...(pickups && !tendedToday(g, today) ? { need: heartNeed(today) } : {}),
                      },
                  }
                : {}),
        })
    }
    if (pickups) {
        for (const spot of pickupSpots(g)) {
            items.push({ x: spot.x, y: spot.y, svg: pickupSvg(spot.pickup.itemId), scale: PICKUP_SCALE, pickup: spot.pickup.id })
        }
    }

    const seed = opts.idPrefix || 'pf'
    return renderIsoScene({
        size: g.landSize,
        biome: g.activeBiome,
        items,
        ground,
        grid,
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
        scale: (t.status === 'withered' ? 0.85 : t.status === 'young' ? 0.7 : 0.8 + Math.min(0.35, t.durationMinutes / 150)) * speciesScale(t.speciesId),
        key: t.id,
        light: t.status === 'mature' ? LIGHT_SOURCES[t.speciesId] : undefined,
    }))
    return renderIsoScene({ size, biome, items, vitality: 80, interactive: false, ...opts, className: 'pf-grove' })
}
