import type { GamificationData } from '../types/forest'
import { getSpecies } from '../assets/floraCatalog'
import { BIOME_CONFIGS, plantedTreeSvg } from '../assets/floraAssets'
import { renderGrove, renderVillage } from '../render/VillageScene'
import { ACHIEVEMENTS, dateKey, levelProgress, levelTitle, villageCharm, vitalityState } from './Progression'

function esc(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** A self-contained, offline HTML snapshot of the village for sharing or a web dashboard. */
export function generateStandaloneForestHtml(data: GamificationData, vaultName = 'Obsidian Vault'): string {
    const level = levelProgress(data.xp)
    const vit = vitalityState(data.vitality)
    const biome = BIOME_CONFIGS[data.activeBiome] || BIOME_CONFIGS.meadow
    const stats = data.lifetimeStats
    const today = data.dailyLogs[dateKey()]

    const village = renderVillage(data, { embedCss: true, idPrefix: 'exv' })
    const grove = today?.trees.length ? renderGrove(today.trees, data.activeBiome, { idPrefix: 'exg' }) : ''

    const recent = Object.values(data.dailyLogs)
        .sort((a, b) => a.date.localeCompare(b.date))
        .flatMap((l) => l.trees)
        .slice(-24)
        .reverse()
        .map((t) => {
            const svg = plantedTreeSvg(t)
            const name = getSpecies(t.speciesId)?.name || t.speciesId
            const label = t.taskText || t.notePath?.split('/').pop()?.replace(/\.md$/, '') || 'Focus session'
            const when = new Date(t.plantedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            return `<li class="${t.status}"><span class="art">${svg}</span><span><b>${esc(name)}</b> · ${t.durationMinutes}m<br><small>${esc(label)} · ${when}</small></span></li>`
        })
        .join('')

    const achievements = ACHIEVEMENTS.filter((a) => data.achievements.includes(a.id))
        .map((a) => `<span class="ach" title="${esc(a.description)}">${a.icon} ${esc(a.title)}</span>`)
        .join('')

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(vaultName)} · Homestead</title>
<style>
:root{--bg:#f4f1ea;--card:#fffdf8;--text:#2b2a27;--muted:#7a756c;--border:#e4ddd0;--accent:#43a047}
@media (prefers-color-scheme:dark){:root{--bg:#15181a;--card:#1d2124;--text:#eef0ea;--muted:#9aa29c;--border:#2c3236}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1040px;margin:0 auto;padding:28px 16px 48px}
header{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:18px}
h1{margin:0;font-size:1.7rem}
.sub{color:var(--muted);margin:2px 0 0}
.lvl{display:flex;align-items:center;gap:10px}
.badge{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;font-weight:800;color:#3b2a07;background:radial-gradient(circle at 35% 30%,#fff1b8,#ffc94a 55%,#e19b16)}
.bar{width:160px;height:6px;border-radius:9px;background:var(--border);overflow:hidden}.bar i{display:block;height:100%;background:linear-gradient(90deg,#ffd54f,#ffb300)}
.scene{border-radius:20px;overflow:hidden;border:1px solid var(--border);box-shadow:0 12px 40px rgba(0,0,0,.12)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:18px 0}
.stat{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:12px 14px}
.stat b{display:block;font-size:1.3rem}.stat span{color:var(--muted);font-size:.8rem}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:18px}@media(max-width:760px){.cols{grid-template-columns:1fr}}
section{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:14px 16px}
h2{margin:0 0 10px;font-size:1rem}
ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;max-height:420px;overflow:auto}
li{display:flex;gap:10px;align-items:center}li.withered{opacity:.55}li small{color:var(--muted)}
.art{width:36px;height:36px;flex-shrink:0}.art svg{width:100%;height:100%}
.achs{display:flex;flex-wrap:wrap;gap:6px}.ach{background:var(--bg);border:1px solid var(--border);border-radius:99px;padding:2px 10px;font-size:.82rem}
footer{margin-top:24px;color:var(--muted);font-size:.8rem;text-align:center}
</style>
</head>
<body><main>
<header>
  <div><h1>${esc(vaultName)}'s Homestead</h1><p class="sub">${esc(biome.name)} · ${vit.label} village · ${villageCharm(data.homestead)} charm</p></div>
  <div class="lvl"><div class="badge">${level.level}</div><div><b>${levelTitle(level.level)}</b><div class="bar"><i style="width:${Math.round(level.ratio * 100)}%"></i></div></div></div>
</header>
<div class="scene">${village}</div>
<div class="grid">
  <div class="stat"><b>🔥 ${data.streak.current}d</b><span>streak · best ${data.streak.longest}d</span></div>
  <div class="stat"><b>${Math.floor(stats.totalFocusMinutes / 60)}h ${stats.totalFocusMinutes % 60}m</b><span>focused</span></div>
  <div class="stat"><b>🌳 ${stats.treesGrown}</b><span>trees grown</span></div>
  <div class="stat"><b>✅ ${stats.tasksCompleted}</b><span>tasks done</span></div>
  <div class="stat"><b>📯 ${stats.questsCompleted}</b><span>quests</span></div>
</div>
<div class="cols">
  <section><h2>Recent harvests</h2><ul>${recent || '<li><small>No trees yet.</small></li>'}</ul></section>
  <section>
    ${grove ? `<h2>Today's grove</h2><div class="scene">${grove}</div><br>` : ''}
    <h2>Achievements (${data.achievements.length}/${ACHIEVEMENTS.length})</h2><div class="achs">${achievements || '<small>None yet — the first tree is the hardest.</small>'}</div>
  </section>
</div>
<footer>Snapshot from Pomodoro Forest &amp; Homestead · ${new Date().toLocaleString()}</footer>
</main></body></html>`
}
