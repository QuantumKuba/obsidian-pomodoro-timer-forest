/**
 * Web Audio API procedural sound synthesizer.
 * Generates soothing chimes, celebratory chords, and ambient focus soundscapes
 * with zero external audio assets, zero latency, and zero bandwidth footprint.
 */

export type AmbientSoundType = 'none' | 'rain' | 'forest_stream' | 'breeze'

export default class SoundManager {
    private audioCtx: AudioContext | null = null
    private ambientGainNode: GainNode | null = null
    private ambientSources: AudioNode[] = []
    private currentAmbient: AmbientSoundType = 'none'

    private getContext(): AudioContext | null {
        if (typeof window === 'undefined') return null
        if (!this.audioCtx) {
            this.audioCtx = new window.AudioContext()
        }
        if (this.audioCtx.state === 'suspended') {
            // Browsers keep audio suspended until the user has interacted with the page
            this.audioCtx.resume().catch(() => {})
        }
        return this.audioCtx
    }

    private playNotes(notes: number[], spacing: number, peak: number, decay: number, type: OscillatorType = 'sine'): void {
        const ctx = this.getContext()
        if (!ctx) return
        const now = ctx.currentTime
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            const t = now + i * spacing
            osc.type = type
            osc.frequency.setValueAtTime(freq, t)
            gain.gain.setValueAtTime(0, t)
            gain.gain.linearRampToValueAtTime(peak, t + 0.02)
            gain.gain.exponentialRampToValueAtTime(0.0001, t + decay)
            osc.connect(gain)
            gain.connect(ctx.destination)
            osc.start(t)
            osc.stop(t + decay + 0.05)
        })
    }

    /** Bright two-note "coin" ding for checked-off tasks and purchases. */
    public playCoin(): void {
        this.playNotes([1318.51, 1975.53], 0.07, 0.08, 0.35, 'triangle')
    }

    /** Rising fanfare for level-ups, chests and achievements. */
    public playLevelUp(): void {
        this.playNotes([392.0, 523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98], 0.08, 0.14, 1.6)
    }

    /**
     * Gentle celebratory harp chime played when a tree completes and is harvested.
     */
    public playHarvestCelebration(): void {
        const ctx = this.getContext()
        if (!ctx) return

        // Pentatonic joyful arpeggio (C5, E5, G5, A5, C6, E6)
        const notes = [523.25, 659.25, 783.99, 880.0, 1046.5, 1318.51]
        const now = ctx.currentTime

        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()

            osc.type = 'sine'
            osc.frequency.setValueAtTime(freq, now + i * 0.1)

            // Warm subtle vibrato
            gain.gain.setValueAtTime(0, now + i * 0.1)
            gain.gain.linearRampToValueAtTime(0.18, now + i * 0.1 + 0.04)
            gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.1 + 1.2)

            osc.connect(gain)
            gain.connect(ctx.destination)

            osc.start(now + i * 0.1)
            osc.stop(now + i * 0.1 + 1.3)
        })
    }

    /**
     * Subtle earth/wood chime when planting a seed.
     */
    public playPlantSeed(): void {
        const ctx = this.getContext()
        if (!ctx) return

        const now = ctx.currentTime
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()

        osc.type = 'triangle'
        osc.frequency.setValueAtTime(329.63, now) // E4
        osc.frequency.exponentialRampToValueAtTime(440.0, now + 0.18) // A4

        gain.gain.setValueAtTime(0.15, now)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4)

        osc.connect(gain)
        gain.connect(ctx.destination)

        osc.start(now)
        osc.stop(now + 0.45)
    }

    /**
     * Branch snap / dull thud when a session is prematurely abandoned (withered).
     */
    public playWitherSound(): void {
        const ctx = this.getContext()
        if (!ctx) return

        const now = ctx.currentTime
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()

        osc.type = 'sawtooth'
        osc.frequency.setValueAtTime(140, now)
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.3)

        gain.gain.setValueAtTime(0.2, now)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)

        osc.connect(gain)
        gain.connect(ctx.destination)

        osc.start(now)
        osc.stop(now + 0.4)
    }

    /**
     * Start procedural ambient soundscape during focus.
     */
    /**
     * Start a looping procedural soundscape. Each one is a continuous noise bed
     * plus randomly scheduled events (drops, bubbles, gusts, birds), which is
     * what makes it read as rain or water rather than a flat hiss.
     */
    public startAmbient(type: AmbientSoundType, volume = 0.3): void {
        this.stopAmbient()
        if (type === 'none') return
        const ctx = this.getContext()
        if (!ctx) return

        this.currentAmbient = type
        const master = ctx.createGain()
        // Fade in so starting a session never "pops"
        master.gain.setValueAtTime(0, ctx.currentTime)
        master.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, volume)) * 1.6, ctx.currentTime + 1.5)
        const limiter = ctx.createDynamicsCompressor()
        limiter.threshold.value = -12
        limiter.ratio.value = 6
        master.connect(limiter)
        limiter.connect(ctx.destination)
        this.ambientGainNode = master
        this.ambientSources.push(limiter)

        if (type === 'rain') this.buildRain(ctx, master)
        else if (type === 'forest_stream') this.buildStream(ctx, master)
        else if (type === 'breeze') this.buildBreeze(ctx, master)
    }

    /** Play a few seconds of a soundscape so it can be heard while choosing it. */
    public previewAmbient(type: AmbientSoundType, volume = 0.3, seconds = 5): void {
        this.startAmbient(type, volume)
        const ctx = this.audioCtx
        const master = this.ambientGainNode
        if (!ctx || !master || type === 'none') return
        const t = ctx.currentTime + seconds
        master.gain.setValueAtTime(master.gain.value, t - 1.2)
        master.gain.linearRampToValueAtTime(0, t)
        this.previewTimer = window.setTimeout(() => {
            if (this.ambientGainNode === master) this.stopAmbient()
        }, seconds * 1000 + 100)
    }

    public get isAmbientPlaying(): boolean {
        return this.currentAmbient !== 'none'
    }

    public stopAmbient(): void {
        if (this.previewTimer) {
            window.clearTimeout(this.previewTimer)
            this.previewTimer = null
        }
        if (this.schedulerTimer) {
            window.clearInterval(this.schedulerTimer)
            this.schedulerTimer = null
        }
        const ctx = this.audioCtx
        const master = this.ambientGainNode
        const sources = this.ambientSources
        this.ambientSources = []
        this.ambientGainNode = null
        this.currentAmbient = 'none'

        // Short fade-out, then tear the graph down
        if (ctx && master) {
            master.gain.cancelScheduledValues(ctx.currentTime)
            master.gain.setValueAtTime(master.gain.value, ctx.currentTime)
            master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4)
        }
        window.setTimeout(() => {
            for (const node of [...sources, ...(master ? [master] : [])]) {
                try {
                    if (node instanceof AudioScheduledSourceNode) node.stop()
                    node.disconnect()
                } catch {
                    // Already stopped
                }
            }
        }, 450)
    }

    // -- building blocks -----------------------------------------------------

    private previewTimer: number | null = null
    private schedulerTimer: number | null = null
    private noiseBuffers: { white?: AudioBuffer; brown?: AudioBuffer } = {}

    private noise(ctx: AudioContext, kind: 'white' | 'brown'): AudioBufferSourceNode {
        let buffer = this.noiseBuffers[kind]
        if (!buffer || buffer.sampleRate !== ctx.sampleRate) {
            const length = ctx.sampleRate * 4
            buffer = ctx.createBuffer(1, length, ctx.sampleRate)
            const data = buffer.getChannelData(0)
            let last = 0
            for (let i = 0; i < length; i++) {
                const white = Math.random() * 2 - 1
                if (kind === 'white') {
                    data[i] = white
                } else {
                    last = (last + 0.02 * white) / 1.02
                    data[i] = last * 3.5
                }
            }
            this.noiseBuffers[kind] = buffer
        }
        const src = ctx.createBufferSource()
        src.buffer = buffer
        src.loop = true
        // Start at a random offset so layers built from the same buffer don't phase
        src.start(0, Math.random() * 3.5)
        this.ambientSources.push(src)
        return src
    }

    private filter(ctx: AudioContext, type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
        const f = ctx.createBiquadFilter()
        f.type = type
        f.frequency.value = freq
        f.Q.value = q
        this.ambientSources.push(f)
        return f
    }

    private gain(ctx: AudioContext, value: number): GainNode {
        const g = ctx.createGain()
        g.gain.value = value
        this.ambientSources.push(g)
        return g
    }

    /** Slow sine modulation of an AudioParam (e.g. gusts, swelling water). */
    private lfo(ctx: AudioContext, param: AudioParam, rate: number, depth: number): void {
        const osc = ctx.createOscillator()
        osc.frequency.value = rate
        const amt = this.gain(ctx, depth)
        osc.connect(amt)
        amt.connect(param)
        osc.start()
        this.ambientSources.push(osc)
    }

    /** Runs `schedule(from, to)` every 100ms with a small look-ahead window. */
    private runScheduler(ctx: AudioContext, schedule: (from: number, to: number) => void): void {
        let cursor = ctx.currentTime + 0.05
        const tick = () => {
            const until = ctx.currentTime + 0.3
            if (until > cursor) {
                schedule(cursor, until)
                cursor = until
            }
        }
        tick()
        this.schedulerTimer = window.setInterval(tick, 100)
    }

    /** Poisson-distributed event times at `perSecond` between from and to. */
    private eventTimes(from: number, to: number, perSecond: number): number[] {
        const times: number[] = []
        let t = from
        while (true) {
            t += -Math.log(1 - Math.random()) / perSecond
            if (t >= to) return times
            times.push(t)
        }
    }

    private oneShotNoise(ctx: AudioContext, out: AudioNode, at: number, dur: number, type: BiquadFilterType, freq: number, q: number, level: number): void {
        const src = ctx.createBufferSource()
        src.buffer = this.noiseBuffers.white!
        const f = ctx.createBiquadFilter()
        f.type = type
        f.frequency.value = freq
        f.Q.value = q
        const g = ctx.createGain()
        g.gain.setValueAtTime(0, at)
        g.gain.linearRampToValueAtTime(level, at + 0.002)
        g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
        src.connect(f)
        f.connect(g)
        g.connect(out)
        src.start(at, Math.random() * 3)
        src.stop(at + dur + 0.02)
    }

    private chirp(ctx: AudioContext, out: AudioNode, at: number, f0: number, f1: number, dur: number, level: number): void {
        const osc = ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(f0, at)
        osc.frequency.exponentialRampToValueAtTime(f1, at + dur)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0, at)
        g.gain.linearRampToValueAtTime(level, at + Math.min(0.01, dur / 4))
        g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
        osc.connect(g)
        g.connect(out)
        osc.start(at)
        osc.stop(at + dur + 0.02)
    }

    // -- soundscapes -----------------------------------------------------------

    /** Steady hiss of distant rain + a soft low rumble + individual drops close by. */
    private buildRain(ctx: AudioContext, out: AudioNode): void {
        const hiss = this.noise(ctx, 'white')
        const hp = this.filter(ctx, 'highpass', 500)
        const lp = this.filter(ctx, 'lowpass', 7000)
        const hissGain = this.gain(ctx, 0.12)
        hiss.connect(hp).connect(lp).connect(hissGain).connect(out)
        this.lfo(ctx, hissGain.gain, 0.07, 0.035) // intensity slowly ebbs

        const rumble = this.noise(ctx, 'brown')
        const rumbleLp = this.filter(ctx, 'lowpass', 180)
        rumble.connect(rumbleLp).connect(this.gain(ctx, 0.12)).connect(out)

        const drops = this.gain(ctx, 1)
        drops.connect(out)
        this.runScheduler(ctx, (from, to) => {
            // Many tiny ticks on leaves/roofs…
            for (const t of this.eventTimes(from, to, 45)) {
                this.oneShotNoise(ctx, drops, t, 0.015 + Math.random() * 0.02, 'bandpass', 2500 + Math.random() * 4500, 3, 0.09 + Math.random() * 0.12)
            }
            // …and occasional fat drops with a little pitched "plip"
            for (const t of this.eventTimes(from, to, 2.5)) {
                this.oneShotNoise(ctx, drops, t, 0.05, 'bandpass', 900 + Math.random() * 900, 4, 0.2)
                if (Math.random() < 0.4) this.chirp(ctx, drops, t, 1400 + Math.random() * 1200, 2600 + Math.random() * 800, 0.04, 0.025)
            }
        })
    }

    /** Burbling water: noise through wandering resonant filters, plus bubbles and the odd bird. */
    private buildStream(ctx: AudioContext, out: AudioNode): void {
        const bedSrc = this.noise(ctx, 'brown')
        const bed = this.filter(ctx, 'lowpass', 900)
        bedSrc.connect(bed).connect(this.gain(ctx, 0.35)).connect(out)

        const burbleSrc = this.noise(ctx, 'white')
        const bands: BiquadFilterNode[] = []
        for (let i = 0; i < 3; i++) {
            const bp = this.filter(ctx, 'bandpass', 500 + i * 450, 8)
            const g = this.gain(ctx, 0.35)
            burbleSrc.connect(bp).connect(g).connect(out)
            this.lfo(ctx, g.gain, 0.15 + i * 0.07, 0.15)
            bands.push(bp)
        }

        const fx = this.gain(ctx, 1)
        fx.connect(out)
        this.runScheduler(ctx, (from, to) => {
            // Water "babble": the resonances jump around several times a second
            for (const t of this.eventTimes(from, to, 9)) {
                const bp = bands[Math.floor(Math.random() * bands.length)]
                bp.frequency.setTargetAtTime(350 + Math.random() * 1500, t, 0.03)
            }
            // Bubbles: short upward sine sweeps
            for (const t of this.eventTimes(from, to, 6)) {
                const f0 = 300 + Math.random() * 500
                this.chirp(ctx, fx, t, f0, f0 * (1.8 + Math.random()), 0.03 + Math.random() * 0.04, 0.03 + Math.random() * 0.04)
            }
            for (const t of this.eventTimes(from, to, 0.12)) this.bird(ctx, fx, t)
        })
    }

    /** Wind through trees: gusting band of noise, rustling leaves, occasional birdsong. */
    private buildBreeze(ctx: AudioContext, out: AudioNode): void {
        const windSrc = this.noise(ctx, 'brown')
        const band = this.filter(ctx, 'bandpass', 400, 0.8)
        const windGain = this.gain(ctx, 0.5)
        windSrc.connect(band).connect(windGain).connect(out)
        this.lfo(ctx, band.frequency, 0.05, 180) // pitch of the wind wanders
        this.lfo(ctx, windGain.gain, 0.09, 0.3) // gusts swell and fade

        const leavesSrc = this.noise(ctx, 'white')
        const leavesHp = this.filter(ctx, 'highpass', 3000)
        const leavesGain = this.gain(ctx, 0.012)
        leavesSrc.connect(leavesHp).connect(leavesGain).connect(out)
        this.lfo(ctx, leavesGain.gain, 0.09, 0.01)

        const fx = this.gain(ctx, 1)
        fx.connect(out)
        this.runScheduler(ctx, (from, to) => {
            for (const t of this.eventTimes(from, to, 1.2)) {
                this.oneShotNoise(ctx, fx, t, 0.25 + Math.random() * 0.4, 'highpass', 2500 + Math.random() * 2000, 0.7, 0.03)
            }
            for (const t of this.eventTimes(from, to, 0.18)) this.bird(ctx, fx, t)
        })
    }

    /** A short, soft two- to four-note bird call. */
    private bird(ctx: AudioContext, out: AudioNode, at: number): void {
        const base = 2200 + Math.random() * 1600
        const notes = 2 + Math.floor(Math.random() * 3)
        for (let i = 0; i < notes; i++) {
            const t = at + i * (0.09 + Math.random() * 0.05)
            const f0 = base * (0.9 + Math.random() * 0.25)
            this.chirp(ctx, out, t, f0, f0 * (Math.random() < 0.5 ? 1.3 : 0.75), 0.07, 0.018)
        }
    }
}
