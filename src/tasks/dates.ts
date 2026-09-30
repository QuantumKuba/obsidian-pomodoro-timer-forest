/** Calendar-day helpers for task dates. Dates are `YYYY-MM-DD` in the local time zone. */

const DAY = 86_400_000

const pad = (n: number) => String(n).padStart(2, '0')

export const toISO = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const parse = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d)
}

export const today = () => toISO(new Date())

export function addDays(iso: string, days: number): string {
    const d = parse(iso)
    d.setDate(d.getDate() + days)
    return toISO(d)
}

/** The coming Monday (a week from today when today is Monday). */
export function nextMonday(from: string = today()): string {
    const day = parse(from).getDay() // 0 = Sunday
    return addDays(from, ((8 - day) % 7) || 7)
}

/** Whole days from today: negative in the past. */
export function daysFromToday(iso: string): number {
    return Math.round((parse(iso).getTime() - parse(today()).getTime()) / DAY)
}

export function shortDate(iso: string): string {
    const d = parse(iso)
    const sameYear = d.getFullYear() === new Date().getFullYear()
    return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        ...(sameYear ? {} : { year: 'numeric' }),
    })
}

export const longDate = (iso: string) =>
    parse(iso).toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    })

const weekday = (iso: string) =>
    parse(iso).toLocaleDateString(undefined, { weekday: 'short' })

export type Tone = 'overdue' | 'today' | 'soon' | 'later' | 'future' | 'past'

/** How a due date reads in a chip: "Tomorrow", "Fri", "Oct 9", "3d overdue". */
export function describeDue(iso: string, done = false): { text: string; tone: Tone } {
    const d = daysFromToday(iso)
    if (done) return { text: shortDate(iso), tone: 'past' }
    if (d < -1) return { text: `${-d}d overdue`, tone: 'overdue' }
    if (d === -1) return { text: 'Yesterday', tone: 'overdue' }
    if (d === 0) return { text: 'Today', tone: 'today' }
    if (d === 1) return { text: 'Tomorrow', tone: 'soon' }
    if (d < 7) return { text: weekday(iso), tone: d === 2 ? 'soon' : 'later' }
    return { text: shortDate(iso), tone: 'later' }
}

/** A start date that has not come yet is worth a warning; one that has passed fades away. */
export function describeStart(iso: string): { text: string; tone: Tone } {
    const d = daysFromToday(iso)
    if (d <= 0) return { text: shortDate(iso), tone: 'past' }
    if (d === 1) return { text: 'Starts tomorrow', tone: 'future' }
    if (d < 7) return { text: `Starts ${weekday(iso)}`, tone: 'future' }
    return { text: `Starts ${shortDate(iso)}`, tone: 'future' }
}

/** The same date as a sentence for the editor: "in 3 days", "2 days ago". */
export function relativeDays(iso: string): string {
    const d = daysFromToday(iso)
    if (d === 0) return 'today'
    if (d === 1) return 'tomorrow'
    if (d === -1) return 'yesterday'
    return d > 0 ? `in ${d} days` : `${-d} days ago`
}
