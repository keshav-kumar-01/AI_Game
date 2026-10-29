// input.js - Input handling with buffering for Shadow Fight game
// Manages keyboard state tracking, per-frame press/release detection,
// and a timestamped input buffer for combo sequence recognition.

/**
 * @typedef {Object} ActionState
 * @property {boolean} left   - Left movement
 * @property {boolean} right  - Right movement
 * @property {boolean} up     - Up / jump
 * @property {boolean} down   - Down / crouch
 * @property {boolean} punch  - Punch attack
 * @property {boolean} kick   - Kick attack
 * @property {boolean} block  - Block / guard
 * @property {boolean} special - Special move
 */

/**
 * @typedef {Object} BufferedInput
 * @property {string} action    - The logical action name
 * @property {number} timestamp - Performance.now() when the input was recorded
 */

/**
 * InputManager – captures keyboard events and exposes a clean per-frame API
 * for polling held keys, just-pressed keys, just-released keys, and buffered
 * combo sequences.
 *
 * Usage:
 *   const input = new InputManager();
 *   // inside game loop:
 *   input.update();
 *   const held    = input.getPlayerInput();   // continuous movement etc.
 *   const actions = input.getPlayerActions();  // single-fire attacks etc.
 */
export class InputManager {
    constructor() {
        /** @type {Object<string, boolean>} Currently held raw keys */
        this.keys = {};

        /** @type {Object<string, boolean>} Keys that transitioned to DOWN this frame */
        this.justPressed = {};

        /** @type {Object<string, boolean>} Keys that transitioned to UP this frame */
        this.justReleased = {};

        /**
         * Snapshot of `this.keys` from the previous frame, used to derive
         * justPressed / justReleased by comparison.
         * @type {Object<string, boolean>}
         */
        this._prevKeys = {};

        /** @type {BufferedInput[]} Recent inputs kept for combo detection */
        this.inputBuffer = [];

        /** @type {number} How long (ms) buffered inputs stay valid */
        this.bufferDuration = 200;

        /**
         * Logical action → physical key mappings.
         * Each action maps to an array of accepted key values
         * (KeyboardEvent.key strings).
         * @type {Object<string, string[]>}
         */
        this.bindings = {
            left:    ['ArrowLeft',  'a', 'A', '4'],
            right:   ['ArrowRight', 'd', 'D', '6'],
            up:      ['ArrowUp',    'w', 'W', '8'],
            down:    ['ArrowDown',  's', 'S', '2'],
            punch:   ['j', 'J', 'z', 'Z', 'f', 'F', 'Enter', ' ', '1'],
            kick:    ['k', 'K', 'x', 'X', 'g', 'G', '3'],
            block:   ['l', 'L', 'c', 'C', 'h', 'H', 'Shift', '0'],
            special: ['i', 'I', 'v', 'V', 'u', 'U', 'e', 'E', 'q', 'Q', '5']
        };

        // Bound handler references so we can remove them later in destroy().
        /** @private */
        this._onKeyDown = this._handleKeyDown.bind(this);
        /** @private */
        this._onKeyUp   = this._handleKeyUp.bind(this);

        this._setupListeners();
    }

    /* ------------------------------------------------------------------
     *  Event listeners
     * ----------------------------------------------------------------*/

    /**
     * Attach keydown / keyup listeners to the window.
     * @private
     */
    _setupListeners() {
        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup',   this._onKeyUp);
    }

    /**
     * Handle a raw keydown event.
     * We record the key as held and prevent default for game-bound keys
     * so the browser doesn't scroll, etc.
     * @param {KeyboardEvent} e
     * @private
     */
    _handleKeyDown(e) {
        // Prevent repeat events from being counted as new presses.
        if (e.repeat) return;

        const key = e.key;
        this.keys[key] = true;

        // Prevent default browser behaviour for any key we care about.
        if (this._isGameKey(key)) {
            e.preventDefault();
        }
    }

    /**
     * Handle a raw keyup event.
     * @param {KeyboardEvent} e
     * @private
     */
    _handleKeyUp(e) {
        const key = e.key;
        this.keys[key] = false;

        if (this._isGameKey(key)) {
            e.preventDefault();
        }
    }

    /**
     * Returns true if `key` is mapped to any game action.
     * @param {string} key - KeyboardEvent.key value
     * @returns {boolean}
     * @private
     */
    _isGameKey(key) {
        for (const action in this.bindings) {
            if (this.bindings[action].includes(key)) {
                return true;
            }
        }
        return false;
    }

    /* ------------------------------------------------------------------
     *  Per-frame update
     * ----------------------------------------------------------------*/

    /**
     * Must be called **once per frame** (at the very start of the game-loop
     * tick). It:
     *   1. Derives `justPressed` and `justReleased` by comparing the current
     *      raw key state against the previous frame's snapshot.
     *   2. Auto-buffers any action that was just pressed.
     *   3. Prunes stale entries from the input buffer.
     *   4. Takes a new snapshot for the next frame.
     */
    update() {
        // --- 1. Derive per-frame transitions --------------------------------
        this.justPressed  = {};
        this.justReleased = {};

        // Collect all key names we need to inspect (union of current + prev).
        const allKeys = new Set([
            ...Object.keys(this.keys),
            ...Object.keys(this._prevKeys)
        ]);

        for (const key of allKeys) {
            const now  = !!this.keys[key];
            const prev = !!this._prevKeys[key];

            if (now && !prev) {
                this.justPressed[key] = true;
            } else if (!now && prev) {
                this.justReleased[key] = true;
            }
        }

        // --- 2. Auto-buffer newly pressed actions ----------------------------
        for (const action in this.bindings) {
            if (this.wasPressed(action)) {
                this.addToBuffer(action);
            }
        }

        // --- 3. Prune stale buffer entries -----------------------------------
        const now = performance.now();
        this.inputBuffer = this.inputBuffer.filter(
            entry => (now - entry.timestamp) <= this.bufferDuration
        );

        // --- 4. Snapshot for next frame --------------------------------------
        this._prevKeys = {};
        for (const key in this.keys) {
            this._prevKeys[key] = this.keys[key];
        }
    }

    /* ------------------------------------------------------------------
     *  Query helpers – by logical action name
     * ----------------------------------------------------------------*/

    /**
     * Returns `true` if **any** key bound to `action` is currently held down.
     * @param {string} action - Logical action name (e.g. "punch")
     * @returns {boolean}
     */
    isHeld(action) {
        const bound = this.bindings[action];
        if (!bound) return false;
        for (let i = 0; i < bound.length; i++) {
            if (this.keys[bound[i]]) return true;
        }
        return false;
    }

    /**
     * Returns `true` if `action` was **just pressed** this frame (edge-triggered).
     * @param {string} action - Logical action name
     * @returns {boolean}
     */
    wasPressed(action) {
        const bound = this.bindings[action];
        if (!bound) return false;
        for (let i = 0; i < bound.length; i++) {
            if (this.justPressed[bound[i]]) return true;
        }
        return false;
    }

    /**
     * Returns `true` if `action` was **just released** this frame (edge-triggered).
     * @param {string} action - Logical action name
     * @returns {boolean}
     */
    wasReleased(action) {
        const bound = this.bindings[action];
        if (!bound) return false;
        for (let i = 0; i < bound.length; i++) {
            if (this.justReleased[bound[i]]) return true;
        }
        return false;
    }

    /* ------------------------------------------------------------------
     *  Aggregate queries – return full ActionState objects
     * ----------------------------------------------------------------*/

    /**
     * Returns an object whose boolean fields indicate which actions are
     * **currently held** (continuous / level-triggered).  Ideal for movement.
     * @returns {ActionState}
     */
    getPlayerInput() {
        return {
            left:    this.isHeld('left'),
            right:   this.isHeld('right'),
            up:      this.isHeld('up'),
            down:    this.isHeld('down'),
            punch:   this.isHeld('punch'),
            kick:    this.isHeld('kick'),
            block:   this.isHeld('block'),
            special: this.isHeld('special')
        };
    }

    /**
     * Returns an object whose boolean fields indicate which actions were
     * **just pressed** this frame (edge-triggered / single-fire).  Ideal for
     * attacks and other discrete actions.
     * @returns {ActionState}
     */
    getPlayerActions() {
        return {
            left:    this.wasPressed('left'),
            right:   this.wasPressed('right'),
            up:      this.wasPressed('up'),
            down:    this.wasPressed('down'),
            punch:   this.wasPressed('punch'),
            kick:    this.wasPressed('kick'),
            block:   this.wasPressed('block'),
            special: this.wasPressed('special')
        };
    }

    /* ------------------------------------------------------------------
     *  Input buffer – for combo / sequence detection
     * ----------------------------------------------------------------*/

    /**
     * Record an action in the input buffer with the current timestamp.
     * @param {string} action - Logical action name to buffer
     */
    addToBuffer(action) {
        this.inputBuffer.push({
            action,
            timestamp: performance.now()
        });
    }

    /**
     * Check whether a specific **ordered sequence** of actions has been
     * performed recently (all entries still within `bufferDuration` of now).
     *
     * The sequence must appear in order inside the buffer, but non-matching
     * entries between them are allowed (lenient matching).
     *
     * @param {string[]} sequence - e.g. ['down', 'right', 'punch']
     * @returns {boolean} `true` if the full sequence is found in the buffer
     *
     * @example
     *   // Fireball motion: ↓ → Punch
     *   if (input.checkBufferSequence(['down', 'right', 'punch'])) {
     *       player.doFireball();
     *   }
     */
    checkBufferSequence(sequence) {
        if (!sequence || sequence.length === 0) return false;

        const now = performance.now();

        // Only consider entries that are still fresh.
        const fresh = this.inputBuffer.filter(
            entry => (now - entry.timestamp) <= this.bufferDuration
        );

        if (fresh.length < sequence.length) return false;

        // Walk through the buffer looking for each element of the sequence
        // in order (but not necessarily consecutively).
        let seqIdx = 0;
        for (let i = 0; i < fresh.length; i++) {
            if (fresh[i].action === sequence[seqIdx]) {
                seqIdx++;
                if (seqIdx === sequence.length) {
                    return true;
                }
            }
        }

        return false;
    }

    /* ------------------------------------------------------------------
     *  Cleanup
     * ----------------------------------------------------------------*/

    /**
     * Remove all event listeners. Call this when the game is being
     * torn down or the input manager is no longer needed.
     */
    destroy() {
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup',   this._onKeyUp);

        this.keys          = {};
        this.justPressed   = {};
        this.justReleased  = {};
        this._prevKeys     = {};
        this.inputBuffer   = [];
    }
}
