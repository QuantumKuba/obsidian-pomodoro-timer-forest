/**
 * The archipelago seen from far above: the home village in the middle, every sighted island
 * on its arm, and the bridges between them, laid plank by plank as the focus comes in.
 *
 * A pure SVG string like the village scene. Islands carry `data-island` (an island id, or
 * `home`) for event delegation.
 */
import type { BiomeType, GamificationData, Island } from '../types/forest'
import { BIOME_PALETTES, skyFor, type BiomePalette } from './VillageScene'
import {
    bridgeProgress,
    islandLandSize,
    islandMapPosition,
    islandName,
    islandParent,
    isReached,
    itemsOn,
    masteryTitle,
} from '../services/Islands'

const SPACING = 132
const f = (n: number) => Math.round(n * 10) / 10

/** Canopy colours that read as each biome from a distance. */
const CANOPY: Record<BiomeType, [string, string]> = {
    meadow: ['#4f9a48', '#3c7f3b'],
    sakura_garden: ['#f4a9c6', '#e283ab'],
    autumn_valley: ['#e8843a', '#c9562c'],
    alpine_frost: ['#3f7a63', '#2f5f52'],
    twilight_moss: ['#57d6d2', '#3a9fb0'],
    coral_lagoon: ['#58b46a', '#ff8f7a'],
    ember_highlands: ['#d9603a', '#8c3a2c'],
    jade_marsh: ['#2f8f73', '#57b592'],
}

function hash(...n: (number | string)[]): number {
    let h = 2166136261
    const s = n.join('|')
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i)
        h = Math.imul(h, 16777619)
    }
    h ^= h >>> 16
    h = Math.imul(h, 0x85ebca6b)
    h ^= h >>> 13
    return ((h >>> 0) % 10000) / 10000
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

interface Mini {
    cx: number
    cy: number
    /** Width of the grass top; its height is half of that. */
    w: number
    pal: BiomePalette
    biome: BiomeType
    trees: number
    seed: string
    home?: boolean
}

/** A small floating island: grass top, earth, and rock tapering away underneath. */
function miniIsland({ cx, cy, w, pal, biome, trees, seed, home }: Mini): string {
    const h = w / 2
    const d = w * 0.2
    const L = [cx - w / 2, cy], R = [cx + w / 2, cy], B = [cx, cy + h / 2], T = [cx, cy - h / 2]
    const tip = [cx + w * (hash(seed, 'tip') - 0.5) * 0.16, cy + h / 2 + d * 2.3]
    const lm = [cx - w * 0.31, cy + d * 1.25], rm = [cx + w * 0.3, cy + d * 1.15]
    const pts = (...p: number[][]) => p.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')
    let out = `<ellipse cx="${f(cx)}" cy="${f(tip[1] + 9)}" rx="${f(w * 0.3)}" ry="${f(w * 0.045)}" fill="#0b1b33" opacity=".13"/>`
    // rock underside, then the earth band over it
    out += `<polygon points="${pts(L, B, tip, lm)}" fill="${pal.strata}"/><polygon points="${pts(B, R, rm, tip)}" fill="${pal.strata}" opacity=".82"/>`
    out += `<polygon points="${pts(L, B, [B[0], B[1] + d], [L[0] + w * 0.07, L[1] + d * 0.8])}" fill="${pal.cliffL}"/>`
    out += `<polygon points="${pts(B, R, [R[0] - w * 0.07, R[1] + d * 0.8], [B[0], B[1] + d])}" fill="${pal.cliffR}"/>`
    out += `<polyline points="${pts(L, B, R)}" fill="none" stroke="${pal.tileEdge}" stroke-width="${f(w * 0.045)}" stroke-linejoin="round"/>`
    out += `<polygon points="${pts(T, R, B, L)}" fill="${pal.tileA}"/>`
    out += `<polygon points="${pts([cx, cy - h * 0.22], [cx + w * 0.22, cy], [cx, cy + h * 0.22], [cx - w * 0.22, cy])}" fill="${pal.tileB}" opacity=".7"/>`

    // a few trees, back to front
    const [c1, c2] = CANOPY[biome]
    const spots: [number, number][] = []
    for (let i = 0; i < trees; i++) {
        const u = hash(seed, 'tu', i) - 0.5, v = hash(seed, 'tv', i) - 0.5
        spots.push([cx + (u - v) * w * 0.52, cy + (u + v) * h * 0.52])
    }
    spots.sort((a, b) => a[1] - b[1])
    const s = w / 70
    spots.forEach(([x, y], i) => {
        const tall = 7.5 + hash(seed, 'th', i) * 4
        out += `<rect x="${f(x - 0.8 * s)}" y="${f(y - tall * s * 0.5)}" width="${f(1.6 * s)}" height="${f(tall * s * 0.5)}" fill="#6b4a32"/>`
        out += biome === 'alpine_frost' || hash(seed, 'tk', i) < 0.3
            ? `<polygon points="${f(x)},${f(y - tall * s * 1.25)} ${f(x + 3.4 * s)},${f(y - tall * s * 0.3)} ${f(x - 3.4 * s)},${f(y - tall * s * 0.3)}" fill="${i % 2 ? c2 : c1}"/>`
            : `<circle cx="${f(x)}" cy="${f(y - tall * s * 0.72)}" r="${f(3.6 * s)}" fill="${i % 2 ? c2 : c1}"/><circle cx="${f(x - 1.1 * s)}" cy="${f(y - tall * s * 0.84)}" r="${f(1.5 * s)}" fill="#fff" opacity=".22"/>`
    })
    if (home) {
        // the village: a cabin with a lit window
        const x = cx + w * 0.04, y = cy + h * 0.04
        out += `<polygon points="${f(x - 7 * s)},${f(y)} ${f(x + 7 * s)},${f(y)} ${f(x + 7 * s)},${f(y - 7 * s)} ${f(x - 7 * s)},${f(y - 7 * s)}" fill="#c9a37a"/>`
        out += `<polygon points="${f(x - 9 * s)},${f(y - 6.5 * s)} ${f(x)},${f(y - 14 * s)} ${f(x + 9 * s)},${f(y - 6.5 * s)}" fill="#b5473a"/>`
        out += `<rect x="${f(x - 1.6 * s)}" y="${f(y - 5 * s)}" width="${f(3.2 * s)}" height="${f(3.2 * s)}" fill="#ffe08a"/>`
    }
    return out
}

/** The planks and ropes between two islands; `ratio` of it is built, the rest is only marked out. */
function bridge(ax: number, ay: number, bx: number, by: number, ratio: number, planned: boolean): string {
    const dx = bx - ax, dy = by - ay
    const len = Math.hypot(dx, dy)
    const nx = -dy / len, ny = dx / len
    const sag = (t: number) => Math.sin(Math.PI * t) * len * 0.05
    const at = (t: number): [number, number] => [ax + dx * t, ay + dy * t + sag(t)]
    let out = ''
    if (ratio < 1) {
        const [x0, y0] = at(ratio), [x1, y1] = at(1)
        const [mx, my] = at((ratio + 1) / 2)
        out += `<path d="M${f(x0)} ${f(y0)}Q${f(mx)} ${f(my + 1)} ${f(x1)} ${f(y1)}" fill="none" stroke="#fff" stroke-opacity="${planned ? 0.55 : 0.28}" stroke-width="1.3" stroke-dasharray="2 5" stroke-linecap="round"/>`
    }
    if (ratio <= 0) return out
    const steps = Math.max(2, Math.round((len * ratio) / 5.5))
    let ropeA = '', ropeB = ''
    for (let i = 0; i <= steps; i++) {
        const [x, y] = at((ratio * i) / steps)
        ropeA += `${i ? 'L' : 'M'}${f(x + nx * 4)} ${f(y + ny * 4 - 3)}`
        ropeB += `${i ? 'L' : 'M'}${f(x - nx * 4)} ${f(y - ny * 4 - 3)}`
        out += `<path d="M${f(x + nx * 3.6)} ${f(y + ny * 3.6)}L${f(x - nx * 3.6)} ${f(y - ny * 3.6)}" stroke="${i % 2 ? '#b98a56' : '#a67845'}" stroke-width="3.1" stroke-linecap="round"/>`
    }
    out += `<path d="${ropeB}" fill="none" stroke="#6d4a2c" stroke-width="1"/><path d="${ropeA}" fill="none" stroke="#6d4a2c" stroke-width="1"/>`
    return out
}

export interface ArchipelagoOptions {
    /** An island id, or `home`. */
    selected?: string | null
    date?: Date
    idPrefix?: string
    className?: string
}

export function renderArchipelago(g: GamificationData, opts: ArchipelagoOptions = {}): string {
    const id = opts.idPrefix || 'pfa'
    const sky = skyFor(opts.date || new Date())
    const islands = g.islands || []
    const place = (index: number) => {
        const p = islandMapPosition(index)
        return { x: p.x * SPACING, y: p.y * SPACING }
    }
    const widthOf = (island: Island | null) => (island ? 54 + (islandLandSize(island.level) - 4) * 5 : 70 + (g.landSize - 5) * 5)

    // The four nearest slots are always in frame, so the map does not jump when the first island appears
    const xs = [-SPACING, SPACING, ...islands.map((i) => place(i.index).x)]
    const ys = [-SPACING / 2, SPACING / 2, ...islands.map((i) => place(i.index).y)]
    const minX = Math.min(...xs) - 74, maxX = Math.max(...xs) + 74
    const minY = Math.min(...ys) - 56, maxY = Math.max(...ys) + 92
    const W = maxX - minX, H = maxY - minY

    let svg = `<svg class="pf-archipelago ${opts.className || ''}" viewBox="${f(minX)} ${f(minY)} ${f(W)} ${f(H)}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">`
    svg += `<defs><linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky.top}"/><stop offset="1" stop-color="${sky.bottom}"/></linearGradient>
        <radialGradient id="${id}-fog"><stop offset="0" stop-color="#fff" stop-opacity=".8"/><stop offset=".6" stop-color="#fff" stop-opacity=".28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>`
    svg += `<rect x="${f(minX)}" y="${f(minY)}" width="${f(W)}" height="${f(H)}" fill="url(#${id}-sky)"/>`
    // a sea of clouds far below
    const night = sky.phase === 'night'
    for (let i = 0; i < 9; i++) {
        const cx = minX + hash(id, 'cx', i) * W, cy = minY + H * (0.2 + hash(id, 'cy', i) * 0.8)
        const rx = 60 + hash(id, 'cr', i) * 90
        svg += `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(rx * 0.16)}" fill="#fff" opacity="${night ? 0.05 : 0.2}"/>`
    }

    // Bridges first, so the islands sit on their ends
    for (const island of islands) {
        const parentIndex = islandParent(island.index)
        const a = place(parentIndex), b = place(island.index)
        const dx = b.x - a.x, dy = b.y - a.y
        const len = Math.hypot(dx, dy)
        const parent = islands.find((i) => i.index === parentIndex) || null
        const ra = widthOf(parent) * 0.42, rb = widthOf(island) * 0.42
        const { ratio } = bridgeProgress(island)
        svg += `<g class="pf-map-bridge">${bridge(a.x + (dx / len) * ra, a.y + (dy / len) * ra * 0.9, b.x - (dx / len) * rb, b.y - (dy / len) * rb * 0.9, ratio, !!island.focus)}</g>`
    }

    const label = (x: number, y: number, title: string, sub: string, dim: boolean) =>
        `<text x="${f(x)}" y="${f(y)}" class="pf-map-name" text-anchor="middle" opacity="${dim ? 0.8 : 1}">${esc(title)}</text>` +
        (sub ? `<text x="${f(x)}" y="${f(y)}" dy="1.4em" class="pf-map-sub" text-anchor="middle">${esc(sub)}</text>` : '')
    const ring = (x: number, y: number, w: number) =>
        `<ellipse class="pf-map-ring" cx="${f(x)}" cy="${f(y)}" rx="${f(w * 0.66)}" ry="${f(w * 0.36)}" fill="none" stroke="#fff" stroke-width="1.6" stroke-dasharray="5 4"/>`

    // Back to front
    const drawn: { y: number; markup: string }[] = []
    {
        const w = widthOf(null)
        const pal = BIOME_PALETTES[g.activeBiome] || BIOME_PALETTES.meadow
        let m = `<g class="pf-map-isle pf-map-home${opts.selected === 'home' ? ' is-selected' : ''}" data-island="home">`
        if (opts.selected === 'home') m += ring(0, 0, w)
        m += miniIsland({ cx: 0, cy: 0, w, pal, biome: g.activeBiome, trees: Math.min(5, 2 + Math.floor(itemsOn(g, null).length / 6)), seed: 'home', home: true })
        m += label(0, w * 0.5 + 34, 'Home', '', false) + `</g>`
        drawn.push({ y: 0, markup: m })
    }
    for (const island of islands) {
        const { x, y } = place(island.index)
        const w = widthOf(island)
        const pal = BIOME_PALETTES[island.biome] || BIOME_PALETTES.meadow
        const reached = isReached(island)
        const selected = opts.selected === island.id
        const b = bridgeProgress(island)
        let m = `<g class="pf-map-isle${reached ? '' : ' pf-map-far'}${selected ? ' is-selected' : ''}" data-island="${island.id}">`
        if (selected) m += ring(x, y, w)
        m += `<g${reached ? '' : ` opacity="${island.focus ? 0.82 : 0.6}"`}>${miniIsland({ cx: x, cy: y, w, pal, biome: island.biome, trees: reached ? Math.min(6, 1 + Math.floor(itemsOn(g, island.id).length / 3) + Math.min(2, island.level)) : 1, seed: island.id })}</g>`
        if (!reached) {
            // not reached yet: it lies in haze, more so while it has no meaning
            m += `<ellipse cx="${f(x)}" cy="${f(y + 6)}" rx="${f(w * 0.75)}" ry="${f(w * 0.3)}" fill="url(#${id}-fog)" opacity="${island.focus ? 0.5 : 0.95}"/>`
            if (!island.focus) m += `<g class="pf-map-mark"><circle cx="${f(x)}" cy="${f(y - 16)}" r="8.5" fill="#fffdf6" stroke="#e39b2d" stroke-width="1.2"/><text x="${f(x)}" y="${f(y - 12)}" text-anchor="middle" class="pf-map-q">?</text></g>`
        }
        const sub = reached ? `${masteryTitle(island.level)} · ${island.level}` : island.focus ? `${Math.floor(b.laid)}/${b.target} min` : 'Tap to chart it'
        m += label(x, y + w * 0.5 + 30, islandName(island), sub, !reached) + `</g>`
        drawn.push({ y, markup: m })
    }
    drawn.sort((a, b) => a.y - b.y)
    svg += drawn.map((d) => d.markup).join('')
    if (night) svg += `<rect x="${f(minX)}" y="${f(minY)}" width="${f(W)}" height="${f(H)}" fill="#0a1030" opacity=".22" pointer-events="none"/>`
    return svg + `</svg>`
}

/** One small island on its own, for reward cards (64×64). */
export function islandIconSvg(biome: BiomeType): string {
    const pal = BIOME_PALETTES[biome] || BIOME_PALETTES.meadow
    return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">${miniIsland({ cx: 32, cy: 26, w: 50, pal, biome, trees: 3, seed: `icon-${biome}` })}</svg>`
}
