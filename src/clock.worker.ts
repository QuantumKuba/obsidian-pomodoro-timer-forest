/** Sent by the timer: start (or stop) ticking. `lowFps` reports once per second instead of every frame. */
interface ClockCommand {
    start: boolean
    lowFps?: boolean
}

let running = false
let start: number | undefined
let interval = 0
let prev: number | undefined
let lowFps = false

const tick = (t: number): void => {
    if (!running) return

    if (start === undefined) {
        start = t
        prev = t
        self.requestAnimationFrame(tick)
        return
    }

    const delta = t - (prev ?? t)
    interval += delta
    if (lowFps) {
        if (interval >= 1000) {
            self.postMessage(interval)
            interval = 0
        }
    } else {
        self.postMessage(delta)
    }
    self.requestAnimationFrame(tick)

    prev = t
}

self.onmessage = ({ data }: MessageEvent<ClockCommand>) => {
    if (data.start) {
        lowFps = data.lowFps ?? false
        if (!running) {
            running = true
            interval = 0
            self.requestAnimationFrame(tick)
        }
    } else {
        running = false
        start = undefined
        prev = undefined
    }
}
