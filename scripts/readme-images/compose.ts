/**
 * Node entry: renders the composed marketing pages (growth, collection, day cycle,
 * biomes, and the frames of the day-cycle animation) as standalone HTML, using the
 * plugin's real renderer, catalog and art. Usage: node compose.cjs <outDir>
 * The hero and the how-it-works loop need the live timer component, so they are
 * harness scenes (marketing.ts).
 */
import * as fs from 'fs'
import { renderVillage, skyFor } from '../../src/render/VillageScene'
import { SCENE_CSS } from '../../src/render/sceneCss'
import { BIOME_CONFIGS, GROWTH_STAGE_SVGS, SPECIES_SVGS, growthSvg } from '../../src/assets/floraAssets'
import { BIOME_UNLOCK_LEVELS, CROPS, ISLAND_BIOMES, FLORA_SPECIES, HOMESTEAD_BUILDINGS } from '../../src/assets/floraCatalog'
import type { BiomeType, GamificationData } from '../../src/types/forest'
import { renderArchipelago } from '../../src/render/ArchipelagoMap'
import { bridgeProgress, islandBoonPct, islandLinks, islandView } from '../../src/services/Islands'
import { village } from './sample-data'
import { FONT, T, page } from './theme'
import { perkTag, stars } from './perk-tags'

const out = process.argv[2]
const at = (h: number, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d }
const write = (name: string, html: string) => fs.writeFileSync(`${out}/${name}.html`, html)

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
    // As the full-page village shows it: the bridges and the islands they lead to stay in frame
    const links = islandLinks(g, null)
    const html = cells.map(([t, clock, d], i) => `<div class="cell">${renderVillage(g, { date: d, idPrefix: `dc${i}`, still: true, links }).replace('xMidYMid meet', 'xMidYMid slice')}<div class="tag"><b>${t}</b><span>${clock}</span></div></div>`).join('')
    write('day-cycle', page(1320, 1000, `
        body{padding:${T.margin}px;display:grid;grid-template-columns:1fr 1fr;gap:16px}
        .cell{position:relative;border-radius:${T.radius}px;overflow:hidden;height:452px;box-shadow:0 6px 18px rgba(60,45,20,.08)}
        .cell svg{display:block;width:100%;height:100%}
        .tag{position:absolute;left:16px;top:16px;display:flex;align-items:baseline;gap:8px;padding:6px 13px;border-radius:99px;background:rgba(12,18,24,.55);color:#fff;backdrop-filter:blur(6px)}
        .tag b{font-size:16px;font-weight:700}.tag span{font-size:13px;opacity:.75;font-variant-numeric:tabular-nums}
        `, `<style>${SCENE_CSS}</style>${html}`))
}

// ---------------------------------------------------------------- biomes: eight grounds, five earned by level and three found on islands
{
    type R = [string, string, number, number, number?]
    // A river through the middle, falling off the front-right edge once
    const mini: R[] = [
        ['tree', 'sakura', 0, 0, 3], ['tree', 'classic_pine', 2, 0, 2], ['tree', 'autumn_maple', 4, 0, 3], ['tree', 'lavender', 0, 1, 2],
        ['building', 'cabin', 1, 1, 3], ['building', 'cobblestone_path', 2, 1], ['building', 'stone_well', 3, 1, 2],
        ['building', 'water_stream', 0, 2], ['building', 'water_stream', 1, 2], ['building', 'bridge', 2, 2], ['building', 'water_stream', 3, 2], ['building', 'water_stream', 4, 2],
        ['building', 'cobblestone_path', 2, 3], ['building', 'campfire', 1, 3, 2], ['building', 'lantern', 3, 3, 2], ['tree', 'sunflower', 0, 3, 1], ['tree', 'willow', 4, 3, 2],
        ['tree', 'ancient_oak', 0, 4, 2], ['building', 'bench', 2, 4, 1], ['tree', 'classic_pine', 4, 4, 2],
    ]
    const base = village()
    const biomes = [...(Object.keys(BIOME_UNLOCK_LEVELS) as BiomeType[]), ...ISLAND_BIOMES]
    const cells = biomes.map((b, i) => {
        const g: GamificationData = { ...base, islands: [], landSize: 5, activeBiome: b, vitality: 90, homestead: mini.map(([t, id, x, y, l], k) => ({ id: `m${k}`, itemType: t as any, itemId: id, gridX: x, gridY: y, level: l ?? 1 })) }
        const date = b === 'twilight_moss' ? at(20) : at(13)
        const svg = renderVillage(g, { date, idPrefix: `bm${i}`, still: true, seed: `bm${b}` })
            .replace(/viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/, (_, x, y, w, h) => `viewBox="${+x + w * 0.02} ${+y + h * 0.03} ${w * 0.96} ${h * 0.86}"`)
            .replace('xMidYMid meet', 'xMidYMid slice')
        const lv = BIOME_UNLOCK_LEVELS[b]
        return `<div class="mk-tile cell"><div class="art">${svg}</div><div class="cap"><b>${BIOME_CONFIGS[b].name}</b>${lv ? `<span class="mk-pill">Lv ${lv}</span>` : '<span class="mk-pill sea">Island find</span>'}</div></div>`
    }).join('')
    write('biomes', page(1600, 814, `
        body{padding:${T.margin}px}
        .row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:22px}
        .cell{overflow:hidden;padding:0}
        .art svg{display:block;width:100%;height:auto;aspect-ratio:4/3}
        .cap{display:flex;align-items:center;justify-content:space-between;padding:11px 14px 13px}
        .cap b{font-size:16px;font-weight:700}
        .mk-pill.sea{background:#dff1f3;color:#1f7a86}
        `, `<style>${SCENE_CSS}</style><div class="mk-eyebrow">Eight biomes</div><div class="mk-title">Switch the ground under your village</div><div class="row">${cells}</div>`))
}

// ---------------------------------------------------------------- islands: the archipelago, and how an island is earned
{
    const g = village()
    const map = renderArchipelago(g, { date: at(12), idPrefix: 'arc', selected: 'isle_3' })
    const sky = skyFor(at(12))
    const thesis = g.islands!.find((i) => i.id === 'isle_1')!
    const deep = g.islands!.find((i) => i.id === 'isle_3')!
    const b = bridgeProgress(deep)
    const view = islandView(g, 'isle_1')
    // Tight on the island itself: most of the scene's sky is cut away
    const isle = renderVillage(view, { date: at(12), idPrefix: 'isl', still: true, island: 'isle_1', seed: 'isle_1' })
        .replace(/viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/, (_, x, y, w, h) => `viewBox="${+x + w * 0.05} ${+y + h * 0.15} ${w * 0.9} ${h * 0.68}"`)
        .replace('xMidYMid meet', 'xMidYMid slice')
    const icon = (d: string) => `<svg viewBox="0 0 24 24"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    const tagI = icon('M3 12V4h8l9 9-8 8-9-9zM7.5 7.5h.01')
    const folderI = icon('M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z')
    const noteI = icon('M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5')
    const planks = Math.round(b.ratio * 28)
    const bar = Array.from({ length: 28 }, (_, i) => `<i class="${i < planks ? 'on' : ''}"></i>`).join('')
    write('islands', page(1600, 640, `
        body{padding:${T.margin}px}
        .row{display:grid;grid-template-columns:1fr 520px;gap:16px;margin-top:22px;height:500px}
        .map{border-radius:${T.radius}px;overflow:hidden;background:linear-gradient(${sky.top},${sky.bottom});box-shadow:0 6px 18px rgba(60,45,20,.08);position:relative}
        .map svg{display:block;width:100%;height:100%}
        .pf-map-name{font:750 9px ${FONT};fill:#fff;paint-order:stroke;stroke:rgba(12,24,48,.5);stroke-width:1.7px;stroke-linejoin:round}
        .pf-map-sub{font:600 7px ${FONT};fill:#eef6ff;paint-order:stroke;stroke:rgba(12,24,48,.45);stroke-width:1.4px;stroke-linejoin:round}
        .col{display:flex;flex-direction:column;gap:12px;min-height:0}
        .st{padding:16px 18px;display:flex;flex-direction:column;gap:10px}
        .st h4,.land h4{margin:0;display:flex;align-items:center;gap:10px;font-size:18px;font-weight:750}
        .st h4 .n,.land h4 .n{flex:none;width:26px;height:26px;border-radius:50%;background:${T.green};color:#fff;font-size:13.5px;font-weight:800;display:flex;align-items:center;justify-content:center}
        .st p,.land p{margin:0;font-size:14.5px;line-height:1.4;color:${T.muted}}
        .chips{display:flex;gap:8px;flex-wrap:wrap}
        .chip{display:inline-flex;align-items:center;gap:6px;font-size:14px;font-weight:650;padding:6px 12px 6px 10px;border-radius:9px;background:#f3eee4;border:1px solid ${T.line};color:#3d3a33;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
        .chip svg{width:15px;height:15px;color:#8a7a5c}
        .chip.tag{background:#efeafe;border-color:#ddd3fb;color:#5b3fd0}.chip.tag svg{color:#7c5cff}
        .bridge{display:flex;align-items:center;gap:12px}
        .bar{flex:1;display:flex;gap:2px;height:14px;padding:2px;border-radius:5px;background:#ece5d8}
        .bar i{flex:1;border-radius:2px;background:transparent}.bar i.on{background:linear-gradient(#d9a465,#b07a3c)}
        .bridge b{font-size:15px;font-variant-numeric:tabular-nums;white-space:nowrap}.bridge b span{color:${T.muted};font-weight:600}
        .land{flex:1;min-height:0;padding:0;overflow:hidden;display:grid;grid-template-columns:1fr 200px}
        .land .pic{min-height:0;background:linear-gradient(#86c8ef,#d8f0fc)}
        .land .pic svg{display:block;width:100%;height:100%}
        .land .tx{padding:16px 18px;display:flex;flex-direction:column;gap:10px}
        .facts{display:flex;flex-direction:column;gap:6px;margin-top:auto}
        .facts div{display:flex;justify-content:space-between;font-size:13.5px;color:${T.muted};border-top:1px solid ${T.line};padding-top:6px}
        .facts b{color:${T.ink}}
        `, `<style>${SCENE_CSS}</style><div class="mk-eyebrow">The archipelago</div><div class="mk-title">Give each project its own island</div>
        <div class="row"><div class="map">${map}</div><div class="col">
            <div class="mk-tile st"><h4><span class="n">1</span>Choose what it stands for</h4>
                <div class="chips"><span class="chip tag">${tagI}#thesis</span><span class="chip">${folderI}Projects/Thesis</span><span class="chip">${noteI}[[Reading hub]]</span></div></div>
            <div class="mk-tile st"><h4><span class="n">2</span>Focus on it to build the bridge</h4>
                <div class="bridge"><div class="bar">${bar}</div><b>${Math.floor(b.laid)} <span>/ ${b.target} min</span></b></div></div>
            <div class="mk-tile land"><div class="pic">${isle}</div><div class="tx"><h4><span class="n">3</span>Land, then keep growing</h4>
                <p>New ground, a biome of its own, and a Sunlight bonus whenever you work on it.</p>
                <div class="facts"><div><span>Mastery</span><b>${thesis.level}</b></div><div><span>Bonus</span><b>+${islandBoonPct(thesis.level)}%</b></div><div><span>Notes</span><b>${thesis.notes}</b></div></div></div></div>
        </div></div>`))
}

// ---------------------------------------------------------------- frames for village-day.gif: one day, dawn to night
{
    const g = village()
    // The whole scene with its bridges, as the full-page village shows it
    const links = islandLinks(g, null)
    const [, , DAY_W, DAY_H] = renderVillage(g, { still: true, links }).match(/viewBox="([^"]+)"/)![1].split(' ').map(Number)
    const frames: number[] = []
    for (let m = 5 * 60; m <= 23 * 60 + 30; m += 30) frames.push(m)
    frames.forEach((m, i) => {
        const svg = renderVillage(g, { date: at(Math.floor(m / 60), m % 60), idPrefix: `vd${i}`, still: true, links })
        write(`village-day-${String(i).padStart(2, '0')}`, page(DAY_W, DAY_H, `svg{display:block;width:${DAY_W}px;height:${DAY_H}px}`, `<style>${SCENE_CSS}</style>${svg}`))
    })
    fs.writeFileSync(`${out}/village-day.json`, JSON.stringify({ frames: frames.length, w: DAY_W, h: DAY_H }))
}
// ---------------------------------------------------------------- frames for bridge.gif: focus lays the bridge, the island is reached, the next one appears
{
    const g = village()
    const sky = skyFor(at(12))
    const deep = g.islands!.find((i) => i.id === 'isle_3')!
    const target = bridgeProgress({ ...deep, bridge: 0 }).target
    const steps = 22
    const states: GamificationData[] = []
    for (let k = 0; k <= steps; k++) {
        const laid = Math.round((target * k) / steps)
        states.push({ ...g, islands: g.islands!.map((i) => (i.id === 'isle_3' ? { ...i, bridge: laid } : i)) })
    }
    // Landed: the island takes on its colours, and the next one comes into view
    const landed: GamificationData = {
        ...g,
        islands: [
            ...g.islands!.map((i) => (i.id === 'isle_3' ? { ...i, bridge: target, reachedOn: i.sightedOn, level: 1, minutes: 30 } : i)),
            { id: 'isle_4', index: 4, name: '', biome: 'jade_marsh', focus: null, bridge: 0, sightedOn: '', minutes: 0, level: 0, notes: 0, notesMark: 0 },
        ],
    }
    states.push(landed)
    // One camera for every frame (the last one's, which also holds the new island) and one seed, so the clouds stay put
    const viewBox = renderArchipelago(landed, { date: at(12), idPrefix: 'br' }).match(/viewBox="[^"]+"/)![0]
    states.forEach((st, i) => {
        const svg = renderArchipelago(st, { date: at(12), idPrefix: 'br', selected: 'isle_3' }).replace(/viewBox="[^"]+"/, viewBox)
        write(`bridge-${String(i).padStart(2, '0')}`, page(640, 400, `
            body{background:linear-gradient(${sky.top},${sky.bottom})}
            svg{display:block;width:640px;height:400px}
            .pf-map-name{font:750 10.5px ${FONT};fill:#fff;paint-order:stroke;stroke:rgba(12,24,48,.5);stroke-width:2px;stroke-linejoin:round}
            .pf-map-sub{font:600 8px ${FONT};fill:#eef6ff;paint-order:stroke;stroke:rgba(12,24,48,.45);stroke-width:1.6px;stroke-linejoin:round}
            .pf-map-q{font:800 11px ${FONT};fill:#b5741a}
            `, svg, 'transparent'))
    })
    fs.writeFileSync(`${out}/bridge.json`, JSON.stringify(states.length))
}
// ---------------------------------------------------------------- island-scene: one reached island on its own, with the bridge home
{
    const g = village()
    const svg = renderVillage(islandView(g, 'isle_1'), { date: at(12), idPrefix: 'is', still: true, island: 'isle_1', seed: 'isle_1', links: islandLinks(g, 'isle_1') })
        .replace(/viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/, (_, x, y, w, h) => `viewBox="${+x + w * 0.02} ${+y + h * 0.02} ${w * 0.96} ${h * 0.84}"`)
        .replace('xMidYMid meet', 'xMidYMid slice')
    write('island-scene', page(640, 400, `svg{display:block;width:640px;height:400px}`, `<style>${SCENE_CSS}</style>${svg}`))
}
console.log('composed')
