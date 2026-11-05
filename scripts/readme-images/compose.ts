/**
 * Node entry: renders the composed marketing pages (growth, collection, day cycle,
 * biomes, and the frames of the day-cycle animation) as standalone HTML, using the
 * plugin's real renderer, catalog and art. Usage: node compose.cjs <outDir>
 * The hero and the how-it-works loop need the live timer component, so they are
 * harness scenes (marketing.ts).
 */
import * as fs from 'fs'
import { renderVillage } from '../../src/render/VillageScene'
import { SCENE_CSS } from '../../src/render/sceneCss'
import { BIOME_CONFIGS, GROWTH_STAGE_SVGS, SPECIES_SVGS, growthSvg } from '../../src/assets/floraAssets'
import { BIOME_UNLOCK_LEVELS, CROPS, FLORA_SPECIES, HOMESTEAD_BUILDINGS } from '../../src/assets/floraCatalog'
import type { BiomeType, GamificationData } from '../../src/types/forest'
import { village } from './sample-data'
import { T, page } from './theme'
import { perkTag, stars } from './perk-tags'

const out = process.argv[2]
const at = (h: number, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d }
const write = (name: string, html: string) => fs.writeFileSync(`${out}/${name}.html`, html)
/** Crop a scene SVG to part of its viewBox (in scene units). */
const crop = (svg: string, x: number, y: number, w: number, h: number) => svg.replace(/viewBox="[^"]+"/, `viewBox="${x} ${y} ${w} ${h}"`)

// ---------------------------------------------------------------- growth: one tree, four stages, and what giving up costs
{
    const id = 'sakura'
    const stages: [string, string, string][] = [['seed', 'Seed', '0%'], ['sprout', 'Sprout', '25%'], ['sapling', 'Sapling', '50%'], ['mature', 'Grown', '75%+']]
    const chevron = `<svg class="chev" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="#b9ad97" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    const tiles = stages.map(([s, name, pct], i) => `${i ? chevron : ''}<div class="mk-tile st"><div class="art">${s === 'mature' ? SPECIES_SVGS[id] : growthSvg(s as any, id)}</div><div class="cap"><b>${name}</b><span class="mk-pill">${pct}</span></div></div>`).join('')
    const wither = `<div class="mk-tile st dead"><div class="art">${GROWTH_STAGE_SVGS.withered}</div><div class="cap"><b>Withered</b><span class="mk-pill red">gave up</span></div></div>`
    write('growth', page(1600, 440, `
        body{padding:${T.margin}px}
        .row{display:flex;align-items:center;gap:10px;margin-top:22px}
        .st{flex:1;display:flex;flex-direction:column;padding:12px 12px 14px}
        .art{height:230px;border-radius:12px;background:radial-gradient(ellipse 60% 40% at 50% 86%,#e1eed3,transparent 70%)}
        .art svg{width:100%;height:100%}
        .cap{display:flex;align-items:center;justify-content:space-between;padding:10px 6px 0}
        .cap b{font-size:19px;font-weight:700}
        .chev{width:26px;height:26px;flex:none}
        .sep{width:1px;align-self:stretch;margin:8px 16px;background:${T.line}}
        .dead{flex:.85;background:#f8f4ec;border-style:dashed}
        .dead .art{background:radial-gradient(ellipse 60% 40% at 50% 86%,#ece3d3,transparent 70%)}
        .mk-pill.red{background:#f8e3dc;color:#b4472b}
        `, `<div class="mk-eyebrow">Grows while you focus</div><div class="mk-title">One session, one tree</div><div class="row">${tiles}<div class="sep"></div>${wither}</div>`))
}

// ---------------------------------------------------------------- collection: everything you can unlock, art first
{
    const species = FLORA_SPECIES.map((s) => `<div class="mk-tile sp"><div class="art">${s.iconSvg}</div><b>${s.name}</b><span class="mk-pill">Lv ${s.unlockLevel}</span></div>`).join('')
    // Charter landmarks are granted by rank, not bought; charter.png shows them
    const market = HOMESTEAD_BUILDINGS.filter((b) => !b.charterRank)
    const perks = market.filter((b) => b.perk)
    const decor = market.filter((b) => !b.perk)
    const bTile = (icon: string, name: string, meta: string, tag: string) =>
        `<div class="mk-tile bd"><div class="ic">${icon}</div><div class="tx"><b>${name}</b><div class="meta">${meta}</div>${tag ? `<span class="tag">${tag}</span>` : ''}</div></div>`
    const buildings = perks.map((b) => bTile(b.iconSvg, b.name, `<span class="mk-pill gold">Lv ${b.unlockLevel}</span>${stars(b.maxLevel)}`, perkTag(b))).join('')
    const crops = `<div class="mk-tile bd"><div class="ic crops">${CROPS.slice(0, 4).map((c) => `<span>${c.icon}</span>`).join('')}</div><div class="tx"><b>${CROPS.length} crops</b><div class="meta"><span class="mk-pill gold">Garden plot</span></div><span class="tag">grow as you focus</span></div></div>`
    const decorTiles = decor.map((b) => bTile(b.iconSvg, b.name, `<span class="mk-pill gold">Lv ${b.unlockLevel}</span>`, '')).join('')
    write('collection', page(1600, 706, `
        body{padding:${T.margin}px}
        h3{display:flex;align-items:baseline;gap:12px;margin:0 0 14px}
        h3 .mk-eyebrow{font-size:14px}
        h3 small{font-size:15px;color:${T.muted};font-weight:500}
        .sps{display:grid;grid-template-columns:repeat(11,1fr);gap:10px;margin-bottom:34px}
        .sp{display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 6px 12px;text-align:center}
        .sp .art{width:92px;height:92px}.sp .art svg{width:100%;height:100%}
        .sp b{font-size:13.5px;line-height:1.2;min-height:2.4em;display:flex;align-items:center}
        .bds{display:grid;grid-template-columns:repeat(6,1fr);gap:10px}
        .bd{display:flex;align-items:center;gap:12px;padding:12px 14px 12px 12px;min-height:104px}
        .ic{width:70px;height:70px;flex:none}.ic svg{width:100%;height:100%}
        .ic.crops{display:grid;grid-template-columns:32px 32px;grid-auto-rows:32px;gap:4px;align-content:center;justify-content:center;font-size:26px;line-height:32px;text-align:center}
        .tx{display:flex;flex-direction:column;gap:5px;min-width:0}
        .tx b{font-size:15px;line-height:1.15}
        .meta{display:flex;align-items:center;gap:6px}
        .stars{font-size:11px;letter-spacing:1px;color:#e0a526}
        .tag{display:inline-flex;align-items:center;gap:4px;font-size:12.5px;font-weight:600;color:#5b4a2a}
        .tag svg{width:14px;height:14px;flex:none}
        .decor{margin-top:10px}
        `, `<h3><span class="mk-eyebrow">The nursery</span><small>${FLORA_SPECIES.length} species, unlocked as you level up</small></h3><div class="sps">${species}</div>
        <h3><span class="mk-eyebrow">The builders</span><small>buildings with perks that grow as you upgrade them</small></h3><div class="bds">${buildings}</div><div class="bds decor">${decorTiles}${crops}</div>`))
}

// ---------------------------------------------------------------- day cycle: the same village at four times of day
{
    const g = village()
    const cells: [string, string, Date][] = [['Dawn', '06:30', at(6, 30)], ['Day', '12:00', at(12)], ['Dusk', '19:00', at(19)], ['Night', '23:00', at(23)]]
    const html = cells.map(([t, clock, d], i) => `<div class="cell">${crop(renderVillage(g, { date: d, idPrefix: `dc${i}`, still: true }), 0, 6, 560, 392)}<div class="tag"><b>${t}</b><span>${clock}</span></div></div>`).join('')
    write('day-cycle', page(1320, 1000, `
        body{padding:${T.margin}px;display:grid;grid-template-columns:1fr 1fr;gap:16px}
        .cell{position:relative;border-radius:${T.radius}px;overflow:hidden;height:452px;box-shadow:0 6px 18px rgba(60,45,20,.08)}
        .cell svg{display:block;width:100%;height:100%}
        .tag{position:absolute;left:16px;top:16px;display:flex;align-items:baseline;gap:8px;padding:6px 13px;border-radius:99px;background:rgba(12,18,24,.55);color:#fff;backdrop-filter:blur(6px)}
        .tag b{font-size:16px;font-weight:700}.tag span{font-size:13px;opacity:.75;font-variant-numeric:tabular-nums}
        `, `<style>${SCENE_CSS}</style>${html}`))
}

// ---------------------------------------------------------------- biomes: five grounds, side by side
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
        const g: GamificationData = { ...base, landSize: 5, activeBiome: b, vitality: 90, homestead: mini.map(([t, id, x, y, l], k) => ({ id: `m${k}`, itemType: t as any, itemId: id, gridX: x, gridY: y, level: l ?? 1 })) }
        const date = b === 'twilight_moss' ? at(20) : at(13)
        const svg = crop(renderVillage(g, { date, idPrefix: `bm${i}`, still: true }), 0, 22, 368, 290)
        return `<div class="mk-tile cell"><div class="art">${svg}</div><div class="cap"><b>${BIOME_CONFIGS[b].name}</b><span class="mk-pill">Lv ${BIOME_UNLOCK_LEVELS[b]}</span></div></div>`
    }).join('')
    write('biomes', page(1600, 434, `
        body{padding:${T.margin}px}
        .row{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-top:22px}
        .cell{overflow:hidden;padding:0}
        .art svg{display:block;width:100%;height:auto;aspect-ratio:368/290}
        .cap{display:flex;align-items:center;justify-content:space-between;padding:11px 14px 13px}
        .cap b{font-size:16px;font-weight:700}
        `, `<style>${SCENE_CSS}</style><div class="mk-eyebrow">Five biomes</div><div class="mk-title">Switch the ground under your village</div><div class="row">${cells}</div>`))
}

// ---------------------------------------------------------------- frames for village-day.gif: one day, dawn to night
{
    const g = village()
    const frames: number[] = []
    for (let m = 5 * 60; m <= 23 * 60 + 30; m += 30) frames.push(m)
    frames.forEach((m, i) => {
        const svg = crop(renderVillage(g, { date: at(Math.floor(m / 60), m % 60), idPrefix: `vd${i}`, still: true }), 0, 6, 560, 392)
        write(`village-day-${String(i).padStart(2, '0')}`, page(560, 392, `svg{display:block;width:560px;height:392px}`, `<style>${SCENE_CSS}</style>${svg}`))
    })
    fs.writeFileSync(`${out}/village-day.json`, JSON.stringify(frames.length))
}
console.log('composed')
