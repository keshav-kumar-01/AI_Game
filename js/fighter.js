/**
 * fighter.js - Core Fighter Entity Class
 * 
 * The main gameplay entity representing both the player and AI fighter
 * in a Shadow Fight-style 2D fighting game. Implements a full state machine,
 * animation triggering, physics, and all combat mechanics.
 */

import { GROUND_Y, STAGE_LEFT, STAGE_RIGHT, clamp } from './utils.js';
import { Skeleton, AnimationPlayer, createAnimationClips } from './animation.js';

// ─── Fighter State Enum ─────────────────────────────────────────────────────
export const FighterState = {
    IDLE: 'idle',
    WALKING_FORWARD: 'walk_forward',
    WALKING_BACKWARD: 'walk_backward',
    JUMPING: 'jumping',
    CROUCHING: 'crouching',
    ATTACKING: 'attacking',
    BLOCKING: 'blocking',
    HIT_STUN: 'hit_stun',
    KNOCKED_DOWN: 'knocked_down',
    VICTORY: 'victory',
    DEFEATED: 'defeated'
};

// ─── Move Type Enum ─────────────────────────────────────────────────────────
export const MoveType = {
    PUNCH: 'punch',
    KICK: 'kick',
    UPPERCUT: 'uppercut',
    ROUNDHOUSE: 'roundhouse',
    SPECIAL: 'special',
    CROUCH_PUNCH: 'crouch_punch',
    CROUCH_KICK: 'crouch_kick'
};

// ─── Gravity constant (px/s²) ───────────────────────────────────────────────
const GRAVITY = 1800;

// ─── Combo window (ms) – if no follow-up hit lands within this time, combo resets
const COMBO_WINDOW_MS = 800;

// ─── Knockdown threshold – consecutive combo hits beyond this trigger knockdown
const KNOCKDOWN_COMBO_THRESHOLD = 5;

// ─── Knockdown recovery time (ms)
const KNOCKDOWN_DURATION_MS = 800;

// ─── Health-bar display lerp speed (units / second)
const HEALTH_LERP_SPEED = 60;

// ─── Block damage reduction factor (0-1, lower = less damage taken while blocking)
const BLOCK_DAMAGE_FACTOR = 0.2;

// ─── Block knockback reduction factor
const BLOCK_KNOCKBACK_FACTOR = 0.35;

// ─── Combo damage scaling – each successive hit scales damage by this factor
const COMBO_SCALING_FACTOR = 0.85;

// ─── Minimum combo damage scaling floor
const COMBO_SCALING_MIN = 0.4;


// ═══════════════════════════════════════════════════════════════════════════════
//  Fighter Class
// ═══════════════════════════════════════════════════════════════════════════════

export class Fighter {
    /**
     * @param {number} x          – initial x position (centre of character)
     * @param {number} y          – initial y position (feet on ground)
     * @param {number} facing     – 1 = facing right, -1 = facing left
     * @param {string} name       – display name
     */
    constructor(x, y, facing, name = 'Fighter') {
        // ── Position & Physics ────────────────────────────────────────────
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.facing = facing;          // 1 = right, -1 = left
        this.isGrounded = true;
        this.name = name;

        // ── Dimensions (standing hurtbox) ─────────────────────────────────
        this.width = 50;
        this.height = 150;

        // ── Stats ─────────────────────────────────────────────────────────
        this.health = 100;
        this.maxHealth = 100;
        this.displayHealth = 100;       // smoothly animated toward actual health
        this.specialMeter = 30;          // builds on hits/blocks; special requires 100
        this.maxSpecialMeter = 100;

        // ── State Machine ─────────────────────────────────────────────────
        this.state = FighterState.IDLE;
        this.previousState = FighterState.IDLE;

        // ── Combat ────────────────────────────────────────────────────────
        this.stunTimer = 0;             // remaining hit-stun time (ms)
        this.blockStunTimer = 0;        // remaining block-stun time (ms)
        this.knockdownTimer = 0;        // remaining knockdown time (ms)
        this.currentMove = null;        // current attack move data object
        this.attackTimer = 0;           // elapsed time in current attack (ms)
        this.hasHitThisAttack = false;  // prevents multi-hit on same swing
        this.comboCount = 0;
        this.comboTimer = 0;            // time since last hit in combo (ms)
        this.comboDamageScaling = 1.0;

        // ── Movement Speeds ───────────────────────────────────────────────
        this.walkSpeed = 280;           // px / s (fast & responsive)
        this.jumpForce = -680;          // initial vy on jump
        this.airMoveSpeed = 180;        // smooth horizontal control in air
        this.bufferedMove = null;       // input buffer for smooth combo chaining

        // ── Animation ─────────────────────────────────────────────────────
        this.skeleton = new Skeleton();
        this.animationPlayer = new AnimationPlayer(createAnimationClips());
        this.animationPlayer.play('idle', { loop: true });

        // ── Attack Data Definitions ───────────────────────────────────────
        this.moves = {
            [MoveType.PUNCH]: {
                animation: 'punch',
                damage: 10,
                knockbackX: 220,
                knockbackY: -40,
                hitstun: 320,
                blockstun: 160,
                startup: 60,
                active: 70,
                recovery: 140,
                meterGain: 8,
                hitbox: { offsetX: 48, offsetY: -82, w: 55, h: 32 }
            },
            [MoveType.KICK]: {
                animation: 'kick',
                damage: 14,
                knockbackX: 320,
                knockbackY: -70,
                hitstun: 420,
                blockstun: 210,
                startup: 80,
                active: 80,
                recovery: 180,
                meterGain: 10,
                hitbox: { offsetX: 58, offsetY: -65, w: 65, h: 36 }
            },
            [MoveType.UPPERCUT]: {
                animation: 'uppercut',
                damage: 18,
                knockbackX: 180,
                knockbackY: -420,
                hitstun: 520,
                blockstun: 260,
                startup: 90,
                active: 80,
                recovery: 200,
                meterGain: 14,
                hitbox: { offsetX: 35, offsetY: -125, w: 45, h: 65 }
            },
            [MoveType.ROUNDHOUSE]: {
                animation: 'roundhouse',
                damage: 20,
                knockbackX: 420,
                knockbackY: -110,
                hitstun: 520,
                blockstun: 300,
                startup: 100,
                active: 90,
                recovery: 220,
                meterGain: 16,
                hitbox: { offsetX: 55, offsetY: -75, w: 75, h: 42 }
            },
            [MoveType.SPECIAL]: {
                animation: 'special',
                damage: 32,
                knockbackX: 520,
                knockbackY: -180,
                hitstun: 680,
                blockstun: 380,
                startup: 120,
                active: 90,
                recovery: 240,
                meterGain: 0,
                meterCost: 50, // fast & accessible special moves
                hitbox: { offsetX: 60, offsetY: -90, w: 85, h: 75 }
            },
            [MoveType.CROUCH_PUNCH]: {
                animation: 'crouch_punch',
                damage: 8,
                knockbackX: 160,
                knockbackY: 0,
                hitstun: 260,
                blockstun: 110,
                startup: 60,
                active: 60,
                recovery: 120,
                meterGain: 6,
                hitbox: { offsetX: 40, offsetY: -35, w: 50, h: 28 }
            },
            [MoveType.CROUCH_KICK]: {
                animation: 'crouch_kick',
                damage: 12,
                knockbackX: 220,
                knockbackY: -25,
                hitstun: 360,
                blockstun: 180,
                startup: 80,
                active: 70,
                recovery: 160,
                meterGain: 8,
                hitbox: { offsetX: 55, offsetY: -18, w: 70, h: 24 }
            }
        };
    }

    get facingRight() {
        return this.facing === 1;
    }

    get grounded() {
        return this.isGrounded;
    }

    getCurrentMoveData() {
        return this.currentMove;
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  Main Update – called every frame
    //  @param {number} dt       – delta time in seconds
    //  @param {object} input    – held buttons { left, right, up, down, punch, kick, block, special }
    //  @param {object} actions  – just-pressed buttons (same shape, true only on frame pressed)
    //  @param {number} opponentX – opponent's x position (for auto-facing)
    // ═════════════════════════════════════════════════════════════════════════
    update(dt, input, actions, opponentX) {
        const dtMs = dt * 1000; // many timers are in milliseconds

        // ── 1. Update Timers ──────────────────────────────────────────────
        this._updateTimers(dtMs);

        // ── 2. Smooth display health toward actual health ─────────────────
        this._updateDisplayHealth(dt);

        // ── 3. Auto-face opponent (only when able to act & grounded) ──────
        if (this.canAct() && this.isGrounded && this.state !== FighterState.BLOCKING) {
            this._autoFaceOpponent(opponentX);
        }

        // ── 4. State Machine Logic ────────────────────────────────────────
        this._updateStateMachine(dt, dtMs, input, actions, opponentX);

        // ── 5. Apply physics (gravity, velocity, clamping) ────────────────
        this._updatePhysics(dt);

        // ── 6. Update animation ───────────────────────────────────────────
        this.animationPlayer.update(dt, this.skeleton);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Timer Updates
    // ─────────────────────────────────────────────────────────────────────────
    _updateTimers(dtMs) {
        // Hit stun
        if (this.stunTimer > 0) {
            this.stunTimer = Math.max(0, this.stunTimer - dtMs);
        }

        // Block stun
        if (this.blockStunTimer > 0) {
            this.blockStunTimer = Math.max(0, this.blockStunTimer - dtMs);
        }

        // Knockdown
        if (this.knockdownTimer > 0) {
            this.knockdownTimer = Math.max(0, this.knockdownTimer - dtMs);
        }

        // Attack timer
        if (this.state === FighterState.ATTACKING && this.currentMove) {
            this.attackTimer += dtMs;
        }

        // Combo timer – reset combo if window expires
        if (this.comboCount > 0) {
            this.comboTimer += dtMs;
            if (this.comboTimer > COMBO_WINDOW_MS) {
                this.comboCount = 0;
                this.comboTimer = 0;
                this.comboDamageScaling = 1.0;
            }
        }

        // Passive special meter generation (2.5 units/s)
        if (this.state !== FighterState.DEFEATED && this.state !== FighterState.VICTORY) {
            this.specialMeter = Math.min(this.maxSpecialMeter, this.specialMeter + 2.5 * (dtMs / 1000));
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Smooth health-bar display
    // ─────────────────────────────────────────────────────────────────────────
    _updateDisplayHealth(dt) {
        if (this.displayHealth !== this.health) {
            const diff = this.health - this.displayHealth;
            const step = HEALTH_LERP_SPEED * dt;
            if (Math.abs(diff) < step) {
                this.displayHealth = this.health;
            } else {
                this.displayHealth += Math.sign(diff) * step;
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Auto-face opponent
    // ─────────────────────────────────────────────────────────────────────────
    _autoFaceOpponent(opponentX) {
        if (opponentX > this.x) {
            this.facing = 1;
        } else if (opponentX < this.x) {
            this.facing = -1;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  State Machine
    // ─────────────────────────────────────────────────────────────────────────
    _updateStateMachine(dt, dtMs, input, actions, opponentX) {
        this.previousState = this.state;

        switch (this.state) {

            // ──── VICTORY / DEFEATED (absorbing states) ─────────────────
            case FighterState.VICTORY:
            case FighterState.DEFEATED:
                this.vx = 0;
                return;

            // ──── HIT STUN ──────────────────────────────────────────────
            case FighterState.HIT_STUN:
                if (this.stunTimer <= 0) {
                    this._transitionTo(FighterState.IDLE);
                }
                return;

            // ──── KNOCKED DOWN ──────────────────────────────────────────
            case FighterState.KNOCKED_DOWN:
                if (this.knockdownTimer <= 0 && this.isGrounded) {
                    this._transitionTo(FighterState.IDLE);
                }
                return;

            // ──── ATTACKING ─────────────────────────────────────────────
            case FighterState.ATTACKING:
                this._updateAttacking(dt, dtMs, input, actions);
                return;

            // ──── BLOCKING ──────────────────────────────────────────────
            case FighterState.BLOCKING:
                this._updateBlocking(dt, input, actions, opponentX);
                return;

            // ──── JUMPING ───────────────────────────────────────────────
            case FighterState.JUMPING:
                this._updateJumping(dt, input, actions);
                return;

            // ──── CROUCHING ─────────────────────────────────────────────
            case FighterState.CROUCHING:
                this._updateCrouching(dt, input, actions);
                return;

            // ──── IDLE / WALKING ────────────────────────────────────────
            case FighterState.IDLE:
            case FighterState.WALKING_FORWARD:
            case FighterState.WALKING_BACKWARD:
                this._updateGroundActions(dt, input, actions, opponentX);
                return;

            default:
                this._transitionTo(FighterState.IDLE);
                return;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Ground actions (idle / walking) – can attack, block, jump, crouch, move
    // ─────────────────────────────────────────────────────────────────────────
    _updateGroundActions(dt, input, actions, opponentX) {
        // ── Attacks (just-pressed takes priority) ─────────────────────────
        if (actions.special) {
            if (this.performMove(MoveType.SPECIAL)) return;
        }
        if (actions.punch) {
            if (this.performMove(MoveType.PUNCH)) return;
        }
        if (actions.kick) {
            if (this.performMove(MoveType.KICK)) return;
        }

        // ── Block ─────────────────────────────────────────────────────────
        if (input.block) {
            this._transitionTo(FighterState.BLOCKING);
            this.vx = 0;
            return;
        }

        // ── Jump ──────────────────────────────────────────────────────────
        if (actions.up || input.up) {
            this.vy = this.jumpForce;
            this.isGrounded = false;
            this._transitionTo(FighterState.JUMPING);
            // Carry forward a bit of horizontal momentum
            if (input.left) {
                this.vx = -this.walkSpeed;
            } else if (input.right) {
                this.vx = this.walkSpeed;
            }
            return;
        }

        // ── Crouch ────────────────────────────────────────────────────────
        if (input.down) {
            this.vx = 0;
            this._transitionTo(FighterState.CROUCHING);
            return;
        }

        // ── Horizontal movement ───────────────────────────────────────────
        let moveDir = 0;
        if (input.left) moveDir -= 1;
        if (input.right) moveDir += 1;

        if (moveDir !== 0) {
            this.vx = moveDir * this.walkSpeed;
            // Determine if walking forward or backward relative to facing
            const isForward = (moveDir === this.facing);
            this._transitionTo(isForward ? FighterState.WALKING_FORWARD : FighterState.WALKING_BACKWARD);
        } else {
            this.vx = 0;
            this._transitionTo(FighterState.IDLE);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Jumping state – limited air control, air attacks
    // ─────────────────────────────────────────────────────────────────────────
    _updateJumping(dt, input, actions) {
        // Air attacks
        if (actions.punch) {
            this.performMove(MoveType.PUNCH);
            return;
        }
        if (actions.kick) {
            this.performMove(MoveType.KICK);
            return;
        }

        // Air movement (reduced)
        let moveDir = 0;
        if (input.left) moveDir -= 1;
        if (input.right) moveDir += 1;
        this.vx = moveDir * this.airMoveSpeed;

        // Landing is handled in _updatePhysics
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Crouching state – can do crouch attacks, or stand up
    // ─────────────────────────────────────────────────────────────────────────
    _updateCrouching(dt, input, actions) {
        this.vx = 0;

        // Crouch attacks
        if (actions.punch) {
            if (this.performMove(MoveType.CROUCH_PUNCH)) return;
        }
        if (actions.kick) {
            if (this.performMove(MoveType.CROUCH_KICK)) return;
        }

        // Block while crouching
        if (input.block) {
            this._transitionTo(FighterState.BLOCKING);
            return;
        }

        // Release down to stand
        if (!input.down) {
            this._transitionTo(FighterState.IDLE);
            return;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Blocking state – hold to stay, release to return to idle
    // ─────────────────────────────────────────────────────────────────────────
    _updateBlocking(dt, input, actions, opponentX) {
        this.vx = 0;

        // Block-stun keeps us locked in the block pose
        if (this.blockStunTimer > 0) {
            return;
        }

        // Release block
        if (!input.block) {
            if (input.down) {
                this._transitionTo(FighterState.CROUCHING);
            } else {
                this._transitionTo(FighterState.IDLE);
            }
            return;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Attacking state – advance through startup → active → recovery
    // ─────────────────────────────────────────────────────────────────────────
    _updateAttacking(dt, dtMs, input, actions) {
        if (!this.currentMove) {
            this._transitionTo(FighterState.IDLE);
            return;
        }

        const move = this.currentMove;
        const totalDuration = move.startup + (move.active || 80) + move.recovery;

        // Buffer follow-up attacks during active & recovery frames for buttery-smooth combos
        if (actions && this.attackTimer > move.startup * 0.5) {
            if (actions.special) {
                this.bufferedMove = MoveType.SPECIAL;
            } else if (actions.kick) {
                this.bufferedMove = input.up ? MoveType.ROUNDHOUSE : (input.down ? MoveType.CROUCH_KICK : MoveType.KICK);
            } else if (actions.punch) {
                this.bufferedMove = input.up ? MoveType.UPPERCUT : (input.down ? MoveType.CROUCH_PUNCH : MoveType.PUNCH);
            }
        }

        // Reduce horizontal velocity during attacks (slight slide)
        this.vx *= 0.88;

        // Attack finished
        if (this.attackTimer >= totalDuration) {
            this.currentMove = null;
            this.attackTimer = 0;

            // Execute buffered combo move immediately
            if (this.bufferedMove) {
                const nextMove = this.bufferedMove;
                this.bufferedMove = null;
                if (this.performMove(nextMove)) {
                    return;
                }
            }

            // Return to appropriate state
            if (!this.isGrounded) {
                this._transitionTo(FighterState.JUMPING);
            } else {
                this._transitionTo(FighterState.IDLE);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  State Transition Helper
    // ─────────────────────────────────────────────────────────────────────────
    _transitionTo(newState) {
        if (this.state === newState) return;

        this.previousState = this.state;
        this.state = newState;

        // Play appropriate animation
        switch (newState) {
            case FighterState.IDLE:
                this.animationPlayer.play('idle', { loop: true });
                break;
            case FighterState.WALKING_FORWARD:
                this.animationPlayer.play('walk_forward', { loop: true });
                break;
            case FighterState.WALKING_BACKWARD:
                this.animationPlayer.play('walk_backward', { loop: true });
                break;
            case FighterState.JUMPING:
                this.animationPlayer.play('jump', { loop: false });
                break;
            case FighterState.CROUCHING:
                this.animationPlayer.play('crouch', { loop: true });
                break;
            case FighterState.BLOCKING:
                this.animationPlayer.play('block', { loop: true });
                break;
            case FighterState.HIT_STUN:
                this.animationPlayer.play('hit_stun', { loop: false });
                break;
            case FighterState.KNOCKED_DOWN:
                this.animationPlayer.play('knockdown', { loop: false });
                break;
            case FighterState.VICTORY:
                this.animationPlayer.play('victory', { loop: false });
                break;
            case FighterState.DEFEATED:
                this.animationPlayer.play('defeated', { loop: false });
                break;
            // ATTACKING animation is triggered in performMove
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Physics Update
    // ─────────────────────────────────────────────────────────────────────────
    _updatePhysics(dt) {
        // Apply gravity when airborne
        if (!this.isGrounded) {
            this.vy += GRAVITY * dt;
        }

        // Integrate velocity
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Floor collision
        if (this.y >= GROUND_Y) {
            this.y = GROUND_Y;
            this.vy = 0;

            if (!this.isGrounded) {
                this.isGrounded = true;
                // Land from jump → return to idle (unless attacking or stunned)
                if (this.state === FighterState.JUMPING) {
                    this._transitionTo(FighterState.IDLE);
                }
            }
        } else {
            this.isGrounded = false;
        }

        // Stage boundary clamping (keep fighter within arena)
        const halfWidth = this.width / 2;
        this.x = clamp(this.x, STAGE_LEFT + halfWidth, STAGE_RIGHT - halfWidth);
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  performMove – Attempt to execute an attack
    //  @param {string} moveType – one of MoveType values
    //  @returns {boolean} true if the move was initiated
    // ═════════════════════════════════════════════════════════════════════════
    performMove(moveType) {
        // Must be able to act
        if (!this.canAct() && this.state !== FighterState.JUMPING) {
            return false;
        }

        // Already attacking
        if (this.state === FighterState.ATTACKING) {
            return false;
        }

        const move = this.moves[moveType];
        if (!move) return false;

        // Special meter cost check
        if (move.meterCost && this.specialMeter < move.meterCost) {
            return false;
        }

        // Consume meter for special
        if (move.meterCost) {
            this.specialMeter = Math.max(0, this.specialMeter - move.meterCost);
        }

        // Set up attack state
        this.state = FighterState.ATTACKING;
        this.currentMove = move;
        this.attackTimer = 0;
        this.hasHitThisAttack = false;

        // Small forward lunge on attack
        this.vx = this.facing * 80;

        // Play the attack animation
        this.animationPlayer.play(move.animation, { loop: false });

        return true;
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  getHurtbox – World-space axis-aligned bounding box for taking hits
    //  @returns {{ x: number, y: number, w: number, h: number }}
    // ═════════════════════════════════════════════════════════════════════════
    getHurtbox() {
        let w = this.width;
        let h = this.height;

        // Crouching makes the hurtbox shorter and slightly wider
        const isCrouching = (this.state === FighterState.CROUCHING) ||
            (this.state === FighterState.ATTACKING && this.currentMove &&
                (this.currentMove.animation === 'crouch_punch' || this.currentMove.animation === 'crouch_kick'));

        if (isCrouching) {
            h = this.height * 0.55;
            w = this.width * 1.2;
        }

        return {
            x: this.x - w / 2,
            y: this.y - h,
            w: w,
            h: h
        };
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  getActiveHitbox – Returns the hitbox in world coords if the current
    //  attack is in its active frames, otherwise null.
    //  @returns {{ x: number, y: number, w: number, h: number } | null}
    // ═════════════════════════════════════════════════════════════════════════
    getActiveHitbox() {
        if (this.state !== FighterState.ATTACKING || !this.currentMove) {
            return null;
        }

        const move = this.currentMove;
        const activeDuration = move.active || 80;
        const activeStart = move.startup;
        const activeEnd = move.startup + activeDuration;

        // Only return hitbox during active frames
        if (this.attackTimer < activeStart || this.attackTimer > activeEnd) {
            return null;
        }

        // Already registered a hit for this swing
        if (this.hasHitThisAttack) {
            return null;
        }

        const hb = move.hitbox;
        return {
            x: this.x + hb.offsetX * this.facing - (this.facing === -1 ? hb.w : 0),
            y: this.y + hb.offsetY,
            w: hb.w,
            h: hb.h
        };
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  takeDamage – Apply damage, knockback, and stun
    //  @param {number} damage      – raw damage amount
    //  @param {number} knockbackX  – horizontal knockback (always pushed away)
    //  @param {number} knockbackY  – vertical knockback (negative = up)
    //  @param {number} hitstun     – stun duration in ms
    // ═════════════════════════════════════════════════════════════════════════
    takeDamage(damage, knockbackX, knockbackY, hitstun) {
        if (this.state === FighterState.DEFEATED) return;

        // Apply combo damage scaling
        const scaledDamage = Math.max(1, Math.round(damage * this.comboDamageScaling));

        // Reduce health
        this.health = Math.max(0, this.health - scaledDamage);

        // Apply knockback – always pushed AWAY from the source
        // The caller should ensure knockbackX sign is correct, but we'll
        // use facing to push the victim backward
        this.vx = -this.facing * knockbackX;
        this.vy = knockbackY;
        if (knockbackY < 0) {
            this.isGrounded = false;
        }

        // Update combo tracking
        this.comboCount++;
        this.comboTimer = 0;
        this.comboDamageScaling = Math.max(
            COMBO_SCALING_MIN,
            this.comboDamageScaling * COMBO_SCALING_FACTOR
        );

        // Cancel any current attack
        this.currentMove = null;
        this.attackTimer = 0;

        // Determine if knockdown or regular stun
        if (this.comboCount >= KNOCKDOWN_COMBO_THRESHOLD || this.health <= 0) {
            this.stunTimer = 0;
            this.knockdownTimer = KNOCKDOWN_DURATION_MS;
            this._transitionTo(FighterState.KNOCKED_DOWN);
            // Reset combo after knockdown
            this.comboCount = 0;
            this.comboTimer = 0;
            this.comboDamageScaling = 1.0;
        } else {
            this.stunTimer = hitstun;
            this._transitionTo(FighterState.HIT_STUN);
        }

        // Defeat check
        if (this.health <= 0) {
            this.health = 0;
            this._transitionTo(FighterState.DEFEATED);
            this.vx = -this.facing * knockbackX * 0.5;
            this.vy = Math.min(knockbackY, -200);
            this.isGrounded = false;
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  blockHit – Handle a blocked attack (reduced damage and knockback)
    //  @param {number} damage      – raw damage
    //  @param {number} knockbackX  – raw horizontal knockback
    //  @param {number} blockstun   – block stun duration (ms)
    // ═════════════════════════════════════════════════════════════════════════
    blockHit(damage, knockbackX, blockstun) {
        if (this.state === FighterState.DEFEATED) return;

        // Chip damage (reduced)
        const chipDamage = Math.max(1, Math.round(damage * BLOCK_DAMAGE_FACTOR));
        this.health = Math.max(0, this.health - chipDamage);

        // Reduced knockback
        this.vx = -this.facing * knockbackX * BLOCK_KNOCKBACK_FACTOR;

        // Block stun
        this.blockStunTimer = blockstun;

        // Gain a small amount of meter from blocking
        this.specialMeter = Math.min(this.maxSpecialMeter, this.specialMeter + 2);

        // Stay in blocking state
        if (this.state !== FighterState.BLOCKING) {
            this._transitionTo(FighterState.BLOCKING);
        }

        // Defeat from chip damage
        if (this.health <= 0) {
            this.health = 0;
            this._transitionTo(FighterState.DEFEATED);
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  isBlocking – Check if fighter is actively blocking toward the opponent
    //  @param {number} opponentX – opponent's x position
    //  @returns {boolean}
    // ═════════════════════════════════════════════════════════════════════════
    isBlocking(opponentX) {
        // Must be in the BLOCKING state
        if (this.state !== FighterState.BLOCKING) {
            return false;
        }

        // Can't block when airborne
        if (!this.isGrounded) {
            return false;
        }

        // Facing must be toward the opponent to count as a valid block
        const facingOpponent = (opponentX > this.x && this.facing === 1) ||
            (opponentX < this.x && this.facing === -1);
        return facingOpponent;
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  canAct – Whether the fighter can initiate new actions
    //  @returns {boolean}
    // ═════════════════════════════════════════════════════════════════════════
    canAct() {
        return (
            this.state !== FighterState.HIT_STUN &&
            this.state !== FighterState.KNOCKED_DOWN &&
            this.state !== FighterState.ATTACKING &&
            this.state !== FighterState.DEFEATED &&
            this.state !== FighterState.VICTORY
        );
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  reset – Re-initialise for a new round
    //  @param {number} x       – spawn x
    //  @param {number} y       – spawn y
    //  @param {number} facing  – initial facing (1 or -1)
    // ═════════════════════════════════════════════════════════════════════════
    reset(x, y, facing) {
        // Position & physics
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.facing = facing;
        this.isGrounded = true;

        // Stats
        this.health = this.maxHealth;
        this.displayHealth = this.maxHealth;
        this.specialMeter = 30;

        // State
        this.state = FighterState.IDLE;
        this.previousState = FighterState.IDLE;

        // Combat
        this.stunTimer = 0;
        this.blockStunTimer = 0;
        this.knockdownTimer = 0;
        this.currentMove = null;
        this.attackTimer = 0;
        this.hasHitThisAttack = false;
        this.comboCount = 0;
        this.comboTimer = 0;
        this.comboDamageScaling = 1.0;

        // Animation
        this.skeleton = new Skeleton();
        this.animationPlayer.play('idle', { loop: true });
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  getStateInfo – Returns a normalized observation vector for the RL agent
    //  All values are in [0, 1] or [-1, 1] range.
    //  @returns {object}
    // ═════════════════════════════════════════════════════════════════════════
    getStateInfo() {
        // Normalise position to stage bounds
        const stageWidth = STAGE_RIGHT - STAGE_LEFT;
        const normX = (this.x - STAGE_LEFT) / stageWidth;                // [0, 1]
        const normY = (GROUND_Y - this.y) / GROUND_Y;                    // 0 = ground, ~1 = top

        // Normalise velocities (assume max ~800 px/s)
        const maxVel = 800;
        const normVx = clamp(this.vx / maxVel, -1, 1);
        const normVy = clamp(this.vy / maxVel, -1, 1);

        // Normalise health & meter
        const normHealth = this.health / this.maxHealth;
        const normMeter = this.specialMeter / this.maxSpecialMeter;

        // State one-hot style via index
        const stateValues = Object.values(FighterState);
        const stateIndex = stateValues.indexOf(this.state);

        // Boolean flags
        const isAirborne = this.isGrounded ? 0 : 1;
        const isAttacking = this.state === FighterState.ATTACKING ? 1 : 0;
        const isStunned = (this.state === FighterState.HIT_STUN || this.state === FighterState.KNOCKED_DOWN) ? 1 : 0;
        const isBlockingFlag = this.state === FighterState.BLOCKING ? 1 : 0;

        // Timing info
        const normStunTimer = this.stunTimer / 1000;  // rough normalisation
        const normAttackTimer = this.currentMove
            ? this.attackTimer / (this.currentMove.startup + (this.currentMove.active || 80) + this.currentMove.recovery)
            : 0;

        return {
            x: normX,
            y: normY,
            vx: normVx,
            vy: normVy,
            health: normHealth,
            meter: normMeter,
            facing: this.facing,           // -1 or 1
            stateIndex: stateIndex,
            isAirborne: isAirborne,
            isAttacking: isAttacking,
            isStunned: isStunned,
            isBlocking: isBlockingFlag,
            stunTimer: normStunTimer,
            attackProgress: normAttackTimer,
            comboCount: this.comboCount,
            comboDamageScaling: this.comboDamageScaling
        };
    }
}
