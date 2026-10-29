/**
 * @module physics
 * @description Physics engine and collision detection for a Shadow Fight-style
 * 2D fighting game. Handles gravity, velocity integration, ground/stage-bound
 * clamping, push-apart resolution, hitbox-vs-hurtbox detection, blocking, and
 * knockback application.
 *
 * All spatial units are in pixels; time units are in seconds (dt).
 */

import {
    GRAVITY,
    GROUND_Y,
    STAGE_LEFT,
    STAGE_RIGHT,
    aabbIntersect,
    aabbOverlap
} from './utils.js';

/**
 * @typedef {Object} Rect
 * @property {number} x - Left edge
 * @property {number} y - Top edge
 * @property {number} w - Width
 * @property {number} h - Height
 */

/**
 * @typedef {Object} MoveData
 * @property {number}  damage     - Base damage of the move
 * @property {number}  knockbackX - Horizontal knockback magnitude (px/s)
 * @property {number}  knockbackY - Vertical knockback magnitude (px/s, negative = upward)
 * @property {number}  hitstun    - Duration the defender is stunned (seconds)
 * @property {number}  [blockstun] - Duration of block-stun override (seconds, defaults to hitstun * 0.6)
 */

/**
 * @typedef {Object} HitResult
 * @property {boolean} blocked   - Whether the defender successfully blocked
 * @property {number}  damage    - Final damage dealt after modifiers
 * @property {{x: number, y: number}} knockback - Final knockback applied
 */

/**
 * @typedef {Object} PhysicsEvent
 * @property {string} type       - Event type: 'hit', 'land', 'blocked'
 * @property {*}      [attacker] - Reference to the attacking fighter (hit/blocked)
 * @property {*}      [defender] - Reference to the defending fighter (hit/blocked)
 * @property {*}      [fighter]  - Reference to the fighter involved (land)
 * @property {*}      [data]     - Extra payload (HitResult, etc.)
 */

export class PhysicsEngine {
    /**
     * Create a new PhysicsEngine with tuneable constants.
     */
    constructor() {
        /** @type {number} Gravitational acceleration (px/s²) */
        this.gravity = GRAVITY;

        /** @type {number} Y-coordinate of the ground plane */
        this.groundY = GROUND_Y;

        /** @type {number} Left stage boundary (pixels) */
        this.stageLeft = STAGE_LEFT;

        /** @type {number} Right stage boundary (pixels) */
        this.stageRight = STAGE_RIGHT;

        /**
         * Multiplicative drag applied to horizontal velocity each frame while
         * the fighter is airborne. Keeps aerial movement snappy but prevents
         * infinite drift.
         * @type {number}
         */
        this.airResistance = 0.98;

        /**
         * Multiplicative friction applied to horizontal velocity each frame
         * while the fighter is grounded. Gives a weighty stop-and-start feel.
         * @type {number}
         */
        this.groundFriction = 0.85;

        /**
         * Minimum horizontal speed below which velocity is zeroed-out to
         * prevent micro-sliding.
         * @type {number}
         */
        this.velocityDeadzone = 5;

        /**
         * Minimum overlap (px) required along X to trigger push-apart.
         * Prevents jitter from sub-pixel overlaps.
         * @type {number}
         */
        this.pushBuffer = 2;
    }

    // ------------------------------------------------------------------ //
    //  Core physics steps
    // ------------------------------------------------------------------ //

    /**
     * Apply gravitational acceleration to a fighter's vertical velocity.
     * Only affects airborne fighters.
     *
     * @param {Object} fighter - Fighter instance (needs vy, isGrounded)
     * @param {number} dt      - Delta time in seconds
     */
    applyGravity(fighter, dt) {
        if (!fighter.isGrounded) {
            fighter.vy += this.gravity * dt;
        }
    }

    /**
     * Integrate velocity into position and apply drag / friction.
     *
     * @param {Object} fighter - Fighter instance (needs x, y, vx, vy, isGrounded)
     * @param {number} dt      - Delta time in seconds
     */
    applyVelocity(fighter, dt) {
        // Integrate position
        fighter.x += fighter.vx * dt;
        fighter.y += fighter.vy * dt;

        // Apply drag / friction to horizontal velocity
        if (fighter.isGrounded) {
            fighter.vx *= this.groundFriction;
        } else {
            fighter.vx *= this.airResistance;
        }

        // Zero-out micro velocities to prevent sliding
        if (Math.abs(fighter.vx) < this.velocityDeadzone) {
            fighter.vx = 0;
        }
    }

    /**
     * Detect and resolve collision with the ground plane.
     * Returns a 'land' event if the fighter just touched down.
     *
     * @param {Object} fighter - Fighter instance
     * @returns {PhysicsEvent|null} A landing event, or null
     */
    checkGroundCollision(fighter) {
        if (fighter.y >= this.groundY) {
            const wasAirborne = !fighter.isGrounded;

            fighter.y = this.groundY;
            fighter.vy = 0;
            fighter.isGrounded = true;

            if (wasAirborne) {
                return {
                    type: 'land',
                    fighter,
                    data: { dustX: fighter.x, dustY: this.groundY }
                };
            }
        }
        return null;
    }

    /**
     * Clamp a fighter's horizontal position to the stage boundaries,
     * accounting for the fighter's width so they can't poke off-screen.
     *
     * @param {Object} fighter - Fighter instance (needs x, width)
     */
    checkBounds(fighter) {
        const halfW = (fighter.width || 50) / 2;

        if (fighter.x - halfW < this.stageLeft) {
            fighter.x = this.stageLeft + halfW;
            fighter.vx = 0;
        } else if (fighter.x + halfW > this.stageRight) {
            fighter.x = this.stageRight - halfW;
            fighter.vx = 0;
        }
    }

    // ------------------------------------------------------------------ //
    //  Fighter-vs-fighter body collision (push apart)
    // ------------------------------------------------------------------ //

    /**
     * Build a simple axis-aligned body rectangle for a fighter, centred on
     * their x position and extending upward from their y (feet) position.
     *
     * @param {Object} fighter
     * @returns {Rect}
     */
    _bodyRect(fighter) {
        const w = fighter.width || 50;
        const h = fighter.height || 150;
        return {
            x: fighter.x - w / 2,
            y: fighter.y - h,
            w,
            h
        };
    }

    /**
     * If two fighters' body rectangles overlap, push them apart equally
     * along the X axis so they cannot walk through each other.
     *
     * @param {Object} fighterA
     * @param {Object} fighterB
     */
    checkPushCollision(fighterA, fighterB) {
        const a = this._bodyRect(fighterA);
        const b = this._bodyRect(fighterB);

        if (!aabbIntersect(a, b)) {
            return;
        }

        // Compute horizontal overlap
        const overlapLeft  = (a.x + a.w) - b.x;   // A's right vs B's left
        const overlapRight = (b.x + b.w) - a.x;    // B's right vs A's left
        const overlap = Math.min(overlapLeft, overlapRight);

        if (overlap <= this.pushBuffer) {
            return;
        }

        // Determine push direction: each fighter moves half the overlap away
        const pushDist = overlap / 2 + 1; // +1 px to break contact

        if (fighterA.x < fighterB.x) {
            fighterA.x -= pushDist;
            fighterB.x += pushDist;
        } else {
            fighterA.x += pushDist;
            fighterB.x -= pushDist;
        }

        // Re-clamp to stage bounds after push
        this.checkBounds(fighterA);
        this.checkBounds(fighterB);
    }

    // ------------------------------------------------------------------ //
    //  Hit detection
    // ------------------------------------------------------------------ //

    /**
     * Check whether an attacker's active hitbox overlaps the defender's
     * hurtbox. Uses the fighter API methods `getActiveHitbox()` and
     * `getHurtbox()`, both of which return a {@link Rect} in world
     * coordinates (or null when no hitbox is active).
     *
     * A hit only registers once per attack: the attacker tracks a set of
     * already-hit targets via `hitTargets` (a Set). When a new attack
     * begins, the fighter clears that set.
     *
     * @param {Object} attacker
     * @param {Object} defender
     * @returns {{ hit: boolean, hitbox: Rect|null, hurtbox: Rect|null }}
     */
    checkHit(attacker, defender) {
        const result = { hit: false, hitbox: null, hurtbox: null };

        // Attacker must expose an active hitbox
        if (typeof attacker.getActiveHitbox !== 'function') return result;
        const hitbox = attacker.getActiveHitbox();
        if (!hitbox) return result;

        // Defender must expose a hurtbox
        if (typeof defender.getHurtbox !== 'function') return result;
        const hurtbox = defender.getHurtbox();
        if (!hurtbox) return result;

        result.hitbox  = hitbox;
        result.hurtbox = hurtbox;

        // Check if attacker has already registered a hit for this swing
        if (attacker.hasHitThisAttack) {
            return result;
        }

        // AABB overlap test
        if (aabbIntersect(hitbox, hurtbox)) {
            result.hit = true;
            attacker.hasHitThisAttack = true;
        }

        return result;
    }

    // ------------------------------------------------------------------ //
    //  Hit resolution (damage, blocking, knockback, stun)
    // ------------------------------------------------------------------ //

    /**
     * Determine whether the defender is currently blocking in a direction
     * that faces the attacker.
     *
     * @param {Object} attacker
     * @param {Object} defender
     * @returns {boolean}
     */
    _isBlocking(attacker, defender) {
        if (!defender.state || defender.state !== 'blocking') {
            return false;
        }

        // Defender must be facing the attacker to block
        const facingAttacker =
            (defender.facing === 1 && attacker.x > defender.x) ||
            (defender.facing === -1 && attacker.x < defender.x);

        return facingAttacker;
    }

    /**
     * Resolve a confirmed hit: apply damage, knockback, and stun while
     * respecting blocking.
     *
     * @param {Object}   attacker
     * @param {Object}   defender
     * @param {MoveData} moveData
     * @returns {HitResult}
     */
    resolveHit(attacker, defender, moveData) {
        const damage     = moveData.damage     || 10;
        const knockbackX = moveData.knockbackX || 300;
        const knockbackY = moveData.knockbackY || -150;
        const hitstun    = moveData.hitstun    || 0.3;

        const blocked = this._isBlocking(attacker, defender);

        /** @type {HitResult} */
        const result = {
            blocked,
            damage: 0,
            knockback: { x: 0, y: 0 }
        };

        // Direction from attacker toward defender
        const dir = (defender.x >= attacker.x) ? 1 : -1;

        if (blocked) {
            // ----- Blocked hit ----- //
            result.damage      = Math.round(damage * 0.2);   // 80 % reduction
            result.knockback.x = knockbackX * 0.4 * dir;     // reduced pushback
            result.knockback.y = 0;                            // no vertical pop on block

            // Apply chip damage
            if (typeof defender.takeDamage === 'function') {
                defender.takeDamage(result.damage);
            }

            // Block-stun: shorter than hitstun
            const blockstun = moveData.blockstun != null
                ? moveData.blockstun
                : hitstun * 0.6;
            if (typeof defender.applyStun === 'function') {
                defender.applyStun(blockstun, 'blockstun');
            }

            // Slight pushback on block
            this.applyKnockback(defender, result.knockback.x, result.knockback.y);

            // Attacker also gets a tiny recoil on block
            this.applyKnockback(attacker, -result.knockback.x * 0.25, 0);
        } else {
            // ----- Clean hit ----- //
            result.damage      = damage;
            result.knockback.x = knockbackX * dir;
            result.knockback.y = knockbackY;

            // Apply damage
            if (typeof defender.takeDamage === 'function') {
                defender.takeDamage(result.damage);
            }

            // Apply hitstun
            if (typeof defender.applyStun === 'function') {
                defender.applyStun(hitstun, 'hitstun');
            }

            // Knockback
            this.applyKnockback(defender, result.knockback.x, result.knockback.y);
        }

        return result;
    }

    /**
     * Apply an impulse (knockback) to a fighter's velocity.
     *
     * @param {Object} fighter
     * @param {number} knockbackX - Signed horizontal velocity to add (px/s)
     * @param {number} knockbackY - Signed vertical velocity to add (px/s, negative = up)
     */
    applyKnockback(fighter, knockbackX, knockbackY) {
        fighter.vx += knockbackX;
        fighter.vy += knockbackY;

        // If knocked into the air, flag as airborne
        if (knockbackY < 0) {
            fighter.isGrounded = false;
        }
    }

    // ------------------------------------------------------------------ //
    //  Per-frame update (orchestrates everything)
    // ------------------------------------------------------------------ //

    /**
     * Run a full physics tick for both fighters.
     *
     * Steps:
     *  1. Gravity
     *  2. Velocity integration + drag/friction
     *  3. Ground collision
     *  4. Stage-bound clamping
     *  5. Push-apart collision between fighters
     *  6. Hit detection & resolution (both directions)
     *
     * @param {Object} playerFighter
     * @param {Object} aiFighter
     * @param {number} dt - Delta time in seconds
     * @returns {PhysicsEvent[]} Array of events generated this tick
     */
    update(playerFighter, aiFighter, dt) {
        /** @type {PhysicsEvent[]} */
        const events = [];

        // Ground collisions & landing dust events
        const playerLand = this.checkGroundCollision(playerFighter);
        const aiLand     = this.checkGroundCollision(aiFighter);
        if (playerLand) events.push(playerLand);
        if (aiLand)     events.push(aiLand);

        // Stage bounds
        this.checkBounds(playerFighter);
        this.checkBounds(aiFighter);

        // Push-apart
        this.checkPushCollision(playerFighter, aiFighter);

        // Hit detection (both directions)
        this._processHit(playerFighter, aiFighter, events);
        this._processHit(aiFighter, playerFighter, events);

        return events;
    }

    /**
     * Internal helper: test for a hit from `attacker` to `defender` and, if
     * confirmed, emit the appropriate event.
     *
     * @param {Object}         attacker
     * @param {Object}         defender
     * @param {PhysicsEvent[]} events   - Array to push events into
     * @private
     */
    _processHit(attacker, defender, events) {
        const hitTest = this.checkHit(attacker, defender);

        if (!hitTest.hit) return;

        // Retrieve move data from the attacker
        const moveData = attacker.currentMove ||
            ((typeof attacker.getCurrentMoveData === 'function') ? attacker.getCurrentMoveData() : null) ||
            { damage: 10, knockbackX: 300, knockbackY: -100, hitstun: 300, blockstun: 150 };

        events.push({
            type: 'hit',
            attacker,
            defender,
            moveData,
            data: {
                hitbox:  hitTest.hitbox,
                hurtbox: hitTest.hurtbox
            }
        });
    }
}
