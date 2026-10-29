/**
 * animation.js — Procedural Skeletal Animation System
 *
 * Shadow Fight-style 2D fighting game.
 * Fighters are rendered as full muscular shadow silhouettes.
 *
 * Architecture:
 *   • Bone: stores local hierarchy and forward kinematics in neutral coordinates
 *   • Skeleton: computes neutral local coordinates, then projects to world
 *     coordinates cleanly using (worldX = x + facing * localX, worldY = y - 115 + localY).
 *     This GUARANTEES the character can NEVER be inverted or upside down.
 *   • AnimationClip: keyframed martial arts animations with smooth cosine easing.
 *   • AnimationPlayer: smooth interpolation, cross-fading, and playback control.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Bone
// ─────────────────────────────────────────────────────────────────────────────

export class Bone {
    /**
     * @param {string} name       — unique bone name
     * @param {number} length     — bone length in pixels
     * @param {number} angle      — local angle relative to parent (radians)
     * @param {Bone|null} parent  — parent bone (null for root)
     */
    constructor(name, length, angle = 0, parent = null) {
        this.name = name;
        this.length = length;
        this.angle = angle;            // local angle relative to parent
        this.parent = parent;
        /** @type {Bone[]} */
        this.children = [];

        // Neutral local coordinates (relative to hip root at (0, 0))
        this.localStartX = 0;
        this.localStartY = 0;
        this.localEndX = 0;
        this.localEndY = 0;
        this.localAngle = 0;

        // World-space coordinates (computed with facing & fighter position)
        this.startX = 0;
        this.startY = 0;
        this.endX = 0;
        this.endY = 0;

        // Visual thickness
        this.thickness = 6;
    }

    /** Add a child bone and return it for chaining. */
    addChild(bone) {
        bone.parent = this;
        this.children.push(bone);
        return bone;
    }

    /**
     * Compute forward kinematics in neutral local space (facing right, hip at (0, 0)).
     * @param {number} parentX
     * @param {number} parentY
     * @param {number} parentAngle
     */
    computeLocal(parentX, parentY, parentAngle) {
        this.localStartX = parentX;
        this.localStartY = parentY;
        this.localAngle = parentAngle + this.angle;
        this.localEndX = this.localStartX + Math.cos(this.localAngle) * this.length;
        this.localEndY = this.localStartY + Math.sin(this.localAngle) * this.length;

        for (const child of this.children) {
            child.computeLocal(this.localEndX, this.localEndY, this.localAngle);
        }
    }

    /**
     * Project neutral local coordinates to world coordinates.
     * Mirrors X according to facing (1 = right, -1 = left).
     * Y is NEVER inverted — guaranteeing characters always stay upright!
     * @param {number} x        — fighter world X (center, feet)
     * @param {number} rootY    — fighter hip world Y (feet Y - 115)
     * @param {number} facing   — 1 = facing right, -1 = facing left
     */
    applyWorld(x, rootY, facing) {
        this.startX = x + facing * this.localStartX;
        this.startY = rootY + this.localStartY;
        this.endX = x + facing * this.localEndX;
        this.endY = rootY + this.localEndY;

        for (const child of this.children) {
            child.applyWorld(x, rootY, facing);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Skeleton
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Humanoid martial arts skeleton.
 *
 * Joint hierarchy:
 *   hip (0, 0)
 *   ├── torso (46px, upward)
 *   │   ├── neck (10px, upward)
 *   │   │   └── head (16px, upward)
 *   │   ├── upperArmR → forearmR → handR  (Front arm)
 *   │   └── upperArmL → forearmL → handL  (Back arm)
 *   ├── thighR → shinR → footR            (Front leg)
 *   └── thighL → shinL → footL            (Back leg)
 */
export class Skeleton {
    constructor() {
        // — Root ────────────────────────────────────────────────────────────
        this.hip = new Bone('hip', 0, 0, null);

        // — Torso chain (upward) ───────────────────────────────────────────
        this.torso     = this.hip.addChild(new Bone('torso', 46, -Math.PI / 2));
        this.neck      = this.torso.addChild(new Bone('neck', 10, 0));
        this.head      = this.neck.addChild(new Bone('head', 16, 0));

        // — Right arm (Front arm when facing right) ─────────────────────────
        this.upperArmR = this.torso.addChild(new Bone('upperArmR', 30, Math.PI * 0.58));
        this.forearmR  = this.upperArmR.addChild(new Bone('forearmR', 26, 0.45));
        this.handR     = this.forearmR.addChild(new Bone('handR', 10, 0.15));

        // — Left arm (Back arm when facing right) ──────────────────────────
        this.upperArmL = this.torso.addChild(new Bone('upperArmL', 30, Math.PI * 0.68));
        this.forearmL  = this.upperArmL.addChild(new Bone('forearmL', 26, 0.40));
        this.handL     = this.forearmL.addChild(new Bone('handL', 10, 0.15));

        // — Right leg (Front leg) ──────────────────────────────────────────
        this.thighR    = this.hip.addChild(new Bone('thighR', 44, Math.PI / 2 - 0.18));
        this.shinR     = this.thighR.addChild(new Bone('shinR', 42, 0.22));
        this.footR     = this.shinR.addChild(new Bone('footR', 16, -Math.PI / 2 + 0.85));

        // — Left leg (Back leg) ────────────────────────────────────────────
        this.thighL    = this.hip.addChild(new Bone('thighL', 44, Math.PI / 2 + 0.18));
        this.shinL     = this.thighL.addChild(new Bone('shinL', 42, -0.15));
        this.footL     = this.shinL.addChild(new Bone('footL', 16, -Math.PI / 2 + 0.85));

        // Flat list
        /** @type {Bone[]} */
        this.allBones = [
            this.hip,
            this.torso, this.neck, this.head,
            this.upperArmR, this.forearmR, this.handR,
            this.upperArmL, this.forearmL, this.handL,
            this.thighR, this.shinR, this.footR,
            this.thighL, this.shinL, this.footL
        ];

        // Map lookup
        /** @type {Map<string, Bone>} */
        this.boneMap = new Map();
        for (const b of this.allBones) {
            this.boneMap.set(b.name, b);
        }

        this.facing = 1;
        this.x = 0;
        this.y = 0;
    }

    /**
     * Compute world positions for all bones.
     * Guaranteed upright in both facing directions!
     * @param {number} x       — fighter world X (centre, feet)
     * @param {number} y       — fighter world Y (feet / ground)
     * @param {number} facing  — 1 = right, -1 = left
     */
    computeWorldPositions(x, y, facing) {
        this.x = x;
        this.y = y;
        this.facing = facing >= 0 ? 1 : -1;

        // Step 1: Compute neutral local coordinates (hip at 0, 0)
        this.hip.computeLocal(0, 0, 0);

        // Step 2: Project cleanly to world coordinates
        const rootY = y - 115;
        this.hip.applyWorld(x, rootY, this.facing);
    }

    /**
     * Return bone segments as endpoints for rendering.
     */
    getBoneEndpoints() {
        const segments = [];
        for (const b of this.allBones) {
            if (b.length === 0) continue;
            segments.push({
                x1: b.startX,
                y1: b.startY,
                x2: b.endX,
                y2: b.endY,
                startX: b.startX,
                startY: b.startY,
                endX: b.endX,
                endY: b.endY,
                name: b.name,
                thickness: b.thickness
            });
        }
        return segments;
    }

    /**
     * Return world positions of every joint for rendering.
     */
    getJointPositions() {
        const joints = [];
        for (const b of this.allBones) {
            joints.push({
                x: b.startX,
                y: b.startY,
                name: b.name + '_start',
                isHead: false
            });
            if (b.children.length === 0) {
                joints.push({
                    x: b.endX,
                    y: b.endY,
                    name: b.name + '_end',
                    isHead: b.name === 'head'
                });
            }
        }
        return joints;
    }

    /** Get bone by name. */
    getBone(name) {
        return this.boneMap.get(name) || null;
    }

    /** Set bone angles from a dictionary { boneName: angle }. */
    applyPose(pose) {
        for (const [name, angle] of Object.entries(pose)) {
            const bone = this.boneMap.get(name);
            if (bone) bone.angle = angle;
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  AnimationClip
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Keyframed animation clip with smooth cosine interpolation.
 */
export class AnimationClip {
    /**
     * @param {string} name
     * @param {Array<{boneAngles: Object, duration: number, hitboxActive?: boolean, hitboxOffset?: {offsetX:number,offsetY:number,w:number,h:number}|null}>} keyframes
     */
    constructor(name, keyframes) {
        this.name = name;
        this.keyframes = keyframes;
    }

    /** Total duration in milliseconds. */
    get totalDuration() {
        let t = 0;
        for (const kf of this.keyframes) t += kf.duration;
        return t;
    }

    /**
     * Return interpolated pose at elapsed time.
     * Uses smooth cosine easing for organic martial arts fluidity!
     */
    getFrameAt(elapsedMs) {
        if (this.keyframes.length === 1) {
            return { from: this.keyframes[0], to: this.keyframes[0], t: 0, index: 0 };
        }

        let accumulated = 0;
        for (let i = 0; i < this.keyframes.length; i++) {
            const kf = this.keyframes[i];
            const nextIndex = (i + 1) < this.keyframes.length ? (i + 1) : 0;
            const nextKf = this.keyframes[nextIndex];

            if (elapsedMs < accumulated + kf.duration) {
                const rawT = Math.max(0, Math.min(1, (elapsedMs - accumulated) / kf.duration));
                // Smooth cosine easing (slow in, fast out, smooth stop)
                const smoothT = (1 - Math.cos(rawT * Math.PI)) / 2;
                return {
                    from: kf,
                    to: nextKf,
                    t: smoothT,
                    index: i
                };
            }
            accumulated += kf.duration;
        }

        const last = this.keyframes[this.keyframes.length - 1];
        const first = this.keyframes[0];
        return { from: last, to: first, t: 1, index: this.keyframes.length - 1 };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  AnimationPlayer
// ─────────────────────────────────────────────────────────────────────────────

export class AnimationPlayer {
    /**
     * @param {Map<string, AnimationClip>} clips
     */
    constructor(clips) {
        this.clips = clips;
        this.currentClip = null;
        this.currentClipName = '';
        this.elapsed = 0;
        this.loop = false;
        this.onComplete = null;
        this.speed = 1.0;

        // Smooth cross-blending between clips
        this.blendDuration = 90; // ms
        this.blendTimer = 0;
        this.previousPose = {};
        this.isBlending = false;
    }

    play(clipName, options = {}) {
        const clip = this.clips.get(clipName);
        if (!clip) {
            console.warn(`AnimationPlayer: clip "${clipName}" not found`);
            return;
        }

        // If already playing the same looping clip, let it continue
        if (clipName === this.currentClipName && this.loop && options.loop) {
            return;
        }

        // Snapshot current pose for silky cross-fade transition
        if (this.currentClip) {
            this.previousPose = this._evaluateClipPose(this.currentClip, this.elapsed);
            this.isBlending = true;
            this.blendTimer = 0;
        }

        this.currentClip = clip;
        this.currentClipName = clipName;
        this.elapsed = 0;
        this.loop = !!options.loop;
        this.onComplete = options.onComplete || null;
        this.speed = options.speed != null ? options.speed : 1.0;
        if (options.blendTime != null) this.blendDuration = options.blendTime;
    }

    update(dt, skeleton) {
        if (!this.currentClip) return;

        const dtMs = dt * 1000 * this.speed;
        this.elapsed += dtMs;

        const totalDur = this.currentClip.totalDuration;

        if (this.elapsed >= totalDur) {
            if (this.loop) {
                this.elapsed = this.elapsed % totalDur;
            } else {
                this.elapsed = totalDur;
                if (this.onComplete) {
                    const cb = this.onComplete;
                    this.onComplete = null;
                    cb();
                }
            }
        }

        // Evaluate target pose
        const targetPose = this._evaluateClipPose(this.currentClip, this.elapsed);

        // Blend with previous pose
        let finalPose = targetPose;
        if (this.isBlending) {
            this.blendTimer += dtMs;
            const rawBlendT = Math.min(1, this.blendTimer / this.blendDuration);
            const smoothBlendT = (1 - Math.cos(rawBlendT * Math.PI)) / 2;
            finalPose = this._blendPoses(this.previousPose, targetPose, smoothBlendT);
            if (rawBlendT >= 1) {
                this.isBlending = false;
            }
        }

        // Dynamic martial arts breathing oscillation for idle
        if (this.currentClipName === 'idle') {
            const t = performance.now() / 1000;
            const breath = Math.sin(t * 2.4);
            if (finalPose.torso != null) finalPose.torso += breath * 0.02;
            if (finalPose.upperArmR != null) finalPose.upperArmR += breath * 0.035;
            if (finalPose.upperArmL != null) finalPose.upperArmL += breath * 0.025;
            if (finalPose.head != null) finalPose.head += Math.sin(t * 1.8) * 0.015;
        }

        skeleton.applyPose(finalPose);
    }

    isPlaying(clipName) {
        return this.currentClipName === clipName;
    }

    getCurrentHitbox() {
        if (!this.currentClip) return null;
        const frame = this.currentClip.getFrameAt(this.elapsed);
        const kf = frame.from;
        if (kf.hitboxActive && kf.hitboxOffset) {
            return { ...kf.hitboxOffset };
        }
        return null;
    }

    _evaluateClipPose(clip, elapsedMs) {
        const { from, to, t } = clip.getFrameAt(elapsedMs);
        const pose = {};
        const allNames = new Set([
            ...Object.keys(from.boneAngles),
            ...Object.keys(to.boneAngles)
        ]);
        for (const name of allNames) {
            const a = from.boneAngles[name];
            const b = to.boneAngles[name];
            if (a != null && b != null) {
                pose[name] = a + (b - a) * t;
            } else if (b != null) {
                pose[name] = b;
            } else if (a != null) {
                pose[name] = a;
            }
        }
        return pose;
    }

    _blendPoses(poseA, poseB, t) {
        const result = {};
        const allNames = new Set([...Object.keys(poseA), ...Object.keys(poseB)]);
        for (const name of allNames) {
            const a = poseA[name];
            const b = poseB[name];
            if (a != null && b != null) {
                result[name] = a + (b - a) * t;
            } else if (b != null) {
                result[name] = b;
            } else if (a != null) {
                result[name] = a;
            }
        }
        return result;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Pre-defined Martial Arts Animation Clips (Shadow Fight 2 Stances)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates authentic Shadow Fight 2 martial arts fighting animations.
 * Ready combat guard, natural body physics, snappy strikes, and fluid recovery!
 */
export function createAnimationClips() {
    /** @type {Map<string, AnimationClip>} */
    const clips = new Map();

    // ── Authentic Shadow Fight Combat Ready Stance ───────────────────────
    // Fists guarding chin and ribs, athletic knee flex, focused posture
    const guardRest = {
        torso:     -Math.PI / 2 - 0.05, // slightly leaned back defensively
        neck:      0.04,
        head:      -0.02,
        // Lead arm (R): high guard protecting chin
        upperArmR: Math.PI * 0.42,
        forearmR:  0.85,
        handR:     0.15,
        // Rear arm (L): tucked guard protecting solar plexus
        upperArmL: Math.PI * 0.58,
        forearmL:  0.95,
        handL:     0.15,
        // Lead leg (R): springy flex
        thighR:    Math.PI / 2 - 0.22,
        shinR:     0.32,
        footR:     -Math.PI / 2 + 0.85,
        // Rear leg (L): braced support
        thighL:    Math.PI / 2 + 0.18,
        shinL:     -0.12,
        footL:     -Math.PI / 2 + 0.85
    };

    // =====================================================================
    //  1. IDLE — Shadow Fight 2 Combat Stance (Smooth Breathing Sway)
    // =====================================================================
    clips.set('idle', new AnimationClip('idle', [
        { duration: 600, boneAngles: { ...guardRest } },
        { duration: 600, boneAngles: {
            ...guardRest,
            torso:     -Math.PI / 2 - 0.08,
            upperArmR: Math.PI * 0.40,
            forearmR:  0.88,
            upperArmL: Math.PI * 0.56,
            thighR:    Math.PI / 2 - 0.26,
            shinR:     0.36
        }},
        { duration: 600, boneAngles: { ...guardRest } }
    ]));

    // =====================================================================
    //  2. WALK FORWARD — Smooth Ninja Advance
    // =====================================================================
    clips.set('walk_forward', new AnimationClip('walk_forward', [
        { duration: 140, boneAngles: {
            ...guardRest,
            torso:  -Math.PI / 2 + 0.04,
            thighR: Math.PI / 2 - 0.48, shinR: 0.55,
            thighL: Math.PI / 2 + 0.35, shinL: -0.25,
            upperArmR: Math.PI * 0.46, upperArmL: Math.PI * 0.52
        }},
        { duration: 140, boneAngles: {
            ...guardRest,
            torso:  -Math.PI / 2 + 0.02,
            thighR: Math.PI / 2 - 0.15, shinR: 0.15,
            thighL: Math.PI / 2 + 0.10, shinL: 0.05
        }},
        { duration: 140, boneAngles: {
            ...guardRest,
            torso:  -Math.PI / 2 + 0.04,
            thighR: Math.PI / 2 + 0.35, shinR: -0.25,
            thighL: Math.PI / 2 - 0.48, shinL: 0.55,
            upperArmR: Math.PI * 0.38, upperArmL: Math.PI * 0.62
        }},
        { duration: 140, boneAngles: {
            ...guardRest,
            torso:  -Math.PI / 2 + 0.02,
            thighR: Math.PI / 2 + 0.10, shinR: 0.05,
            thighL: Math.PI / 2 - 0.15, shinL: 0.15
        }}
    ]));

    // =====================================================================
    //  3. WALK BACKWARD — Tactical Retreat
    // =====================================================================
    clips.set('walk_backward', new AnimationClip('walk_backward', [
        { duration: 150, boneAngles: {
            ...guardRest,
            torso:  -Math.PI / 2 - 0.08,
            thighR: Math.PI / 2 + 0.32, shinR: -0.20,
            thighL: Math.PI / 2 - 0.35, shinL: 0.45,
            upperArmR: Math.PI * 0.38, upperArmL: Math.PI * 0.65
        }},
        { duration: 150, boneAngles: {
            ...guardRest,
            torso:  -Math.PI / 2 - 0.06,
            thighR: Math.PI / 2 - 0.10, shinR: 0.10,
            thighL: Math.PI / 2 + 0.10, shinL: -0.05
        }},
        { duration: 150, boneAngles: {
            ...guardRest,
            torso:  -Math.PI / 2 - 0.08,
            thighR: Math.PI / 2 - 0.35, shinR: 0.45,
            thighL: Math.PI / 2 + 0.32, shinL: -0.20,
            upperArmR: Math.PI * 0.45, upperArmL: Math.PI * 0.55
        }}
    ]));

    // =====================================================================
    //  4. JUMP — Athletic Vault
    // =====================================================================
    clips.set('jump', new AnimationClip('jump', [
        // Compression
        { duration: 80, boneAngles: {
            ...guardRest,
            torso:  -Math.PI / 2 + 0.15,
            thighR: Math.PI / 2 - 0.55, shinR: 0.95,
            thighL: Math.PI / 2 - 0.45, shinL: 0.85,
            upperArmR: Math.PI * 0.65, upperArmL: Math.PI * 0.75
        }},
        // Apex tuck
        { duration: 240, boneAngles: {
            ...guardRest,
            torso:  -Math.PI / 2 - 0.10,
            thighR: Math.PI / 2 - 0.85, shinR: 1.15,
            thighL: Math.PI / 2 - 0.75, shinL: 1.05,
            upperArmR: Math.PI * 0.25, forearmR: 0.40,
            upperArmL: Math.PI * 0.35, forearmL: 0.45
        }},
        // Landing prep
        { duration: 240, boneAngles: {
            ...guardRest,
            torso:  -Math.PI / 2 + 0.05,
            thighR: Math.PI / 2 - 0.35, shinR: 0.45,
            thighL: Math.PI / 2 - 0.25, shinL: 0.35
        }}
    ]));

    // =====================================================================
    //  5. CROUCH — Low Martial Arts Duck
    // =====================================================================
    clips.set('crouch', new AnimationClip('crouch', [
        { duration: 90, boneAngles: {
            ...guardRest,
            torso:     -Math.PI / 2 + 0.35,
            thighR:    Math.PI / 2 - 0.85, shinR: 1.35,
            thighL:    Math.PI / 2 - 0.65, shinL: 1.15,
            upperArmR: Math.PI * 0.45, forearmR: 1.10,
            upperArmL: Math.PI * 0.55, forearmL: 1.20
        }},
        { duration: 250, boneAngles: {
            ...guardRest,
            torso:     -Math.PI / 2 + 0.38,
            thighR:    Math.PI / 2 - 0.90, shinR: 1.40,
            thighL:    Math.PI / 2 - 0.70, shinL: 1.20,
            upperArmR: Math.PI * 0.42, forearmR: 1.15,
            upperArmL: Math.PI * 0.52, forearmL: 1.25
        }}
    ]));

    // =====================================================================
    //  6. PUNCH — Lightning Straight Karate Jab
    // =====================================================================
    clips.set('punch', new AnimationClip('punch', [
        // Coil windup (60ms)
        { duration: 60, hitboxActive: false, boneAngles: {
            ...guardRest,
            torso:     -Math.PI / 2 - 0.12,
            upperArmR: Math.PI * 0.55, forearmR: 1.25, handR: 0.1,
            upperArmL: Math.PI * 0.45, forearmL: 0.95
        }},
        // Explosive Strike (70ms) — HITBOX ACTIVE
        { duration: 70, hitboxActive: true, hitboxOffset: { offsetX: 48, offsetY: -82, w: 55, h: 32 },
          boneAngles: {
            ...guardRest,
            torso:     -Math.PI / 2 + 0.18, // body leans into the punch!
            upperArmR: -0.05,               // fully extended forward!
            forearmR:  0.02,
            handR:     0.0,
            // Rear arm pulls back for torque
            upperArmL: Math.PI * 0.75, forearmL: 1.35,
            thighR:    Math.PI / 2 - 0.28, shinR: 0.38
        }},
        // Impact hold (60ms) — HITBOX ACTIVE
        { duration: 60, hitboxActive: true, hitboxOffset: { offsetX: 50, offsetY: -82, w: 55, h: 32 },
          boneAngles: {
            ...guardRest,
            torso:     -Math.PI / 2 + 0.16,
            upperArmR: 0.0,
            forearmR:  0.04,
            handR:     0.0,
            upperArmL: Math.PI * 0.72, forearmL: 1.30
        }},
        // Fluid recovery (120ms)
        { duration: 120, hitboxActive: false, boneAngles: { ...guardRest } }
    ]));

    // =====================================================================
    //  7. KICK — High Snap Kick
    // =====================================================================
    clips.set('kick', new AnimationClip('kick', [
        // Chamber (70ms)
        { duration: 70, boneAngles: {
            ...guardRest,
            torso:     -Math.PI / 2 - 0.15,
            thighR:    0.35, shinR: 1.25, footR: 0.45,
            upperArmR: Math.PI * 0.35, upperArmL: Math.PI * 0.65
        }},
        // Whip Extension (80ms) — HITBOX ACTIVE
        { duration: 80, hitboxActive: true, hitboxOffset: { offsetX: 58, offsetY: -65, w: 65, h: 36 },
          boneAngles: {
            ...guardRest,
            torso:     -Math.PI / 2 - 0.25, // torso counterbalances kick
            thighR:    -0.08, shinR: 0.05, footR: 0.15, // horizontal high snap!
            upperArmR: Math.PI * 0.30, upperArmL: Math.PI * 0.75,
            thighL:    Math.PI / 2 + 0.22, shinL: -0.05
        }},
        // Hold (60ms) — HITBOX ACTIVE
        { duration: 60, hitboxActive: true, hitboxOffset: { offsetX: 58, offsetY: -65, w: 65, h: 36 },
          boneAngles: {
            ...guardRest,
            torso:     -Math.PI / 2 - 0.22,
            thighR:    -0.05, shinR: 0.08, footR: 0.15,
            upperArmR: Math.PI * 0.32, upperArmL: Math.PI * 0.72
        }},
        // Chamber return (70ms)
        { duration: 70, hitboxActive: false, boneAngles: {
            ...guardRest,
            torso:     -Math.PI / 2 - 0.10,
            thighR:    0.45, shinR: 1.10
        }},
        // Plant back down (120ms)
        { duration: 120, hitboxActive: false, boneAngles: { ...guardRest } }
    ]));

    // =====================================================================
    //  8. UPPERCUT — Dragon Rising Uppercut
    // =====================================================================
    clips.set('uppercut', new AnimationClip('uppercut', [
        // Dip (90ms)
        { duration: 90, boneAngles: {
            ...guardRest,
            torso:     -Math.PI / 2 + 0.22,
            upperArmR: Math.PI * 0.75, forearmR: 1.55,
            thighR:    Math.PI / 2 - 0.45, shinR: 0.65
        }},
        // Surge Upward (80ms) — HITBOX ACTIVE
        { duration: 80, hitboxActive: true, hitboxOffset: { offsetX: 35, offsetY: -125, w: 45, h: 65 },
          boneAngles: {
            ...guardRest,
            torso:     -Math.PI / 2 - 0.20,
            upperArmR: -0.85, forearmR: -0.65, handR: -0.15, // rocket upward!
            upperArmL: Math.PI * 0.65, forearmL: 1.25,
            thighR:    Math.PI / 2 - 0.05, shinR: 0.05
        }},
        // Apex (70ms) — HITBOX ACTIVE
        { duration: 70, hitboxActive: true, hitboxOffset: { offsetX: 35, offsetY: -125, w: 45, h: 65 },
          boneAngles: {
            ...guardRest,
            torso:     -Math.PI / 2 - 0.18,
            upperArmR: -0.90, forearmR: -0.70, handR: -0.15
        }},
        // Recovery (160ms)
        { duration: 160, hitboxActive: false, boneAngles: { ...guardRest } }
    ]));

    // =====================================================================
    //  9. ROUNDHOUSE — Spinning Whirlwind Kick
    // =====================================================================
    clips.set('roundhouse', new AnimationClip('roundhouse', [
        // Coil & pivot (90ms)
        { duration: 90, boneAngles: {
            ...guardRest,
            torso:     -Math.PI / 2 - 0.35,
            thighR:    0.85, shinR: 0.45,
            upperArmR: Math.PI * 0.65, upperArmL: Math.PI * 0.35
        }},
        // Arc Strike (90ms) — HITBOX ACTIVE
        { duration: 90, hitboxActive: true, hitboxOffset: { offsetX: 55, offsetY: -75, w: 75, h: 42 },
          boneAngles: {
            ...guardRest,
            torso:     -Math.PI / 2 + 0.15,
            thighR:    -0.15, shinR: -0.05, footR: 0.35, // sweeping high arc!
            upperArmR: Math.PI * 0.25, upperArmL: Math.PI * 0.85
        }},
        // Hold (70ms) — HITBOX ACTIVE
        { duration: 70, hitboxActive: true, hitboxOffset: { offsetX: 55, offsetY: -75, w: 75, h: 42 },
          boneAngles: {
            ...guardRest,
            torso:     -Math.PI / 2 + 0.12,
            thighR:    -0.10, shinR: 0.0, footR: 0.30
        }},
        // Follow-through & return (180ms)
        { duration: 180, hitboxActive: false, boneAngles: { ...guardRest } }
    ]));

    // =====================================================================
    //  10. SPECIAL — Shadow Energy Thrust
    // =====================================================================
    clips.set('special', new AnimationClip('special', [
        // Power charge (110ms)
        { duration: 110, boneAngles: {
            ...guardRest,
            torso:     -Math.PI / 2 - 0.25,
            upperArmR: Math.PI * 0.85, forearmR: 1.65,
            upperArmL: Math.PI * 0.75, forearmL: 1.55,
            thighR:    Math.PI / 2 - 0.55, shinR: 0.85
        }},
        // Flash Strike (90ms) — HITBOX ACTIVE
        { duration: 90, hitboxActive: true, hitboxOffset: { offsetX: 60, offsetY: -90, w: 85, h: 75 },
          boneAngles: {
            ...guardRest,
            torso:     -Math.PI / 2 + 0.35, // massive forward lunge!
            upperArmR: -0.15, forearmR: -0.05, handR: -0.1,
            upperArmL: Math.PI * 0.85, forearmL: 1.25,
            thighR:    Math.PI / 2 - 0.65, shinR: 0.85,
            thighL:    Math.PI / 2 + 0.55, shinL: -0.25
        }},
        // Impact hold (80ms) — HITBOX ACTIVE
        { duration: 80, hitboxActive: true, hitboxOffset: { offsetX: 60, offsetY: -90, w: 85, h: 75 },
          boneAngles: {
            ...guardRest,
            torso:     -Math.PI / 2 + 0.30,
            upperArmR: -0.10, forearmR: 0.0,
            upperArmL: Math.PI * 0.80
        }},
        // Recovery (200ms)
        { duration: 200, hitboxActive: false, boneAngles: { ...guardRest } }
    ]));

    // =====================================================================
    //  11. CROUCH PUNCH — Low Shin/Gut Strike
    // =====================================================================
    clips.set('crouch_punch', new AnimationClip('crouch_punch', [
        { duration: 60, boneAngles: {
            ...guardRest,
            torso:  -Math.PI / 2 + 0.35,
            thighR: Math.PI / 2 - 0.85, shinR: 1.35,
            upperArmR: Math.PI * 0.55, forearmR: 1.25
        }},
        { duration: 70, hitboxActive: true, hitboxOffset: { offsetX: 40, offsetY: -35, w: 50, h: 28 },
          boneAngles: {
            ...guardRest,
            torso:  -Math.PI / 2 + 0.40,
            thighR: Math.PI / 2 - 0.85, shinR: 1.35,
            upperArmR: 0.35, forearmR: 0.05, handR: 0.0
        }},
        { duration: 60, hitboxActive: true, hitboxOffset: { offsetX: 40, offsetY: -35, w: 50, h: 28 },
          boneAngles: {
            ...guardRest,
            torso:  -Math.PI / 2 + 0.38,
            thighR: Math.PI / 2 - 0.85, shinR: 1.35,
            upperArmR: 0.38, forearmR: 0.10
        }},
        { duration: 120, hitboxActive: false, boneAngles: {
            ...guardRest,
            torso:  -Math.PI / 2 + 0.35,
            thighR: Math.PI / 2 - 0.85, shinR: 1.35
        }}
    ]));

    // =====================================================================
    //  12. CROUCH KICK — Low Dragon Sweep
    // =====================================================================
    clips.set('crouch_kick', new AnimationClip('crouch_kick', [
        { duration: 70, boneAngles: {
            ...guardRest,
            torso:  -Math.PI / 2 + 0.45,
            thighR: 0.65, shinR: 0.95,
            thighL: Math.PI / 2 - 0.75, shinL: 1.25
        }},
        { duration: 80, hitboxActive: true, hitboxOffset: { offsetX: 55, offsetY: -18, w: 70, h: 24 },
          boneAngles: {
            ...guardRest,
            torso:  -Math.PI / 2 + 0.55,
            thighR: 0.15, shinR: 0.05, footR: 0.35,
            thighL: Math.PI / 2 - 0.85, shinL: 1.35,
            upperArmR: Math.PI * 0.65, upperArmL: Math.PI * 0.75
        }},
        { duration: 60, hitboxActive: true, hitboxOffset: { offsetX: 55, offsetY: -18, w: 70, h: 24 },
          boneAngles: {
            ...guardRest,
            torso:  -Math.PI / 2 + 0.50,
            thighR: 0.20, shinR: 0.10, footR: 0.30
        }},
        { duration: 150, hitboxActive: false, boneAngles: {
            ...guardRest,
            torso:  -Math.PI / 2 + 0.35,
            thighR: Math.PI / 2 - 0.85, shinR: 1.35
        }}
    ]));

    // =====================================================================
    //  13. BLOCK — Solid Crossed Guard Stance
    // =====================================================================
    clips.set('block', new AnimationClip('block', [
        { duration: 80, boneAngles: {
            ...guardRest,
            torso:     -Math.PI / 2 - 0.15,
            upperArmR: Math.PI * 0.30, forearmR: 1.55, handR: 0.0,
            upperArmL: Math.PI * 0.35, forearmL: 1.65, handL: 0.0,
            thighR:    Math.PI / 2 - 0.35, shinR: 0.45,
            thighL:    Math.PI / 2 + 0.25, shinL: -0.15
        }},
        { duration: 250, boneAngles: {
            ...guardRest,
            torso:     -Math.PI / 2 - 0.15,
            upperArmR: Math.PI * 0.30, forearmR: 1.55, handR: 0.0,
            upperArmL: Math.PI * 0.35, forearmL: 1.65, handL: 0.0,
            thighR:    Math.PI / 2 - 0.35, shinR: 0.45,
            thighL:    Math.PI / 2 + 0.25, shinL: -0.15
        }}
    ]));

    // =====================================================================
    //  14. HIT STUN — Impact Recoil
    // =====================================================================
    clips.set('hit_stun', new AnimationClip('hit_stun', [
        { duration: 60, boneAngles: {
            ...guardRest,
            torso:     -Math.PI / 2 - 0.35,
            neck:      0.25, head: 0.20,
            upperArmR: Math.PI * 0.65, forearmR: 0.65,
            upperArmL: Math.PI * 0.75, forearmL: 0.55
        }},
        { duration: 140, boneAngles: {
            ...guardRest,
            torso:     -Math.PI / 2 - 0.30,
            neck:      0.20, head: 0.15,
            upperArmR: Math.PI * 0.55, forearmR: 0.75
        }},
        { duration: 120, boneAngles: { ...guardRest } }
    ]));

    // =====================================================================
    //  15. KNOCKDOWN / DEFEATED — Dramatic Fall
    // =====================================================================
    clips.set('knockdown', new AnimationClip('knockdown', [
        { duration: 90, boneAngles: {
            ...guardRest,
            torso:  -Math.PI / 2 - 0.55,
            neck:   0.35, head: 0.30,
            upperArmR: Math.PI * 0.85, upperArmL: Math.PI * 0.95
        }},
        { duration: 150, boneAngles: {
            ...guardRest,
            torso:  -0.45, neck: 0.35, head: 0.25,
            thighR: 0.45, shinR: 0.65,
            thighL: 0.65, shinL: 0.45,
            upperArmR: Math.PI * 0.95, upperArmL: Math.PI * 1.05
        }},
        { duration: 240, boneAngles: {
            ...guardRest,
            torso:  -0.10, neck: 0.25, head: 0.15,
            thighR: 0.20, shinR: 0.35,
            thighL: 0.30, shinL: 0.25,
            upperArmR: Math.PI * 0.90, upperArmL: Math.PI * 0.95
        }},
        { duration: 500, boneAngles: {
            ...guardRest,
            torso:  0.0, neck: 0.20, head: 0.10,
            thighR: 0.10, shinR: 0.20,
            thighL: 0.15, shinL: 0.15,
            upperArmR: Math.PI * 0.85, upperArmL: Math.PI * 0.90
        }}
    ]));

    clips.set('defeated', clips.get('knockdown'));

    // =====================================================================
    //  16. VICTORY — Confident Martial Arts Salute
    // =====================================================================
    clips.set('victory', new AnimationClip('victory', [
        { duration: 250, boneAngles: {
            ...guardRest,
            torso:     -Math.PI / 2,
            upperArmR: Math.PI * 0.35, forearmR: 1.45, handR: 0.0,
            upperArmL: Math.PI * 0.45, forearmL: 1.45, handL: 0.0
        }},
        { duration: 600, boneAngles: {
            ...guardRest,
            torso:     -Math.PI / 2 - 0.05,
            upperArmR: Math.PI * 0.32, forearmR: 1.50, handR: 0.0,
            upperArmL: Math.PI * 0.42, forearmL: 1.50, handL: 0.0,
            head:      -0.08
        }}
    ]));

    return clips;
}
