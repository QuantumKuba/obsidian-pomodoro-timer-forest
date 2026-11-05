/**
 * The one visual system every composed README image shares: warm paper background,
 * the same type scale, margins and card radius. The outer corners are rounded by the
 * build (see build.mjs `frame`), so pages here are plain rectangles.
 */
export const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif`

export const T = {
    paper: '#f4f1ea',
    card: '#fffdf8',
    line: '#e5ddcf',
    ink: '#1d2b24',
    muted: '#6d6a61',
    green: '#2e7d32',
    gold: '#a86a00',
    margin: 40,
    radius: 18,
}

/** Standalone page of exactly w×h CSS px. */
export const page = (w: number, h: number, css: string, body: string, bg: string = T.paper) =>
    `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0}body{width:${w}px;height:${h}px;overflow:hidden;font-family:${FONT};color:${T.ink};background:${bg};-webkit-font-smoothing:antialiased}${SHARED_CSS}${css}</style></head><body>${body}</body></html>`

/** Building blocks used across images. */
export const SHARED_CSS = `
.eyebrow{font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${T.green}}
.title{font-size:30px;font-weight:750;letter-spacing:-.015em;margin:4px 0 0;line-height:1.1}
.pill{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;padding:3px 9px;border-radius:99px;background:#e8f1e1;color:${T.green};white-space:nowrap}
.pill.gold{background:#f7ecd6;color:${T.gold}}
.pill svg{width:13px;height:13px}
.tile{background:${T.card};border:1px solid ${T.line};border-radius:${T.radius}px;box-shadow:0 1px 0 rgba(255,255,255,.8) inset,0 6px 18px rgba(60,45,20,.06)}
`
