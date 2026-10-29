// ai.js - Reinforcement Learning Agent for Shadow Fight AI opponent
// Uses tabular Q-learning with epsilon-greedy exploration to learn fighting strategies.

import { clamp, randomRange } from './utils.js';

// ─── Actions the AI can take ────────────────────────────────────────────────────
export const AIAction = {
    IDLE: 0,
    MOVE_FORWARD: 1,
    MOVE_BACKWARD: 2,
    JUMP: 3,
    CROUCH: 4,
    PUNCH: 5,
    KICK: 6,
    BLOCK: 7,
    SPECIAL: 8,
    UPPERCUT: 9,
    ROUNDHOUSE: 10,
    CROUCH_PUNCH: 11,
    CROUCH_KICK: 12
};

export const NUM_ACTIONS = 13;

// ─── State encoding helpers ─────────────────────────────────────────────────────

/**
 * Map a string-based fighter state name to a numeric bin index.
 * The bins correspond to the major logical states a fighter can occupy:
 *   0 = idle / walking (neutral)
 *   1 = attacking (any offensive action)
 *   2 = blocking
 *   3 = stunned / hit-stun / knocked-down
 *   4 = jumping / airborne
 *   5 = crouching
 */
function stateNameToBin(stateName) {
    if (!stateName) return 0;
    const s = stateName.toLowerCase();
    if (s.includes('attack') || s.includes('punch') || s.includes('kick') ||
        s.includes('upper') || s.includes('round') || s.includes('special')) return 1;
    if (s.includes('block') || s.includes('guard'))  return 2;
    if (s.includes('stun') || s.includes('hit') || s.includes('hurt') ||
        s.includes('knock') || s.includes('down'))   return 3;
    if (s.includes('jump') || s.includes('air'))      return 4;
    if (s.includes('crouch') || s.includes('duck'))   return 5;
    return 0; // idle / walk / unknown
}

// ─── RLAgent ────────────────────────────────────────────────────────────────────

export class RLAgent {
    /**
     * @param {Object} config  Optional hyperparameter overrides.
     */
    constructor(config = {}) {
        // ── Hyperparameters ──────────────────────────────────────────────────
        this.learningRate   = config.learningRate   || 0.1;     // α
        this.discountFactor = config.discountFactor || 0.95;    // γ
        this.epsilon        = config.epsilon        || 0.3;     // exploration rate
        this.epsilonMin     = config.epsilonMin     || 0.05;
        this.epsilonDecay   = config.epsilonDecay   || 0.9995;

        // ── Q-table: Map<stateKey, Float64Array(NUM_ACTIONS)> ────────────────
        this.qTable = new Map();

        // ── State discretisation bin counts ──────────────────────────────────
        this.distanceBins   = 5;  // horizontal distance between fighters
        this.heightBins     = 3;  // vertical distance (below / level / above)
        this.healthBins     = 4;  // own health level
        this.oppHealthBins  = 4;  // opponent health level
        this.stateBins      = 6;  // own state  (idle, attacking, blocking, stunned, jumping, crouching)
        this.oppStateBins   = 6;  // opponent state
        this.groundedBins   = 2;  // grounded flag
        this.specialBins    = 3;  // special meter (low / mid / full)

        // ── Previous state-action pair for learning ─────────────────────────
        this.prevState       = null;
        this.prevAction      = null;
        this.prevReward      = 0;

        // ── Statistics ──────────────────────────────────────────────────────
        this.totalReward       = 0;
        this.episodeReward     = 0;
        this.episodesCompleted = 0;
        this.wins              = 0;
        this.losses            = 0;

        // ── Decision timing ─────────────────────────────────────────────────
        this.decisionInterval = 150; // ms between decisions (avoids twitchy AI)
        this.decisionTimer    = 0;
        this.currentDecision  = AIAction.IDLE;

        // ── Difficulty ──────────────────────────────────────────────────────
        this.difficulty = config.difficulty || 'medium';
        this.setDifficulty(this.difficulty);

        // ── Combo tracking (for reward shaping) ─────────────────────────────
        this.comboCounter = 0;
        this.lastHitTime  = 0;
        this.comboWindow  = 800; // ms – hits within this window count as a combo

        // ── Attempt to load a previously saved model ────────────────────────
        this.loadModel();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // State encoding
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Discretise a continuous value [0,1] into `numBins` integer bins.
     * Returns an integer in [0, numBins-1].
     */
    discretise(value, numBins) {
        const clamped = clamp(value, 0, 1);
        const bin = Math.floor(clamped * numBins);
        return Math.min(bin, numBins - 1);
    }

    /**
     * Encode a game observation into a compact string key for the Q-table.
     *
     * @param {Object} observation  See `getObservation()` for shape.
     * @returns {string} A key such as "3_1_2_3_0_4_1_2"
     */
    encodeState(observation) {
        const distBin      = this.discretise(observation.distanceX,       this.distanceBins);
        const heightBin    = this.discretise((observation.distanceY + 1) / 2, this.heightBins);
        const hpBin        = this.discretise(observation.ownHealth,       this.healthBins);
        const oppHpBin     = this.discretise(observation.opponentHealth,  this.oppHealthBins);
        const ownStateBin  = stateNameToBin(observation.ownState);
        const oppStateBin  = stateNameToBin(observation.opponentState);
        const groundedBin  = observation.isGrounded ? 1 : 0;
        const specialBin   = this.discretise(observation.ownSpecialMeter || 0, this.specialBins);

        return `${distBin}_${heightBin}_${hpBin}_${oppHpBin}_${ownStateBin}_${oppStateBin}_${groundedBin}_${specialBin}`;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Q-table access
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Return the Q-value array for a given state key.
     * If the state has never been visited the row is initialised with small
     * random values so that tie-breaking is stochastic.
     */
    getQValues(stateKey) {
        if (!this.qTable.has(stateKey)) {
            const qValues = new Float64Array(NUM_ACTIONS);
            for (let i = 0; i < NUM_ACTIONS; i++) {
                qValues[i] = Math.random() * 0.01;
            }
            this.qTable.set(stateKey, qValues);
        }
        return this.qTable.get(stateKey);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Action selection  (ε-greedy)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Choose an action index using ε-greedy policy.
     */
    selectAction(observation) {
        const stateKey = this.encodeState(observation);

        // Exploration: pick a uniformly random action
        if (Math.random() < this.epsilon) {
            return Math.floor(Math.random() * NUM_ACTIONS);
        }

        // Exploitation: pick the action with the highest Q-value
        const qValues  = this.getQValues(stateKey);
        let bestAction = 0;
        let bestValue  = qValues[0];
        for (let i = 1; i < NUM_ACTIONS; i++) {
            if (qValues[i] > bestValue) {
                bestValue  = qValues[i];
                bestAction = i;
            }
        }
        return bestAction;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Action → game input translation
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Convert an `AIAction` integer into a player-input-like object that the
     * fighter controller can consume. Only one action flag is true per call.
     *
     * @param {number|Object} action  One of the AIAction enum values, or already an input object.
     * @param {number}        facing  Fighter facing direction (1 = right, -1 = left).
     * @returns {Object}  Input object.
     */
    actionToInput(action, facing = 1) {
        if (typeof action === 'object' && action !== null) {
            return action;
        }

        const input = {
            left:        false,
            right:       false,
            up:          false,
            down:        false,
            punch:       false,
            kick:        false,
            block:       false,
            special:     false,
            uppercut:    false,
            roundhouse:  false,
            crouchPunch: false,
            crouchKick:  false
        };

        const forwardKey = facing >= 0 ? 'right' : 'left';
        const backwardKey = facing >= 0 ? 'left' : 'right';

        switch (action) {
            case AIAction.IDLE:                                          break;
            case AIAction.MOVE_FORWARD:  input[forwardKey]  = true;      break;
            case AIAction.MOVE_BACKWARD: input[backwardKey] = true;      break;
            case AIAction.JUMP:          input.up           = true;      break;
            case AIAction.CROUCH:        input.down         = true;      break;
            case AIAction.PUNCH:         input.punch        = true;      break;
            case AIAction.KICK:          input.kick         = true;      break;
            case AIAction.BLOCK:         input.block        = true;      break;
            case AIAction.SPECIAL:       input.special      = true;      break;
            case AIAction.UPPERCUT:      input.uppercut     = true;      break;
            case AIAction.ROUNDHOUSE:    input.roundhouse   = true;      break;
            case AIAction.CROUCH_PUNCH:  input.crouchPunch  = true;      break;
            case AIAction.CROUCH_KICK:   input.crouchKick   = true;      break;
        }

        return input;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Reward calculation
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Compute the scalar reward for this timestep from a list of game events.
     *
     * @param {Array<{type:string, data:*}>} events
     * @returns {number} Total reward.
     */
    calculateReward(events) {
        let reward = 0;
        const now = performance.now();

        for (const event of events) {
            switch (event.type) {
                // ── Offensive rewards ───────────────────────────────────
                case 'dealt_damage': {
                    const dmg = event.data || 10;
                    // Base reward proportional to damage dealt
                    reward += 1.0 + dmg * 0.05;

                    // Combo bonus – consecutive hits within the combo window
                    if (now - this.lastHitTime < this.comboWindow) {
                        this.comboCounter++;
                        reward += 0.5 * this.comboCounter; // escalating combo reward
                    } else {
                        this.comboCounter = 1;
                    }
                    this.lastHitTime = now;
                    break;
                }

                // ── Defensive rewards ───────────────────────────────────
                case 'blocked': {
                    reward += 0.4; // successful block
                    break;
                }

                // ── Damage taken penalty ────────────────────────────────
                case 'took_damage': {
                    const dmg = event.data || 10;
                    reward -= 1.0 + dmg * 0.05;
                    this.comboCounter = 0; // combo broken
                    break;
                }

                // ── Whiff penalty ───────────────────────────────────────
                case 'whiffed': {
                    reward -= 0.3; // missed attack
                    break;
                }

                // ── Round end ───────────────────────────────────────────
                case 'won_round': {
                    reward += 10.0; // large win bonus
                    break;
                }
                case 'lost_round': {
                    reward -= 10.0; // large loss penalty
                    break;
                }

                // ── Positional shaping ──────────────────────────────────
                case 'approach': {
                    reward += 0.05; // tiny reward for closing distance
                    break;
                }

                // ── Time penalty ────────────────────────────────────────
                case 'timeout': {
                    reward -= 0.02; // small per-tick penalty to encourage action
                    break;
                }

                default:
                    break;
            }
        }

        return reward;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Q-learning update
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Apply the standard Q-learning update:
     *   Q(s,a) ← Q(s,a) + α · [ r + γ · max_a' Q(s',a') − Q(s,a) ]
     *
     * @param {Object}  state      Current observation.
     * @param {number}  action     Action taken.
     * @param {number}  reward     Immediate reward received.
     * @param {Object}  nextState  Next observation (after action).
     * @param {boolean} done       Whether the episode is over.
     */
    learn(state, action, reward, nextState, done) {
        const stateKey     = this.encodeState(state);
        const nextStateKey = this.encodeState(nextState);

        const qValues     = this.getQValues(stateKey);
        const nextQValues = this.getQValues(nextStateKey);

        // Bootstrap target (0 if terminal)
        let maxNextQ = 0;
        if (!done) {
            maxNextQ = nextQValues[0];
            for (let i = 1; i < NUM_ACTIONS; i++) {
                if (nextQValues[i] > maxNextQ) maxNextQ = nextQValues[i];
            }
        }

        const target = reward + this.discountFactor * maxNextQ;
        qValues[action] += this.learningRate * (target - qValues[action]);

        // Decay exploration rate
        this.epsilon = Math.max(this.epsilonMin, this.epsilon * this.epsilonDecay);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Per-frame step
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Main entry point called every game frame.
     *
     * 1. Compute reward from events.
     * 2. Learn from the previous transition.
     * 3. Throttle decisions to `decisionInterval` ms.
     * 4. When it's time to decide, pick a new action.
     * 5. Return the current input object.
     *
     * @param {Object}  observation  State features (see `getObservation`).
     * @param {Array}   events       Game events since last step.
     * @param {number}  dt           Delta-time in ms since last frame.
     * @param {boolean} done         True if round is over.
     * @returns {Object} Input object for the fighter controller.
     */
    step(observation, events, dt, done = false, facing = 1) {
        // Handle dt in seconds vs milliseconds
        const dtMs = dt < 5 ? dt * 1000 : dt;

        // 1. Calculate reward from events that happened since last step
        const reward = this.calculateReward(events);
        this.episodeReward += reward;
        this.totalReward   += reward;

        // 2. If we have a previous state-action, learn from the transition
        if (this.prevState !== null && this.prevAction !== null) {
            this.learn(this.prevState, this.prevAction, reward, observation, done);
        }

        // 3. Update decision timer – only pick a new action after the interval
        this.decisionTimer += dtMs;

        if (this.decisionTimer >= this.decisionInterval) {
            this.decisionTimer = 0;

            // 4. Select a new action
            this.currentDecision = this.selectAction(observation);

            // 5. Store current state/action for next learning step
            this.prevState  = observation;
            this.prevAction = this.currentDecision;
        }

        // 6. Convert the current decision to input and return
        return this.actionToInput(this.currentDecision, facing);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Episode lifecycle
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Called when a round / episode ends.
     *
     * @param {boolean} won  Whether the AI won this round.
     */
    onEpisodeEnd(won) {
        // Apply terminal reward via one final learn step
        if (this.prevState !== null && this.prevAction !== null) {
            const terminalReward = won ? 10.0 : -10.0;
            // Use prevState as both state and nextState (terminal – maxNextQ will be 0)
            this.learn(this.prevState, this.prevAction, terminalReward, this.prevState, true);
        }

        // Update statistics
        this.episodesCompleted++;
        if (won) this.wins++;
        else     this.losses++;

        // Log episode summary
        console.log(
            `[RL] Episode ${this.episodesCompleted} | ` +
            `Result: ${won ? 'WIN' : 'LOSS'} | ` +
            `Reward: ${this.episodeReward.toFixed(1)} | ` +
            `ε: ${this.epsilon.toFixed(4)} | ` +
            `States: ${this.qTable.size}`
        );

        // Reset episode-level tracking
        this.episodeReward  = 0;
        this.prevState      = null;
        this.prevAction     = null;
        this.prevReward     = 0;
        this.comboCounter   = 0;
        this.decisionTimer  = 0;
        this.currentDecision = AIAction.IDLE;

        // Extra epsilon decay at end of episode to speed convergence
        this.epsilon = Math.max(this.epsilonMin, this.epsilon * 0.99);

        // Persist model every 5 episodes
        if (this.episodesCompleted % 5 === 0) {
            this.saveModel();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Observation extraction
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Build a normalised observation object from two fighter instances.
     *
     * @param {Object} aiFighter      The AI-controlled fighter.
     * @param {Object} playerFighter  The human-controlled fighter.
     * @returns {Object} observation
     */
    getObservation(aiFighter, playerFighter) {
        // Canvas dimensions used for normalisation
        const canvasW = 1200;
        const canvasH = 600;

        // Horizontal distance (normalised 0-1)
        const dx = Math.abs(aiFighter.x - playerFighter.x) / canvasW;

        // Vertical distance (normalised -1 to 1, positive = opponent above)
        const dy = clamp((playerFighter.y - aiFighter.y) / canvasH, -1, 1);

        // Health normalised to [0,1]
        const ownHpMax = aiFighter.maxHealth || 100;
        const oppHpMax = playerFighter.maxHealth || 100;
        const ownHealth = clamp((aiFighter.health || 0) / ownHpMax, 0, 1);
        const oppHealth = clamp((playerFighter.health || 0) / oppHpMax, 0, 1);

        // Fighter state names (fall back to 'idle')
        const ownState = aiFighter.state || aiFighter.currentState || 'idle';
        const oppState = playerFighter.state || playerFighter.currentState || 'idle';

        // Grounded flags
        const isGrounded       = aiFighter.grounded      !== undefined ? aiFighter.grounded      : true;
        const opponentGrounded = playerFighter.grounded   !== undefined ? playerFighter.grounded  : true;

        // Special meter normalised to [0,1]
        const maxSpecial       = aiFighter.maxSpecialMeter || aiFighter.maxSpecial || 100;
        const ownSpecialMeter  = clamp((aiFighter.specialMeter || aiFighter.special || 0) / maxSpecial, 0, 1);

        // Is the opponent facing toward us?
        const opponentFacing = playerFighter.facingRight
            ? playerFighter.x < aiFighter.x
            : playerFighter.x > aiFighter.x;

        return {
            distanceX: dx,
            distanceY: dy,
            ownHealth,
            opponentHealth: oppHealth,
            ownState:  String(ownState),
            opponentState: String(oppState),
            isGrounded,
            opponentGrounded,
            ownSpecialMeter,
            opponentFacing
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Persistence  (localStorage)
    // ─────────────────────────────────────────────────────────────────────────

    /** Serialise the Q-table and stats to localStorage. */
    saveModel() {
        try {
            // Convert Float64Arrays to plain arrays for JSON
            const serialisedTable = [];
            for (const [key, qValues] of this.qTable.entries()) {
                serialisedTable.push([key, Array.from(qValues)]);
            }

            const data = {
                qTable:   serialisedTable,
                epsilon:  this.epsilon,
                episodes: this.episodesCompleted,
                wins:     this.wins,
                losses:   this.losses
            };
            localStorage.setItem('shadowFightRL', JSON.stringify(data));
            console.log(`[RL] Model saved – ${this.qTable.size} states`);
        } catch (e) {
            console.warn('[RL] Could not save model:', e);
        }
    }

    /** Load a previously saved Q-table and stats from localStorage. */
    loadModel() {
        try {
            const saved = localStorage.getItem('shadowFightRL');
            if (saved) {
                const data = JSON.parse(saved);
                this.qTable = new Map(
                    data.qTable.map(([k, v]) => [k, new Float64Array(v)])
                );
                this.epsilon            = data.epsilon  || this.epsilon;
                this.episodesCompleted  = data.episodes || 0;
                this.wins               = data.wins     || 0;
                this.losses             = data.losses   || 0;
                console.log(
                    `[RL] Loaded model: ${this.qTable.size} states, ` +
                    `${this.episodesCompleted} episodes, ε=${this.epsilon.toFixed(4)}`
                );
            }
        } catch (e) {
            console.warn('[RL] Could not load model:', e);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Model management
    // ─────────────────────────────────────────────────────────────────────────

    /** Wipe all learned data and remove the persisted model. */
    resetModel() {
        this.qTable             = new Map();
        this.epsilon            = 0.3;
        this.episodesCompleted  = 0;
        this.wins               = 0;
        this.losses             = 0;
        this.totalReward        = 0;
        this.episodeReward      = 0;
        this.prevState          = null;
        this.prevAction         = null;
        this.comboCounter       = 0;

        try {
            localStorage.removeItem('shadowFightRL');
        } catch (_) { /* ignore */ }

        console.log('[RL] Model reset');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Stats
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Return a plain object of human-readable stats for HUD / debug display.
     */
    getStats() {
        return {
            statesExplored: this.qTable.size,
            epsilon:        this.epsilon.toFixed(4),
            episodes:       this.episodesCompleted,
            wins:           this.wins,
            losses:         this.losses,
            winRate:        this.episodesCompleted > 0
                                ? ((this.wins / this.episodesCompleted) * 100).toFixed(1) + '%'
                                : 'N/A',
            episodeReward:  this.episodeReward.toFixed(1),
            totalReward:    this.totalReward.toFixed(1),
            difficulty:     this.difficulty
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Difficulty presets
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Apply a difficulty preset that adjusts exploration rate and reaction
     * speed.  This does NOT affect the learned Q-values – the agent keeps its
     * knowledge but behaves differently.
     *
     * @param {'easy'|'medium'|'hard'} level
     */
    setDifficulty(level) {
        switch (level) {
            case 'easy':
                this.epsilon          = 0.5;   // 50 % random actions
                this.epsilonMin       = 0.3;   // stays fairly random
                this.decisionInterval = 300;   // slower reaction time (300 ms)
                this.learningRate     = 0.05;  // learns slower
                break;

            case 'medium':
                this.epsilon          = 0.2;
                this.epsilonMin       = 0.05;
                this.decisionInterval = 150;   // moderate reaction time
                this.learningRate     = 0.1;
                break;

            case 'hard':
                this.epsilon          = 0.05;  // almost pure exploitation
                this.epsilonMin       = 0.01;
                this.decisionInterval = 80;    // fast reactions (80 ms)
                this.learningRate     = 0.15;  // learns faster
                break;

            default:
                console.warn(`[RL] Unknown difficulty "${level}", defaulting to medium`);
                this.setDifficulty('medium');
                return;
        }
        this.difficulty = level;
    }
}
