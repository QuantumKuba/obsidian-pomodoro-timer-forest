/**
 * Regenerates docs/images/* from the plugin's real renderer and components.
 *   node scripts/readme-images/build.mjs            all images
 *   node scripts/readme-images/build.mjs board      only names containing "board"
 * Needs Google Chrome (set CHROME=/path/to/chrome to override) and Node 22+.
 * The two animations (timer-growth.gif, village-day.gif) also need ffmpeg; without it
 * they are skipped.
 */
import esbuild from 'esbuild'
import esbuildSvelte from 'esbuild-svelte'
import sveltePreprocess from 'svelte-preprocess'
import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { openChrome } from './chrome.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const build = path.join(here, '.build')
const images = path.join(root, 'docs/images')
const chromeBin = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
fs.rmSync(build, { recursive: true, force: true })
fs.mkdirSync(build, { recursive: true })
fs.mkdirSync(images, { recursive: true })

const alias = { obsidian: path.join(here, 'obsidian-stub.ts') }
const svelte = esbuildSvelte({ compilerOptions: { css: 'injected' }, preprocess: sveltePreprocess() })
const loader = { '.css': 'text' }
await esbuild.build({ entryPoints: [path.join(here, 'harness.ts')], bundle: true, format: 'iife', loader, outfile: path.join(build, 'harness.js'), alias, plugins: [svelte], logLevel: 'error', target: 'es2020' })
await esbuild.build({ entryPoints: [path.join(here, 'compose.ts')], bundle: true, platform: 'node', loader, format: 'cjs', outfile: path.join(build, 'compose.cjs'), alias, logLevel: 'error' })
execFileSync('node', [path.join(build, 'compose.cjs'), build], { stdio: 'inherit' })

const tpl = fs.readFileSync(path.join(here, 'page.html.tpl'), 'utf8')
const uiPage = (name, { hour = 12, pad = 12, extra = '' }) =>
    fs.writeFileSync(path.join(build, `${name}.html`), tpl.replace('__PAD__', pad).replace('__HOUR__', hour).replace('__EXTRA__', extra))

// ------------------------------------------------------------------ clip helpers (evaluated in the page)
/** Full width, from the top down to the lowest bottom edge of `sel` (or its nth match). */
const downTo = (sel, extra = 12, nth = -1) =>
    `const els=[...document.querySelectorAll(${JSON.stringify(sel)})].filter(e=>e.getBoundingClientRect().height>0);
     const pick=${nth}<0?els:[els[${nth}]]; const b=Math.max(...pick.map(e=>e.getBoundingClientRect().bottom));
     return {x:0,y:0,width:document.documentElement.clientWidth,height:Math.ceil(b+${extra})}`
/** The union of every `sel` box, grown by `pad`. */
const around = (sel, pad = 0) =>
    `const rs=[...document.querySelectorAll(${JSON.stringify(sel)})].map(e=>e.getBoundingClientRect()).filter(r=>r.height>0);
     const x=Math.min(...rs.map(r=>r.left))-${pad}, y=Math.min(...rs.map(r=>r.top))-${pad};
     return {x:Math.max(0,x),y:Math.max(0,y),width:Math.max(...rs.map(r=>r.right))+${pad}-Math.max(0,x),height:Math.max(...rs.map(r=>r.bottom))+${pad}-Math.max(0,y)}`

// ------------------------------------------------------------------ the shot list
// Every still is rounded the same way (RADIUS CSS px at its own scale) with transparent
// corners, so the README reads as one set on light and dark GitHub themes alike.
const RADIUS = 18
const shots = []
// Composed pages size their own <body>; the shot is clipped to it
const composed = (name, scale = 1.5) => shots.push({ name, url: `${name}.html`, w: 1600, h: 1000, scale, clip: 'body' })
const ui = (name, query, w, h, opts = {}) => {
    uiPage(name, opts)
    shots.push({ name, url: `${name}.html?${query}`, w, h, scale: opts.scale || 2, clip: opts.clip, settle: opts.settle })
}

ui('hero', 'scene=hero', 1600, 1000, { pad: 0, scale: 1.5, clip: 'body' })
ui('how-it-works', 'scene=loop', 1600, 1000, { pad: 0, scale: 1.5, clip: 'body' })
ui('charter', 'scene=charter', 1600, 1000, { pad: 0, scale: 1.5, clip: 'body' })
composed('growth')
composed('collection')
composed('day-cycle', 1.25)
composed('biomes')

// Narrow panels: the sidebar width people actually use, cropped to the interesting part
ui('panel-sidebar', 'scene=sidebar', 356, 900, { clip: downTo('svg.pf-scene', 14) })
ui('panel-reward', 'scene=sidebar-reward&settle=1', 356, 900, { clip: downTo('.pf-card', 18) })
ui('panel-levelup', 'scene=sidebar-levelup&settle=1', 356, 900, { clip: downTo('.pf-card', 18) })
ui('panel-grove', 'scene=forest&tab=grove', 356, 1100, { clip: downTo('.heat', 14) })
ui('panel-market', 'scene=forest&tab=market&player=mid&click=Builders', 356, 1400, { clip: downTo('.pf-market .card', 6, 2) })
ui('panel-journey', 'scene=forest&tab=journey', 356, 2200, { clip: downTo('.chest', 14) })
ui('panel-tasks', 'scene=tasks&pins=2', 356, 1000, { clip: downTo('.panel', 12) })
ui('panel-tasks-edit', 'scene=tasks&press=.edit&nth=1&focus=1&tracking=1', 356, 1300, { clip: downTo('.group', 12, 0), settle: 1500 })
ui('homestead-full', 'scene=homestead&select=cabin', 1360, 900, { pad: 0, extra: 'body{height:900px;overflow:hidden}', clip: around('.pf-forest > *', 28) })
const boardPage = { pad: 0, extra: '#wrap,#app{height:100vh} body{overflow:hidden} .add-lane{display:none}', clip: downTo('.pf-lane', 24) }
ui('board', 'scene=board&burst=1', 1520, 720, boardPage)
ui('board-light', 'scene=board&theme=light', 1520, 720, boardPage)
ui('board-stats', 'scene=board&press=.tool&nth=0', 1520, 960, boardPage)
ui('board-edit', 'scene=board&focus=0&press=.pf-card&nth=1', 1520, 720, boardPage)
ui('board-phone', 'scene=board&mobile=1', 390, 900, boardPage)

// Animations: frames shot one by one, then stitched by ffmpeg
uiPage('dial', { pad: 0 })
const anims = [
    {
        name: 'timer-growth', fps: 12, hold: 14, scale: 2,
        frames: Array.from({ length: 40 }, (_, i) => ({ url: `dial.html?scene=dial&ratio=${Math.min(0.999, i / 39)}`, w: 300, h: 300, settle: 600 })),
    },
    {
        name: 'village-day', fps: 8, hold: 6, scale: 1.25,
        frames: Array.from({ length: JSON.parse(fs.readFileSync(path.join(build, 'village-day.json'), 'utf8')) }, (_, i) =>
            ({ url: `village-day-${String(i).padStart(2, '0')}.html`, w: 560, h: 392, budget: 0, settle: 50 })),
    },
]

// ------------------------------------------------------------------ run
const only = process.argv[2]
const chrome = await openChrome(chromeBin)
const kb = (f) => `${Math.round(fs.statSync(f).size / 1024)} KB`
const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) })
const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true } catch { return false } })()

/** Rounds the corners of a finished PNG (anti-aliased, transparent outside) by drawing it once more in Chrome. */
async function frame(buf, radius) {
    const { w, h } = pngSize(buf)
    const src = path.join(build, `frame-${Math.random().toString(36).slice(2)}.png`)
    fs.writeFileSync(src, buf)
    const html = src.replace(/\.png$/, '.html')
    fs.writeFileSync(html, `<!doctype html><html><body style="margin:0;background:transparent"><img src="${path.basename(src)}" style="display:block;width:${w}px;height:${h}px;border-radius:${radius}px"></body></html>`)
    return chrome.shoot({ url: `file://${html}`, width: w, height: h, scale: 1, budget: 0, settle: 0, transparent: true })
}

/** Chrome writes PNGs fast, not small; ffmpeg's best filter choice saves 10–25% losslessly. */
function squeeze(file) {
    if (!hasFfmpeg) return
    const tmp = file.replace(/\.png$/, '.tmp.png')
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-pred', 'mixed', '-compression_level', '9', tmp])
    if (fs.statSync(tmp).size < fs.statSync(file).size) fs.renameSync(tmp, file)
    else fs.rmSync(tmp)
}

try {
    for (const s of shots) {
        if (only && !s.name.includes(only)) continue
        const png = path.join(images, `${s.name}.png`)
        const raw = await chrome.shoot({ url: `file://${path.join(build, s.url)}`, width: s.w, height: s.h, scale: s.scale, clip: s.clip, settle: s.settle })
        fs.writeFileSync(png, await frame(raw, Math.round(RADIUS * s.scale)))
        squeeze(png)
        const { w, h } = pngSize(fs.readFileSync(png))
        console.log('wrote', path.relative(root, png), `${w}×${h}`, kb(png))
    }
    for (const a of anims) {
        if (only && !a.name.includes(only)) continue
        if (!hasFfmpeg) { console.log('skipped', a.name, '(no ffmpeg)'); continue }
        const dir = path.join(build, a.name)
        fs.mkdirSync(dir, { recursive: true })
        for (const [i, f] of a.frames.entries()) {
            fs.writeFileSync(path.join(dir, `${String(i).padStart(3, '0')}.png`), await chrome.shoot({ url: `file://${path.join(build, f.url)}`, width: f.w, height: f.h, scale: a.scale, budget: f.budget ?? 2000, settle: f.settle }))
        }
        // Each frame shown 1/fps, the last one held for `hold` frames before the loop restarts
        const list = a.frames.map((_, i) => `file '${String(i).padStart(3, '0')}.png'\nduration ${(i === a.frames.length - 1 ? a.hold : 1) / a.fps}`).join('\n') + `\nfile '${String(a.frames.length - 1).padStart(3, '0')}.png'\n`
        fs.writeFileSync(path.join(dir, 'list.txt'), list)
        const gif = path.join(images, `${a.name}.gif`)
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'),
            '-vf', 'split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle',
            '-loop', '0', gif])
        const { w, h } = pngSize(fs.readFileSync(path.join(dir, '000.png')))
        console.log('wrote', path.relative(root, gif), `${w}×${h}`, `${a.frames.length} frames`, kb(gif))
    }
} finally {
    await chrome.close()
}
