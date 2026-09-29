/**
 * Lightweight, high-performance canvas celebration particle engine.
 * Spawns organic flora petals, golden sparkles, and confetti when a session completes.
 */

export interface Particle {
    x: number
    y: number
    vx: number
    vy: number
    size: number
    color: string
    rotation: number
    vRot: number
    opacity: number
    life: number
    maxLife: number
    type: 'circle' | 'petal' | 'star'
}

export default class ConfettiEngine {
    private canvas: HTMLCanvasElement | null = null
    private ctx: CanvasRenderingContext2D | null = null
    private particles: Particle[] = []
    private animationFrameId: number | null = null

    public attach(canvas: HTMLCanvasElement): void {
        this.canvas = canvas
        this.ctx = canvas.getContext('2d')
        this.resize()
    }

    public resize(): void {
        if (!this.canvas) return
        const rect = this.canvas.parentElement?.getBoundingClientRect()
        if (rect) {
            this.canvas.width = rect.width
            this.canvas.height = rect.height
        }
    }

    public triggerCelebration(speciesId = 'classic_pine'): void {
        if (!this.canvas || !this.ctx) return
        this.resize()

        let colors = ['#81C784', '#4CAF50', '#2E7D32', '#A5D6A7']
        let particleType: Particle['type'] = 'petal'

        if (speciesId === 'sakura') {
            colors = ['#F48FB1', '#EC407A', '#F8BBD0', '#FF80AB', '#FFF']
        } else if (speciesId === 'autumn_maple') {
            colors = ['#FF7043', '#E65100', '#FFA726', '#FFD54F', '#D84315']
        } else if (speciesId === 'golden_tree') {
            colors = ['#FFD700', '#FFC107', '#FFF59D', '#FFE082', '#FFFFFF']
            particleType = 'star'
        } else if (speciesId === 'sunflower') {
            colors = ['#FDD835', '#FBC02D', '#FFA000', '#81C784']
        }

        const width = this.canvas.width
        const height = this.canvas.height
        const count = 45

        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2
            const speed = 2 + Math.random() * 4.5
            this.particles.push({
                x: width / 2,
                y: height / 2 + 10,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 2.5,
                size: 4 + Math.random() * 6,
                color: colors[Math.floor(Math.random() * colors.length)],
                rotation: Math.random() * Math.PI * 2,
                vRot: (Math.random() - 0.5) * 0.15,
                opacity: 1,
                life: 0,
                maxLife: 60 + Math.random() * 40,
                type: particleType,
            })
        }

        if (!this.animationFrameId) {
            this.loop()
        }
    }

    private loop = (): void => {
        if (!this.ctx || !this.canvas) return

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i]
            p.life++
            p.x += p.vx
            p.y += p.vy
            p.vy += 0.08 // subtle gravity
            p.vx *= 0.98 // air friction
            p.rotation += p.vRot
            p.opacity = Math.max(0, 1 - p.life / p.maxLife)

            this.drawParticle(p)

            if (p.life >= p.maxLife) {
                this.particles.splice(i, 1)
            }
        }

        if (this.particles.length > 0) {
            this.animationFrameId = requestAnimationFrame(this.loop)
        } else {
            this.animationFrameId = null
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
        }
    }

    private drawParticle(p: Particle): void {
        if (!this.ctx) return
        this.ctx.save()
        this.ctx.translate(p.x, p.y)
        this.ctx.rotate(p.rotation)
        this.ctx.globalAlpha = p.opacity
        this.ctx.fillStyle = p.color

        if (p.type === 'petal') {
            // Elegant leaf / petal shape
            this.ctx.beginPath()
            this.ctx.moveTo(0, -p.size)
            this.ctx.quadraticCurveTo(p.size * 0.8, 0, 0, p.size)
            this.ctx.quadraticCurveTo(-p.size * 0.8, 0, 0, -p.size)
            this.ctx.fill()
        } else if (p.type === 'star') {
            // 4-pointed star
            this.ctx.beginPath()
            this.ctx.moveTo(0, -p.size)
            this.ctx.lineTo(p.size * 0.3, -p.size * 0.3)
            this.ctx.lineTo(p.size, 0)
            this.ctx.lineTo(p.size * 0.3, p.size * 0.3)
            this.ctx.lineTo(0, p.size)
            this.ctx.lineTo(-p.size * 0.3, p.size * 0.3)
            this.ctx.lineTo(-p.size, 0)
            this.ctx.lineTo(-p.size * 0.3, -p.size * 0.3)
            this.ctx.closePath()
            this.ctx.fill()
        } else {
            this.ctx.beginPath()
            this.ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2)
            this.ctx.fill()
        }

        this.ctx.restore()
    }

    /** Stop drawing on `canvas` if it is the one currently attached (views come and go). */
    public detach(canvas: HTMLCanvasElement): void {
        if (this.canvas === canvas) this.destroy()
    }

    public destroy(): void {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId)
            this.animationFrameId = null
        }
        this.particles = []
        this.canvas = null
        this.ctx = null
    }
}
