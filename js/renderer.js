/**
 * renderer.js - Rendering & Visual Effects Module
 * 
 * Shadow Fight-style 2D fighting game renderer.
 * Handles all visual output: dark atmospheric backgrounds, shadow silhouette
 * fighters with glowing edges, particle effects, HUD, menus, and announcements.
 * 
 * Exports: Renderer, ParticleSystem, Particle
 */

import { CANVAS_WIDTH, CANVAS_HEIGHT, GROUND_Y, lerp, rgba } from './utils.js';

// ─────────────────────────────────────────────
// Particle
// ─────────────────────────────────────────────

/**
 * A single visual particle used for hit sparks, dust, energy effects, etc.
 */
export class Particle {
    /**
     * @param {number} x          - World X position
     * @param {number} y          - World Y position
     * @param {number} vx         - Velocity X (px/s)
     * @param {number} vy         - Velocity Y (px/s)
     * @param {string} color      - CSS color string
     * @param {number} size       - Radius in pixels
     * @param {number} lifetime   - Seconds until death
     * @param {string} type       - 'circle' | 'line' | 'spark' | 'square'
     */
    constructor(x, y, vx, vy, color, size, lifetime, type = 'circle') {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.size = size;
        this.initialSize = size;
        this.lifetime = lifetime;
        this.maxLifetime = lifetime;
        this.type = type;
        this.alpha = 1;
        this.gravity = 0;       // set externally if needed
        this.friction = 0.98;   // slight drag
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 4;
    }

    /**
     * Advance the particle by dt seconds.
     * Applies velocity, gravity, friction, shrinks, and fades.
     */
    update(dt) {
        this.lifetime -= dt;

        // Physics
        this.vy += this.gravity * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vx *= this.friction;
        this.vy *= this.friction;

        // Visual fade
        const lifeRatio = Math.max(0, this.lifetime / this.maxLifetime);
        this.alpha = lifeRatio;
        this.size = this.initialSize * lifeRatio;
        this.rotation += this.rotationSpeed * dt;
    }

    /** @returns {boolean} true when this particle should be removed */
    isDead() {
        return this.lifetime <= 0;
    }

    /**
     * Render the particle with glow onto the given context.
     * @param {CanvasRenderingContext2D} ctx
     */
    draw(ctx) {
        if (this.alpha <= 0 || this.size <= 0.1) return;

        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        // Glow
        ctx.shadowBlur = this.size * 3;
        ctx.shadowColor = this.color;

        switch (this.type) {
            case 'circle':
                ctx.beginPath();
                ctx.arc(0, 0, this.size, 0, Math.PI * 2);
                ctx.fillStyle = this.color;
                ctx.fill();
                break;

            case 'spark': {
                // Elongated streak in the direction of travel
                const len = this.size * 3;
                const angle = Math.atan2(this.vy, this.vx);
                ctx.rotate(angle - this.rotation); // override rotation with travel dir
                ctx.beginPath();
                ctx.moveTo(-len, 0);
                ctx.lineTo(len, 0);
                ctx.lineWidth = Math.max(0.5, this.size * 0.6);
                ctx.lineCap = 'round';
                ctx.strokeStyle = this.color;
                ctx.stroke();
                break;
            }

            case 'line': {
                const halfLen = this.size * 2;
                ctx.beginPath();
                ctx.moveTo(-halfLen, 0);
                ctx.lineTo(halfLen, 0);
                ctx.lineWidth = Math.max(0.5, this.size * 0.5);
                ctx.lineCap = 'round';
                ctx.strokeStyle = this.color;
                ctx.stroke();
                break;
            }

            case 'square':
                ctx.fillStyle = this.color;
                ctx.fillRect(-this.size, -this.size, this.size * 2, this.size * 2);
                break;

            default:
                ctx.beginPath();
                ctx.arc(0, 0, this.size, 0, Math.PI * 2);
                ctx.fillStyle = this.color;
                ctx.fill();
                break;
        }

        ctx.restore();
    }
}

// ─────────────────────────────────────────────
// ParticleSystem
// ─────────────────────────────────────────────

/**
 * Manages a pool of Particle objects and provides pre-defined emission configs.
 */
export class ParticleSystem {
    constructor() {
        /** @type {Particle[]} */
        this.particles = [];
    }

    /**
     * Spawn a burst of particles at (x, y) according to config.
     * @param {number} x
     * @param {number} y
     * @param {Object} config - Particle configuration preset
     */
    emit(x, y, config) {
        const count = config.count instanceof Array
            ? config.count[0] + Math.floor(Math.random() * (config.count[1] - config.count[0] + 1))
            : config.count;

        for (let i = 0; i < count; i++) {
            const angle = config.angleMin + Math.random() * (config.angleMax - config.angleMin);
            const speed = config.speedMin + Math.random() * (config.speedMax - config.speedMin);
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;

            const colorIdx = Math.floor(Math.random() * config.colors.length);
            const color = config.colors[colorIdx];

            const size = config.sizeMin + Math.random() * (config.sizeMax - config.sizeMin);
            const lifetime = config.lifetimeMin + Math.random() * (config.lifetimeMax - config.lifetimeMin);
            const type = config.type || 'circle';

            // Small random offset so particles don't all start from the same pixel
            const ox = (Math.random() - 0.5) * (config.spread || 0);
            const oy = (Math.random() - 0.5) * (config.spread || 0);

            const p = new Particle(x + ox, y + oy, vx, vy, color, size, lifetime, type);
            p.gravity = config.gravity || 0;
            p.friction = config.friction !== undefined ? config.friction : 0.98;
            this.particles.push(p);
        }
    }

    /** Advance all particles and cull dead ones. */
    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update(dt);
            if (this.particles[i].isDead()) {
                this.particles.splice(i, 1);
            }
        }
    }

    /** Render all living particles. */
    draw(ctx) {
        if (this.particles.length === 0) return;

        ctx.save();
        // Use additive blending for most spark / energy particles
        ctx.globalCompositeOperation = 'lighter';
        for (const p of this.particles) {
            p.draw(ctx);
        }
        ctx.restore();
    }
}

// ── Pre-defined emission configs ──

/** White/yellow radial burst – on-hit flash */
ParticleSystem.HIT_SPARK = {
    count: [15, 20],
    colors: ['#ffffff', '#ffee88', '#ffcc44', '#ffaa22'],
    sizeMin: 2, sizeMax: 5,
    speedMin: 200, speedMax: 500,
    angleMin: 0, angleMax: Math.PI * 2,
    lifetimeMin: 0.15, lifetimeMax: 0.35,
    gravity: 0,
    friction: 0.92,
    type: 'spark',
    spread: 6
};

/** Blue/cyan flash – blocked attack */
ParticleSystem.BLOCK_SPARK = {
    count: 10,
    colors: ['#44aaff', '#88ccff', '#aaeeff', '#ffffff'],
    sizeMin: 2, sizeMax: 4,
    speedMin: 150, speedMax: 350,
    angleMin: 0, angleMax: Math.PI * 2,
    lifetimeMin: 0.12, lifetimeMax: 0.28,
    gravity: 0,
    friction: 0.93,
    type: 'spark',
    spread: 4
};

/** Gray floating puff – footstep / landing dust */
ParticleSystem.DUST = {
    count: [5, 8],
    colors: ['#888888', '#777766', '#999988', '#666655'],
    sizeMin: 2, sizeMax: 5,
    speedMin: 20, speedMax: 80,
    angleMin: -Math.PI, angleMax: 0,        // upward hemisphere
    lifetimeMin: 0.3, lifetimeMax: 0.6,
    gravity: -30,
    friction: 0.96,
    type: 'circle',
    spread: 12
};

/** Purple / pink swirl – special move energy */
ParticleSystem.ENERGY = {
    count: [20, 30],
    colors: ['#cc44ff', '#ff44cc', '#aa66ff', '#ff88ee', '#8844ff'],
    sizeMin: 2, sizeMax: 6,
    speedMin: 60, speedMax: 250,
    angleMin: 0, angleMax: Math.PI * 2,
    lifetimeMin: 0.3, lifetimeMax: 0.7,
    gravity: -40,
    friction: 0.95,
    type: 'circle',
    spread: 16
};

/** Dark red droplets – shadow blood */
ParticleSystem.BLOOD = {
    count: [8, 14],
    colors: ['#660000', '#880000', '#aa1111', '#551111'],
    sizeMin: 1, sizeMax: 3,
    speedMin: 80, speedMax: 280,
    angleMin: -Math.PI * 0.8, angleMax: Math.PI * 0.1,
    lifetimeMin: 0.25, lifetimeMax: 0.55,
    gravity: 400,
    friction: 0.97,
    type: 'circle',
    spread: 6
};

// ─────────────────────────────────────────────
// Renderer
// ─────────────────────────────────────────────

/**
 * Main rendering engine. Owns the canvas context, particle system,
 * screen-shake state, and all draw helpers.
 */
export class Renderer {
    /**
     * @param {HTMLCanvasElement} canvas
     */
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.particleSystem = new ParticleSystem();

        /** Screen shake state */
        this.screenShake = { intensity: 0, duration: 0, timer: 0, offsetX: 0, offsetY: 0 };

        /** Ambient floating dust for atmospheric background */
        this.backgroundParticles = [];
        this._initBackgroundParticles();

        // Pre-compute the background gradient once (static)
        this._bgGradient = null;
        this._vignetteGradient = null;
    }

    // ── Background particles (ambient dust) ──

    /** Populate initial ambient dust particles. */
    _initBackgroundParticles() {
        for (let i = 0; i < 40; i++) {
            this.backgroundParticles.push(this._createBgParticle(true));
        }
    }

    /**
     * Create a single ambient dust mote.
     * @param {boolean} randomY - if true, scatter across the full height; otherwise start at bottom
     */
    _createBgParticle(randomY = false) {
        return {
            x: Math.random() * CANVAS_WIDTH,
            y: randomY ? Math.random() * CANVAS_HEIGHT : CANVAS_HEIGHT + Math.random() * 20,
            vx: (Math.random() - 0.5) * 12,
            vy: -(5 + Math.random() * 15),
            size: 0.5 + Math.random() * 1.5,
            alpha: 0.1 + Math.random() * 0.2,
            life: 8 + Math.random() * 12
        };
    }

    /** Step ambient background dust. */
    _updateBackgroundParticles(dt) {
        for (let i = this.backgroundParticles.length - 1; i >= 0; i--) {
            const p = this.backgroundParticles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
            if (p.life <= 0 || p.y < -10) {
                this.backgroundParticles[i] = this._createBgParticle(false);
            }
        }
    }

    // ── Frame lifecycle ──

    /** Clear the canvas for a new frame. */
    clear() {
        this.ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    // ── Background ──

    /**
     * Render the atmospheric dark-gradient background with vignette and
     * floating ambient dust.
     */
    drawBackground(optionalCtx) {
        const ctx = this.ctx;

        // Dark gradient sky (cached after first creation)
        if (!this._bgGradient) {
            this._bgGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
            this._bgGradient.addColorStop(0, '#0a0a15');
            this._bgGradient.addColorStop(0.5, '#111122');
            this._bgGradient.addColorStop(1, '#1a1a2e');
        }
        ctx.fillStyle = this._bgGradient;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Subtle radial vignette (darker corners / edges)
        if (!this._vignetteGradient) {
            const cx = CANVAS_WIDTH / 2;
            const cy = CANVAS_HEIGHT / 2;
            const outerR = Math.sqrt(cx * cx + cy * cy);
            this._vignetteGradient = ctx.createRadialGradient(cx, cy, outerR * 0.35, cx, cy, outerR);
            this._vignetteGradient.addColorStop(0, 'rgba(0,0,0,0)');
            this._vignetteGradient.addColorStop(1, 'rgba(0,0,0,0.55)');
        }
        ctx.fillStyle = this._vignetteGradient;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Ambient floating dust motes
        ctx.save();
        for (const p of this.backgroundParticles) {
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = '#ccccaa';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    // ── Ground ──

    /**
     * Draw the arena floor: a thin glowing line at GROUND_Y with a subtle
     * warm-orange glow and a faint reflection plane below.
     */
    drawGround(optionalCtx) {
        const ctx = this.ctx;
        const y = GROUND_Y;

        // Reflection plane below the ground line (dim gradient)
        const reflGrad = ctx.createLinearGradient(0, y, 0, CANVAS_HEIGHT);
        reflGrad.addColorStop(0, 'rgba(40,30,15,0.25)');
        reflGrad.addColorStop(1, 'rgba(10,10,10,0)');
        ctx.fillStyle = reflGrad;
        ctx.fillRect(0, y, CANVAS_WIDTH, CANVAS_HEIGHT - y);

        // Glowing ground line
        ctx.save();
        ctx.shadowBlur = 18;
        ctx.shadowColor = '#cc8833';
        ctx.strokeStyle = '#bb7722';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CANVAS_WIDTH, y);
        ctx.stroke();

        // Second pass for extra glow bloom
        ctx.shadowBlur = 40;
        ctx.shadowColor = 'rgba(200,120,40,0.3)';
        ctx.strokeStyle = 'rgba(200,140,60,0.15)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CANVAS_WIDTH, y);
        ctx.stroke();
        ctx.restore();
    }

    // ── Fighter rendering ──

    /**
     * Render a fighter as a full muscular shadow silhouette with glowing coloured edges,
     * authentic to Shadow Fight 2.
     *
     * @param {Object} fighter
     * @param {number[]} glowColor - [r, g, b] e.g. [68, 136, 255] for blue
     */
    drawFighter(ctxOrFighter, glowColorOrUndef) {
        let fighter, glowColor;
        if (arguments.length === 3) {
            fighter = arguments[1];
            glowColor = arguments[2];
        } else if (glowColorOrUndef && Array.isArray(glowColorOrUndef)) {
            fighter = ctxOrFighter;
            glowColor = glowColorOrUndef;
        } else {
            fighter = ctxOrFighter;
            glowColor = [68, 136, 255];
        }

        if (!fighter || !fighter.skeleton) return;

        const ctx = this.ctx;
        const [r, g, b] = glowColor;
        const glowCSS = `rgb(${r},${g},${b})`;
        const glowAlpha = (a) => `rgba(${r},${g},${b},${a})`;

        const skel = fighter.skeleton;
        const bm = skel.boneMap;
        const facing = fighter.facing || 1;
        const time = performance.now() / 1000;
        const vx = fighter.vx || 0;

        // Extract key bones
        const torso = bm.get('torso');
        const neck = bm.get('neck');
        const head = bm.get('head');

        // Front vs back limb assignment based on facing
        const frontArm = facing === 1 ?
            { up: bm.get('upperArmR'), fore: bm.get('forearmR'), hand: bm.get('handR') } :
            { up: bm.get('upperArmL'), fore: bm.get('forearmL'), hand: bm.get('handL') };

        const rearArm = facing === 1 ?
            { up: bm.get('upperArmL'), fore: bm.get('forearmL'), hand: bm.get('handL') } :
            { up: bm.get('upperArmR'), fore: bm.get('forearmR'), hand: bm.get('handR') };

        const frontLeg = facing === 1 ?
            { thigh: bm.get('thighR'), shin: bm.get('shinR'), foot: bm.get('footR') } :
            { thigh: bm.get('thighL'), shin: bm.get('shinL'), foot: bm.get('footL') };

        const rearLeg = facing === 1 ?
            { thigh: bm.get('thighL'), shin: bm.get('shinL'), foot: bm.get('footL') } :
            { thigh: bm.get('thighR'), shin: bm.get('shinR'), foot: bm.get('footR') };

        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        // ═════════════════════════════════════════════════════════════════════
        // PASS 1: Glowing Backlight / Ambient Outer Aura
        // ═════════════════════════════════════════════════════════════════════
        ctx.shadowBlur = 18;
        ctx.shadowColor = glowCSS;
        ctx.strokeStyle = glowAlpha(0.7);
        ctx.fillStyle = glowAlpha(0.5);
        ctx.lineWidth = 5;

        // Trace entire body geometry for glowing aura
        this._renderFighterShapes(ctx, torso, neck, head, frontArm, rearArm, frontLeg, rearLeg, facing, time, vx, true);

        // ═════════════════════════════════════════════════════════════════════
        // PASS 2: Solid Pure Shadow Body (Deep Opaque Black Silhouette)
        // ═════════════════════════════════════════════════════════════════════
        ctx.shadowBlur = 0;

        // 2a. Rear limbs in deep shadow
        ctx.fillStyle = '#05050a';
        ctx.strokeStyle = '#05050a';
        ctx.lineWidth = 1;
        this._drawLimbSet(ctx, rearArm, rearLeg, facing, '#05050a');

        // 2b. Flowing headband ribbons behind head
        this._drawHeadbandRibbons(ctx, head, facing, time, vx, glowColor);

        // 2c. Torso, hips, tunic, and sash belt
        ctx.fillStyle = '#090910';
        ctx.strokeStyle = '#090910';
        this._drawTorsoAndWaist(ctx, torso, facing, glowColor);

        // 2d. Head with ninja cowl & neck
        this._drawHeadAndNeck(ctx, neck, head, facing, glowColor);

        // 2e. Front limbs in foreground
        ctx.fillStyle = '#0a0a14';
        ctx.strokeStyle = '#0a0a14';
        this._drawLimbSet(ctx, frontArm, frontLeg, facing, '#0a0a14');

        // ═════════════════════════════════════════════════════════════════════
        // PASS 3: Razor-Sharp Luminous Rim-Lighting
        // ═════════════════════════════════════════════════════════════════════
        ctx.shadowBlur = 6;
        ctx.shadowColor = glowCSS;
        ctx.strokeStyle = glowAlpha(0.85);
        ctx.lineWidth = 1.6;

        this._renderFighterOutlines(ctx, torso, neck, head, frontArm, rearArm, frontLeg, rearLeg, facing);

        // ═════════════════════════════════════════════════════════════════════
        // PASS 4: Glowing Ninja Eye Slash & Weapon / Attack Trails
        // ═════════════════════════════════════════════════════════════════════
        this._drawNinjaEye(ctx, head, facing, glowCSS);
        this._drawAttackTrails(ctx, fighter, frontArm, frontLeg, facing, glowCSS);

        ctx.restore();
    }

    /** Helper: draws tapered capsule along a bone segment */
    _drawCapsule(ctx, x1, y1, x2, y2, r1, r2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.5) return;

        const nx = -dy / dist;
        const ny = dx / dist;

        ctx.beginPath();
        ctx.arc(x1, y1, r1, Math.atan2(ny, nx), Math.atan2(-ny, -nx));
        ctx.arc(x2, y2, r2, Math.atan2(-ny, -nx), Math.atan2(ny, nx));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    /** Draw arm and leg limbs */
    _drawLimbSet(ctx, arm, leg, facing, fillColor) {
        ctx.fillStyle = fillColor;

        // Leg: Thigh (hip to knee)
        if (leg.thigh) {
            this._drawCapsule(ctx, leg.thigh.startX, leg.thigh.startY, leg.thigh.endX, leg.thigh.endY, 11, 8);
        }
        // Leg: Shin / Calf (knee to ankle)
        if (leg.shin) {
            this._drawCapsule(ctx, leg.shin.startX, leg.shin.startY, leg.shin.endX, leg.shin.endY, 8.5, 6);
        }
        // Leg: Foot (tabi boot)
        if (leg.foot) {
            const ax = leg.foot.startX;
            const ay = leg.foot.startY;
            const tx = leg.foot.endX;
            const ty = leg.foot.endY;
            ctx.beginPath();
            ctx.moveTo(ax - facing * 5, ay - 3);
            ctx.lineTo(ax - facing * 5, ay + 6);
            ctx.lineTo(tx + facing * 8, ty + 6);
            ctx.lineTo(tx + facing * 8, ty);
            ctx.lineTo(ax + facing * 3, ay - 2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }

        // Arm: Upper arm (shoulder to elbow)
        if (arm.up) {
            this._drawCapsule(ctx, arm.up.startX, arm.up.startY, arm.up.endX, arm.up.endY, 8.5, 6.8);
        }
        // Arm: Forearm (elbow to wrist)
        if (arm.fore) {
            this._drawCapsule(ctx, arm.fore.startX, arm.fore.startY, arm.fore.endX, arm.fore.endY, 6.8, 5.2);
        }
        // Arm: Fist / Hand
        if (arm.hand) {
            ctx.beginPath();
            ctx.arc(arm.hand.startX + (arm.hand.endX - arm.hand.startX) * 0.5,
                    arm.hand.startY + (arm.hand.endY - arm.hand.startY) * 0.5,
                    6.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
    }

    /** Draw muscular torso, waist, belt sash */
    _drawTorsoAndWaist(ctx, torso, facing, glowColor) {
        if (!torso) return;

        const hx = torso.startX;
        const hy = torso.startY; // hip
        const cx = torso.endX;
        const cy = torso.endY;   // chest/shoulders

        const dx = cx - hx;
        const dy = cy - hy;
        const len = Math.hypot(dx, dy) || 1;
        const px = -dy / len;
        const py = dx / len;

        // Chest width: ~30px, Waist: ~20px, Hips: ~24px
        const shoulderW = 16;
        const waistW = 10;
        const hipW = 12;

        const mx = hx + dx * 0.45;
        const my = hy + dy * 0.45;

        // Torso polygon
        ctx.beginPath();
        // Left shoulder
        ctx.moveTo(cx - px * shoulderW, cy - py * shoulderW);
        // Neck dip
        ctx.lineTo(cx, cy - 3);
        // Right shoulder
        ctx.lineTo(cx + px * shoulderW, cy + py * shoulderW);
        // Right waist
        ctx.lineTo(mx + px * waistW, my + py * waistW);
        // Right hip
        ctx.lineTo(hx + px * hipW, hy + py * hipW);
        // Tunic bottom
        ctx.lineTo(hx + dx * 0.1, hy + 8);
        // Left hip
        ctx.lineTo(hx - px * hipW, hy - py * hipW);
        // Left waist
        ctx.lineTo(mx - px * waistW, my - py * waistW);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Belt / Sash (Obi) around waist
        const [r, g, b] = glowColor;
        ctx.save();
        ctx.fillStyle = `rgba(${r},${g},${b},0.4)`;
        ctx.beginPath();
        ctx.moveTo(mx - px * (waistW + 1), my - py * (waistW + 1) - 4);
        ctx.lineTo(mx + px * (waistW + 1), my + py * (waistW + 1) - 4);
        ctx.lineTo(mx + px * (waistW + 1), my + py * (waistW + 1) + 4);
        ctx.lineTo(mx - px * (waistW + 1), my - py * (waistW + 1) + 4);
        ctx.closePath();
        ctx.fill();

        // Sash Knot & hanging tails
        const knotX = mx + facing * 4;
        const knotY = my;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.beginPath();
        ctx.arc(knotX, knotY, 3.5, 0, Math.PI * 2);
        ctx.fill();

        // Hanging sash ribbon
        ctx.strokeStyle = `rgba(${r},${g},${b},0.6)`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(knotX, knotY);
        ctx.quadraticCurveTo(knotX - facing * 5, knotY + 14, knotX - facing * 8, knotY + 24);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(knotX, knotY);
        ctx.quadraticCurveTo(knotX - facing * 2, knotY + 12, knotX - facing * 4, knotY + 20);
        ctx.stroke();
        ctx.restore();
    }

    /** Draw ninja cowl head and neck */
    _drawHeadAndNeck(ctx, neck, head, facing, glowColor) {
        if (!head) return;

        // Neck
        if (neck) {
            ctx.beginPath();
            ctx.moveTo(neck.startX - 5, neck.startY);
            ctx.lineTo(neck.startX + 5, neck.startY);
            ctx.lineTo(neck.endX + 4, neck.endY);
            ctx.lineTo(neck.endX - 4, neck.endY);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }

        // Head cowl (oval with ninja jawline)
        const hx = head.startX + (head.endX - head.startX) * 0.45;
        const hy = head.startY + (head.endY - head.startY) * 0.45;

        ctx.beginPath();
        // Skull oval
        ctx.save();
        ctx.translate(hx, hy);
        ctx.scale(1, 1.15); // slightly elongated head
        ctx.arc(0, 0, 11, 0, Math.PI * 2);
        ctx.restore();
        ctx.fill();
        ctx.stroke();

        // Chin / jaw taper facing forward
        ctx.beginPath();
        ctx.moveTo(hx - facing * 6, hy);
        ctx.lineTo(hx + facing * 8, hy + 4);
        ctx.lineTo(hx + facing * 3, hy + 12); // chin tip
        ctx.lineTo(hx - facing * 4, hy + 9);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    /** Flowing headband ribbons trailing from back of head */
    _drawHeadbandRibbons(ctx, head, facing, time, vx, glowColor) {
        if (!head) return;

        const hx = head.startX + (head.endX - head.startX) * 0.45;
        const hy = head.startY + (head.endY - head.startY) * 0.45;
        const tieX = hx - facing * 10;
        const tieY = hy - 1;

        const [r, g, b] = glowColor;
        const wind = -facing * (14 + Math.abs(vx) * 0.06);
        const wave1 = Math.sin(time * 7) * 4;
        const wave2 = Math.cos(time * 6 + 1) * 5;

        ctx.save();
        ctx.strokeStyle = `rgba(${r},${g},${b},0.85)`;
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';

        // Ribbon 1 (long)
        ctx.beginPath();
        ctx.moveTo(tieX, tieY);
        ctx.quadraticCurveTo(tieX + wind * 0.5, tieY + wave1, tieX + wind, tieY + 8 + wave1);
        ctx.stroke();

        // Ribbon 2 (short)
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(tieX, tieY + 2);
        ctx.quadraticCurveTo(tieX + wind * 0.4, tieY + 4 + wave2, tieX + wind * 0.8, tieY + 14 + wave2);
        ctx.stroke();

        ctx.restore();
    }

    /** Iconic glowing ninja eye slit */
    _drawNinjaEye(ctx, head, facing, glowCSS) {
        if (!head) return;

        const hx = head.startX + (head.endX - head.startX) * 0.45;
        const hy = head.startY + (head.endY - head.startY) * 0.45;

        // Eye location (facing forward)
        const eyeX = hx + facing * 4;
        const eyeY = hy - 2;

        ctx.save();
        ctx.shadowBlur = 12;
        ctx.shadowColor = glowCSS;
        ctx.fillStyle = '#ffffff';

        // Sharp fierce ninja eye slash
        ctx.beginPath();
        ctx.moveTo(eyeX - facing * 2, eyeY - 1);
        ctx.lineTo(eyeX + facing * 6, eyeY);
        ctx.lineTo(eyeX + facing * 4, eyeY + 2.5);
        ctx.lineTo(eyeX - facing * 1, eyeY + 1);
        ctx.closePath();
        ctx.fill();

        // Inner glowing iris dot
        ctx.fillStyle = glowCSS;
        ctx.beginPath();
        ctx.arc(eyeX + facing * 2, eyeY + 0.5, 1.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    /** Attack motion trails & weapon energy */
    _drawAttackTrails(ctx, fighter, frontArm, frontLeg, facing, glowCSS) {
        if (!fighter || fighter.state !== 'attacking' || !fighter.currentMove) return;

        const move = fighter.currentMove;
        ctx.save();
        ctx.shadowBlur = 20;
        ctx.shadowColor = glowCSS;
        ctx.strokeStyle = glowCSS;
        ctx.lineWidth = 3;

        // Fist slash trail for punch / uppercut
        if (move.animation === 'punch' || move.animation === 'uppercut' || move.animation === 'special') {
            if (frontArm && frontArm.hand) {
                const hx = frontArm.hand.endX;
                const hy = frontArm.hand.endY;
                ctx.beginPath();
                ctx.arc(hx, hy, 12, 0, Math.PI * 2);
                ctx.fillStyle = glowCSS;
                ctx.globalAlpha = 0.35;
                ctx.fill();
                ctx.stroke();
            }
        }

        // Foot slash arc for kicks
        if (move.animation === 'kick' || move.animation === 'roundhouse' || move.animation === 'crouch_kick') {
            if (frontLeg && frontLeg.foot) {
                const fx = frontLeg.foot.endX;
                const fy = frontLeg.foot.endY;
                ctx.beginPath();
                ctx.arc(fx, fy, 14, 0, Math.PI * 2);
                ctx.fillStyle = glowCSS;
                ctx.globalAlpha = 0.35;
                ctx.fill();
                ctx.stroke();
            }
        }

        ctx.restore();
    }

    /** Render full body silhouette shapes for Pass 1 (Aura) */
    _renderFighterShapes(ctx, torso, neck, head, frontArm, rearArm, frontLeg, rearLeg, facing, time, vx, isAura) {
        this._drawLimbSet(ctx, rearArm, rearLeg, facing, ctx.fillStyle);
        this._drawTorsoAndWaist(ctx, torso, facing, [255, 255, 255]);
        this._drawHeadAndNeck(ctx, neck, head, facing, [255, 255, 255]);
        this._drawLimbSet(ctx, frontArm, frontLeg, facing, ctx.fillStyle);
    }

    /** Render crisp edge outlines for Pass 3 */
    _renderFighterOutlines(ctx, torso, neck, head, frontArm, rearArm, frontLeg, rearLeg, facing) {
        // Outline front limbs
        if (frontArm.up) this._drawCapsule(ctx, frontArm.up.startX, frontArm.up.startY, frontArm.up.endX, frontArm.up.endY, 8.5, 6.8);
        if (frontArm.fore) this._drawCapsule(ctx, frontArm.fore.startX, frontArm.fore.startY, frontArm.fore.endX, frontArm.fore.endY, 6.8, 5.2);
        if (frontLeg.thigh) this._drawCapsule(ctx, frontLeg.thigh.startX, frontLeg.thigh.startY, frontLeg.thigh.endX, frontLeg.thigh.endY, 11, 8);
        if (frontLeg.shin) this._drawCapsule(ctx, frontLeg.shin.startX, frontLeg.shin.startY, frontLeg.shin.endX, frontLeg.shin.endY, 8.5, 6);

        // Outline head crown
        if (head) {
            const hx = head.startX + (head.endX - head.startX) * 0.45;
            const hy = head.startY + (head.endY - head.startY) * 0.45;
            ctx.beginPath();
            ctx.arc(hx, hy, 11, -Math.PI * 0.8, Math.PI * 0.2);
            ctx.stroke();
        }
    }

    // ── Health bars ──

    /**
     * Draw a single health bar.
     *
     * @param {number}   x          - Left edge x
     * @param {number}   y          - Top edge y
     * @param {number}   width      - Bar pixel width
     * @param {number}   health     - Current HP
     * @param {number}   maxHealth  - Maximum HP
     * @param {number[]} glowColor  - [r,g,b]
     * @param {string}   name       - Fighter display name
     * @param {boolean}  isReversed - If true, bar depletes from left (AI side)
     */
    drawHealthBar(x, y, width, health, maxHealth, glowColor, name, isReversed = false) {
        const ctx = this.ctx;
        const height = 20;
        const radius = 4;
        const ratio = Math.max(0, Math.min(1, health / maxHealth));

        const [r, g, b] = glowColor;
        const glowCSS = `rgb(${r},${g},${b})`;

        // ── Fighter name label ──
        ctx.save();
        ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#cccccc';
        ctx.shadowBlur = 4;
        ctx.shadowColor = glowCSS;
        if (isReversed) {
            ctx.textAlign = 'right';
            ctx.fillText(name, x + width, y - 4);
        } else {
            ctx.textAlign = 'left';
            ctx.fillText(name, x, y - 4);
        }
        ctx.restore();

        ctx.save();

        // ── Dark border / background ──
        ctx.shadowBlur = 8;
        ctx.shadowColor = glowCSS;
        this._roundRect(ctx, x, y, width, height, radius);
        ctx.fillStyle = '#111111';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // ── Coloured health fill ──
        ctx.shadowBlur = 0;
        const fillWidth = width * ratio;
        if (fillWidth > 0) {
            ctx.save();

            // Clip to rounded rect
            this._roundRect(ctx, x, y, width, height, radius);
            ctx.clip();

            // The fill bar position depends on which side it depletes from
            const fillX = isReversed ? x + width - fillWidth : x;

            // Gradient colour: green → yellow → red based on ratio
            let barR, barG, barB;
            if (ratio > 0.5) {
                // green → yellow
                const t = (ratio - 0.5) * 2;
                barR = Math.round(lerp(220, 30, t));
                barG = Math.round(lerp(200, 200, t));
                barB = Math.round(lerp(30, 30, t));
            } else {
                // yellow → red
                const t = ratio * 2;
                barR = Math.round(lerp(220, 220, t));
                barG = Math.round(lerp(40, 200, t));
                barB = 30;
            }

            const barGrad = ctx.createLinearGradient(fillX, y, fillX, y + height);
            barGrad.addColorStop(0, `rgba(${barR},${barG},${barB},1)`);
            barGrad.addColorStop(0.45, `rgba(${barR},${barG},${barB},0.85)`);
            barGrad.addColorStop(0.55, `rgba(${Math.max(0, barR - 40)},${Math.max(0, barG - 40)},${barB},0.9)`);
            barGrad.addColorStop(1, `rgba(${Math.max(0, barR - 60)},${Math.max(0, barG - 60)},${barB},1)`);

            ctx.fillStyle = barGrad;
            ctx.fillRect(fillX, y, fillWidth, height);

            // Inner highlight shine
            const shineGrad = ctx.createLinearGradient(fillX, y, fillX, y + height * 0.5);
            shineGrad.addColorStop(0, 'rgba(255,255,255,0.18)');
            shineGrad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = shineGrad;
            ctx.fillRect(fillX, y, fillWidth, height * 0.5);

            ctx.restore();
        }

        // ── Thin border re-draw (on top of fill) ──
        this._roundRect(ctx, x, y, width, height, radius);
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore();
    }

    // ── HUD ──

    /**
     * Draw the full heads-up display: both health bars, round indicator, timer.
     *
     * @param {Object} player     - Player fighter
     * @param {Object} ai         - AI fighter
     * @param {number} round      - Current round number (1-based)
     * @param {number} timer      - Round timer in seconds
     * @param {number} maxRounds  - Total rounds to win
     */
    drawHUD(player, ai, round, timer, maxRounds) {
        const ctx = this.ctx;
        const barWidth = 400;
        const barY = 20;
        const gap = 20; // gap from centre

        const centreX = CANVAS_WIDTH / 2;

        // Player bar (left side, depletes from right)
        this.drawHealthBar(
            centreX - gap - barWidth, barY, barWidth,
            player.health, player.maxHealth,
            [68, 136, 255],  // blue
            player.name || 'PLAYER',
            true  // reversed: depletes from left edge toward centre
        );

        // AI bar (right side, depletes from left)
        this.drawHealthBar(
            centreX + gap, barY, barWidth,
            ai.health, ai.maxHealth,
            [255, 68, 68],   // red
            ai.name || 'ENEMY',
            false
        );

        // ── Centre: timer ──
        ctx.save();
        const displayTimer = Math.max(0, Math.ceil(timer));
        ctx.font = 'bold 28px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = displayTimer <= 10 ? '#ff4444' : '#ffffff';
        ctx.shadowBlur = 6;
        ctx.shadowColor = displayTimer <= 10 ? '#ff0000' : '#ffffff';
        ctx.fillText(String(displayTimer), centreX, barY + 10);
        ctx.restore();

        // ── Round indicator (small dots/text below timer) ──
        ctx.save();
        ctx.font = '12px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#888888';
        ctx.fillText(`ROUND ${round} / ${maxRounds}`, centreX, barY + 28);
        ctx.restore();
    }

    // ── Screen shake ──

    /**
     * Trigger a screen shake effect.
     * @param {number} intensity - Max pixel offset
     * @param {number} duration  - Duration in seconds
     */
    triggerScreenShake(intensity, duration) {
        this.screenShake.intensity = intensity;
        this.screenShake.duration = duration;
        this.screenShake.timer = duration;
    }

    /** Apply a random screen-shake translate to the canvas context. */
    applyScreenShake(optionalCtx) {
        if (this.screenShake.timer <= 0) return;

        const ctx = this.ctx;

        const progress = this.screenShake.timer / this.screenShake.duration;
        const mag = this.screenShake.intensity * progress;
        this.screenShake.offsetX = (Math.random() - 0.5) * 2 * mag;
        this.screenShake.offsetY = (Math.random() - 0.5) * 2 * mag;

        this.ctx.save();
        this.ctx.translate(this.screenShake.offsetX, this.screenShake.offsetY);
    }

    /** Reset the canvas transform after screen shake. */
    resetScreenShake(optionalCtx) {
        if (this.screenShake.timer <= 0) return;
        this.ctx.restore();
    }

    /** Tick down the screen shake timer. */
    updateScreenShake(dt) {
        if (this.screenShake.timer > 0) {
            this.screenShake.timer -= dt;
            if (this.screenShake.timer <= 0) {
                this.screenShake.timer = 0;
                this.screenShake.offsetX = 0;
                this.screenShake.offsetY = 0;
            }
        }
    }

    // ── Debug ──

    /**
     * Draw a translucent debug rectangle (hitbox / hurtbox).
     * @param {{ x: number, y: number, width: number, height: number }} rect
     * @param {string} color - CSS colour
     */
    drawHitbox(ctxOrRect, rectOrColor, colorMaybe) {
        // Support both drawHitbox(rect, color) and drawHitbox(ctx, rect, color)
        let rect, color;
        if (colorMaybe !== undefined) {
            rect = rectOrColor;
            color = colorMaybe;
        } else {
            rect = ctxOrRect;
            color = rectOrColor;
        }
        const ctx = this.ctx;
        const w = rect.width || rect.w || 0;
        const h = rect.height || rect.h || 0;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(rect.x, rect.y, w, h);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.15;
        ctx.fillRect(rect.x, rect.y, w, h);
        ctx.setLineDash([]);
        ctx.restore();
    }

    // ── Announcements ──

    /**
     * Render large announcement text with dramatic scale / fade animation.
     * @param {string} text      - e.g. "ROUND 1", "FIGHT!", "K.O.!"
     * @param {number} progress  - 0 → 1 animation progress
     */
    drawAnnouncement(text, progress) {
        const ctx = this.ctx;
        ctx.save();

        // Animation phases: scale in (0-0.2), hold (0.2-0.7), fade out (0.7-1)
        let scale, alpha;
        if (progress < 0.2) {
            // Scale in
            const t = progress / 0.2;
            scale = lerp(3, 1, t * t); // ease-out
            alpha = t;
        } else if (progress < 0.7) {
            scale = 1;
            alpha = 1;
        } else {
            // Fade out
            const t = (progress - 0.7) / 0.3;
            scale = 1;
            alpha = 1 - t;
        }

        ctx.globalAlpha = alpha;
        ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 30);
        ctx.scale(scale, scale);

        // Outer glow
        ctx.shadowBlur = 30;
        ctx.shadowColor = '#ffffff';
        ctx.font = 'bold 72px "Segoe UI", Impact, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, 0, 0);

        // Second pass for stronger glow
        ctx.shadowBlur = 60;
        ctx.shadowColor = '#4488ff';
        ctx.fillText(text, 0, 0);

        ctx.restore();
    }

    // ── Menus & overlays ──

    /**
     * Render the main menu screen.
     * @param {number} selectedOption - Index of highlighted menu item (0-based)
     */
    drawMainMenu(selectedOption) {
        const ctx = this.ctx;

        // Background
        this.drawBackground();

        // Title
        ctx.save();
        ctx.shadowBlur = 25;
        ctx.shadowColor = '#4488ff';
        ctx.font = 'bold 64px "Segoe UI", Impact, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('SHADOW FIGHT', CANVAS_WIDTH / 2, 140);

        // Subtitle
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ff4444';
        ctx.font = '24px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = '#cc8888';
        ctx.fillText('Battle of Shadows', CANVAS_WIDTH / 2, 195);
        ctx.restore();

        // Menu items
        const items = ['START GAME', 'TRAINING', 'OPTIONS', 'CREDITS'];
        const startY = 300;
        const spacing = 55;

        for (let i = 0; i < items.length; i++) {
            const isSelected = i === selectedOption;
            const itemY = startY + i * spacing;

            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            if (isSelected) {
                // Highlighted option
                ctx.shadowBlur = 15;
                ctx.shadowColor = '#4488ff';
                ctx.font = 'bold 30px "Segoe UI", Arial, sans-serif';
                ctx.fillStyle = '#ffffff';

                // Selection indicator arrows
                const textWidth = ctx.measureText(items[i]).width;
                ctx.fillText('▸', CANVAS_WIDTH / 2 - textWidth / 2 - 25, itemY);
                ctx.fillText('◂', CANVAS_WIDTH / 2 + textWidth / 2 + 25, itemY);
            } else {
                ctx.font = '26px "Segoe UI", Arial, sans-serif';
                ctx.fillStyle = '#666666';
            }

            ctx.fillText(items[i], CANVAS_WIDTH / 2, itemY);
            ctx.restore();
        }

        // Footer hint
        ctx.save();
        ctx.font = '14px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#444444';
        ctx.fillText('Use ↑↓ to navigate  •  ENTER to select', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 30);
        ctx.restore();
    }

    /**
     * Render the game over screen.
     * @param {string} winner - 'player' | 'ai'
     * @param {Object} stats  - { roundsWon, roundsLost, totalDamage, … }
     */
    drawGameOver(winner, stats) {
        const ctx = this.ctx;

        // Dim overlay
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        const isPlayerWin = winner === 'player';
        const titleText = isPlayerWin ? 'VICTORY' : 'DEFEAT';
        const titleColor = isPlayerWin ? '#44ff88' : '#ff4444';
        const glowColor = isPlayerWin ? '#22cc66' : '#cc2222';

        // Title
        ctx.save();
        ctx.shadowBlur = 30;
        ctx.shadowColor = glowColor;
        ctx.font = 'bold 72px "Segoe UI", Impact, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = titleColor;
        ctx.fillText(titleText, CANVAS_WIDTH / 2, 180);
        ctx.restore();

        // Stats
        if (stats) {
            ctx.save();
            ctx.font = '20px "Segoe UI", Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#aaaaaa';
            const lines = [];
            if (stats.roundsWon !== undefined) lines.push(`Rounds Won: ${stats.roundsWon}`);
            if (stats.roundsLost !== undefined) lines.push(`Rounds Lost: ${stats.roundsLost}`);
            if (stats.totalDamage !== undefined) lines.push(`Total Damage: ${stats.totalDamage}`);
            if (stats.perfects !== undefined) lines.push(`Perfects: ${stats.perfects}`);

            let sy = 270;
            for (const line of lines) {
                ctx.fillText(line, CANVAS_WIDTH / 2, sy);
                sy += 32;
            }
            ctx.restore();
        }

        // Prompt
        ctx.save();
        ctx.font = '18px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#666666';
        ctx.fillText('Press ENTER to return to menu', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 60);
        ctx.restore();
    }

    /**
     * Render a semi-transparent pause overlay.
     */
    drawPauseOverlay() {
        const ctx = this.ctx;

        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        ctx.save();
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ffffff';
        ctx.font = 'bold 48px "Segoe UI", Impact, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('PAUSED', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);

        ctx.shadowBlur = 0;
        ctx.font = '18px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = '#888888';
        ctx.fillText('Press ESC to resume', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 30);
        ctx.restore();
    }

    // ── Main render entry point ──

    /**
     * Render a complete frame based on the current game state.
     *
     * @param {Object} gameState
     *   - state: 'menu' | 'fighting' | 'paused' | 'roundEnd' | 'gameOver'
     *   - player: fighter object
     *   - ai: fighter object
     *   - round: current round number
     *   - timer: round timer (seconds)
     *   - maxRounds: best-of round count
     *   - announcement: { text, progress } | null
     *   - selectedOption: menu cursor index
     *   - winner: 'player' | 'ai'
     *   - stats: end-of-match stats object
     *   - showHitboxes: boolean debug toggle
     */
    render(gameState) {
        const ctx = this.ctx;
        this.clear();

        switch (gameState.state) {
            case 'menu':
                this.drawMainMenu(gameState.selectedOption || 0);
                break;

            case 'fighting':
            case 'roundEnd':
            case 'paused': {
                // Apply screen shake
                this.applyScreenShake();

                // World
                this.drawBackground();
                this.drawGround();

                // Fighters
                if (gameState.player) {
                    this.drawFighter(gameState.player, [68, 136, 255]);
                }
                if (gameState.ai) {
                    this.drawFighter(gameState.ai, [255, 68, 68]);
                }

                // Particles on top of fighters
                this.particleSystem.draw(ctx);

                // Debug hitboxes
                if (gameState.showHitboxes) {
                    if (gameState.player && gameState.player.getHitboxes) {
                        for (const hb of gameState.player.getHitboxes()) {
                            this.drawHitbox(hb, 'rgb(0,150,255)');
                        }
                        if (gameState.player.getHurtbox) {
                            this.drawHitbox(gameState.player.getHurtbox(), 'rgb(0,255,0)');
                        }
                    }
                    if (gameState.ai && gameState.ai.getHitboxes) {
                        for (const hb of gameState.ai.getHitboxes()) {
                            this.drawHitbox(hb, 'rgb(255,80,80)');
                        }
                        if (gameState.ai.getHurtbox) {
                            this.drawHitbox(gameState.ai.getHurtbox(), 'rgb(255,200,0)');
                        }
                    }
                }

                // HUD
                this.drawHUD(
                    gameState.player,
                    gameState.ai,
                    gameState.round || 1,
                    gameState.timer || 0,
                    gameState.maxRounds || 3
                );

                // Reset screen shake transform
                this.resetScreenShake();

                // Announcement overlay (drawn without shake)
                if (gameState.announcement && gameState.announcement.text) {
                    this.drawAnnouncement(gameState.announcement.text, gameState.announcement.progress);
                }

                // Pause overlay on top
                if (gameState.state === 'paused') {
                    this.drawPauseOverlay();
                }
                break;
            }

            case 'gameOver':
                this.drawBackground();
                this.drawGround();
                if (gameState.player) this.drawFighter(gameState.player, [68, 136, 255]);
                if (gameState.ai) this.drawFighter(gameState.ai, [255, 68, 68]);
                this.particleSystem.draw(ctx);
                this.drawGameOver(gameState.winner || 'ai', gameState.stats || {});
                break;

            default:
                // Fallback – just draw background
                this.drawBackground();
                break;
        }
    }

    // ── Effects update ──

    /**
     * Tick all visual effects forward by dt seconds.
     * Call once per frame before render().
     * @param {number} dt - Delta time in seconds
     */
    updateEffects(dt) {
        this.particleSystem.update(dt);
        this.updateScreenShake(dt);
        this._updateBackgroundParticles(dt);
    }

    // ── Utility helpers ──

    /**
     * Trace a rounded-rectangle path (does NOT stroke or fill).
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} x
     * @param {number} y
     * @param {number} w
     * @param {number} h
     * @param {number} r - Corner radius
     */
    _roundRect(ctx, x, y, w, h, r) {
        r = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }
}
