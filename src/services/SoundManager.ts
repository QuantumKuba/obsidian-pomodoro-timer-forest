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
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
            if (AudioContextClass) {
                this.audioCtx = new AudioContextClass()
            }
        }
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume()
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
    public startAmbient(type: AmbientSoundType, volume = 0.3): void {
        if (type === 'none') {
            this.stopAmbient()
            return
        }

        this.stopAmbient()
        const ctx = this.getContext()
        if (!ctx) return

        this.currentAmbient = type
        this.ambientGainNode = ctx.createGain()
        this.ambientGainNode.gain.setValueAtTime(volume * 0.5, ctx.currentTime)
        this.ambientGainNode.connect(ctx.destination)

        if (type === 'rain') {
            this.generateRainAmbient(ctx, this.ambientGainNode)
        } else if (type === 'forest_stream') {
            this.generateStreamAmbient(ctx, this.ambientGainNode)
        } else if (type === 'breeze') {
            this.generateBreezeAmbient(ctx, this.ambientGainNode)
        }
    }

    public stopAmbient(): void {
        if (this.ambientSources.length > 0) {
            this.ambientSources.forEach((node) => {
                try {
                    ;(node as any).stop?.()
                    node.disconnect()
                } catch {
                    // Ignore disconnect errors
                }
            })
            this.ambientSources = []
        }
        if (this.ambientGainNode) {
            try {
                this.ambientGainNode.disconnect()
            } catch {
                // Ignore
            }
            this.ambientGainNode = null
        }
        this.currentAmbient = 'none'
    }

    private generateRainAmbient(ctx: AudioContext, destination: AudioNode): void {
        // Pink noise with bandpass filter
        const bufferSize = ctx.sampleRate * 2
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
        const output = noiseBuffer.getChannelData(0)
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0

        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1
            b0 = 0.99886 * b0 + white * 0.0555179
            b1 = 0.99332 * b1 + white * 0.0750759
            b2 = 0.96900 * b2 + white * 0.1538520
            b3 = 0.86650 * b3 + white * 0.3104856
            b4 = 0.55000 * b4 + white * 0.5329522
            b5 = -0.7616 * b5 - white * 0.0168980
            output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.08
            b6 = white * 0.115926
        }

        const whiteNoise = ctx.createBufferSource()
        whiteNoise.buffer = noiseBuffer
        whiteNoise.loop = true

        const filter = ctx.createBiquadFilter()
        filter.type = 'lowpass'
        filter.frequency.setValueAtTime(1000, ctx.currentTime)

        whiteNoise.connect(filter)
        filter.connect(destination)
        whiteNoise.start()

        this.ambientSources.push(whiteNoise, filter)
    }

    private generateStreamAmbient(ctx: AudioContext, destination: AudioNode): void {
        const bufferSize = ctx.sampleRate * 2
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
        const output = noiseBuffer.getChannelData(0)

        for (let i = 0; i < bufferSize; i++) {
            output[i] = (Math.random() * 2 - 1) * 0.1
        }

        const noise = ctx.createBufferSource()
        noise.buffer = noiseBuffer
        noise.loop = true

        const filter = ctx.createBiquadFilter()
        filter.type = 'bandpass'
        filter.frequency.setValueAtTime(650, ctx.currentTime)
        filter.Q.setValueAtTime(2.5, ctx.currentTime)

        noise.connect(filter)
        filter.connect(destination)
        noise.start()

        this.ambientSources.push(noise, filter)
    }

    private generateBreezeAmbient(ctx: AudioContext, destination: AudioNode): void {
        const bufferSize = ctx.sampleRate * 2
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
        const output = noiseBuffer.getChannelData(0)

        for (let i = 0; i < bufferSize; i++) {
            output[i] = (Math.random() * 2 - 1) * 0.08
        }

        const noise = ctx.createBufferSource()
        noise.buffer = noiseBuffer
        noise.loop = true

        const filter = ctx.createBiquadFilter()
        filter.type = 'lowpass'
        filter.frequency.setValueAtTime(450, ctx.currentTime)

        noise.connect(filter)
        filter.connect(destination)
        noise.start()

        this.ambientSources.push(noise, filter)
    }
}
