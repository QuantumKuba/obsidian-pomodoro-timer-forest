/**
 * Browser-side marketing scenes that need the live timer dial: the hero, the
 * how-it-works loop and the frames of the timer-growth animation. Everything drawn
 * here is the plugin's own component, renderer and art; the pages only arrange it.
 * The charter scene arranges the real Village Charter card, landmarks and residents.
 *   ?scene=hero | loop | charter | dial&ratio=0.4
 */
import { readable } from 'svelte/store'
import TimerViewComponent from '../../src/TimerViewComponent.svelte'
import { activePlantStore } from '../../src/stores'
import { renderVillage } from '../../src/render/VillageScene'
import { ICONS, SPECIES_SVGS, VILLAGER_SVGS } from '../../src/assets/floraAssets'
import { charterLandmark, getBuilding } from '../../src/assets/floraCatalog'
import { CHARTER_RANKS } from '../../src/services/Charter'
import CharterCard from '../../src/forest/CharterCard.svelte'
import { MAX_HEARTS, RESIDENTS, hearts, residentsPresent } from '../../src/services/Neighbours'
import type { GamificationData } from '../../src/types/forest'
import { FONT, SHARED_CSS, T } from './theme'
import { perkTag, stars } from './perk-tags'

export const MARKETING_SCENES = ['hero', 'loop', 'charter', 'dial']

const COUNT = 25 * 60_000
const stageFor = (r: number) => (r >= 0.75 ? 'mature' : r >= 0.5 ? 'sapling' : r >= 0.25 ? 'sprout' : 'seed')

/** Mounts the real timer component and lifts its dial into `slot`. */
function mountDial(slot: HTMLElement, ratio: number, speciesId = 'sakura') {
    activePlantStore.set({ speciesId, startTime: 0, totalDurationMillis: COUNT, currentStage: stageFor(ratio) as any, progressRatio: ratio, taskText: 'Write chapter 3 draft' })
    const elapsed = Math.round(ratio * COUNT)
    const left = COUNT - elapsed
    const human = `${String(Math.floor(left / 60000)).padStart(2, '0')} : ${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`
    const timer = readable({ count: COUNT, elapsed, running: true, inSession: true, mode: 'WORK', remained: { millis: left, human }, finished: false, earlyHarvestAt: COUNT } as any)
    const holder = document.createElement('div')
    holder.style.cssText = 'position:absolute;left:-9999px;top:0;width:356px'
    document.body.appendChild(holder)
    new TimerViewComponent({ target: holder, props: { timer: timer as any, tasks: {} as any, tracker: {} as any, render: () => {} } })
    slot.appendChild(holder.querySelector('.dial')!)
}

const style = (css: string) => document.head.appendChild(Object.assign(document.createElement('style'), { textContent: css }))
const base = (w: number, h: number, bg: string) =>
    `html,body{margin:0;background:${bg}!important}body{width:${w}px;height:${h}px;overflow:hidden;font-family:${FONT};color:${T.ink};-webkit-font-smoothing:antialiased}#wrap{padding:0!important}${SHARED_CSS}`

/** A dark Obsidian-sidebar-like card for the dial, so it reads as the plugin's UI. */
const DIAL_CARD = `.dialcard{background:#1e1e1e;border:1px solid #333;border-radius:26px;display:flex;align-items:center;justify-content:center;box-shadow:0 24px 60px rgba(8,30,50,.28),0 2px 6px rgba(0,0,0,.2)}
.dialcard .dial{margin:0}`

export function mountMarketing(scene: string, q: URLSearchParams, g: GamificationData, app: HTMLElement) {
    if (scene === 'dial') {
        // One frame of timer-growth.gif
        style(base(300, 300, '#1e1e1e') + `.slot{width:300px;height:300px;display:flex;align-items:center;justify-content:center}.slot .dial{margin:0;zoom:1.2}`)
        const slot = Object.assign(document.createElement('div'), { className: 'slot' })
        app.appendChild(slot)
        mountDial(slot, Number(q.get('ratio') || 0))
        return
    }

    if (scene === 'hero') {
        const W = 1600, H = 720
        const at = new Date(); at.setHours(12, 0, 0, 0)
        style(base(W, H, 'linear-gradient(#7cc2ee,#d6efff)') + DIAL_CARD + `
            .scene{position:absolute;right:-40px;top:-6px;width:1010px;-webkit-mask-image:linear-gradient(to right,transparent 0,#000 22%)}
            .scene svg{display:block;width:100%;height:auto}
            .copy{position:absolute;left:84px;top:118px;width:620px}
            .kicker{display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;padding:6px 14px 6px 10px;border-radius:99px;background:rgba(255,255,255,.72);color:${T.green}}
            .kicker svg{width:18px;height:18px}
            h1{font-size:78px;line-height:.98;margin:22px 0 18px;letter-spacing:-.03em;color:#0f2b3d;font-weight:800}
            h1 em{font-style:normal;color:${T.green}}
            p{font-size:25px;line-height:1.4;margin:0;color:#24506b}
            .dialcard{position:absolute;left:84px;top:408px;width:264px;height:264px}
            .dialcard .dial{zoom:1.05}
            .note{position:absolute;left:372px;top:452px;display:flex;flex-direction:column;gap:10px}
            .chip{display:inline-flex;align-items:center;gap:7px;font-size:19px;font-weight:750;padding:8px 15px 8px 13px;border-radius:99px;background:rgba(255,255,255,.88);box-shadow:0 6px 16px rgba(20,60,90,.12);width:max-content}
            .chip:nth-child(2){margin-left:22px}.chip:nth-child(3){margin-left:44px}
            .chip svg{width:20px;height:20px}
            .chip.sun{color:#c7600a}.chip.coin{color:#97620c}.chip.xp{color:#6d4fd6}
            `)
        app.innerHTML = `<div class="scene">${renderVillage(g, { date: at, idPrefix: 'hero' })}</div>
            <div class="copy"><span class="kicker">${ICONS.sapling}Obsidian plugin</span><h1>Pomodoro Timer<br><em>Forest</em></h1><p>Focus grows trees. Trees build your village.</p></div>
            <div class="dialcard" id="dial"></div>
            <div class="note"><span class="chip sun">${ICONS.sunlight}+84</span><span class="chip coin">${ICONS.coin}+7</span><span class="chip xp">+74 XP</span></div>`
        mountDial(document.getElementById('dial')!, 0.62)
        return
    }

    if (scene === 'charter') {
        const W = 1600, H = 752
        const at = new Date(); at.setHours(12, 0, 0, 0)
        const current = Math.max(0, Math.floor(g.charter?.rank || 0))
        // Each rank's landmark; the Clearing starts around the campfire
        const steps = CHARTER_RANKS.map((r, i) => {
            const art = (i === 0 ? getBuilding('campfire') : charterLandmark(i))?.iconSvg || ''
            const state = i < current ? 'reached' : i === current ? 'current' : 'ahead'
            return `<li class="${state}"><div class="lm">${art}</div><b>${r.name}</b>${i === current ? '<span class="mk-pill">You are here</span>' : `<span class="rk">Rank ${i + 1}</span>`}</li>`
        }).join('')
        const n = CHARTER_RANKS.length
        // The rail runs between the first and last circle centres; the green part ends at the current rank
        const rail = `calc((100% - ${(n - 1) * 10}px) / ${n} / 2)`
        const fillTo = `calc(${rail} + (100% - 2 * ${rail}) * ${current / (n - 1)})`
        const people = RESIDENTS.filter((r) => residentsPresent(g).includes(r)).map((r) => {
            const h = hearts(g, r.id)
            const req = (g.requests || []).find((q) => q.residentId === r.id)
            return `<div class="mk-tile nb${req ? ' asking' : ''}"><span class="pt">${VILLAGER_SVGS[r.variant % VILLAGER_SVGS.length]}</span>
                <div class="nb-tx"><div class="nb-head"><b>${r.name}</b><span class="hearts">${'♥'.repeat(h)}<i>${'♥'.repeat(MAX_HEARTS - h)}</i></span></div>
                ${req ? `<span class="req">${req.title}</span><div class="bar"><div style="width:${Math.round((req.progress / Math.max(1, req.target)) * 100)}%"></div></div>` : `<span class="role">${r.role}</span>`}</div></div>`
        }).join('')
        style(base(W, H, T.paper) + `
            body{padding:${T.margin}px}
            .mk-ladder{position:relative;display:grid;grid-template-columns:repeat(${n},1fr);gap:10px;list-style:none;margin:22px 0 0;padding:0}
            .mk-ladder::before,.mk-ladder::after{content:'';position:absolute;top:56px;height:3px;border-radius:3px}
            .mk-ladder::before{left:${rail};right:${rail};background:${T.line}}
            .mk-ladder::after{left:${rail};width:calc(${fillTo} - ${rail});background:${T.green}}
            .mk-ladder li{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:5px;text-align:center}
            .lm{width:112px;height:112px;border-radius:50%;background:${T.card};border:1px solid ${T.line};display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(60,45,20,.07)}
            .lm svg{width:80px;height:80px}
            .current .lm{border:3px solid ${T.green};box-shadow:0 0 0 6px #e3efd9,0 8px 22px rgba(46,125,50,.18)}
            .ahead .lm svg{filter:grayscale(1);opacity:.4}
            .mk-ladder b{font-size:17px;font-weight:750;margin-top:6px}
            .ahead b{color:${T.muted};font-weight:650}
            .rk{font-size:12.5px;color:${T.muted}}
            .mk-row{display:grid;grid-template-columns:auto 330px 1fr;gap:16px;margin-top:28px;align-items:stretch}
            .dark{align-self:start;background:#1e1e1e;border:1px solid #333;border-radius:${T.radius + 4}px;padding:12px;color:var(--text-normal);box-shadow:0 14px 34px rgba(30,25,15,.16)}
            .dark > div{width:356px;zoom:1.12}
            .nbs{display:flex;flex-direction:column;gap:10px;min-height:0}
            .nbs h4{margin:2px 2px 2px;font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${T.muted}}
            .nb{flex:1 1 0;min-height:0;display:flex;align-items:center;gap:12px;padding:10px 14px 10px 10px}
            .nb.asking{border-color:#e7c3b8;background:#fff8f4}
            .pt{width:52px;height:52px;flex:none;border-radius:50%;background:#efe9dc;display:flex;align-items:center;justify-content:center;overflow:hidden}
            .pt svg{width:44px;height:44px}
            .nb-tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
            .nb-head{display:flex;align-items:center;justify-content:space-between}
            .nb-head b{font-size:16px}
            .hearts{color:#e05a6b;font-size:14px;letter-spacing:1px}.hearts i{font-style:normal;color:#ddd3c3}
            .role{font-size:13px;color:${T.muted}}
            .req{font-size:13px;font-weight:600;color:#9a4a33;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
            .bar{height:5px;border-radius:5px;background:#efe3d9}.bar div{height:100%;border-radius:5px;background:#e0866c}
            .isle{min-height:0;border-radius:${T.radius + 4}px;overflow:hidden;background:linear-gradient(#80c4ef,#d4eefc);box-shadow:0 14px 34px rgba(30,25,15,.12)}
            .isle svg{display:block;width:100%;height:100%}
            `)
        const svg = renderVillage(g, { date: at, idPrefix: 'charter', still: true }).replace(/viewBox="[^"]+"/, 'viewBox="0 34 560 320"').replace('preserveAspectRatio="xMidYMid meet"', 'preserveAspectRatio="xMidYMid slice"')
        app.innerHTML = `<div class="mk-eyebrow">Something to aim for</div><div class="mk-title">Grow a clearing into a city</div>
            <ol class="mk-ladder">${steps}</ol>
            <div class="mk-row"><div class="dark"><div id="charter"></div></div><div class="nbs"><h4>Neighbours</h4>${people}</div><div class="isle">${svg}</div></div>`
        new CharterCard({ target: document.getElementById('charter')! })
        // The charter card sets the row's height; the page ends one margin below it
        const row = document.querySelector('.mk-row') as HTMLElement
        row.style.height = `${(document.querySelector('.dark') as HTMLElement).offsetHeight}px`
        document.body.style.height = `${Math.ceil(row.getBoundingClientRect().bottom) + T.margin}px`
        return
    }

    if (scene === 'loop') {
        const W = 1600, H = 494
        const at = new Date(); at.setHours(13, 0, 0, 0)
        const mini: [string, string, number, number, number?][] = [
            ['tree', 'sakura', 0, 0, 3], ['tree', 'classic_pine', 2, 0, 2], ['building', 'cabin', 1, 1, 3], ['tree', 'autumn_maple', 3, 1, 3],
            ['building', 'cobblestone_path', 2, 1], ['building', 'cobblestone_path', 2, 2], ['building', 'campfire', 1, 3, 2], ['building', 'lantern', 3, 2, 2],
            ['tree', 'lavender', 0, 2, 2], ['tree', 'sunflower', 3, 3, 1], ['tree', 'ancient_oak', 0, 3, 2],
        ]
        const isle: GamificationData = { ...g, landSize: 4, vitality: 92, homestead: mini.map(([t, id, x, y, l], k) => ({ id: `l${k}`, itemType: t as any, itemId: id, gridX: x, gridY: y, level: l ?? 1 })) }
        const svg = renderVillage(isle, { date: at, idPrefix: 'loop', still: true }).replace(/viewBox="([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)"/, (_, x, y, w, h) => `viewBox="${x} 30 ${w} ${Number(h) - 44}"`)
        const cabin = getBuilding('cabin')!
        const chev = `<svg class="chev" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="#b9ad97" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
        const step = (n: number, name: string, line: string, art: string, cls = '') =>
            `<div class="mk-tile step ${cls}"><div class="art">${art}</div><div class="cap"><span class="n">${n}</span><div><b>${name}</b><span>${line}</span></div></div></div>`
        style(base(W, H, T.paper) + DIAL_CARD + `
            body{padding:${T.margin}px}
            .row{display:flex;align-items:stretch;gap:8px;margin-top:22px}
            .step{flex:1;display:flex;flex-direction:column;padding:12px}
            .art{height:262px;border-radius:12px;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden}
            .focus .art{background:#1e1e1e}
            .focus .dial{zoom:1.02}
            .grow .art,.perk .art{background:radial-gradient(ellipse 60% 45% at 50% 70%,#e3efd6,transparent 72%)}
            .grow .tree{width:190px;height:190px;margin-top:-34px}.grow .tree svg{width:100%;height:100%}
            .loot{position:absolute;bottom:16px;left:0;right:0;display:flex;justify-content:center;gap:6px}
            .loot span{display:inline-flex;align-items:center;gap:4px;font-size:15px;font-weight:750;padding:5px 11px;border-radius:99px;background:#fff;border:1px solid ${T.line}}
            .loot svg{width:16px;height:16px}
            .loot .sun{color:#d9730d}.loot .coin{color:#a86d10}.loot .xp{color:#6d4fd6}
            .build .art{background:linear-gradient(#86c8ef,#d4eefc)}
            .build .art svg{width:108%;height:auto;margin-top:6px}
            .perk .ic{width:150px;height:150px;margin-top:-40px}.perk .ic svg{width:100%;height:100%}
            .perk .badge{position:absolute;bottom:16px;left:0;right:0;display:flex;flex-direction:column;align-items:center;gap:6px}
            .perk .tag{display:inline-flex;align-items:center;gap:6px;font-size:15px;font-weight:700;padding:6px 13px;border-radius:99px;background:#fff;border:1px solid ${T.line};color:#5b4a2a}
            .perk .tag svg{width:16px;height:16px}
            .stars{font-size:15px;letter-spacing:2px;color:#e0a526}
            .cap{display:flex;align-items:center;gap:12px;padding:14px 6px 4px}
            .cap .n{flex:none;width:30px;height:30px;border-radius:50%;background:${T.green};color:#fff;font-weight:800;font-size:15px;display:flex;align-items:center;justify-content:center}
            .cap b{display:block;font-size:19px;font-weight:750}
            .cap span{font-size:14.5px;color:${T.muted}}
            .chev{width:24px;height:24px;flex:none;align-self:center;margin-top:-50px}
            .back{display:flex;align-items:center;gap:8px;position:absolute;right:${T.margin}px;top:${T.margin + 6}px;font-size:14px;font-weight:650;color:${T.muted}}
            .back svg{width:18px;height:18px}
            `)
        const loop = `<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5" fill="none" stroke="${T.green}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
        app.innerHTML = `<div class="mk-eyebrow">How it works</div><div class="mk-title">Your focus builds something</div>
            <div class="back">${loop}Every session feeds the next</div>
            <div class="row">
            ${step(1, 'Focus', 'Start a session on a task', '<div class="dialcard-free" id="dial"></div>', 'focus')}${chev}
            ${step(2, 'Harvest', 'A finished session grows a tree', `<div class="tree">${SPECIES_SVGS.sakura}</div><div class="loot"><span class="sun">+84 ${ICONS.sunlight}</span><span class="coin">+7 ${ICONS.coin}</span><span class="xp">+74 XP</span></div>`, 'grow')}${chev}
            ${step(3, 'Build', 'Plant trees, raise buildings', svg, 'build')}${chev}
            ${step(4, 'Level up', 'Perks boost every session', `<div class="ic">${cabin.iconSvg}</div><div class="badge">${stars(cabin.maxLevel)}<span class="tag">${perkTag(cabin)}</span></div>`, 'perk')}
            </div>`
        mountDial(document.getElementById('dial')!, 0.62)
    }
}
