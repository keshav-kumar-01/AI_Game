/**
 * engine.js — Core Game Engine
 *
 * Manages the game loop, game state, round logic, and orchestrates
 * all subsystems (physics, fighters, AI, rendering, UI).
 */

import { CANVAS_WIDTH, CANVAS_HEIGHT, GROUND_Y, STAGE_LEFT, STAGE_RIGHT } from './utils.js';
import { Fighter, FighterState, MoveType } from './fighter.js';
import { PhysicsEngine } from './physics.js';
import { Renderer, ParticleSystem } from './renderer.js';
import { UI } from './ui.js';
import { InputManager } from './input.js';
import { RLAgent, AIAction } from './ai.js';

// ─── Game States ────────────────────────────────────────────────────────────
export const GameState = {
    MENU: 'menu',
    ROUND_INTRO: 'round_intro',
    FIGHTING: 'fighting',
    ROUND_END: 'round_end',
    GAME_OVER: 'game_over',
    PAUSED: 'paused',
    TRAINING: 'training'
};

// ─── Constants ──────────────────────────────────────────────────────────────
const MAX_ROUNDS = 3;
const ROUND_TIME = 60;             // seconds per round
const ROUND_INTRO_DURATION = 3.0;  // seconds for "ROUND X ... FIGHT!"
const ROUND_END_DURATION = 2.5;    // seconds for KO / time-up display
const PLAYER_SPAWN_X = 300;
const AI_SPAWN_X = 900;

// ═══════════════════════════════════════════════════════════════════════════
export class GameEngine {
    /**
     * @param {HTMLCanvasElement} canvas
     */
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // ── Subsystems ────────────────────────────────────────────────
        this.input = new InputManager();
        this.physics = new PhysicsEngine();
        this.renderer = new Renderer(canvas);
        this.ui = new UI(canvas);
        this.rlAgent = new RLAgent({ difficulty: 'medium' });

        // ── Menu state ────────────────────────────────────────────────
        this.menuSelection = 0;
        this.menuItems = ['FIGHT', 'DIFFICULTY', 'RESET AI'];
        this.ui.menuItems = this.menuItems;
        this.difficultyMenuOpen = false;
        this.difficultySelection = 1;  // 0=easy 1=medium 2=hard
        this.gameOverSelection = 0;

        // ── Fighters ──────────────────────────────────────────────────
        this.player = new Fighter(PLAYER_SPAWN_X, GROUND_Y, 1, 'PLAYER');
        this.ai = new Fighter(AI_SPAWN_X, GROUND_Y, -1, 'AI SHADOW');

        // ── Game state ────────────────────────────────────────────────
        this.state = GameState.MENU;
        this.previousState = GameState.MENU;   // for pause/unpause

        // ── Round tracking ────────────────────────────────────────────
        this.currentRound = 1;
        this.playerWins = 0;
        this.aiWins = 0;
        this.roundTimer = ROUND_TIME;
        this.roundIntroTimer = 0;
        this.roundEndTimer = 0;
        this.matchWinner = null;       // 'player' | 'ai' | 'draw'

        // ── Announcement ──────────────────────────────────────────────
        this.announcement = null;      // { text, timer, duration }

        // ── Stats tracking ────────────────────────────────────────────
        this.stats = {
            playerDamageDealt: 0,
            aiDamageDealt: 0,
            playerCombos: 0,
            aiCombos: 0,
            roundsPlayed: 0
        };

        // ── Timing ────────────────────────────────────────────────────
        this.lastTimestamp = 0;
        this.accumulator = 0;
        this.fixedDt = 1 / 60;        // 60 Hz fixed update
        this.running = false;

        // ── Hit-lag (freeze frames for impact) ────────────────────────
        this.hitlagFrames = 0;

        // ── RL Events buffer ─────────────────────────────────────────
        this.rlEvents = [];

        // ── Debug mode ────────────────────────────────────────────────
        this.debugHitboxes = false;

        // ── Tab key for RL stats ──────────────────────────────────────
        this._setupExtraInputs();
    }

    // ─── Extra key bindings (pause, debug, stats, mouse) ────────────
    _setupExtraInputs() {
        this._onKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                if (this.state === GameState.FIGHTING) {
                    this.previousState = GameState.FIGHTING;
                    this.state = GameState.PAUSED;
                } else if (this.state === GameState.PAUSED) {
                    this.state = this.previousState;
                }
            }
            if (e.key === 'Tab') {
                e.preventDefault();
                this.ui.showStats = !this.ui.showStats;
            }
            if (e.key === '`' || e.key === '~') {
                this.debugHitboxes = !this.debugHitboxes;
            }
        };
        window.addEventListener('keydown', this._onKeyDown);

        this._onCanvasClick = (e) => {
            if (this.state === GameState.MENU) {
                if (this.difficultyMenuOpen) {
                    const rect = this.canvas.getBoundingClientRect();
                    const scaleY = CANVAS_HEIGHT / rect.height;
                    const y = (e.clientY - rect.top) * scaleY;
                    if (y >= 260 && y <= 310) {
                        this.rlAgent.setDifficulty('easy');
                        this.ui.difficulty = 'easy';
                        this.difficultyMenuOpen = false;
                    } else if (y >= 330 && y <= 380) {
                        this.rlAgent.setDifficulty('medium');
                        this.ui.difficulty = 'medium';
                        this.difficultyMenuOpen = false;
                    } else if (y >= 400 && y <= 450) {
                        this.rlAgent.setDifficulty('hard');
                        this.ui.difficulty = 'hard';
                        this.difficultyMenuOpen = false;
                    } else {
                        this.difficultyMenuOpen = false;
                    }
                } else {
                    const rect = this.canvas.getBoundingClientRect();
                    const scaleY = CANVAS_HEIGHT / rect.height;
                    const y = (e.clientY - rect.top) * scaleY;
                    const menuStartY = 230;
                    const menuSpacing = 65;
                    for (let i = 0; i < this.menuItems.length; i++) {
                        const itemY = menuStartY + i * menuSpacing;
                        if (y >= itemY - 25 && y <= itemY + 25) {
                            if (i === 0) this._startMatch();
                            else if (i === 1) this.difficultyMenuOpen = true;
                            else if (i === 2) {
                                this.rlAgent.resetModel();
                                this.ui.showAnnouncement('AI RESET', 1.5);
                            }
                            return;
                        }
                    }
                    this._startMatch();
                }
            } else if (this.state === GameState.GAME_OVER) {
                this._startMatch();
            }
        };
        this.canvas.addEventListener('click', this._onCanvasClick);
    }

    // ═════════════════════════════════════════════════════════════════════
    //  START — kick off the game loop
    // ═════════════════════════════════════════════════════════════════════
    start() {
        this.running = true;
        this.lastTimestamp = performance.now();
        requestAnimationFrame((ts) => this._loop(ts));
    }

    // ─── Main loop ───────────────────────────────────────────────────
    _loop(timestamp) {
        if (!this.running) return;

        let delta = (timestamp - this.lastTimestamp) / 1000;
        this.lastTimestamp = timestamp;

        // Clamp to prevent spiral of death
        if (delta > 0.1) delta = 0.1;

        this.accumulator += delta;

        // Fixed-timestep updates
        while (this.accumulator >= this.fixedDt) {
            if (this.hitlagFrames > 0) {
                this.hitlagFrames--;
            } else {
                this._update(this.fixedDt);
            }
            this.accumulator -= this.fixedDt;
        }

        // Render every frame
        this._render();

        requestAnimationFrame((ts) => this._loop(ts));
    }

    // ═════════════════════════════════════════════════════════════════════
    //  UPDATE — fixed timestep logic
    // ═════════════════════════════════════════════════════════════════════
    _update(dt) {
        this.input.update();

        switch (this.state) {
            case GameState.MENU:
                this._updateMenu(dt);
                break;
            case GameState.ROUND_INTRO:
                this._updateRoundIntro(dt);
                break;
            case GameState.FIGHTING:
                this._updateFighting(dt);
                break;
            case GameState.ROUND_END:
                this._updateRoundEnd(dt);
                break;
            case GameState.GAME_OVER:
                this._updateGameOver(dt);
                break;
            case GameState.PAUSED:
                this._updatePaused(dt);
                break;
        }

        // Update UI timers
        this.ui.update(dt);
    }

    // ─── MENU ────────────────────────────────────────────────────────
    _updateMenu(dt) {
        const actions = this.input.getPlayerActions();

        if (this.difficultyMenuOpen) {
            if (actions.up) this.difficultySelection = (this.difficultySelection - 1 + 3) % 3;
            if (actions.down) this.difficultySelection = (this.difficultySelection + 1) % 3;
            if (actions.punch || actions.kick) {
                const levels = ['easy', 'medium', 'hard'];
                this.rlAgent.setDifficulty(levels[this.difficultySelection]);
                this.ui.difficulty = levels[this.difficultySelection];
                this.difficultyMenuOpen = false;
            }
            if (actions.block) {
                this.difficultyMenuOpen = false;
            }
            return;
        }

        if (actions.up) this.menuSelection = (this.menuSelection - 1 + this.menuItems.length) % this.menuItems.length;
        if (actions.down) this.menuSelection = (this.menuSelection + 1) % this.menuItems.length;

        if (actions.punch || actions.kick) {
            switch (this.menuSelection) {
                case 0: // FIGHT
                    this._startMatch();
                    break;
                case 1: // DIFFICULTY
                    this.difficultyMenuOpen = true;
                    break;
                case 2: // RESET AI
                    this.rlAgent.resetModel();
                    this.ui.showAnnouncement('AI RESET', 1.5);
                    break;
            }
        }
    }

    // ─── Start a new match ───────────────────────────────────────────
    _startMatch() {
        this.currentRound = 1;
        this.playerWins = 0;
        this.aiWins = 0;
        this.matchWinner = null;
        this.stats = { playerDamageDealt: 0, aiDamageDealt: 0, playerCombos: 0, aiCombos: 0, roundsPlayed: 0 };
        this._startRound();
    }

    // ─── Start a new round ───────────────────────────────────────────
    _startRound() {
        this.player.reset(PLAYER_SPAWN_X, GROUND_Y, 1);
        this.ai.reset(AI_SPAWN_X, GROUND_Y, -1);
        this.roundTimer = ROUND_TIME;
        this.roundIntroTimer = ROUND_INTRO_DURATION;
        this.rlEvents = [];
        this.state = GameState.ROUND_INTRO;
        this.ui.showAnnouncement(`ROUND ${this.currentRound}`, 1.5);
    }

    // ─── ROUND INTRO ─────────────────────────────────────────────────
    _updateRoundIntro(dt) {
        this.roundIntroTimer -= dt;

        // Show "FIGHT!" halfway through
        if (this.roundIntroTimer <= ROUND_INTRO_DURATION / 2 && !this._fightShown) {
            this.ui.showAnnouncement('FIGHT!', 1.0);
            this._fightShown = true;
        }

        if (this.roundIntroTimer <= 0) {
            this.state = GameState.FIGHTING;
            this._fightShown = false;
        }

        // Update animations so fighters look idle
        this.player.update(dt, {}, {}, this.ai.x);
        this.ai.update(dt, {}, {}, this.player.x);
        this.player.skeleton.computeWorldPositions(this.player.x, this.player.y, this.player.facing);
        this.ai.skeleton.computeWorldPositions(this.ai.x, this.ai.y, this.ai.facing);
    }

    // ─── FIGHTING ────────────────────────────────────────────────────
    _updateFighting(dt) {
        // ── Round timer ──────────────────────────────────────────────
        this.roundTimer -= dt;
        if (this.roundTimer <= 0) {
            this.roundTimer = 0;
            this._endRound('time');
            return;
        }

        // ── Player input ─────────────────────────────────────────────
        const held = this.input.getPlayerInput();
        const pressed = this.input.getPlayerActions();
        const playerInput = {
            left: held.left,
            right: held.right,
            up: held.up,
            down: held.down,
            block: held.block,
            punch: false,
            kick: false,
            special: false
        };
        const playerActions = {
            left: pressed.left,
            right: pressed.right,
            up: pressed.up,
            down: pressed.down,
            punch: pressed.punch,
            kick: pressed.kick,
            block: pressed.block,
            special: pressed.special
        };

        // Directional special attack combinations:
        // ↑ + Punch = Dragon Uppercut
        // ↑ + Kick  = Spinning Roundhouse
        // ↓ + Punch = Low Crouch Punch
        // ↓ + Kick  = Low Sweep Kick
        // → + Punch = Lunging Dash Strike
        // → + Kick  = Flying Step Kick
        const isForward = (this.player.facing === 1 && held.right) || (this.player.facing === -1 && held.left);

        if (pressed.punch) {
            if (held.up) {
                playerActions.punch = false;
                this.player.performMove(MoveType.UPPERCUT);
            } else if (held.down) {
                playerActions.punch = false;
                this.player.performMove(MoveType.CROUCH_PUNCH);
            } else if (isForward) {
                playerActions.punch = false;
                this.player.vx = this.player.facing * 320;
                this.player.performMove(MoveType.PUNCH);
            }
        }

        if (pressed.kick) {
            if (held.up) {
                playerActions.kick = false;
                this.player.performMove(MoveType.ROUNDHOUSE);
            } else if (held.down) {
                playerActions.kick = false;
                this.player.performMove(MoveType.CROUCH_KICK);
            } else if (isForward) {
                playerActions.kick = false;
                this.player.vx = this.player.facing * 360;
                this.player.performMove(MoveType.KICK);
            }
        }

        // ── AI decision ──────────────────────────────────────────────
        const observation = this.rlAgent.getObservation(this.ai, this.player);
        const aiInput = this.rlAgent.step(observation, this.rlEvents, dt, false, this.ai.facing);
        this.rlEvents = []; // clear events after AI processes them

        const aiActions = { ...aiInput }; // AI actions for edge-triggered attacks
        const aiHeld = {
            left: aiInput.left || false,
            right: aiInput.right || false,
            up: aiInput.up || false,
            down: aiInput.down || false,
            block: aiInput.block || false,
            punch: false,
            kick: false,
            special: false
        };

        // Handle AI special moves
        if (aiInput.uppercut) this.ai.performMove(MoveType.UPPERCUT);
        if (aiInput.roundhouse) this.ai.performMove(MoveType.ROUNDHOUSE);
        if (aiInput.crouchPunch) this.ai.performMove(MoveType.CROUCH_PUNCH);
        if (aiInput.crouchKick) this.ai.performMove(MoveType.CROUCH_KICK);

        // ── Update fighters ──────────────────────────────────────────
        const prevPlayerHealth = this.player.health;
        const prevAiHealth = this.ai.health;

        this.player.update(dt, playerInput, playerActions, this.ai.x);
        this.ai.update(dt, aiHeld, aiActions, this.player.x);

        // ── Physics (push collision, bounds) ─────────────────────────
        const events = this.physics.update(this.player, this.ai, dt);

        // ── Process physics events ───────────────────────────────────
        for (const ev of events) {
            switch (ev.type) {
                case 'hit': {
                    const { attacker, defender, moveData } = ev;
                    const isBlocking = defender.isBlocking(attacker.x);

                    if (isBlocking) {
                        defender.blockHit(moveData.damage, moveData.knockbackX, moveData.blockstun);
                        this.renderer.particleSystem.emit(
                            (attacker.x + defender.x) / 2,
                            defender.y - defender.height / 2,
                            ParticleSystem.BLOCK_SPARK
                        );
                        // RL events
                        if (attacker === this.ai) {
                            this.rlEvents.push({ type: 'dealt_damage', data: moveData.damage * 0.2 });
                        } else {
                            this.rlEvents.push({ type: 'blocked', data: moveData.damage });
                        }
                    } else {
                        defender.takeDamage(moveData.damage, moveData.knockbackX, moveData.knockbackY, moveData.hitstun);
                        attacker.specialMeter = Math.min(
                            attacker.maxSpecialMeter,
                            attacker.specialMeter + (moveData.meterGain || 5)
                        );

                        this.renderer.particleSystem.emit(
                            (attacker.x + defender.x) / 2,
                            defender.y - defender.height / 2,
                            ParticleSystem.HIT_SPARK
                        );

                        // Screen shake on heavy hits
                        if (moveData.damage >= 15) {
                            this.renderer.triggerScreenShake(moveData.damage * 0.4, 0.15);
                            this.hitlagFrames = 3;
                        } else {
                            this.renderer.triggerScreenShake(moveData.damage * 0.25, 0.1);
                            this.hitlagFrames = 2;
                        }

                        // RL events
                        if (attacker === this.ai) {
                            this.rlEvents.push({ type: 'dealt_damage', data: moveData.damage });
                            this.stats.aiDamageDealt += moveData.damage;
                        } else {
                            this.rlEvents.push({ type: 'took_damage', data: moveData.damage });
                            this.stats.playerDamageDealt += moveData.damage;
                        }
                    }

                    attacker.hasHitThisAttack = true;
                    break;
                }
                case 'land':
                    this.renderer.particleSystem.emit(
                        ev.fighter.x, ev.fighter.y,
                        ParticleSystem.DUST
                    );
                    break;
                case 'whiff':
                    if (ev.fighter === this.ai) {
                        this.rlEvents.push({ type: 'whiffed', data: 0 });
                    }
                    break;
            }
        }

        // ── Track approach reward for AI ─────────────────────────────
        const dist = Math.abs(this.ai.x - this.player.x);
        if (dist > 300) {
            this.rlEvents.push({ type: 'approach', data: dist });
        }

        // ── Compute world positions for rendering ────────────────────
        this.player.skeleton.computeWorldPositions(this.player.x, this.player.y, this.player.facing);
        this.ai.skeleton.computeWorldPositions(this.ai.x, this.ai.y, this.ai.facing);

        // ── Update effects ───────────────────────────────────────────
        this.renderer.updateEffects(dt);

        // ── Check for round end ──────────────────────────────────────
        if (this.player.health <= 0 || this.ai.health <= 0) {
            this._endRound('ko');
        }
    }

    // ─── End the current round ───────────────────────────────────────
    _endRound(reason) {
        this.state = GameState.ROUND_END;
        this.roundEndTimer = ROUND_END_DURATION;
        this.stats.roundsPlayed++;

        let roundWinner;
        if (reason === 'ko') {
            if (this.player.health <= 0 && this.ai.health <= 0) {
                roundWinner = 'draw';
            } else if (this.ai.health <= 0) {
                roundWinner = 'player';
            } else {
                roundWinner = 'ai';
            }
        } else { // time up
            if (this.player.health > this.ai.health) {
                roundWinner = 'player';
            } else if (this.ai.health > this.player.health) {
                roundWinner = 'ai';
            } else {
                roundWinner = 'draw';
            }
        }

        // Update wins
        if (roundWinner === 'player') {
            this.playerWins++;
            this.ai._transitionTo(FighterState.DEFEATED);
            this.player._transitionTo(FighterState.VICTORY);
            this.ui.showAnnouncement('K.O.!', 2.0);
            this.rlEvents.push({ type: 'lost_round', data: 0 });
            this.rlAgent.onEpisodeEnd(false);
        } else if (roundWinner === 'ai') {
            this.aiWins++;
            this.player._transitionTo(FighterState.DEFEATED);
            this.ai._transitionTo(FighterState.VICTORY);
            this.ui.showAnnouncement('K.O.!', 2.0);
            this.rlEvents.push({ type: 'won_round', data: 0 });
            this.rlAgent.onEpisodeEnd(true);
        } else {
            this.ui.showAnnouncement('DRAW!', 2.0);
            this.rlAgent.onEpisodeEnd(false);
        }
    }

    // ─── ROUND END ───────────────────────────────────────────────────
    _updateRoundEnd(dt) {
        this.roundEndTimer -= dt;

        // Keep updating animations
        this.player.update(dt, {}, {}, this.ai.x);
        this.ai.update(dt, {}, {}, this.player.x);
        this.player.skeleton.computeWorldPositions(this.player.x, this.player.y, this.player.facing);
        this.ai.skeleton.computeWorldPositions(this.ai.x, this.ai.y, this.ai.facing);
        this.renderer.updateEffects(dt);

        if (this.roundEndTimer <= 0) {
            // Check if match is over
            if (this.playerWins >= Math.ceil(MAX_ROUNDS / 2)) {
                this.matchWinner = 'player';
                this.state = GameState.GAME_OVER;
                this.ui.showAnnouncement('YOU WIN!', 2.5);
            } else if (this.aiWins >= Math.ceil(MAX_ROUNDS / 2)) {
                this.matchWinner = 'ai';
                this.state = GameState.GAME_OVER;
                this.ui.showAnnouncement('YOU LOSE!', 2.5);
            } else {
                this.currentRound++;
                this._startRound();
            }
        }
    }

    // ─── GAME OVER ───────────────────────────────────────────────────
    _updateGameOver(dt) {
        const actions = this.input.getPlayerActions();
        if (actions.up) this.gameOverSelection = (this.gameOverSelection - 1 + 2) % 2;
        if (actions.down) this.gameOverSelection = (this.gameOverSelection + 1) % 2;

        if (actions.punch || actions.kick) {
            if (this.gameOverSelection === 0) {
                // Play again
                this._startMatch();
            } else {
                // Main menu
                this.state = GameState.MENU;
                this.menuSelection = 0;
            }
        }

        this.renderer.updateEffects(dt);
    }

    // ─── PAUSED ──────────────────────────────────────────────────────
    _updatePaused(dt) {
        // Escape is handled in _setupExtraInputs
    }

    // ═════════════════════════════════════════════════════════════════════
    //  RENDER
    // ═════════════════════════════════════════════════════════════════════
    _render() {
        const ctx = this.ctx;

        switch (this.state) {
            case GameState.MENU:
                if (this.difficultyMenuOpen) {
                    this.ui.drawDifficultyMenu(this.ui.difficulty, this.difficultySelection);
                } else {
                    this.ui.drawMainMenu(this.menuSelection);
                }
                break;

            case GameState.ROUND_INTRO:
            case GameState.FIGHTING:
            case GameState.ROUND_END:
                this._renderGameplay();
                break;

            case GameState.GAME_OVER:
                this._renderGameplay();
                this.ui.drawGameOver(
                    this.matchWinner === 'player' ? 'PLAYER' : 'AI SHADOW',
                    {
                        playerWins: this.playerWins,
                        aiWins: this.aiWins,
                        ...this.stats,
                        rl: this.rlAgent.getStats()
                    },
                    this.gameOverSelection
                );
                break;

            case GameState.PAUSED:
                this._renderGameplay();
                this.ui.drawPauseOverlay(0);
                break;
        }
    }

    // ─── Render the gameplay scene ───────────────────────────────────
    _renderGameplay() {
        const ctx = this.ctx;

        // Screen shake
        this.renderer.applyScreenShake(ctx);

        // Background
        this.renderer.drawBackground(ctx);
        this.renderer.drawGround(ctx);

        // Fighters
        this.renderer.drawFighter(ctx, this.player, [68, 136, 255]);   // blue glow
        this.renderer.drawFighter(ctx, this.ai, [255, 68, 68]);        // red glow

        // Debug hitboxes
        if (this.debugHitboxes) {
            const pH = this.player.getActiveHitbox();
            const aH = this.ai.getActiveHitbox();
            if (pH) this.renderer.drawHitbox(ctx, pH, 'rgba(0, 255, 0, 0.4)');
            if (aH) this.renderer.drawHitbox(ctx, aH, 'rgba(255, 0, 0, 0.4)');
            this.renderer.drawHitbox(ctx, this.player.getHurtbox(), 'rgba(0, 0, 255, 0.2)');
            this.renderer.drawHitbox(ctx, this.ai.getHurtbox(), 'rgba(255, 0, 0, 0.2)');
        }

        // Particles
        this.renderer.particleSystem.draw(ctx);

        // Reset screen shake transform
        this.renderer.resetScreenShake(ctx);

        // HUD
        this.ui.drawHUD(
            this.player.health, this.player.maxHealth,
            this.player.specialMeter, this.player.maxSpecialMeter,
            this.ai.health, this.ai.maxHealth,
            this.ai.specialMeter, this.ai.maxSpecialMeter,
            this.currentRound, MAX_ROUNDS,
            Math.ceil(this.roundTimer),
            this.player.comboCount,
            this.ai.comboCount
        );

        // Announcements
        if (this.ui.announcement) {
            const a = this.ui.announcement;
            const progress = 1 - (a.timer / a.duration);
            this.ui.drawAnnouncement(a.text, progress);
        }

        // RL Stats panel (toggle with Tab)
        if (this.ui.showStats) {
            this.ui.drawRLStats(this.rlAgent.getStats());
        }

        // Controls overlay (first few seconds)
        if (this.ui.showControls && this.ui.controlsFadeTimer > 0) {
            const alpha = Math.min(1, this.ui.controlsFadeTimer / 2);
            this.ui.drawControls(alpha);
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    //  Cleanup
    // ═════════════════════════════════════════════════════════════════════
    destroy() {
        this.running = false;
        this.input.destroy();
        window.removeEventListener('keydown', this._onKeyDown);
        if (this._onCanvasClick) this.canvas.removeEventListener('click', this._onCanvasClick);
    }
}
