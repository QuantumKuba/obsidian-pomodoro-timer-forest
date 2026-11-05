/**
 * Browser-side marketing scenes that need the live timer dial: the hero, the
 * how-it-works loop and the frames of the timer-growth animation. Everything drawn
 * here is the plugin's own component, renderer and art; the pages only arrange it.
 *   ?scene=hero | loop | dial&ratio=0.4
 */
import { readable } from 'svelte/store'
import TimerViewComponent from '../../src/TimerViewComponent.svelte'
import { activePlantStore } from '../../src/stores'
import { renderVillage } from '../../src/render/VillageScene'
import { ICONS, SPECIES_SVGS } from '../../src/assets/floraAssets'
import { getBuilding } from '../../src/assets/floraCatalog'
import type { GamificationData } from '../../src/types/forest'
import { FONT, SHARED_CSS, T } from './theme'
import { perkTag, stars } from './perk-tags'

export const MARKETING_SCENES = ['hero', 'loop', 'dial']

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
            `<div class="tile step ${cls}"><div class="art">${art}</div><div class="cap"><span class="n">${n}</span><div><b>${name}</b><span>${line}</span></div></div></div>`
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
        app.innerHTML = `<div class="eyebrow">How it works</div><div class="title">Your focus builds something</div>
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
