/**
 * Regenerates docs/images/*.png from the plugin's real renderer and components.
 *   node scripts/readme-images/build.mjs
 * Needs Google Chrome (set CHROME=/path/to/chrome to override).
 */
import esbuild from 'esbuild'
import esbuildSvelte from 'esbuild-svelte'
import sveltePreprocess from 'svelte-preprocess'
import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const build = path.join(here, '.build')
const images = path.join(root, 'docs/images')
const chrome = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
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

// name, page, window size, device scale
const shots = []
const composed = (name, w, h, scale = 1.5) => shots.push({ name, url: `${name}.html`, w, h, scale })
// Headless Chrome won't go narrower than ~500px, so narrow panels are shot in a wider window and cropped.
const MIN_WINDOW = 520
const ui = (name, query, w, h, opts = {}) => {
    uiPage(name, { ...opts, extra: `${opts.extra || ''}${w < MIN_WINDOW ? `#wrap{width:${w}px;margin:0 auto}` : ''}` })
    shots.push({ name, url: `${name}.html?${query}`, w: Math.max(w, MIN_WINDOW), h, cropW: w, scale: 2 })
}

composed('hero', 1600, 720)
composed('day-cycle', 1320, 990)
composed('biomes', 1440, 1000)
composed('growth', 1240, 1010)
composed('collection', 1400, 1030)
ui('panel-sidebar', 'scene=sidebar', 356, 880, { pad: 12 })
ui('panel-reward', 'scene=sidebar-reward&settle=1', 356, 640, { pad: 12 })
ui('panel-levelup', 'scene=sidebar-levelup&settle=1', 356, 640, { pad: 12 })
ui('panel-grove', 'scene=forest&tab=grove', 356, 1010, { pad: 12 })
ui('panel-market', 'scene=forest&tab=market&player=mid&click=Builders', 356, 960, { pad: 12 })
ui('panel-journey', 'scene=forest&tab=journey', 356, 1510, { pad: 12 })
ui('panel-tasks', 'scene=tasks&pins=2', 356, 860, { pad: 12 })
ui('panel-tasks-edit', 'scene=tasks&press=.edit&nth=1&focus=1&tracking=1', 356, 1130, { pad: 12 })
ui('homestead-full', 'scene=homestead&select=cabin', 1360, 880, { pad: 0, extra: 'body{height:880px;overflow:hidden}' })
const boardPage = { pad: 0, extra: '#wrap,#app{height:100vh} body{overflow:hidden}' }
ui('board', 'scene=board&burst=1', 1480, 680, boardPage)
ui('board-light', 'scene=board&theme=light', 1480, 680, boardPage)
ui('board-stats', 'scene=board&press=.tool&nth=0', 1480, 860, boardPage)
ui('board-edit', 'scene=board&focus=0&press=.pf-card&nth=1', 1480, 680, boardPage)

const only = process.argv[2]
for (const s of shots) {
    if (only && !s.name.includes(only)) continue
    const png = path.join(images, `${s.name}.png`)
    execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-sandbox', `--force-device-scale-factor=${s.scale}`, `--window-size=${s.w},${s.h}`, '--virtual-time-budget=12000', `--screenshot=${png}`, `file://${path.join(build, s.url)}`], { stdio: 'ignore' })
    if (s.cropW) execFileSync('sips', ['--cropOffset', '0', '0', '--cropToHeightWidth', String(s.h * s.scale), String(s.cropW * s.scale), png], { stdio: 'ignore' })
    console.log('wrote', path.relative(root, png), `${Math.round(fs.statSync(png).size / 1024)} KB`)
}
