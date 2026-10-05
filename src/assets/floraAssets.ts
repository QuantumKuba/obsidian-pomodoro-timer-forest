// Cozy flat-vector art for the Forest & Homestead game.
// Style: 2–3 tone shading lit from the top-left, soft highlights and a subtle warm ink outline.
// Every 64x64 sprite has its ground contact at (32,56) and a soft shadow ellipse there.
// Gradient ids are prefixed `pf-<assetkey>-<n>` so inlined copies never collide between assets.

// ───────────────────────── shared helpers ─────────────────────────
type Pal = [string, string, string] // [shade, base, highlight]
type Blob = [number, number, number, number?] // cx, cy, r, highlight?

const INK = '#2b2118'
const OL = ` stroke="${INK}" stroke-opacity=".35" stroke-width=".9"`
const r1 = (n: number) => Math.round(n * 10) / 10
// round caps/joins are inherited from the root group so individual paths stay short
const svg = (b: string) =>
    `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><g stroke-linecap="round" stroke-linejoin="round">${b}</g></svg>`
const shadow = (rx = 18, ry = 4.5, op = 0.28) => `<ellipse cx="32" cy="56" rx="${rx}" ry="${ry}" fill="#1a140e" opacity="${op}"/>`
const sway = (b: string) => `<g class="pf-sway" style="transform-origin:32px 56px">${b}</g>`
const P = (d: string, fill: string, ol = true, extra = '') => `<path d="${d}" fill="${fill}"${ol ? OL : ''}${extra}/>`
const C = (x: number, y: number, r: number, fill: string, extra = '') =>
    `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(r)}" fill="${fill}"${extra}/>`
const E = (x: number, y: number, rx: number, ry: number, fill: string, extra = '') =>
    `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(rx)}" ry="${r1(ry)}" fill="${fill}"${extra}/>`
const LN = (d: string, color: string, w: number, extra = '') =>
    `<path d="${d}" stroke="${color}" stroke-width="${w}"${extra}/>`
/** A stroked line with the ink outline drawn underneath. */
const OLN = (d: string, color: string, w: number) => LN(d, INK, w + 1.8, ' stroke-opacity=".35"') + LN(d, color, w)
const twinkle = (x: number, y: number, s: number, fill: string, delay: number) =>
    `<path class="pf-twinkle" style="animation-delay:${delay}s;transform-box:fill-box;transform-origin:center" d="M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z" fill="${fill}"/>`

/** Lumpy foliage: an ink silhouette of the union, then per-lump 2–3 tone shading (back → front). */
function blobs(list: Blob[], pal: Pal, outline = true): string {
    let o = outline
        ? `<g fill="${INK}" stroke="${INK}" stroke-width="1.8" opacity=".35">${list.map(([x, y, r]) => C(x, y, r, INK)).join('')}</g>`
        : ''
    for (const [x, y, r, h] of list) {
        o += C(x, y, r, pal[0]) + C(x - 0.1 * r, y - 0.13 * r, 0.8 * r, pal[1])
        if (h) o += C(x - 0.3 * r, y - 0.35 * r, 0.36 * r, pal[2])
    }
    return o
}

/** Tapered trunk from `top` down to the ground with a root flare. */
function trunk(x0: number, x1: number, top: number, pal: Pal = BARK, flare = 3): string {
    const m = r1(x0 + (x1 - x0) * 0.42)
    return (
        P(`M${x0} ${top}L${x1} ${top}Q${x1} 51 ${x1 + flare} 56.5L${x0 - flare} 56.5Q${x0} 51 ${x0} ${top}Z`, pal[1]) +
        P(`M${x0 + 0.4} ${top}L${m} ${top}Q${m} 51 ${r1(m - 1)} 56.2L${x0 - flare + 0.8} 56.2Q${x0 + 0.4} 51 ${x0 + 0.4} ${top}Z`, pal[2], false) +
        P(`M${x1 - 1.2} ${top}L${x1} ${top}Q${x1} 51 ${x1 + flare} 56.5L${x1 + flare - 1.8} 56.5Q${x1 - 1.2} 51 ${x1 - 1.2} ${top}Z`, pal[0], false)
    )
}

/** One conifer tier with a scalloped hem, lit on the left. */
function tier(top: number, b: number, w: number, pal: Pal, cx = 32): string {
    const L = r1(cx - w), R = r1(cx + w), cy = r1(top + (b - top) * 0.6)
    const q = (k: number) => r1(cx + w * k)
    const full = `M${cx} ${top}Q${q(0.3)} ${cy} ${R} ${b}Q${q(0.66)} ${b + 3} ${q(0.33)} ${b + 0.8}Q${cx} ${b + 3.4} ${q(-0.33)} ${b + 0.8}Q${q(-0.66)} ${b + 3} ${L} ${b}Q${q(-0.3)} ${cy} ${cx} ${top}Z`
    const lit = `M${cx} ${top}Q${q(-0.3)} ${cy} ${L} ${b}Q${q(-0.66)} ${b + 3} ${q(-0.33)} ${b + 0.8}Q${cx - 1} ${b + 2.4} ${cx + 1.5} ${b + 0.5}Q${cx + 0.8} ${cy} ${cx} ${top}Z`
    const hl = `M${cx - 0.4} ${top + 2.5}Q${q(-0.3)} ${cy} ${r1(L + 2.6)} ${b - 0.4}Q${q(-0.4)} ${b - 1.2} ${q(-0.22)} ${b - 1}Q${q(-0.1)} ${cy} ${cx - 0.4} ${top + 2.5}Z`
    return P(full, pal[0]) + P(lit, pal[1], false) + P(hl, pal[2], false)
}

/** Lanceolate leaf in local coords, rotated/placed. */
const leaf = (x: number, y: number, a: number, len: number, wid: number, fill: string, rib?: string) =>
    `<g transform="translate(${x} ${y}) rotate(${a})">${P(`M0 0Q${r1(len * 0.45)} ${-wid} ${len} 0Q${r1(len * 0.5)} ${r1(wid * 0.7)} 0 0Z`, fill)}${rib ? LN(`M0.8 0L${r1(len * 0.75)} 0`, rib, 0.5) : ''}</g>`

function starPath(cx: number, cy: number, n: number, R: number, r: number, rot = 0): string {
    const pts: string[] = []
    for (let i = 0; i < n * 2; i++) {
        const a = rot + (i * Math.PI) / n - Math.PI / 2
        const rad = i % 2 ? r : R
        pts.push(`${r1(cx + rad * Math.cos(a))} ${r1(cy + rad * Math.sin(a))}`)
    }
    return 'M' + pts.join('L') + 'Z'
}

// palettes
const BARK: Pal = ['#5a3a24', '#7a5234', '#9c6c44']
const GREEN: Pal = ['#2f6b3a', '#4f9a4a', '#8cc867']
const PINE: Pal = ['#1d5236', '#2f7a47', '#5fa860']
const SAKURA: Pal = ['#d4739a', '#f3a9c4', '#ffdbe8']
const GOLD: Pal = ['#c98f10', '#f0c232', '#fff0a0']
const WILLOW: Pal = ['#4a7c34', '#79a948', '#b0d672']
const MAPLE_TOP: Pal = ['#df7426', '#f5a13a', '#ffd36e']
const MAPLE_MID: Pal = ['#c84d22', '#ea762d', '#f8a948']
const MAPLE_LOW: Pal = ['#962a1b', '#c6412a', '#e8693a']
const SOIL: Pal = ['#5e3f27', '#7a5234', '#9c6c44']

/** Soil mound used by the early growth stages. */
function mound(): string {
    return (
        P('M13 56.5Q15 47.5 32 46.5Q49 47.5 51 56.5Q32 59 13 56.5Z', SOIL[1]) +
        P('M17 52.5Q21 48.4 32 48Q41 48.2 45 50.5Q34 49.6 17 53.5Z', SOIL[2], false) +
        P('M47.5 51.5Q50 53.5 50.6 56.2Q44 57.6 38 58Q45 55.5 47.5 51.5Z', SOIL[0], false) +
        C(21, 54, 0.9, SOIL[0]) + C(38, 53.3, 0.8, SOIL[0]) + C(28, 55.4, 0.7, SOIL[0]) + C(43, 55, 0.6, SOIL[2])
    )
}

// ───────────────────────── generic growth stages ─────────────────────────
function seedArt(seed: [string, string] = ['#b8864a', '#e3b979'], shoot = '#6fbf4a'): string {
    return (
        shadow(19, 4.2) + mound() +
        P('M28.5 49Q28 44.5 32 43.5Q36.2 44.5 35.5 49Q32 51 28.5 49Z', seed[0]) +
        P('M29.6 47.6Q29.6 45 32 44.6Q33 45.4 31.6 48.6Q30.4 49 29.6 47.6Z', seed[1], false) +
        sway(OLN('M32.3 44Q32.6 40.5 35.2 39.5', shoot, 1.5) + leaf(35, 39.6, -30, 4.5, 1.8, shoot))
    )
}

function sproutArt(pal: Pal = GREEN): string {
    return (
        shadow(17, 4) + mound() +
        sway(
            OLN('M32 48.5Q31.4 42 32.4 34', pal[0], 1.8) +
            leaf(31.6, 41, 200, 10, 3.8, pal[1], pal[0]) +
            leaf(32.2, 37.5, -25, 11, 4.2, pal[1], pal[0]) +
            leaf(32.4, 34.2, -95, 5.5, 2.4, pal[2])
        )
    )
}

function saplingArt(pal: Pal = GREEN): string {
    return (
        shadow(17, 4) + mound() +
        sway(
            OLN('M32 49Q31.2 41 32.5 33M32 40Q28 37.5 26 34M32.3 37Q36 34 38 31', BARK[1], 2.2) +
            blobs([[31.5, 18.5, 7.5, 1], [23.5, 25, 6.5, 1], [40, 24, 7], [29, 30, 6.5, 1], [37.5, 31, 5.5]], pal)
        )
    )
}

const WITHERED = svg(
    shadow(18, 4.5) +
    E(32, 55.5, 15, 3.4, '#8f7f6b', ' opacity=".55"') +
    LN('M22 55.4L26 54.6M36 55.8L41 55', '#6b5b4b', 0.7, ' opacity=".6"') +
    OLN('M29 40Q23 36 19.5 29.5M21.5 33Q18 32.5 16 30M35 42Q40 38.5 44.5 36.5M41 38Q43 34.5 42.8 32', '#6e5f52', 2) +
    P('M25.5 56.5Q28.4 49 28.4 38L27.6 31.5L30 33.6L31.2 28.6L33.2 32.6L35.6 29.8L36 36Q35.6 49 39.5 56.5Z', '#7b6b5d') +
    P('M26.8 56.2Q29.8 49 29.8 38L29.4 33.6L30.4 35L30.6 40Q30.6 50 29.2 56.2Z', '#9a8a7a', false) +
    P('M34.6 36Q34.4 49 37.8 56.4L39.5 56.5Q35.6 49 36 36Z', '#5f5146', false) +
    LN('M31.5 42Q32.4 46 31.6 50M33.6 38Q34 41 33.4 43', '#5f5146', 0.7) +
    E(32, 30.9, 2.6, 1, '#b3a390') +
    P('M42 53.8Q45 50.8 49 52.4Q46.5 55.6 42 53.8Z', '#a8743e') + LN('M42.6 53.6L47.6 52.6', '#7d5530', 0.5) +
    P('M17 55.4Q18.4 53 21.5 53.8Q20 56.2 17 55.4Z', '#9a7a4e') +
    P('M44 36.2Q46 36.5 46.4 39Q44.3 38.7 44 36.2Z', '#a07a48')
)

export const GROWTH_STAGE_SVGS: Record<string, string> & { seed: string; sprout: string; sapling: string; withered: string } = {
    seed: svg(seedArt()),
    sprout: svg(sproutArt()),
    sapling: svg(saplingArt()),
    withered: WITHERED,
}

// ───────────────────────── species ─────────────────────────
function lavenderSpike(bx: number, tx: number, ty: number, n = 6): string {
    let s = LN(`M${bx} 54Q${bx} ${r1((54 + ty) / 2 + 4)} ${tx} ${ty + 2 * n - 1}`, '#6e8f55', 1)
    s += LN(`M${tx} ${ty + 0.6}L${tx} ${ty + 2 * n - 1}`, INK, 4.6, ' stroke-opacity=".3"')
    for (let k = 0; k < n; k++) {
        const x = tx + (k % 2 ? 0.8 : -0.8) * Math.min(1, 0.4 + k / n)
        s += E(x, ty + k * 2 + 0.6, 1.3 + k * 0.08, 1.7, k === 0 ? '#c9b4f2' : k % 2 ? '#6d4fa8' : '#9476d0')
    }
    return s
}

function sunflowerHead(x: number, y: number, R: number): string {
    return (
        P(starPath(x, y, 12, R, R * 0.6, Math.PI / 12), '#e0921c') +
        P(starPath(x, y, 12, R * 0.9, R * 0.5), '#ffc928', false, ' stroke="#ffc928" stroke-width=".8" stroke-linejoin="round"') +
        P(starPath(x - R * 0.12, y - R * 0.14, 6, R * 0.6, R * 0.35), '#ffe27a', false, ' opacity=".7"') +
        C(x, y, R * 0.46, '#5a331a', OL) +
        C(x - R * 0.06, y - R * 0.08, R * 0.34, '#7a4a24') +
        C(x - R * 0.15, y - R * 0.18, R * 0.12, '#a8723e')
    )
}

function bambooCulm(x: number, top: number, w: number, dark = false): string {
    const h = 56.5 - top
    const pal = dark ? ['#4c7f33', '#6a9f45', '#98c872'] : ['#5a8f3a', '#82b851', '#bde28c']
    let s = `<rect x="${r1(x - w / 2)}" y="${top}" width="${w}" height="${r1(h)}" rx="${r1(w / 2)}" fill="${pal[1]}"${OL}/>`
    s += `<rect x="${r1(x + w / 2 - 1.5)}" y="${top + 1}" width="1.2" height="${r1(h - 1.5)}" fill="${pal[0]}"/>`
    s += `<rect x="${r1(x - w / 2 + 0.9)}" y="${top + 1.5}" width="1" height="${r1(h - 2)}" rx=".5" fill="${pal[2]}"/>`
    for (let y = top + 8; y < 54; y += 8.5) {
        s += `<rect x="${r1(x - w / 2 - 0.4)}" y="${r1(y)}" width="${r1(w + 0.8)}" height="1.4" rx=".7" fill="#40692b"/>`
        s += LN(`M${r1(x - w / 2 + 0.8)} ${r1(y - 0.6)}L${r1(x + w / 2 - 0.8)} ${r1(y - 0.6)}`, pal[2], 0.6)
    }
    return s
}

function mushroom(x: number, y: number, s: number, cap: Pal, glow = false): string {
    const f = (n: number) => r1(n * s)
    return (
        P(`M${r1(x - f(1.3))} ${y}Q${r1(x - f(1.5))} ${r1(y - f(3))} ${r1(x - f(0.9))} ${r1(y - f(4.4))}L${r1(x + f(0.9))} ${r1(y - f(4.4))}Q${r1(x + f(1.5))} ${r1(y - f(3))} ${r1(x + f(1.3))} ${y}Q${x} ${r1(y + f(0.6))} ${r1(x - f(1.3))} ${y}Z`, '#f1e2c6') +
        P(`M${r1(x - f(3.8))} ${r1(y - f(3.8))}Q${r1(x - f(3.6))} ${r1(y - f(8.8))} ${x} ${r1(y - f(9))}Q${r1(x + f(3.6))} ${r1(y - f(8.8))} ${r1(x + f(3.8))} ${r1(y - f(3.8))}Q${x} ${r1(y - f(2.6))} ${r1(x - f(3.8))} ${r1(y - f(3.8))}Z`, cap[1], true, glow ? ' class="pf-glow"' : '') +
        P(`M${r1(x - f(3.3))} ${r1(y - f(4.6))}Q${r1(x - f(3))} ${r1(y - f(8.2))} ${r1(x + f(0.4))} ${r1(y - f(8.5))}Q${r1(x - f(1.6))} ${r1(y - f(6.5))} ${r1(x - f(3.3))} ${r1(y - f(4.6))}Z`, cap[2], false, ' opacity=".8"') +
        C(x + f(1.6), y - f(6.3), f(0.8), '#fff6e6') + C(x - f(0.6), y - f(7.4), f(0.6), '#fff6e6') + C(x + f(2.8), y - f(4.8), f(0.5), '#fff6e6')
    )
}

const RED_CAP: Pal = ['#a8342b', '#dc4a3a', '#f47b62']
const GLOW_CAP: Pal = ['#2a9d8f', '#4fd6c4', '#b8fff2']

export const SPECIES_SVGS: Record<string, string> = {
    classic_pine: svg(
        shadow(15) +
        sway(
            trunk(29.8, 34.2, 44) +
            tier(26, 47, 18, PINE) + tier(16, 37, 14, PINE) + tier(5, 26, 10.5, PINE) +
            C(24, 42, 0.8, '#9fd27a') + C(27, 31.5, 0.7, '#9fd27a') + C(29.5, 17, 0.6, '#9fd27a')
        )
    ),

    ancient_oak: svg(
        shadow(22, 5) +
        sway(
            OLN('M31 40Q25 34 19 28M33 38Q40 33 45 27', BARK[1], 3.4) +
            P('M24 56.5Q28 52 28.5 46Q28.6 40 27 34L37 34Q35.6 40 35.8 46Q36.2 52 40.5 56.5Q36 55.6 34 54.2Q32 56.5 29.6 54.4Q27.4 56 24 56.5Z', BARK[1]) +
            P('M27.6 34.6L30.6 34.6Q30 40 30.2 46Q30.6 51.5 29 54.6Q27.2 55.6 25.6 56Q28.8 52 29 46Q29 40 27.6 34.6Z', BARK[2], false) +
            P('M34.6 34.6L37 34.6Q35.6 40 35.8 46Q36.2 52 40.5 56.5Q37 55.8 35.4 54.6Q34.2 50 34.4 45Z', BARK[0], false) +
            E(32.4, 45, 1.3, 1.8, '#3e2716') +
            blobs(
                [
                    [32, 13, 9.5, 1], [21, 17, 8.5, 1], [43, 17, 8.5], [13.5, 27, 7.5, 1], [50.5, 27, 7.5],
                    [24, 28, 9.5, 1], [40, 28.5, 9.5], [32, 32, 7.5],
                ],
                GREEN
            ) +
            C(18, 30, 1, '#b6e07e') + C(36, 12, 1, '#b6e07e') + C(45, 31, 0.9, '#8cc867') + C(27, 22, 0.9, '#b6e07e')
        )
    ),

    sakura: svg(
        shadow(20, 4.8) +
        E(20, 56.5, 1.3, 0.6, '#f3a9c4') + E(44, 55.4, 1.2, 0.6, '#ffdbe8') + E(38, 58, 1.1, 0.5, '#f3a9c4') +
        sway(
            P('M27 56.5Q30.4 48 30.2 41Q29.6 35 23.5 30.5L26.4 29.4Q31 32.4 32.2 35.6Q34 31.2 39.4 28.2L41 30.2Q35.4 34.4 34.6 41Q34.4 48 37.6 56.5Z', '#6b4642') +
            P('M28.4 56.2Q31.6 48 31.4 41Q31 35.4 25.4 30.8L26.4 30.4Q30.4 33.4 32.4 38Q32.2 48 30.2 56.2Z', '#8a5d56', false) +
            blobs(
                [
                    [30, 13, 8, 1], [42, 14.5, 7.5, 1], [20, 18.5, 7, 1], [51, 21.5, 6], [12.5, 25, 5.5, 1],
                    [24, 25, 7.5, 1], [37.5, 24, 7.8], [47, 28, 5.5], [30.5, 29, 5.5],
                ],
                SAKURA
            ) +
            [[18, 16], [27, 10], [40, 12], [47, 20], [15, 26], [34, 20], [43, 27], [24, 28], [51, 24]]
                .map(([x, y], i) => C(x, y, i % 2 ? 0.8 : 1, i % 3 ? '#fff4f8' : '#c85a86'))
                .join('') +
            P('M10 38Q11.6 36.4 13 37.6Q11.4 39.4 10 38Z', '#f3a9c4') +
            P('M53 36Q55 35.2 55.6 36.8Q53.8 38 53 36Z', '#ffdbe8') +
            P('M48 45Q49.8 44 50.6 45.6Q48.8 46.8 48 45Z', '#f3a9c4')
        )
    ),

    autumn_maple: svg(
        shadow(18, 4.6) +
        P('M17 56Q18.4 54.2 20.4 55.2Q19 57.4 17 56Z', '#e8693a') + P('M44 57Q45.4 55.4 47.4 56Q46 58 44 57Z', '#f5a13a') +
        sway(
            trunk(30.3, 33.7, 36, BARK, 2.6) +
            OLN('M32 40Q27 36 24.5 33M32.4 38Q37 35 39 31', BARK[1], 1.8) +
            blobs([[32, 10, 6.5, 1], [25.5, 15, 6, 1], [38.5, 15.5, 6]], MAPLE_TOP) +
            blobs([[19.5, 23, 7, 1], [32, 20.5, 8, 1], [44.5, 23.5, 7]], MAPLE_MID, false) +
            blobs([[17.5, 31.5, 6.2, 1], [26, 32, 7, 1], [38, 32.5, 7], [46.5, 31.5, 6]], MAPLE_LOW, false) +
            C(22, 20, 0.9, '#ffe08a') + C(35, 8, 0.8, '#fff0b0') + C(41, 22, 0.8, '#ffc15a') + C(29, 29, 0.8, '#f8a948') +
            P(starPath(11, 42, 5, 2.2, 1, 0.3), '#e8622a') + P(starPath(54, 38, 5, 2, 0.9, -0.2), '#f5a13a') +
            P(starPath(49, 48, 5, 1.8, 0.8, 0.5), '#c6412a')
        )
    ),

    sunflower: svg(
        shadow(16, 4.2) +
        sway(
            OLN('M32 56.5Q31 38 33 16', '#4e8a3a', 2.4) + OLN('M26 56.5Q24 42 20.5 27', '#4e8a3a', 2) + OLN('M38.5 56.5Q41 44 44.5 31', '#4e8a3a', 2) +
            leaf(31.6, 40, 200, 11, 4.2, '#5fa84a', '#3f7a32') + leaf(32, 33, -20, 10, 4, '#6fbf4a', '#3f7a32') +
            leaf(24.6, 47, 205, 8, 3.2, '#5fa84a', '#3f7a32') + leaf(40, 46, -30, 8.5, 3.4, '#6fbf4a', '#3f7a32') +
            sunflowerHead(20.5, 26, 7) + sunflowerHead(44.5, 30, 6.5) + sunflowerHead(33, 14, 9)
        ) +
        LN('M24 56L22.5 52.8M40 56.4L42 53', '#5fa84a', 1.2)
    ),

    golden_tree: svg(
        `<defs><radialGradient id="pf-golden_tree-1"><stop offset="0" stop-color="#fff3b0" stop-opacity=".85"/><stop offset=".55" stop-color="#ffd54a" stop-opacity=".35"/><stop offset="1" stop-color="#ffd54a" stop-opacity="0"/></radialGradient></defs>` +
        `<circle class="pf-glow" cx="32" cy="24" r="29" fill="url(#pf-golden_tree-1)"/>` +
        shadow(18, 4.6) +
        sway(
            trunk(29.5, 34.5, 36, ['#8a5a1e', '#b07a2a', '#dcaa52'], 3) +
            OLN('M31 40Q26 36 23 32M33.5 39Q38 35 41 32', '#b07a2a', 2) +
            blobs([[32, 13, 9, 1], [22, 19, 7.5, 1], [42, 19, 7.5], [17.5, 28, 6, 1], [46.5, 28, 6], [27, 29, 8, 1], [38, 29.5, 8]], GOLD) +
            [[26, 15], [37, 11], [20, 25], [44, 23], [31, 25], [24, 32], [40, 33]].map(([x, y]) => C(x, y, 1.1, '#fff8d6')).join('') +
            C(35, 20, 1.6, '#ffae1a', OL) + C(22, 30, 1.4, '#ffae1a', OL) + C(44, 32, 1.4, '#ffae1a', OL)
        ) +
        twinkle(11, 14, 3, '#fff6c8', 0) + twinkle(53, 10, 2.6, '#fff6c8', 0.7) + twinkle(52, 40, 2.2, '#ffe27a', 1.4) +
        twinkle(12, 41, 2.2, '#ffe27a', 2.1) + twinkle(33, 3.5, 2, '#fff6c8', 1)
    ),

    willow: svg(
        shadow(21, 5) +
        sway(
            `<g stroke="${INK}" stroke-width="5" stroke-linecap="round" opacity=".3">` +
            '<path d="M12 24Q9 36 11 50M17 21Q14 36 16 52M47 21Q50 36 48 52M52 24Q55 36 53 49M22 20Q20 34 21 47M42 20Q44 34 43 47"/></g>' +
            `<g stroke="${WILLOW[0]}" stroke-width="3.2" stroke-linecap="round"><path d="M12 24Q9 36 11 50M17 21Q14 36 16 52M47 21Q50 36 48 52M52 24Q55 36 53 49M22 20Q20 34 21 47M42 20Q44 34 43 47"/></g>` +
            P('M28 56.5Q31.4 48 31 38Q30.6 30 28 22L35 22Q34.4 30 35 38Q35.6 48 38.5 56.5Z', BARK[1]) +
            P('M29.2 56.2Q32.2 48 31.8 38Q31.4 30 29.4 22.4L31 22.4Q32.8 30 33 38Q33.4 48 31.2 56.2Z', BARK[2], false) +
            blobs([[22, 17, 7, 1], [32, 12, 8.5, 1], [42, 16.5, 7], [15.5, 23.5, 5.5, 1], [48.5, 23.5, 5.5], [32, 21, 6.5]], WILLOW) +
            `<g stroke="${INK}" stroke-width="4.8" stroke-linecap="round" opacity=".3">` +
            '<path d="M26 22Q24 36 25.5 49M37.5 22Q40 36 38.5 50M31 24Q30.5 32 31.5 40M15 27Q13 36 14 44M49 27Q51 36 50 45"/></g>' +
            `<g stroke="${WILLOW[1]}" stroke-width="3" stroke-linecap="round"><path d="M26 22Q24 36 25.5 49M37.5 22Q40 36 38.5 50M31 24Q30.5 32 31.5 40M15 27Q13 36 14 44M49 27Q51 36 50 45"/></g>` +
            `<g stroke="${WILLOW[2]}" stroke-width=".9" stroke-linecap="round" opacity=".9" transform="translate(-.7 0)"><path d="M26 24Q24 36 25.5 46M37.5 24Q40 36 38.5 47M15 29Q13 36 14 41M49 29Q51 36 50 42"/></g>`
        )
    ),

    bonsai: svg(
        shadow(17, 4.2) +
        sway(
            LN('M31.5 45Q27 39 33 33Q37.5 28 30 22Q26 19 22.5 17.5M33.5 31Q39 29 44.5 23.5M30.5 38Q25 36 21 31', INK, 5.6, ' stroke-opacity=".35"') +
            LN('M31.5 45Q27 39 33 33Q37.5 28 30 22Q26 19 22.5 17.5', '#6b4a32', 3.8) +
            LN('M33.5 31Q39 29 44.5 23.5M30.5 38Q25 36 21 31', '#6b4a32', 2.2) +
            LN('M30.4 44Q26.8 39 32 33.4M29.4 22.4Q26 19.6 23 18.2', '#9c7250', 1.1) +
            blobs([[16.5, 16.5, 4.3, 1], [22, 13.5, 5, 1], [27.5, 15.5, 4.4], [20.5, 18.5, 4], [25.5, 18.8, 3.8]], GREEN) +
            blobs([[40.5, 22.5, 4, 1], [45, 20, 4.6, 1], [49.5, 22.5, 3.8], [44.5, 24.5, 3.6]], GREEN) +
            blobs([[16.5, 30.5, 3.6, 1], [21, 29, 4, 1], [24.5, 31, 3.2]], GREEN)
        ) +
        P('M15.5 45.5L48.5 45.5L48 48.5L16 48.5Z', '#2f5578') +
        P('M18 48.5L46 48.5L43.5 56Q32 57.6 20.5 56Z', '#3f6f9a') +
        P('M18.4 48.8L27 48.8L26 56.6Q23 56.4 20.6 55.8Z', '#6b98c0', false) +
        P('M40 48.8L46 48.8L43.5 56Q41.6 56.3 39.4 56.5Z', '#2f5578', false) +
        E(32, 45.5, 16.5, 2.6, '#4f82ad', OL) + E(32, 45.6, 14, 1.7, '#4a3526') +
        `<rect x="20" y="56" width="3" height="1.4" rx=".6" fill="#243f5a"/><rect x="41" y="56" width="3" height="1.4" rx=".6" fill="#243f5a"/>` +
        C(38, 45.3, 1.1, '#8a9a5a')
    ),

    lavender: svg(
        shadow(17, 4.2) +
        sway(
            `<g stroke-linecap="round"><path d="M32 55Q25 49 19 47M32 55Q27 47 23 43M32 55Q38 48 45 46M32 55Q36 47 41 42M32 55Q31 48 30 44" stroke="#5f7f4f" stroke-width="2"/><path d="M32 55Q23 51 16 51M32 55Q41 51 48 51M32 55Q33 48 35 44" stroke="#8fae78" stroke-width="1.6"/></g>` +
            lavenderSpike(29, 21, 26, 5) + lavenderSpike(35, 43, 25, 5) + lavenderSpike(30, 26, 17) +
            lavenderSpike(34, 38, 16) + lavenderSpike(32, 32, 11) + lavenderSpike(31, 16, 34, 5) + lavenderSpike(33, 48, 33, 5) +
            lavenderSpike(32, 30, 28, 5) + lavenderSpike(33, 35, 30, 5) +
            // a bumble bee
            E(49, 16, 2.2, 1.6, '#ffcf40', OL) + LN('M48.6 14.6L48.6 17.4M50 14.7L50 17.3', '#3a2b1c', 0.7) +
            E(48.6, 13.8, 1.3, 0.9, '#e8f4ff', ' opacity=".85"') + C(47, 16, 0.6, '#3a2b1c')
        )
    ),

    bamboo: svg(
        shadow(17, 4.4) +
        sway(
            bambooCulm(40.5, 20, 4, true) + bambooCulm(20, 27, 3.6, true) +
            leaf(40, 29, -30, 9, 1.8, '#4f8f36') + leaf(20, 36, 200, 8, 1.7, '#4f8f36') +
            bambooCulm(26, 6, 4.8) + bambooCulm(34, 13, 5.2) +
            leaf(26, 14.5, 200, 10, 2.2, '#6fae47', '#4f8f36') + leaf(26, 14.5, 235, 8, 1.8, '#86c257') +
            leaf(34.4, 21.5, -25, 11, 2.3, '#6fae47', '#4f8f36') + leaf(34.4, 21.5, 10, 9, 2, '#86c257') +
            leaf(26.5, 31, 190, 9, 2, '#6fae47') + leaf(34.5, 38.5, -15, 9, 2, '#86c257') +
            leaf(26, 6.5, -60, 7, 1.6, '#86c257') + leaf(34.5, 13.5, -70, 6, 1.5, '#9fd06a')
        ) +
        P('M44 56.6Q45 52 46.6 51Q47.4 53 47.6 56.6Z', '#8a6a3a') + P('M14 56.6Q15 53.4 16.4 53Q17 54.6 17.2 56.6Z', '#8a6a3a')
    ),

    mushroom_circle: svg(
        `<defs><radialGradient id="pf-mushroom_circle-1"><stop offset="0" stop-color="#b8fff0" stop-opacity=".75"/><stop offset=".6" stop-color="#6ff0d0" stop-opacity=".25"/><stop offset="1" stop-color="#6ff0d0" stop-opacity="0"/></radialGradient></defs>` +
        shadow(22, 5, 0.22) +
        `<ellipse class="pf-glow" cx="32" cy="48" rx="24" ry="10" fill="url(#pf-mushroom_circle-1)"/>` +
        E(32, 49, 20, 7, 'none', ' stroke="#8ff0d6" stroke-width="1.2" stroke-dasharray="1 3" stroke-linecap="round" class="pf-glow" opacity=".8"') +
        sway(
            mushroom(32, 41.5, 0.9, GLOW_CAP, true) + mushroom(19, 43.5, 0.85, RED_CAP) + mushroom(45, 43.5, 0.88, RED_CAP) +
            mushroom(11.5, 49.5, 1, GLOW_CAP, true) + mushroom(52.5, 49.5, 1.02, RED_CAP) +
            mushroom(21, 55, 1.25, RED_CAP) + mushroom(43, 55, 1.3, GLOW_CAP, true) +
            LN('M28 55.5L27 53M29 55.6L30 52.8M35 55.6L36 53.2', '#6fae47', 0.9)
        ) +
        twinkle(24, 30, 1.6, '#c8fff4', 0) + twinkle(38, 26, 1.4, '#c8fff4', 0.8) + twinkle(31, 33, 1.2, '#eafff9', 1.6) +
        twinkle(16, 36, 1.3, '#c8fff4', 2.2) + twinkle(47, 33, 1.5, '#eafff9', 1.2)
    ),
}

// ───────────────────────── buildings (3/4 view: lit front face, shaded right side) ─────────────────────────
const WOOD: Pal = ['#6b4226', '#a06e40', '#c8925a']
const STONE: Pal = ['#7b8188', '#9aa0a6', '#c3c7cb']
const ROOF: Pal = ['#7e3526', '#b5523b', '#d9785a']
const LIT = '#ffd36b'

const rect = (x: number, y: number, w: number, h: number, fill: string, extra = '') =>
    `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" fill="${fill}"${extra}/>`

/** Lit window with frame, pane highlight and cross mullions. */
function litWindow(x: number, y: number, w: number, h: number): string {
    return (
        rect(x - 0.8, y - 0.8, w + 1.6, h + 1.6, '#5a3a24', ` rx=".6"${OL}`) +
        rect(x, y, w, h, LIT, ' class="pf-glow"') +
        rect(x + 0.4, y + 0.4, w * 0.4, h * 0.4, '#fff0b8', ' opacity=".8"') +
        LN(`M${r1(x + w / 2)} ${y}L${r1(x + w / 2)} ${y + h}M${x} ${r1(y + h / 2)}L${x + w} ${r1(y + h / 2)}`, '#5a3a24', 0.8)
    )
}

const stone = (x: number, y: number, rx = 3.4, ry = 2.4) => E(x, y, rx, ry, '#8d9096', OL) + E(x - 0.7, y - 0.8, rx * 0.58, ry * 0.45, '#b9bcc0')

type Pt = [number, number]
const qpt = (a: Pt, c: Pt, b: Pt, t: number): Pt => [
    (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0],
    (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1],
]
const lerp = (a: Pt, b: Pt, t: number): Pt => [r1(a[0] + (b[0] - a[0]) * t), r1(a[1] + (b[1] - a[1]) * t)]

function cabin(): string {
    let s = shadow(23, 5)
    // side wall (logs) + side window
    s += P('M39 38L50 33L50 52L39 57Z', '#7a5230')
    for (const y of [41.5, 45, 48.5, 52]) s += LN(`M39 ${y}L50 ${y - 5}`, '#5a3a22', 0.7)
    s += P('M42.5 43.4L47.2 41.3L47.2 47L42.5 49.1Z', LIT, true, ' class="pf-glow"') + LN('M44.85 42.3L44.85 48', '#5a3a24', 0.7)
    // front wall
    s += P('M11 57L11 38L39 38L39 57Z', WOOD[1])
    for (const y of [41.5, 45, 48.5, 52]) s += LN(`M11 ${y}L39 ${y}`, '#7a5230', 0.8) + LN(`M11.5 ${y + 0.9}L38.5 ${y + 0.9}`, '#c28c55', 0.6)
    s += rect(11, 38, 3, 19, '#b88452', ' opacity=".5"')
    for (const y of [39.8, 43.3, 46.8, 50.3, 53.8]) s += C(39, y, 1.5, '#d4a86e', ' stroke="#8a5a30" stroke-width=".6"')
    // gable with vertical boards + round attic window
    s += P('M11 38L25 24.5L39 38Z', '#c0935e')
    for (const x of [15, 19, 23, 27, 31, 35]) {
        const top = r1(x <= 25 ? 38 - ((x - 11) * 13.5) / 14 : 38 - ((39 - x) * 13.5) / 14)
        s += LN(`M${x} ${top + 0.6}L${x} 37.6`, '#9a6c3e', 0.6)
    }
    s += C(25, 32, 2.6, '#5a3a24', OL) + C(25, 32, 1.8, LIT, ' class="pf-glow"')
    // roof side plane, eave thickness, shingles, barge boards
    s += P('M25 22L36 17L53.5 35L42.5 40Z', ROOF[1])
    for (const t of [0.25, 0.5, 0.75]) {
        const a = lerp([25, 22], [42.5, 40], t), b = lerp([36, 17], [53.5, 35], t)
        s += LN(`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`, ROOF[0], 0.8)
    }
    s += P('M42.5 40L53.5 35L53.5 36.8L42.5 41.8Z', '#6a2c20')
    s += LN('M26 22.5L36.2 17.8', ROOF[2], 1.2)
    s += OLN('M8.5 41L25 22.6L41.5 41', '#8e3b2a', 3) + LN('M9.3 39.6L25 22.2', ROOF[2], 0.8)
    // chimney + smoke
    s += P('M40.5 18L44.5 18L44.5 29.8L40.5 31.6Z', STONE[1]) + P('M44.5 18L46.5 17L46.5 28.9L44.5 29.8Z', STONE[0])
    s += LN('M40.5 22L44.5 22M40.5 26L44.5 26M42.5 18L42.5 22M41.5 22L41.5 26M43.5 26L43.5 30', '#6f757c', 0.5)
    s += P('M39.8 16.2L45 16.2L47.2 15.2L47.2 16.8L45 18L39.8 18Z', '#6f757c')
    for (const d of [0, 1, 2]) s += `<circle class="pf-smoke" style="animation-delay:${d}s" cx="43.2" cy="13" r="${2.2 + d * 0.3}" fill="#ece6df" opacity=".85"/>`
    // door, step, windows, flower box
    s += P('M20.5 57L20.5 48Q25 43 29.5 48L29.5 57Z', '#6b3f22') + LN('M23.5 46L23.5 57M26.5 46L26.5 57', '#4f2e18', 0.6)
    s += C(27.8, 52, 0.7, '#f2c14e') + P('M19 57L31 57L30.4 58.6L19.6 58.6Z', '#8d9096')
    s += litWindow(13.5, 43, 5.5, 5.5) + litWindow(32, 43, 5.5, 5.5)
    s += rect(12.8, 49.6, 7, 1.8, '#7a4a28', ` rx=".5"${OL}`) + C(14.5, 49.4, 0.9, '#e8505b') + C(16.3, 49, 0.9, '#ffd24a') + C(18.1, 49.4, 0.9, '#e8505b')
    return svg(s)
}

function watermill(): string {
    let s = shadow(24, 5)
    // stream
    s += P('M1 50.5Q11 48 21 50Q31 52 38 50.5L41 54Q31 58.6 18 58.4Q8 58.4 1 59Z', '#3f8fc4')
    s += P('M2 52.6Q11 50.4 20 52Q30 53.6 37 52.4Q30 56.4 19 56.4Q9 56.4 2 57Z', '#5fb0dc', false)
    s += LN('M4 54.5Q8 53.6 12 54.5M22 55Q26 54.2 30 55M13 57.2Q16 56.6 19 57.2', '#d4f1ff', 0.8, ' class="pf-water"')
    // side face: wood above stone
    s += P('M48 30L56 26L56 52L48 56Z', '#7a5230') + P('M48 44L56 40L56 52L48 56Z', STONE[0])
    s += LN('M48 48L56 44M48 52L56 48', '#60666c', 0.6)
    // front: stone base, planked upper storey, gable
    s += P('M24 56L24 44L48 44L48 56Z', STONE[1])
    s += LN('M24 48L48 48M24 52L48 52M28 44L28 48M36 44L36 48M44 44L44 48M32 48L32 52M40 48L40 52M26 52L26 56M44 52L44 56', '#7b8188', 0.6)
    s += P('M24 44L24 30L48 30L48 44Z', WOOD[1])
    for (const x of [28, 32, 36, 40, 44]) s += LN(`M${x} 30.4L${x} 43.6`, '#7a5230', 0.6)
    s += P('M24 30L36 19.5L48 30Z', '#c0935e') + C(36, 25.5, 1.8, '#5a3a24')
    // roof
    s += P('M36 17.6L44 13.6L58 27.6L50 31.6Z', '#5d7390')
    for (const t of [0.33, 0.66]) {
        const a = lerp([36, 17.6], [50, 31.6], t), b = lerp([44, 13.6], [58, 27.6], t)
        s += LN(`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`, '#465a73', 0.8)
    }
    s += P('M50 31.6L58 27.6L58 29.2L50 33.2Z', '#34455a') + OLN('M21.6 32.2L36 17.4L50.4 32.2', '#3c4f66', 2.6) + LN('M22.4 31L36 17', '#7f95b0', 0.7)
    // door + lit window
    s += P('M31 56L31 50Q33.5 47.2 36 50L36 56Z', '#5a3a24') + litWindow(39, 34, 5, 5)
    // wheel (rotates around 17,43)
    let w = `<g class="pf-wheel" style="transform-origin:17px 43px">`
    w += `<circle cx="17" cy="43" r="12" stroke="${INK}" stroke-opacity=".35" stroke-width="4.2"/><circle cx="17" cy="43" r="12" stroke="#6b4a2c" stroke-width="2.4"/>`
    w += `<circle cx="17" cy="43" r="8.2" stroke="#8a5f38" stroke-width="1.2"/>`
    for (let a = 0; a < 180; a += 45) w += LN(`M17 31L17 55`, '#8a5f38', 1.1, ` transform="rotate(${a} 17 43)"`)
    for (let a = 0; a < 360; a += 30) w += rect(15.5, 28.6, 3, 4.4, '#b07a45', ` rx=".4" transform="rotate(${a} 17 43)"${OL}`)
    w += C(17, 43, 2.4, '#4a3526', OL) + C(16.4, 42.4, 0.9, '#8a6a4a') + '</g>'
    s += w
    s += P('M8 53.5Q12 51.6 17 53Q22 51.6 26 53.5Q21 55.4 17 54.8Q12 55.4 8 53.5Z', '#e8f8ff', false, ' class="pf-water" opacity=".85"')
    return svg(s)
}

function windmill(): string {
    let s = shadow(17, 4.6)
    // tower
    s += P('M41 57L46 54.5L41.8 23.8L37.5 25Z', '#c2ab84')
    s += P('M20 57L23.5 25L37.5 25L41 57Z', '#efe2c8')
    s += P('M20.4 56.8L23.9 25.2L26.4 25.2L23.6 56.8Z', '#fbf4e4', false)
    s += P('M20.6 51L40.4 51L41 57L20 57Z', '#aaa49b') + LN('M20.3 54L40.7 54M25 51L25 54M31 51L31 54M37 51L37 54M28 54L28 57M34 54L34 57', '#857f77', 0.5)
    s += P('M40.4 51L45.4 49.6L46 54.5L41 57Z', '#8b857d', false)
    s += P('M28 57L28 50.5Q31 47.4 34 50.5L34 57Z', '#6b3f22') + C(32.8, 53.6, 0.5, '#f2c14e')
    s += P('M29.2 41.5L29.2 37.6Q31 35.4 32.8 37.6L32.8 41.5Z', LIT, true, ' class="pf-glow"') + LN('M31 36.2L31 41.5', '#5a3a24', 0.6)
    s += rect(29.8, 29.5, 2.6, 3, '#5a4a3a', ` rx=".8"`)
    // cap
    s += P('M21.5 26.8Q21.2 13.2 31 12Q41 12.6 43.4 25.2Z', '#b5523b')
    s += P('M22.4 26Q22.4 14.6 30 13Q25.4 16 25 26Z', '#d9785a', false)
    s += P('M38 13.6Q42.6 17.6 43.4 25.2L39.6 25.6Q39.6 18 38 13.6Z', '#8e3b2a', false)
    s += OLN('M21 26.9L43.8 25.2', '#6a2c20', 1.8) + C(31, 11.6, 1, '#e8b84a', OL)
    // sails (rotate around the hub 31,20)
    let g = `<g class="pf-sails" style="transform-origin:31px 21px">`
    for (const a of [45, 135, 225, 315]) {
        g += `<g transform="rotate(${a} 31 21)">` + OLN('M31 21L31 2.2', '#6b4a2c', 1.4) +
            rect(31.9, 3, 6, 14.4, '#f4ead6', OL) + rect(35.6, 3.4, 2, 13.6, '#dccdb0') +
            LN('M31.9 6.6L37.9 6.6M31.9 10.2L37.9 10.2M31.9 13.8L37.9 13.8M34.9 3L34.9 17.4', '#a07a50', 0.55) + '</g>'
    }
    g += C(31, 21, 2.7, '#5a3a24', OL) + C(30.3, 20.3, 1, '#9c6c44') + '</g>'
    return svg(s + g)
}

function stoneWell(): string {
    let s = shadow(19, 5)
    // roof
    s += OLN('M19.5 25.5L19.5 14M44.5 25.5L44.5 14', '#6b4226', 2.4)
    s += P('M11 24L18.5 11L45.5 11L53 24Z', ROOF[1])
    s += P('M12.4 22.4L18.9 11.6L22 11.6L16.4 22.4Z', ROOF[2], false)
    s += LN('M14.6 19.7L49.4 19.7M16.9 15.4L47.1 15.4', ROOF[0], 0.8)
    s += P('M11 24L53 24L52.4 25.8L11.6 25.8Z', '#6a2c20') + OLN('M18.5 11L45.5 11', '#8e3b2a', 1.8)
    // cylinder
    s += P('M18.5 42L18.5 52.6Q32 58.8 45.5 52.6L45.5 42Z', STONE[1])
    s += P('M18.9 42.6L18.9 52.4Q21.6 54 25 55.2L25 44Z', '#b9bec3', false)
    s += P('M40 44.3L40 55.6Q43 54.4 45.1 52.4L45.1 42.6Z', STONE[0], false)
    s += LN('M18.6 47.4Q32 52.8 45.4 47.4M18.6 51.6Q32 57 45.4 51.6', '#6f757c', 0.7)
    s += LN('M24 44.6L24 49.6M31 45.6L31 50.6M38 45.2L38 50.2M21 49.6L21 53.8M28 50.8L28 55.4M35 50.8L35 55.4M42 49.6L42 53.8', '#6f757c', 0.6)
    s += E(32, 42, 13.8, 4.7, STONE[2], OL) + E(32, 42.4, 10.6, 3.2, '#223240') + E(28.5, 41.6, 3.4, 0.8, '#4b7a9a')
    s += P('M18.8 41Q20.5 39 24 38.5Q22.6 40.6 19.6 42.6Z', '#6fae47')
    // posts, roller, rope, bucket, crank
    s += OLN('M19.3 24L19.3 42.5M44.7 24L44.7 42.5', '#8a5a30', 2.6) + LN('M18.8 25L18.8 41.5', '#b07a45', 0.8)
    s += rect(19, 26, 26, 3, '#a06e40', ` rx="1.4"${OL}`) + rect(29.5, 26, 5, 3, '#c9a26b')
    s += LN('M30.3 26.2L30.3 28.8M31.8 26.2L31.8 28.8M33.3 26.2L33.3 28.8', '#9a7a4a', 0.5)
    s += OLN('M45.5 27.5L49.5 27.5L49.5 31.5', '#4a4a4a', 1.1) + LN('M32 29L32 33.6', '#c9a26b', 0.8)
    s += LN('M29.4 34Q32 30.6 34.6 34', '#4a4a4a', 0.6)
    s += P('M28.8 34L35.2 34L34.5 39.4L29.5 39.4Z', '#a8743f') + LN('M29 35.8L35 35.8M29.3 38L34.7 38', '#5a5a5a', 0.6)
    return svg(s)
}

function campfire(): string {
    let s = shadow(19, 4.6)
    s += E(32, 50, 17, 6, '#ffb347', ' class="pf-glow" opacity=".35"')
    for (const [x, y] of [[20.5, 47.8], [26.5, 46.3], [32, 45.8], [37.5, 46.3], [43.5, 47.8], [18, 51.2], [46, 51.2]]) s += stone(x, y)
    s += LN('M22 53L41 45.6M42 53L23 45.6', INK, 6.2, ' stroke-opacity=".35"')
    s += LN('M22 53L41 45.6M42 53L23 45.6', '#6b4226', 4.4) + LN('M22.4 51.8L40.4 44.8M41.6 51.8L23.6 44.8', '#9a6a3e', 1.2)
    s += C(22, 53, 2.2, '#d4a86e', ' stroke="#9a6a3e" stroke-width=".7"') + C(42, 53, 2.2, '#d4a86e', ' stroke="#9a6a3e" stroke-width=".7"')
    s += `<g class="pf-flame" style="transform-origin:32px 50px">` +
        P('M32 23Q35.5 30.5 39.5 35.5Q43.8 41.5 40 47.6Q35.6 51.4 32 51.4Q27 51.4 24.4 48Q20.8 42.5 24.8 37Q27 34 27.6 29.6Q29.6 34.8 30.8 36.4Q30 30 32 23Z', '#e8532a') +
        P('M32.2 30.5Q34.6 35.6 37.2 39.4Q39.8 44 36.8 48Q34.6 50.2 32 50.2Q29 50.2 27.4 47.8Q25.6 44 28 40.4Q29.6 42.4 30.6 42.6Q30.2 35.8 32.2 30.5Z', '#f79a2e', false) +
        P('M32 38Q35.6 42.8 35.1 46.4Q34.2 49.6 32 49.6Q29.8 49.6 29.1 47Q28.7 43.4 32 38Z', '#ffe066', false, ' class="pf-glow"') +
        P('M40.5 36Q42 38.5 41.4 41Q40 39 40.5 36Z', '#f79a2e', false) + '</g>'
    s += `<circle class="pf-twinkle" style="animation-delay:0s;transform-box:fill-box;transform-origin:center" cx="26" cy="22" r=".9" fill="#ffcf5a"/>`
    s += `<circle class="pf-twinkle" style="animation-delay:.7s;transform-box:fill-box;transform-origin:center" cx="38" cy="19" r=".8" fill="#ffe08a"/>`
    s += `<circle class="pf-twinkle" style="animation-delay:1.4s;transform-box:fill-box;transform-origin:center" cx="33" cy="14" r=".7" fill="#ffcf5a"/>`
    for (const [x, y] of [[22, 54.8], [28.8, 56], [35.2, 56], [42, 54.8]]) s += stone(x, y)
    return svg(s)
}

function bench(): string {
    let s = shadow(22, 4.2)
    s += OLN('M18.6 27L18.6 52M50.6 27L50.6 52', WOOD[0], 2.2)
    for (const y of [26, 32]) s += rect(16, y, 36.5, 3.6, WOOD[1], ` rx=".8"${OL}`) + rect(16.5, y + 0.4, 35.5, 1, WOOD[2], ' rx=".5"')
    s += P('M12 44L48 44L52.5 40L16.5 40Z', WOOD[2]) + LN('M13.5 42.7L49.5 42.7M15 41.3L51 41.3', '#a8733f', 0.7)
    s += P('M12 44L48 44L48 46.4L12 46.4Z', '#8a5a30') + P('M48 44L52.5 40L52.5 42.2L48 46.4Z', WOOD[0])
    s += OLN('M14.4 46.4L14.4 56M45.4 46.4L45.4 56', WOOD[0], 2.4) + LN('M13.8 47L13.8 55.4M44.8 47L44.8 55.4', WOOD[1], 0.7)
    s += OLN('M12.6 44.4Q10.4 38.5 14 36Q17.4 34.6 18 37.6M47.4 44.2Q46.4 38.6 50 36.6Q53 35.6 53.6 38', '#3a3530', 1.4)
    return svg(s)
}

function lantern(): string {
    let s = shadow(16, 4.2)
    s += E(26, 55, 5.8, 2.2, '#8d9096', OL) + E(25, 54.4, 3, 1, '#b9bcc0')
    s += P('M24 55L24 11.5L28 11.5L28 55Z', '#8a5a30') + P('M28 11.5L29.6 10.7L29.6 54.2L28 55Z', WOOD[0]) + rect(24.4, 12, 1, 42.5, '#b07a45')
    s += P('M23 11.6L29 11.6L30.6 10.2L24.6 10.2Z', '#5a3a24')
    s += rect(28, 13, 13, 2, WOOD[0], ` rx=".4"${OL}`) + OLN('M28.4 22Q33.4 20.6 36.6 15.2', WOOD[0], 1.2)
    s += LN('M38 15L38 17.6', '#3b3632', 0.9)
    s += P('M33 20L38 16.8L43 20Z', '#3b3632') + rect(33.6, 20, 8.8, 1.2, '#3b3632')
    s += rect(34.2, 21.2, 7.6, 8.8, LIT, ' class="pf-glow"') + rect(34.6, 21.6, 2, 8, '#fff0b8', ' opacity=".7"') + E(38, 26, 1.5, 2.4, '#fff8d8')
    s += LN('M36.7 21.2L36.7 30M39.3 21.2L39.3 30M34.2 21.2L34.2 30M41.8 21.2L41.8 30', '#3b3632', 0.8)
    s += P('M33.6 30L42.4 30L41 32L35 32Z', '#3b3632') + C(38, 16.5, 0.8, '#3b3632')
    s += LN('M19.5 55.5L19 52.5M21 55.8L21.8 53M31.5 55.8L32.5 53', '#6fae47', 0.9) + C(19, 52.2, 1, '#e86a8a') + C(32.6, 52.6, 1, '#ffd24a')
    return svg(s)
}

function toriiGate(): string {
    let s = shadow(23, 4.2)
    for (const x of [17, 42]) {
        s += P(`M${x} 55L${x + 0.8} 20L${x + 4.6} 20L${x + 5.4} 55Z`, '#d6452f')
        s += P(`M${x + 0.6} 54.6L${x + 1.3} 20.4L${x + 2.2} 20.4L${x + 1.8} 54.6Z`, '#f07a58', false)
        s += P(`M${x + 3.6} 20.4L${x + 4.5} 20.4L${x + 5.3} 54.6L${x + 4.2} 54.6Z`, '#a8321f', false)
        s += rect(x - 1, 50.5, 7.4, 6, '#2e2a28', ` rx=".8"${OL}`) + rect(x - 0.4, 51, 1.4, 5, '#55504c')
    }
    s += rect(11, 26, 42, 3.4, '#d6452f', ` rx=".4"${OL}`) + rect(11.4, 28.3, 41.2, 1, '#a8321f') + rect(11.4, 26.4, 41.2, 0.8, '#f07a58')
    s += P('M8.5 16.5Q32 19 55.5 16.5L55.5 20Q32 22.4 8.5 20Z', '#d6452f') + P('M9 19.2Q32 21.6 55 19.2L55 20Q32 22.4 9 20Z', '#a8321f', false)
    s += P('M4.5 11.5Q32 17 59.5 11.5L58.8 15Q32 19.6 5.2 15Z', '#2e2a28') + LN('M6 12.2Q32 17.2 58 12.2', '#6a625d', 0.9)
    s += rect(29, 19.5, 6, 7.4, '#2e2a28', ` rx=".4"${OL}`) + rect(30, 20.5, 4, 5.4, '#e8b84a') + LN('M32 21.5L32 25', '#8a5a1e', 0.8)
    return svg(s)
}

function gazebo(): string {
    let s = shadow(24, 5)
    // platform
    s += P('M8.5 50L16 46.4L32 45L48 46.4L55.5 50L48 53.4L32 55L16 53.4Z', WOOD[2])
    s += P('M8.5 50L16 53.4L32 55L48 53.4L55.5 50L55.5 53L48 56.4L32 58L16 56.4L8.5 53Z', WOOD[1])
    s += P('M32 55L48 53.4L55.5 50L55.5 53L48 56.4L32 58Z', WOOD[0], false)
    s += LN('M12 48.2L52 48.2M10.5 51.4L53.5 51.4', '#a8733f', 0.6)
    // interior shade, back posts & rail
    s += P('M10 30L54 30L54 49.6L32 46L10 49.6Z', '#3a2d24', false, ' opacity=".28"')
    s += rect(19.5, 30, 1.8, 16.5, '#cfc4b0') + rect(42.7, 30, 1.8, 16.5, '#cfc4b0') + LN('M12 41.5L52 41.5', '#cfc4b0', 1.1)
    // hanging lantern
    s += LN('M32 26L32 32.6', '#3b3632', 0.7) + rect(29.8, 32.4, 4.4, 1, '#3b3632') + rect(30.3, 33.4, 3.4, 4.2, LIT, ' class="pf-glow"') + rect(29.8, 37.6, 4.4, 1, '#3b3632')
    // front posts & rails
    for (const [x, b] of [[11, 51], [22.4, 54], [40.2, 54], [51.6, 51]] as Pt[]) {
        s += rect(x, 30, 2.4, b - 30, '#f3ece0', OL) + rect(x + 1.6, 30.5, 0.8, b - 31, '#cfc4b0')
    }
    s += OLN('M13.4 45.2L22.4 47.6M42.6 47.6L51.6 45.2', '#f3ece0', 1.3) + LN('M16 46L16 50.6M19.4 46.8L19.4 51.8M45.2 46.8L45.2 51.8M48.6 46L48.6 50.6', '#e3d9c6', 0.9)
    s += P('M26 55L38 55L39.4 57.8L24.6 57.8Z', WOOD[1])
    // roof facets from apex
    const pts: Pt[] = [[5.5, 28], [14, 31.6], [24, 33.3], [40, 33.3], [50, 31.6], [58.5, 28]]
    const cols = ['#79c4a0', '#63b08e', '#52a07f', '#428a6c', '#33705a']
    s += P(`M32 6L${pts.map((p) => p.join(' ')).join('L')}Z`, '#428a6c')
    for (let i = 0; i < 5; i++) s += P(`M32 6L${pts[i].join(' ')}L${pts[i + 1].join(' ')}Z`, cols[i], false)
    s += P('M5.5 28L14 31.6L24 33.3L40 33.3L50 31.6L58.5 28L58.5 30L50 33.6L40 35.3L24 35.3L14 33.6L5.5 30Z', '#efe6d4', true)
    s += LN('M32 6.4L14 31.4M32 6.4L24 33M32 6.4L40 33M32 6.4L50 31.4', '#2f6352', 0.4, ' opacity=".6"')
    s += OLN('M32 6.5L32 3.8', '#c9982e', 1.1) + C(32, 3.4, 1.3, '#e8b84a', OL)
    return svg(s)
}

function bridge(): string {
    const N0: Pt = [6, 52], NC: Pt = [32, 30], N2: Pt = [58, 52]
    const off = (p: Pt, dx: number, dy: number): Pt => [r1(p[0] + dx), r1(p[1] + dy)]
    const arc = (dx: number, dy: number) => `M${N0[0] + dx} ${N0[1] + dy}Q${NC[0] + dx} ${NC[1] + dy} ${N2[0] + dx} ${N2[1] + dy}`
    const ts = [0.04, 0.27, 0.5, 0.73, 0.96]
    let s = shadow(22, 4, 0.22)
    s += LN('M14 55.5Q19 54.4 24 55.5M36 56Q41 55 46 56M24 58.6Q29 57.8 34 58.6', '#d4f1ff', 0.9, ' class="pf-water"')
    // far railing
    for (const t of ts) { const b = off(qpt(N0, NC, N2, t), 3, -6); s += OLN(`M${b[0]} ${b[1]}L${b[0]} ${r1(b[1] - 7)}`, '#7a4e2a', 1.6) }
    s += OLN(arc(3, -13), '#8a5a30', 1.8)
    // deck top + planks
    s += P(`${arc(0, 0)}L${N2[0] + 3} ${N2[1] - 6}Q${NC[0] + 3} ${NC[1] - 6} ${N0[0] + 3} ${N0[1] - 6}Z`, WOOD[2])
    for (let t = 0.08; t < 0.95; t += 0.07) {
        const a = qpt(N0, NC, N2, t)
        s += LN(`M${r1(a[0])} ${r1(a[1])}L${r1(a[0] + 3)} ${r1(a[1] - 6)}`, '#a8733f', 0.6)
    }
    // deck side band
    s += P(`${arc(0, 0)}L${N2[0]} ${N2[1] + 3.6}Q${NC[0]} ${NC[1] + 3.6} ${N0[0]} ${N0[1] + 3.6}Z`, '#7a4e2a')
    s += LN(arc(0, 0.7), '#a06e40', 0.8)
    // near railing
    for (const t of ts) {
        const b = qpt(N0, NC, N2, t), w = t < 0.1 || t > 0.9 ? 2.6 : 1.9
        s += OLN(`M${r1(b[0])} ${r1(b[1] + 1)}L${r1(b[0])} ${r1(b[1] - 8)}`, WOOD[1], w)
        if (w > 2) s += C(b[0], b[1] - 8.6, 1.6, WOOD[2], OL)
    }
    s += OLN(arc(0, -7.6), '#b07a45', 2) + LN(arc(-0.2, -8.2), '#d8a46a', 0.7)
    return svg(s)
}

function greenhouse(): string {
    let s = shadow(23, 5)
    s += P('M11 53L39 53L39 57L11 57Z', '#b5654a') + P('M39 53L51 47L51 51L39 57Z', '#8e4a36') + LN('M11 55L39 55M18 53L18 55M25 55L25 57M32 53L32 55', '#8e4a36', 0.5)
    // interior: warm glow + plants seen through glass
    s += E(27, 44, 12, 8, '#fff1b0', ' class="pf-glow" opacity=".5"')
    s += blobs([[44.5, 45, 3.2, 1], [48.5, 42.5, 2.8]], GREEN, false)
    s += blobs([[15.5, 49.5, 3.6, 1], [21.5, 48.5, 4.2, 1], [30.5, 49.5, 3.8], [35.6, 48.6, 3.4, 1]], GREEN, false)
    s += C(20, 47, 1.1, '#e54b3a') + C(23.5, 49.5, 1, '#e54b3a') + C(34, 47.2, 1, '#ffb13b') + C(30, 47.6, 0.9, '#e86a8a')
    // glass
    s += P('M39 36L51 30L51 47L39 53Z', '#7fbcc4', true, ' fill-opacity=".6"')
    s += P('M11 53L11 36L25 23L39 36L39 53Z', '#aadde2', true, ' fill-opacity=".5"')
    s += P('M25 22.4L37 16.4L52.5 30.4L40.5 36.4Z', '#d9f2f0', true, ' fill-opacity=".8"')
    // frames
    const F = '#f7faf4'
    let f = 'M11 36L39 36M11 44.5L39 44.5M17.5 30L17.5 53M32.5 30L32.5 53M25 23L25 42'
    f += 'M39 44.5L51 38.5M43 34L43 51M47 32L47 49'
    for (const t of [0.33, 0.66]) {
        const a = lerp([25, 22.4], [37, 16.4], t), b = lerp([40.5, 36.4], [52.5, 30.4], t)
        f += `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`
    }
    s += LN(f, F, 1)
    s += LN('M11 53L11 36L25 23L39 36L39 53M39 36L51 30L51 47M40.5 36.4L52.5 30.4', F, 1.3)
    s += OLN('M25 22.4L37 16.4', '#e9ede6', 1.5)
    s += rect(22, 42.5, 6, 10.5, '#e9f6f4', ` fill-opacity=".5"${OL}`) + LN('M22 42.5L28 42.5L28 53M22 42.5L22 53', F, 1) + C(26.8, 48, 0.5, '#8a6a4a')
    s += LN('M13 51L19.5 39M14.8 52L19.8 43M42 48L47 36', '#ffffff', 1, ' opacity=".7"')
    s += LN('M28 27L32 24', '#ffffff', 1, ' opacity=".6"')
    return svg(s)
}

/** Square grass tile base used by the ground-tile shop icons. */
const tileBase = () =>
    shadow(22, 4, 0.2) + rect(7, 9, 50, 49, '#4f8a3a', ' rx="9"') + rect(7, 6, 50, 49, '#86bf5a', ` rx="9"${OL}`) +
    rect(9, 8, 46, 20, '#9bd06a', ' rx="7" opacity=".45"')

function cobblestonePath(): string {
    let s = tileBase()
    s += LN('M13 16L12 13M15 16L16 13M46 47L45 44M48 47L49 44M49 13L48.4 10.6M18 34L17 31.5', '#5f9a45', 1)
    s += P('M7 45Q20 43 26 36Q33 26 40 22Q48 18 57 18.5L57 31Q48 30 42 35Q36 41 31 48Q26 55 18 55L13 55Q8.4 54 7 51Z', '#c9b48a', false)
    const A: Pt[] = [[11, 48.5], [16.5, 47.2], [22, 43.6], [26.4, 39], [30.4, 34], [35, 29.2], [40.6, 25.6], [46.8, 23.2], [53.2, 22.4]]
    const B: Pt[] = [[13, 52.6], [19.4, 51.8], [25.6, 48.6], [30.2, 44], [34.6, 39.2], [39.2, 34.4], [44.4, 30.8], [50.2, 28.6], [55, 27.8]]
    ;[...A, ...B].forEach(([x, y], i) => {
        s += E(x, y, 2.7 + (i % 3) * 0.2, 2.1, i % 2 ? '#b3ada2' : '#a39d92', OL) + E(x - 0.6, y - 0.6, 1.4, 0.8, '#dcd7cc')
    })
    return svg(s)
}

function waterStream(): string {
    let s = tileBase()
    s += LN('M14 42L13 38.5M16 42L17 39M12.5 42L10.5 40', '#4f8a3a', 1.1) + LN('M47 20L46 16.5M49 20L50 17', '#5f9a45', 1)
    s += P('M20 6.2Q12.6 20 23 31Q33.6 41 23 55L47 55Q55.4 40 45 29Q35.4 19 43 6.2Z', '#d9c28f', false)
    s += P('M23 6.2Q15.6 20 26 31Q36.4 41 26.4 55L44 55Q52 40 42 29Q32.4 19 40 6.2Z', '#4aa3d8')
    s += P('M28 6.2Q21.6 20 31 31Q40 40 32.4 55L38.6 55Q46 40 37 29Q28.6 19 34.6 6.2Z', '#3a8cc4', false)
    s += `<g class="pf-water">` + LN('M26 14Q29 12.8 32 14M29.6 25Q32.6 23.8 35.6 25M33 36Q36 34.8 39 36M30 47Q33 45.8 36 47', '#e8f8ff', 1) + '</g>'
    s += C(41, 44, 3, '#5fa84a', OL) + P('M41 44L44 43L43.6 45.4Z', '#3a8cc4', false) + C(40, 43, 0.9, '#f5a9c8')
    s += E(21.5, 41, 1.6, 1.1, '#9a948a', OL) + E(47, 26, 1.4, 1, '#9a948a', OL)
    return svg(s)
}

export const BUILDING_SVGS: Record<string, string> = {
    cabin: cabin(),
    watermill: watermill(),
    stone_well: stoneWell(),
    campfire: campfire(),
    bench: bench(),
    lantern: lantern(),
    windmill: windmill(),
    torii_gate: toriiGate(),
    gazebo: gazebo(),
    bridge: bridge(),
    greenhouse: greenhouse(),
    cobblestone_path: cobblestonePath(),
    water_stream: waterStream(),
}


export const BIOME_CONFIGS: Record<string, { id: string; name: string; background: string; border: string; cellBg: string; description: string }> = {
    meadow: {
        id: 'meadow',
        name: 'Emerald Meadow',
        background: '#1c2b20',
        border: '#2e4d35',
        cellBg: 'rgba(36, 56, 41, 0.7)',
        description: 'Lush green grass and vibrant wildflower soil.',
    },
    sakura_garden: {
        id: 'sakura_garden',
        name: 'Sakura Grove',
        background: '#2b1c25',
        border: '#4d2e3f',
        cellBg: 'rgba(56, 36, 49, 0.7)',
        description: 'Delicate pink fallen petals and peaceful zen gravel.',
    },
    autumn_valley: {
        id: 'autumn_valley',
        name: 'Autumn Valley',
        background: '#2b211c',
        border: '#4d372e',
        cellBg: 'rgba(56, 42, 36, 0.7)',
        description: 'Warm golden amber earth with crisp seasonal foliage.',
    },
    alpine_frost: {
        id: 'alpine_frost',
        name: 'Alpine Frost',
        background: '#1c252b',
        border: '#2e3e4d',
        cellBg: 'rgba(36, 48, 56, 0.7)',
        description: 'Crisp mountain air and snow-dusted pine soil.',
    },
    twilight_moss: {
        id: 'twilight_moss',
        name: 'Twilight Sanctuary',
        background: '#1a182b',
        border: '#2b244d',
        cellBg: 'rgba(34, 30, 56, 0.7)',
        description: 'Mystical deep indigo soil with bioluminescent flora.',
    },
}

// ───────────────────────── UI icons (24x24, rendered at 16px) ─────────────────────────
const icon = (b: string) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">${b}</svg>`

export const ICONS = {
    sunlight: icon(
        '<path d="M12 1.6v2.8M12 19.6v2.8M1.6 12h2.8M19.6 12h2.8M4.6 4.6l2 2M17.4 17.4l2 2M4.6 19.4l2-2M17.4 6.6l2-2" stroke="#ff9f1c" stroke-width="2" stroke-linecap="round"/>' +
        '<circle cx="12" cy="12" r="5.8" fill="#ffb627" stroke="#d9730d" stroke-width=".9"/><circle cx="12" cy="12" r="4.2" fill="#ffd54f"/><circle cx="10.3" cy="10.3" r="1.5" fill="#fff3c4"/>'
    ),
    coin: icon(
        '<circle cx="12" cy="13" r="9" fill="#b97a0e"/><circle cx="12" cy="11.6" r="9" fill="#f5b82e" stroke="#a86d10" stroke-width=".9"/>' +
        '<circle cx="12" cy="11.6" r="6.3" fill="#ffd54f" stroke="#e0a526" stroke-width="1"/>' +
        `<path d="${starPath(12, 11.8, 5, 3.3, 1.4)}" fill="#f0a818"/>` +
        '<path d="M7.4 8.6a5.8 5.8 0 0 1 4.2-2.6" stroke="#fff6cc" stroke-width="1.3" stroke-linecap="round"/>'
    ),
    star: icon(
        `<path d="${starPath(12, 12.8, 5, 10.2, 4.6)}" fill="#ffcf33" stroke="#d98a00" stroke-width="1.2" stroke-linejoin="round"/>` +
        `<path d="${starPath(12, 12.8, 5, 6, 2.8)}" fill="#ffe27a"/>` +
        '<path d="M8.6 9.4L10.6 9.2L11.6 6.6" stroke="#fffbe0" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>'
    ),
    flame: icon(
        '<path d="M12 1.6C13.2 5.6 18.8 8.4 18.8 14.4C18.8 18.6 15.8 21.8 12 21.8C8.2 21.8 5.2 18.6 5.2 14.6C5.2 11.2 7.2 9.2 8.4 7.2C8.8 9.4 9.8 10.6 10.8 11C10.2 7.4 11 4.2 12 1.6Z" fill="#ff5a2b" stroke="#b8321a" stroke-width=".9" stroke-linejoin="round"/>' +
        '<path d="M12.4 8.8C13.4 11.6 16.4 13.4 16.4 16.6C16.4 19.2 14.4 21 12 21C9.6 21 7.6 19.2 7.6 16.8C7.6 14.8 8.8 13.6 9.6 12.4C10 13.8 10.8 14.6 11.4 14.8C11.2 12.6 11.6 10.6 12.4 8.8Z" fill="#ffa62b"/>' +
        '<path d="M12 14.2C13 15.9 14.3 17 14.3 18.6C14.3 19.9 13.3 20.8 12 20.8C10.7 20.8 9.7 19.9 9.7 18.7C9.7 17.2 11.2 16.2 12 14.2Z" fill="#ffe066"/>'
    ),
    chest: icon(
        '<rect x="2.5" y="10.5" width="19" height="10.5" rx="1.2" fill="#a5652f" stroke="#5a3417" stroke-width=".9"/>' +
        '<path d="M2.5 11V8.4C2.5 5.6 5 3.8 12 3.8C19 3.8 21.5 5.6 21.5 8.4V11Z" fill="#c47f3e" stroke="#5a3417" stroke-width=".9" stroke-linejoin="round"/>' +
        '<path d="M4 9.6V8.4C4 6.8 6 5.4 11 5.3" stroke="#e8ac6a" stroke-width="1" stroke-linecap="round"/>' +
        '<path d="M3 14.5H21" stroke="#7a4420" stroke-width=".7"/>' +
        '<rect x="5.2" y="4.6" width="2" height="16.4" fill="#f2c14e"/><rect x="16.8" y="4.6" width="2" height="16.4" fill="#f2c14e"/>' +
        '<rect x="2.5" y="10.2" width="19" height="1.6" fill="#e0a526"/>' +
        '<rect x="10" y="9" width="4" height="5" rx=".8" fill="#ffd54f" stroke="#a86d10" stroke-width=".7"/><circle cx="12" cy="11" r=".8" fill="#5a3417"/><path d="M11.6 11.4h.8l.3 1.6h-1.4Z" fill="#5a3417"/>'
    ),
    sapling: icon(
        '<path d="M12 13.4V7.4" stroke="#3f8a2e" stroke-width="1.5" stroke-linecap="round"/>' +
        '<path d="M12 10C9.4 10.4 6.8 9 6.2 6C9.2 5.4 11.6 7 12 10Z" fill="#6cc04a" stroke="#3f7a2a" stroke-width=".7" stroke-linejoin="round"/>' +
        '<path d="M12 8.2C12.6 5.2 15.2 3.2 18.2 3.6C17.8 6.8 15.2 8.6 12 8.2Z" fill="#8bd65a" stroke="#3f7a2a" stroke-width=".7" stroke-linejoin="round"/>' +
        '<path d="M7 14.2h10l-1.3 7.6H8.3Z" fill="#d27a4a" stroke="#8e4a2a" stroke-width=".8" stroke-linejoin="round"/>' +
        '<path d="M9 15.2l.7 5.6" stroke="#e8a070" stroke-width="1" stroke-linecap="round"/>' +
        '<rect x="6" y="12.4" width="12" height="2.6" rx=".8" fill="#e8925e" stroke="#8e4a2a" stroke-width=".8"/>'
    ),
    lock: icon(
        '<path d="M7.5 10.5V7.6a4.5 4.5 0 0 1 9 0v2.9" stroke="#6f7a86" stroke-width="2.6"/><path d="M8.3 10V7.6a3.7 3.7 0 0 1 3-3.6" stroke="#c3ccd4" stroke-width=".9" stroke-linecap="round"/>' +
        '<rect x="4.5" y="10" width="15" height="11.8" rx="2.2" fill="#f2b33d" stroke="#a86d10" stroke-width=".9"/>' +
        '<path d="M4.9 16.6h14.2v2.9a1.9 1.9 0 0 1-1.9 1.9H6.8a1.9 1.9 0 0 1-1.9-1.9Z" fill="#dc9220"/>' +
        '<rect x="6.2" y="11.4" width="1.3" height="5.6" rx=".65" fill="#ffe08a"/>' +
        '<circle cx="12" cy="14.6" r="1.7" fill="#6b4a1a"/><path d="M11.2 15.4h1.6l.4 3.2h-2.4Z" fill="#6b4a1a"/>'
    ),
    hammer: icon(
        '<g transform="rotate(45 12 12)">' +
        '<rect x="10.7" y="8.5" width="2.6" height="14.4" rx="1.1" fill="#b07a45" stroke="#5a3417" stroke-width=".8"/><rect x="11.2" y="9.5" width=".8" height="12.4" rx=".4" fill="#d9a46a"/>' +
        '<rect x="5" y="2.6" width="14" height="6" rx="1.2" fill="#8e99a4" stroke="#3f4750" stroke-width=".8"/>' +
        '<rect x="5.6" y="3.2" width="12.8" height="1.6" rx=".8" fill="#c9d2da"/><rect x="5" y="2.6" width="2.2" height="6" rx="1" fill="#6f7a85"/></g>'
    ),
}

// ───────────────────────── villagers (16x24, feet at 8,23) ─────────────────────────
const OLs = ` stroke="${INK}" stroke-opacity=".45" stroke-width=".55" stroke-linejoin="round"`
function villager(o: { skin: string; top: string; body: string; legs: string; hair: string; front?: string; back?: string; dress?: boolean }): string {
    let s = `<ellipse cx="8" cy="23" rx="4.2" ry="1.1" fill="#1a140e" opacity=".28"/>` + (o.back || '')
    s += `<rect x="5.9" y="18" width="1.8" height="4.6" rx=".6" fill="${o.legs}"/><rect x="8.3" y="18" width="1.8" height="4.6" rx=".6" fill="${o.legs}"/>`
    s += `<ellipse cx="6.7" cy="22.8" rx="1.3" ry=".7" fill="#3b2a20"/><ellipse cx="9.3" cy="22.8" rx="1.3" ry=".7" fill="#3b2a20"/>`
    s += o.dress
        ? `<path d="M5 12.2Q8 10.4 11 12.2L12.2 20Q8 21 3.8 20Z" fill="${o.body}"${OLs}/>`
        : `<path d="M4.9 12.2Q8 10.4 11.1 12.2L11.6 18.8Q8 19.6 4.4 18.8Z" fill="${o.body}"${OLs}/>`
    s += `<path d="M5.4 12.6L7 12L7.4 15.2L5.6 15.4Z" fill="#ffffff" opacity=".18"/>`
    s += `<path d="M5.2 12.6Q3.6 15 4 17.2M10.8 12.6Q12.4 15 12 17.2" stroke="${o.top}" stroke-width="1.6" stroke-linecap="round"/>`
    s += `<circle cx="4" cy="17.4" r=".85" fill="${o.skin}"/><circle cx="12" cy="17.4" r=".85" fill="${o.skin}"/>`
    s += `<circle cx="8" cy="7.4" r="3.4" fill="${o.skin}"${OLs}/>` + o.hair
    s += `<circle cx="6.8" cy="8" r=".45" fill="${INK}"/><circle cx="9.2" cy="8" r=".45" fill="${INK}"/>`
    s += `<circle cx="5.8" cy="9.1" r=".6" fill="#f08a7a" opacity=".55"/><circle cx="10.2" cy="9.1" r=".6" fill="#f08a7a" opacity=".55"/>`
    return `<svg viewBox="0 0 16 24" fill="none" xmlns="http://www.w3.org/2000/svg">${s}${o.front || ''}</svg>`
}

export const VILLAGER_SVGS: string[] = [
    // farmer with straw hat, overalls and an apple basket
    villager({
        skin: '#f2c9a0', top: '#f4efe4', body: '#4a78b5', legs: '#3d6396',
        hair: `<path d="M4.8 6.6Q5 4.8 8 4.6Q11 4.8 11.2 6.6Z" fill="#8a5a30"/><ellipse cx="8" cy="4.9" rx="5.3" ry="1.3" fill="#e8c16a"${OLs}/><path d="M5.3 4.8Q5.5 1.6 8 1.5Q10.5 1.6 10.7 4.8Z" fill="#f0d080"${OLs}/><path d="M5.4 4.2H10.6" stroke="#c0504a" stroke-width=".8"/>`,
        front: `<path d="M6 11.6V14M10 11.6V14" stroke="#3d6396" stroke-width=".7"/><path d="M10.6 16L14.8 16L14.2 19.4L11.2 19.4Z" fill="#b07a45"${OLs}/><path d="M11 16Q12.7 13.4 14.4 16" stroke="#8a5a30" stroke-width=".6"/><circle cx="11.9" cy="15.7" r=".85" fill="#e54b3a"/><circle cx="13.5" cy="15.6" r=".85" fill="#e54b3a"/><path d="M11 17.4H14.4" stroke="#8a5a30" stroke-width=".4"/>`,
    }),
    // gardener in a red dress with a watering can
    villager({
        skin: '#e0ad85', top: '#d4524a', body: '#d4524a', legs: '#e0ad85', dress: true,
        hair: `<circle cx="8" cy="3.4" r="1.6" fill="#6b3f22"/><path d="M4.5 8Q4.2 3.8 8 3.8Q11.8 3.8 11.5 8Q10.6 5.6 8 5.8Q5.6 5.6 4.5 8Z" fill="#6b3f22"${OLs}/>`,
        front: `<path d="M6 13.2H10L10.6 18.6H5.4Z" fill="#f6efe2" opacity=".9"/><path d="M11.2 15.4L14.4 15.4L14.6 19L11 19Z" fill="#7fa3b8"${OLs}/><path d="M14.4 16.2L15.8 13.8" stroke="#7fa3b8" stroke-width=".9" stroke-linecap="round"/><path d="M11.6 15.4Q12.8 13.4 14 15.4" stroke="#5f8396" stroke-width=".6"/><path d="M15.8 13.4L15.9 12.6M15.2 13.2L14.9 12.5" stroke="#8fd0f0" stroke-width=".4" stroke-linecap="round"/>`,
    }),
    // woodsman in a green tunic and orange beanie with a bouquet
    villager({
        skin: '#b87a4b', top: '#5b9a4f', body: '#5b9a4f', legs: '#6b4a32',
        hair: `<path d="M4.6 7.4Q4.4 3.4 8 3.4Q11.6 3.4 11.4 7.4L10.8 6Q8 5.4 5.2 6Z" fill="#2b2118"/><path d="M4.8 6Q5 2.6 8 2.4Q11 2.6 11.2 6Z" fill="#e8823a"${OLs}/><path d="M4.8 5.6H11.2" stroke="#c8622a" stroke-width=".9"/><circle cx="8" cy="2.2" r=".9" fill="#f4efe4"/>`,
        front: `<path d="M4.9 16.6L7.6 15.6M8 18.6H4.9" stroke="#8a5a30" stroke-width=".4"/><path d="M5 14.6H11" stroke="#6b4a32" stroke-width=".9"/><path d="M12 17L13 14.2M12 17L14.4 15M12 17L11.6 14.4" stroke="#4f8a3a" stroke-width=".5"/><circle cx="13" cy="13.8" r=".9" fill="#ffd24a"/><circle cx="14.6" cy="14.8" r=".85" fill="#e86a8a"/><circle cx="11.5" cy="14" r=".85" fill="#9d7fd6"/>`,
    }),
    // elder in a purple robe with a walking stick
    villager({
        skin: '#f5d0b0', top: '#7a5bb5', body: '#7a5bb5', legs: '#5a4a6a', dress: true,
        hair: `<path d="M4.7 8.4Q4.6 5.2 6 4.6L6.4 6.2M11.3 8.4Q11.4 5.2 10 4.6L9.6 6.2" fill="#eeeeee" stroke="#eeeeee" stroke-width="1"/><path d="M5.8 9.8Q8 13 10.2 9.8Q8 10.6 5.8 9.8Z" fill="#f4f4f4"${OLs}/><path d="M6.4 5.4Q8 4.4 9.6 5.4" stroke="#e6c3a3" stroke-width=".5"/>`,
        front: `<path d="M13 11.4L13.4 23" stroke="#8a5a30" stroke-width="1" stroke-linecap="round"/><circle cx="13" cy="11.3" r=".9" fill="#a8743f"/><path d="M5.2 12.4Q8 13.8 10.8 12.4" stroke="#e8b84a" stroke-width=".8"/>`,
    }),
]

// ───────────────────────── ground scatter decorations (16x16, base at 8,14) ─────────────────────────
const deco = (b: string) =>
    `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse cx="8" cy="14" rx="5" ry="1.2" fill="#1a140e" opacity=".2"/>${b}</svg>`
const daisy = (x: number, y: number, petal: string, mid: string) =>
    [0, 72, 144, 216, 288].map((a) => `<ellipse cx="${x}" cy="${r1(y - 1.1)}" rx=".7" ry="1.1" fill="${petal}" transform="rotate(${a} ${x} ${y})"/>`).join('') +
    `<circle cx="${x}" cy="${y}" r=".75" fill="${mid}"/>`

export const DECOR_SVGS: Record<string, string> = {
    flowers_a: deco(
        '<path d="M8 14L7.6 8.4M8 14L4.8 10M8 14L11.2 9.4" stroke="#4f8a3a" stroke-width=".7" stroke-linecap="round"/>' +
        '<path d="M8 14Q5.4 12.8 5.2 11.8Q7 12 8 14ZM8 14Q10.6 12.6 11 11.6Q9 12 8 14Z" fill="#6fae47"/>' +
        daisy(7.6, 7.6, '#ffffff', '#ffc928') + daisy(4.6, 9.4, '#fff4f8', '#ffb627') + daisy(11.3, 8.8, '#ffffff', '#ffc928')
    ),
    flowers_b: deco(
        '<path d="M8 14L8.2 7.6M8 14L4.6 9.2M8 14L11.6 9.6" stroke="#4f8a3a" stroke-width=".7" stroke-linecap="round"/>' +
        '<path d="M8 14Q5 13 4.4 11.2Q7 11.8 8 14ZM8 14Q11 13 11.6 11.4Q9 11.8 8 14Z" fill="#6fae47"/>' +
        [[8.2, 7], [4.6, 8.6], [11.6, 9]].map(([x, y], i) => {
            const c = ['#e8505b', '#9d7fd6', '#f59ab8'][i], d = ['#b8323c', '#6d4fa8', '#d4739a'][i]
            return `<path d="M${x - 1.5} ${y - 1.6}L${x - 0.75} ${y - 0.7}L${x} ${y - 1.8}L${x + 0.75} ${y - 0.7}L${x + 1.5} ${y - 1.6}L${x + 1.4} ${y + 0.3}Q${x} ${y + 1.6} ${x - 1.4} ${y + 0.3}Z" fill="${c}" stroke="${d}" stroke-width=".4" stroke-linejoin="round"/><path d="M${x - 0.8} ${y - 0.2}L${x - 0.6} ${y + 0.6}" stroke="#ffffff" stroke-width=".4" opacity=".6" stroke-linecap="round"/>`
        }).join('')
    ),
    grass: deco(
        '<path d="M8 14Q7.6 9 6 5.6M8 14Q8.6 9.6 10.6 6.8M8 14Q6 11.4 3.4 10M8 14Q10.4 12 12.8 11.2" stroke="#4f8a3a" stroke-width="1.3" stroke-linecap="round"/>' +
        '<path d="M8 14Q8 10 8.6 7.4M7.4 14Q6 12 4.8 8.6M8.6 14Q10.6 11.8 11.8 9.2" stroke="#86c257" stroke-width="1" stroke-linecap="round"/>' +
        '<path d="M8.4 8.6L8.6 7.4" stroke="#b6e07e" stroke-width=".6" stroke-linecap="round"/>'
    ),
    rock: deco(
        `<path d="M2.8 13.6Q2.4 9.6 5.6 8.2Q8.4 6.2 11.4 8Q13.8 9.6 13.2 13.6Q8 14.8 2.8 13.6Z" fill="#8d9096"${OL}/>` +
        '<path d="M4 11.4Q4.6 9 6.6 8.6Q8.6 7.8 10.4 8.8Q7.4 9 6.2 10.4Q5 11.4 4 11.4Z" fill="#b9bcc0"/>' +
        '<path d="M10.6 13.8Q12.4 12.4 13.2 10.6Q13.4 12.4 13.2 13.6Z" fill="#6f737a"/>' +
        '<path d="M5.4 8.6Q7.4 7 9.6 7.4Q8 8.2 6.6 9Z" fill="#6fae47"/>'
    ),
    mushroom: deco(
        `<path d="M9.4 14L9.6 10.4H11.4L11.6 14Z" fill="#f1e2c6"${OL}/><path d="M7.6 10.8Q7.8 6.8 10.5 6.6Q13.2 6.8 13.4 10.8Q10.5 11.6 7.6 10.8Z" fill="#dc4a3a"${OL}/>` +
        '<path d="M8.4 9.8Q8.6 7.6 10.2 7.2Q9.2 8.4 8.4 9.8Z" fill="#f47b62"/><circle cx="11.4" cy="8.4" r=".6" fill="#fff6e6"/><circle cx="9.6" cy="9.4" r=".5" fill="#fff6e6"/><circle cx="12.4" cy="9.9" r=".4" fill="#fff6e6"/>' +
        `<path d="M4.6 14L4.8 12H5.8L6 14Z" fill="#f1e2c6"${OL}/><path d="M3.4 12.4Q3.6 9.8 5.3 9.7Q7 9.8 7.2 12.4Q5.3 12.9 3.4 12.4Z" fill="#c8843e"${OL}/><circle cx="4.8" cy="10.8" r=".4" fill="#f0c48a"/>`
    ),
    bush: deco(
        `<g fill="${INK}" stroke="${INK}" stroke-width="1.4" opacity=".35"><circle cx="5" cy="10.6" r="3.4"/><circle cx="11" cy="10.6" r="3.4"/><circle cx="8" cy="8" r="4.2"/></g>` +
        '<circle cx="5" cy="10.6" r="3.4" fill="#2f6b3a"/><circle cx="11" cy="10.6" r="3.4" fill="#2f6b3a"/><circle cx="8" cy="8" r="4.2" fill="#2f6b3a"/>' +
        '<circle cx="4.7" cy="10.2" r="2.7" fill="#4f9a4a"/><circle cx="10.6" cy="10.2" r="2.7" fill="#4f9a4a"/><circle cx="7.6" cy="7.5" r="3.4" fill="#4f9a4a"/>' +
        '<circle cx="6.6" cy="6.3" r="1.4" fill="#8cc867"/><circle cx="3.9" cy="9.4" r=".9" fill="#8cc867"/>' +
        '<circle cx="9.6" cy="9.2" r=".7" fill="#e54b3a"/><circle cx="11.8" cy="11" r=".7" fill="#e54b3a"/><circle cx="6.2" cy="11.6" r=".7" fill="#e54b3a"/>'
    ),
}

// ───────────────────────── night-time light halos (sprite coordinates, 0..64) ─────────────────────────
export const LIGHT_SOURCES: Record<string, { x: number; y: number; r: number; color: string }> = {
    cabin: { x: 25, y: 46, r: 18, color: '#ffc861' },
    lantern: { x: 38, y: 26, r: 16, color: '#ffd36b' },
    campfire: { x: 32, y: 44, r: 20, color: '#ffa23a' },
    gazebo: { x: 32, y: 35, r: 14, color: '#ffd36b' },
    greenhouse: { x: 27, y: 44, r: 18, color: '#fff0a8' },
    mushroom_circle: { x: 32, y: 47, r: 22, color: '#7ff5d8' },
    golden_tree: { x: 32, y: 22, r: 26, color: '#ffe27a' },
    watermill: { x: 41.5, y: 36.5, r: 12, color: '#ffc861' },
    windmill: { x: 31, y: 39, r: 11, color: '#ffc861' },
}

// ───────────────────────── species-aware early growth ─────────────────────────
const SPROUT_PAL: Record<string, Pal> = {
    classic_pine: PINE,
    ancient_oak: GREEN,
    sakura: GREEN,
    autumn_maple: ['#a8361f', '#d85a2a', '#f39a4a'],
    sunflower: ['#3f7a32', '#6fbf4a', '#a8e07a'],
    golden_tree: GOLD,
    willow: WILLOW,
    bonsai: GREEN,
    lavender: ['#5f7f4f', '#86a670', '#b3c99d'],
    bamboo: ['#4f8f36', '#7fb24f', '#b9df86'],
    mushroom_circle: GREEN,
}
const SEED_COL: Record<string, [string, string]> = {
    classic_pine: ['#6b4a2f', '#9c6c44'],
    ancient_oak: ['#8a5a2a', '#c28c55'],
    sakura: ['#7a3a3a', '#b86a6a'],
    autumn_maple: ['#a0522d', '#d8894e'],
    sunflower: ['#3a3533', '#e8e0d0'],
    golden_tree: ['#c98f10', '#ffe27a'],
    willow: ['#6a7a3a', '#a8b868'],
    lavender: ['#5a4a6a', '#9a8aaa'],
    bamboo: ['#8a7a3a', '#c8b86a'],
    mushroom_circle: ['#b8a890', '#efe2c8'],
}

const auraDef = (id: string, c: string) =>
    `<defs><radialGradient id="${id}"><stop offset="0" stop-color="${c}" stop-opacity=".7"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient></defs>`
function goldAura(r: number, cy: number): string {
    return auraDef('pf-growth_golden-1', '#ffe27a') + C(32, cy, r, 'url(#pf-growth_golden-1)', ' class="pf-glow"')
}
function mintAura(r: number, cy: number): string {
    return auraDef('pf-growth_mushroom-1', '#8ff0d6') + C(32, cy, r, 'url(#pf-growth_mushroom-1)', ' class="pf-glow"')
}

function miniPot(inner: string): string {
    return (
        shadow(12, 3.6) + sway(inner) +
        P('M21.5 46.5L42.5 46.5L42 49L22 49Z', '#2f5578') + P('M23 49L41 49L39.4 56Q32 57.2 24.6 56Z', '#3f6f9a') +
        P('M23.4 49.3L28 49.3L27.4 56.4Q25.8 56.3 24.6 56Z', '#6b98c0', false) +
        E(32, 46.5, 10.5, 1.9, '#4f82ad', OL) + E(32, 46.6, 8.6, 1.2, '#4a3526')
    )
}

function saplingFor(id: string): string {
    switch (id) {
        case 'classic_pine':
            return shadow(15, 4) + mound() + sway(trunk(30.8, 33.2, 42, BARK, 1.5) + tier(27, 43, 10.5, PINE) + tier(20, 36, 8.4, PINE) + tier(13, 29, 6.2, PINE))
        case 'sakura':
            return saplingArt(SAKURA) + E(20, 57, 1.1, 0.5, '#f3a9c4') + E(45, 56.4, 1, 0.5, '#ffdbe8')
        case 'autumn_maple':
            return saplingArt(MAPLE_MID) + P(starPath(46, 44, 5, 1.8, 0.8, 0.3), '#e8622a')
        case 'golden_tree':
            return goldAura(17, 24) + saplingArt(GOLD) + twinkle(18, 16, 2.2, '#fff6c8', 0) + twinkle(47, 20, 2, '#fff6c8', 0.9)
        case 'willow':
            return (
                saplingArt(WILLOW) +
                `<g class="pf-sway" style="transform-origin:32px 56px">` +
                OLN('M24 25Q22.6 32 23.6 38M40 24Q41.6 31 40.6 37M28 29Q27.6 34 28.4 39M36 29Q36.6 34 35.8 38', WILLOW[1], 1.8) + '</g>'
            )
        case 'sunflower':
            return (
                shadow(14, 4) + mound() +
                sway(
                    OLN('M32 49Q31 38 32.5 24', '#4e8a3a', 2) + leaf(31.6, 41, 205, 9, 3.6, '#5fa84a', '#3f7a32') + leaf(32, 35, -25, 9, 3.6, '#6fbf4a', '#3f7a32') +
                    P(starPath(32.6, 21, 10, 5.2, 2.8), '#ffc928') + C(32.6, 21, 3.4, '#5fa84a', OL) + C(31.8, 20.2, 1.2, '#8cc867')
                )
            )
        case 'lavender':
            return (
                shadow(14, 4) + mound() +
                sway(
                    `<g stroke-linecap="round"><path d="M32 50Q27 46 23 45M32 50Q37 46 41 45M32 50Q30 45 28.5 42" stroke="#6e8f55" stroke-width="1.6"/></g>` +
                    lavenderSpike(31, 27, 30, 4).replace(/M31 54/, 'M31 49') + lavenderSpike(33, 37, 29, 4).replace(/M33 54/, 'M33 49') +
                    lavenderSpike(32, 32, 24, 5).replace(/M32 54/, 'M32 49')
                )
            )
        case 'bamboo':
            return (
                shadow(14, 4) +
                sway(bambooCulm(28, 26, 3.6) + bambooCulm(35, 32, 3.2, true) + leaf(28, 30, 200, 8, 1.8, '#6fae47', '#4f8f36') + leaf(35, 36, -20, 7, 1.6, '#86c257') + leaf(28, 26.5, -60, 5, 1.3, '#86c257')) +
                mound()
            )
        case 'mushroom_circle':
            return (
                shadow(16, 4) + mound() + mintAura(16, 45) +
                sway(mushroom(24.5, 51.5, 0.8, RED_CAP) + mushroom(33, 50, 1, GLOW_CAP, true) + mushroom(40.5, 52.5, 0.72, RED_CAP)) +
                twinkle(28, 36, 1.2, '#c8fff4', 0) + twinkle(38, 38, 1.1, '#c8fff4', 1)
            )
        case 'bonsai':
            return miniPot(
                OLN('M32 46Q29 41 33 37Q36 33.5 31 30.5M33 37.5Q37 35.5 39.5 33', '#6b4a32', 2) +
                blobs([[27.5, 28, 3.6, 1], [31.5, 26.5, 4, 1], [35, 28.5, 3.2]], GREEN) + blobs([[39.5, 32, 3, 1], [42.5, 32.6, 2.6]], GREEN)
            )
        default:
            return saplingArt(SPROUT_PAL[id] || GREEN)
    }
}

function sproutFor(id: string): string {
    switch (id) {
        case 'mushroom_circle':
            return shadow(14, 4) + mound() + mintAura(11, 44) + sway(mushroom(32, 49.5, 0.75, GLOW_CAP, true)) + LN('M26 49L25.4 47M38 49L38.8 47.2', '#6fae47', 0.9)
        case 'bamboo':
            return (
                shadow(14, 4) +
                sway(P('M29.6 50L31.4 34Q32 31.6 32.8 34L34.6 50Z', '#7fb24f') + P('M30.3 49L31.8 36L32.3 36L31.6 49Z', '#b9df86', false) + LN('M30.4 44L34 43.4M30.8 39L33.6 38.4', '#4f8f36', 0.7) + leaf(33.2, 40, -40, 7, 1.6, '#86c257')) +
                mound()
            )
        case 'sakura':
            return sproutArt(GREEN).replace(/<\/g><\/svg>$|<\/g>$/, '') + C(32.6, 33.2, 1.6, '#f3a9c4', OL) + '</g>'
        case 'golden_tree':
            return goldAura(10, 38) + sproutArt(GOLD) + twinkle(40, 30, 1.6, '#fff6c8', 0.5)
        case 'bonsai':
            return miniPot(OLN('M32 46Q31 42 32.4 38', '#4f9a4a', 1.4) + leaf(32.2, 40.5, 205, 6.5, 2.6, '#4f9a4a', '#2f6b3a') + leaf(32.4, 38.6, -30, 7, 2.8, '#6fbf4a', '#2f6b3a'))
        default:
            return sproutArt(SPROUT_PAL[id] || GREEN)
    }
}

/** Species-aware seed / sprout / sapling art drawn in a soil mound (unknown ids fall back to generic green). */
export function growthSvg(stage: 'seed' | 'sprout' | 'sapling', speciesId: string): string {
    if (stage === 'seed') {
        const art = seedArt(SEED_COL[speciesId], (SPROUT_PAL[speciesId] || GREEN)[1])
        return svg(speciesId === 'golden_tree' ? goldAura(9, 46) + art + twinkle(40, 40, 1.6, '#fff6c8', 0) : art)
    }
    if (stage === 'sprout') return svg(sproutFor(speciesId))
    return svg(saplingFor(speciesId))
}

/** A tree in the grove: withered, young (harvested early when its task was done), or fully grown. */
export function plantedTreeSvg(tree: { status: 'mature' | 'young' | 'withered'; speciesId: string }): string {
    if (tree.status === 'withered') return GROWTH_STAGE_SVGS.withered
    if (tree.status === 'young') return growthSvg('sapling', tree.speciesId)
    return SPECIES_SVGS[tree.speciesId] || SPECIES_SVGS.classic_pine
}
