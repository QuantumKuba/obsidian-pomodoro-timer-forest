/**
 * Node entry: renders the composed marketing pages (hero, day cycle, biomes,
 * growth stages, catalog) as standalone HTML using the plugin's real renderer,
 * catalog and art. Usage: node compose.cjs <outDir>
 */
import * as fs from 'fs'
import { renderVillage, SCENE_CSS } from '../../src/render/VillageScene'
import { BIOME_CONFIGS, SPECIES_SVGS, growthSvg } from '../../src/assets/floraAssets'
import { BIOME_UNLOCK_LEVELS, FLORA_SPECIES, HOMESTEAD_BUILDINGS, LAND_EXPANSIONS } from '../../src/assets/floraCatalog'
import { perkText } from '../../src/services/Progression'
import type { BiomeType } from '../../src/types/forest'
import { village } from './sample-data'

const out = process.argv[2]
const at = (h: number, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d }
const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif`
const page = (w: number, h: number, css: string, body: string) =>
    `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;width:${w}px;height:${h}px;overflow:hidden;font-family:${FONT};${''}}${css}</style></head><body>${body}</body></html>`
const write = (name: string, html: string) => fs.writeFileSync(`${out}/${name}.html`, html)

// ---------------------------------------------------------------- hero
{
    const svg = renderVillage(village(), { embedCss: true, date: at(12), idPrefix: 'hero' })
    write('hero', page(1600, 720, `
        body{background:linear-gradient(#79c1ee,#d9f1ff);position:relative}
        .scene{position:absolute;right:-30px;top:0;width:990px;-webkit-mask-image:linear-gradient(to right,transparent 0,#000 24%)}
        .copy{position:absolute;left:72px;top:150px;width:600px;color:#10324a}
        .kicker{display:inline-block;font-size:15px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;padding:5px 14px;border-radius:99px;background:rgba(255,255,255,.7);color:#2e7d32}
        h1{font-size:76px;line-height:1;margin:18px 0 16px;letter-spacing:-.02em;color:#0d2c40}
        h1 em{font-style:normal;color:#2e7d32}
        p{font-size:25px;line-height:1.4;margin:0 0 26px;color:#1d4560}
        .chips{display:flex;gap:10px;flex-wrap:wrap}
        .chip{font-size:18px;font-weight:600;padding:9px 16px;border-radius:14px;background:rgba(255,255,255,.78);box-shadow:0 4px 14px rgba(20,60,90,.12)}
        `, `<div class="scene">${svg}</div><div class="copy"><span class="kicker">Obsidian plugin</span><h1>Pomodoro Timer <em>Forest</em></h1><p>Every focus session grows a tree.<br>Every tree builds your village.</p><div class="chips"><span class="chip">🌲 Grow trees</span><span class="chip">🏡 Build a village</span><span class="chip">🔥 Keep a streak</span><span class="chip">✅ Tick off tasks</span></div></div>`))
}

// ---------------------------------------------------------------- day cycle
{
    const g = village()
    const cells: [string, string, Date][] = [
        ['🌅 Dawn', 'Mist lifts, the first windows glow', at(6, 30)],
        ['☀️ Day', 'Sails turn, villagers wander', at(12)],
        ['🌇 Dusk', 'Lanterns and hearth light up', at(19)],
        ['🌙 Night', 'Fireflies, stars and a warm campfire', at(23)],
    ]
    const html = cells.map(([t, sub, d], i) => `<div class="cell"><div class="tag"><b>${t}</b><span>${sub}</span></div>${renderVillage(g, { embedCss: i === 0, date: d, idPrefix: `dc${i}`, still: true })}</div>`).join('')
    write('day-cycle', page(1320, 990, `
        body{background:#15181a;padding:10px;display:grid;grid-template-columns:1fr 1fr;gap:10px;align-content:start}
        .cell{position:relative;border-radius:18px;overflow:hidden;height:475px}
        .cell svg{width:100%;height:100%}
        .tag{position:absolute;left:14px;bottom:14px;z-index:2;display:flex;flex-direction:column;gap:2px;padding:8px 14px;border-radius:12px;background:rgba(10,14,20,.62);color:#fff;backdrop-filter:blur(6px)}
        .tag b{font-size:20px}.tag span{font-size:13px;opacity:.85}
        `, `<style>${SCENE_CSS}</style>${html}`))
}

// ---------------------------------------------------------------- biomes
{
    type R = [string, string, number, number, number?]
    const mini: R[] = [
        ['tree', 'sakura', 0, 0, 3], ['tree', 'classic_pine', 3, 0, 2], ['tree', 'autumn_maple', 4, 1, 3], ['building', 'cabin', 1, 1, 3],
        ['building', 'cobblestone_path', 2, 1], ['building', 'cobblestone_path', 2, 2], ['building', 'cobblestone_path', 2, 3],
        ['building', 'stone_well', 3, 2, 2], ['building', 'campfire', 1, 3, 2], ['building', 'lantern', 3, 3, 2],
        ['tree', 'lavender', 0, 3, 2], ['building', 'water_stream', 0, 4], ['building', 'water_stream', 1, 4], ['building', 'bridge', 2, 4],
        ['building', 'water_stream', 3, 4], ['building', 'water_stream', 4, 4], ['tree', 'ancient_oak', 4, 3, 2], ['tree', 'sunflower', 0, 1, 1],
    ]
    const base = village()
    const biomes = Object.keys(BIOME_UNLOCK_LEVELS) as BiomeType[]
    const cells = biomes.map((b, i) => {
        const g = { ...base, landSize: 5, activeBiome: b, vitality: 90, homestead: mini.map(([t, id, x, y, l], k) => ({ id: `m${k}`, itemType: t as any, itemId: id, gridX: x, gridY: y, level: l ?? 1 })) }
        const date = b === 'twilight_moss' ? at(20) : at(13)
        const conf = BIOME_CONFIGS[b]
        return `<div class="cell">${renderVillage(g, { embedCss: i === 0, date, idPrefix: `bm${i}`, still: true })}<div class="cap"><b>${conf.name}</b><span>${conf.description}</span><i>Unlocks at level ${BIOME_UNLOCK_LEVELS[b]}</i></div></div>`
    }).join('')
    const lands = LAND_EXPANSIONS.map((l) => `${l.size}×${l.size} at level ${l.unlockLevel}`).join(' · ')
    write('biomes', page(1440, 1000, `
        body{background:#f4f1ea;padding:22px;display:grid;grid-template-columns:repeat(3,1fr);gap:18px;align-content:start;color:#2b2a27}
        .cell{background:#fffdf8;border:1px solid #e4ddd0;border-radius:20px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.07)}
        .cell svg{display:block;width:100%;height:auto;aspect-ratio:368/316}
        .cap{display:flex;flex-direction:column;gap:2px;padding:10px 16px 14px}
        .cap b{font-size:20px}.cap span{font-size:14px;color:#6f6a60}.cap i{font-size:13px;color:#2e7d32;font-style:normal;font-weight:600;margin-top:4px}
        .note{border-radius:20px;background:linear-gradient(135deg,#2e7d32,#1b5e20);color:#fff;padding:26px;display:flex;flex-direction:column;justify-content:center;gap:10px}
        .note h3{margin:0;font-size:28px;line-height:1.15}.note p{margin:0;font-size:16px;opacity:.92;line-height:1.45}
        `, `<style>${SCENE_CSS}</style>${cells}<div class="note"><h3>Five biomes.<br>Your land keeps growing.</h3><p>Each biome has its own ground, foliage and hills — and reacts to the time of day. Start on a 5×5 plot and expand it: ${lands}.</p></div>`))
}

// ---------------------------------------------------------------- growth
{
    const rows: [string, string][] = [['sakura', 'Cherry Blossom'], ['classic_pine', 'Classic Pine'], ['sunflower', 'Sunflower'], ['bonsai', 'Zen Bonsai'], ['golden_tree', 'Celestial Gold Tree']]
    const stages: [string, string][] = [['seed', '0% · Seed planted'], ['sprout', '25% · Sprouting'], ['sapling', '50% · Sapling'], ['mature', '75–100% · Fully grown']]
    const head = stages.map(([, l]) => `<div class="h">${l}</div>`).join('')
    const body = rows.map(([id, name]) => `<div class="name">${name}</div>` + stages.map(([s]) => `<div class="c">${s === 'mature' ? SPECIES_SVGS[id] : growthSvg(s as any, id)}</div>`).join('')).join('')
    write('growth', page(1240, 1010, `
        body{background:#f4f1ea;padding:26px 30px;color:#2b2a27}
        h2{margin:0 0 4px;font-size:30px}.sub{margin:0 0 18px;color:#6f6a60;font-size:16px}
        .g{display:grid;grid-template-columns:170px repeat(4,1fr);gap:10px;align-items:center}
        .h{font-size:14px;font-weight:700;text-align:center;color:#2e7d32;text-transform:uppercase;letter-spacing:.05em}
        .name{font-weight:700;font-size:17px}
        .c{height:150px;border-radius:18px;background:radial-gradient(circle at 50% 78%,#e2efd3,#f8f6ee 70%);border:1px solid #e4ddd0;padding:8px}
        .c svg{width:100%;height:100%}
        `, `<h2>Watch it grow — in real time</h2><p class="sub">The plant in your timer advances through four stages as the minutes pass. Give up early and it withers.</p><div class="g"><div></div>${head}${body}</div>`))
}

// ---------------------------------------------------------------- collection
{
    const trees = FLORA_SPECIES.map((s) => `<div class="card"><div class="art">${s.iconSvg}</div><b>${s.name}</b><span class="lv">Level ${s.unlockLevel}</span><span class="d">${s.recommendedDuration}m · ${s.category}</span></div>`).join('')
    const builds = HOMESTEAD_BUILDINGS.filter((b) => b.category !== 'path' || b.id === 'water_stream' || b.id === 'cobblestone_path').map((b) => `<div class="card b"><div class="art">${b.iconSvg}</div><b>${b.name}</b><span class="lv">Level ${b.unlockLevel}${b.maxLevel > 1 ? ' · ' + '★'.repeat(b.maxLevel) : ''}</span><span class="d">${b.perk ? '⚡ ' + perkText(b, 1) : b.description}</span></div>`).join('')
    write('collection', page(1400, 1030, `
        body{background:#f4f1ea;padding:26px 30px;color:#2b2a27}
        h2{margin:0 0 12px;font-size:26px}h2 small{font-size:15px;color:#6f6a60;font-weight:500;margin-left:8px}
        .grid{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:26px}
        .card{display:flex;flex-direction:column;align-items:center;text-align:center;gap:2px;padding:12px 8px 12px;border-radius:16px;background:#fffdf8;border:1px solid #e4ddd0}
        .art{width:78px;height:78px}.art svg{width:100%;height:100%}
        b{font-size:14px}.lv{font-size:12px;font-weight:700;color:#2e7d32}.d{font-size:11.5px;color:#6f6a60;line-height:1.3}
        .b .lv{color:#c47f00}
        `, `<h2>🌱 The nursery<small>${FLORA_SPECIES.length} species, unlocked as you level up</small></h2><div class="grid">${trees}</div><h2>🔨 The builders<small>buildings with perks that grow when you upgrade them</small></h2><div class="grid">${builds}</div>`))
}
console.log('composed')
