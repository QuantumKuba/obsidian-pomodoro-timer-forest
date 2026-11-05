/**
 * A tiny DevTools-protocol driver for headless Chrome, so one browser can take every
 * README shot: exact viewport (any width), virtual time, element-clipped captures,
 * transparent backgrounds and many animation frames without a relaunch each time.
 * Needs Node 22+ (global WebSocket).
 */
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function openChrome(bin) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-shots-'))
    const proc = spawn(bin, [
        '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
        '--force-color-profile=srgb', '--remote-debugging-port=0', `--user-data-dir=${dir}`, 'about:blank',
    ], { stdio: 'ignore' })
    let port, wsPath
    for (let i = 0; i < 400 && !port; i++) {
        try { [port, wsPath] = fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').trim().split('\n') } catch { await sleep(50) }
    }
    if (!port) throw new Error('Chrome did not start (set CHROME=/path/to/chrome)')
    const ws = new WebSocket(`ws://127.0.0.1:${port}${wsPath}`)
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })

    let seq = 0
    const pending = new Map()
    const listeners = new Set()
    ws.onmessage = (m) => {
        const msg = JSON.parse(m.data)
        if (msg.id && pending.has(msg.id)) {
            const { res, rej } = pending.get(msg.id)
            pending.delete(msg.id)
            msg.error ? rej(new Error(`${msg.error.message} ${msg.error.data || ''}`)) : res(msg.result)
        } else for (const l of listeners) l(msg)
    }
    const send = (method, params = {}, sessionId) =>
        new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params, sessionId })) })
    const event = (sessionId, method, timeout = 30000) =>
        new Promise((res, rej) => {
            const t = setTimeout(() => { listeners.delete(l); rej(new Error(`timeout waiting for ${method}`)) }, timeout)
            const l = (msg) => { if (msg.sessionId === sessionId && msg.method === method) { clearTimeout(t); listeners.delete(l); res(msg.params) } }
            listeners.add(l)
        })

    /**
     * Load `url` in a `width`×`height` viewport at `scale`, let `budget` ms of virtual time
     * pass (timers, rAF), then `settle` ms of real time (CSS animations ignore virtual time),
     * and capture. `clip` is a CSS selector (its bounding box, grown by `pad`), a rect
     * {x, y, width, height}, or a function body evaluated in the page returning such a rect.
     */
    async function shoot({ url, width, height, scale = 2, budget = 12000, settle = 900, clip, pad = 0, transparent = false }) {
        const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
        const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
        const s = (m, p) => send(m, p, sessionId)
        try {
            await s('Page.enable')
            await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false })
            if (transparent) await s('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } })
            const loaded = event(sessionId, 'Page.loadEventFired')
            await s('Page.navigate', { url })
            await loaded
            if (budget) {
                // Like --virtual-time-budget; the virtual clock continues from the real now, so
                // the page's notion of "today" and the hour does not jump
                const done = event(sessionId, 'Emulation.virtualTimeBudgetExpired', 120000)
                await s('Emulation.setVirtualTimePolicy', { policy: 'pauseIfNetworkFetchesPending', budget, initialVirtualTime: Date.now() / 1000 })
                await done
                // 'advance' would fast-forward the clock through every pending timer; hold it instead
                await s('Emulation.setVirtualTimePolicy', { policy: 'pause' })
            }
            if (settle) await sleep(settle)
            let rect
            if (clip) {
                const expr = typeof clip === 'string' && !clip.includes('return')
                    ? `(() => { const r = document.querySelector(${JSON.stringify(clip)}).getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height } })()`
                    : typeof clip === 'string' ? `(() => { ${clip} })()` : null
                rect = expr ? (await s('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value : clip
                if (!rect) throw new Error(`clip ${clip} not found in ${url}`)
                rect = { x: Math.max(0, rect.x - pad), y: Math.max(0, rect.y - pad), width: rect.width + 2 * pad, height: rect.height + 2 * pad }
                // whole device pixels, so frames of one animation all come out the same size
                rect = { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
            }
            const { data } = await s('Page.captureScreenshot', { format: 'png', ...(rect ? { clip: { ...rect, scale: 1 }, captureBeyondViewport: true } : {}) })
            return Buffer.from(data, 'base64')
        } finally {
            await send('Target.closeTarget', { targetId }).catch(() => {})
        }
    }

    return {
        shoot,
        async close() {
            const exited = new Promise((r) => (proc.exitCode !== null ? r() : proc.once('exit', r)))
            try { await send('Browser.close') } catch {}
            ws.close()
            await Promise.race([exited, sleep(3000)])
            proc.kill()
            try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch {}
        },
    }
}
