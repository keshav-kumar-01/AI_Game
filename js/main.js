/**
 * main.js — Entry Point
 *
 * Bootstraps the Shadow Fight game: creates the canvas, initializes the
 * GameEngine, and starts the game loop.
 */

import { GameEngine } from './engine.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './utils.js';

// ─── Boot ────────────────────────────────────────────────────────────────
function init() {
    const canvas = document.getElementById('gameCanvas');

    if (!canvas) {
        console.error('Canvas element #gameCanvas not found!');
        return;
    }

    // Set canvas size
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    // Create and start the game engine
    const engine = new GameEngine(canvas);
    engine.start();

    // Expose for debugging
    window.__shadowFight = engine;

    // Wire on-screen touch and click buttons for easy accessible controls
    document.querySelectorAll('.t-btn').forEach(btn => {
        const key = btn.dataset.key;
        if (!key) return;

        const press = (e) => {
            e.preventDefault();
            window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        };
        const release = (e) => {
            e.preventDefault();
            window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
        };

        btn.addEventListener('mousedown', press);
        btn.addEventListener('mouseup', release);
        btn.addEventListener('mouseleave', release);
        btn.addEventListener('touchstart', press, { passive: false });
        btn.addEventListener('touchend', release, { passive: false });
        btn.addEventListener('touchcancel', release, { passive: false });
    });

    console.log(
        '%c⚔ SHADOW FIGHT ⚔%c — Loaded!',
        'color: #4488ff; font-size: 18px; font-weight: bold;',
        'color: #888; font-size: 12px;'
    );
    console.log('Controls: Arrow keys/WASD to move | J/Z = Punch | K/X = Kick | L/C = Block | I/V = Special');
    console.log('Press Tab to toggle RL stats | Escape to pause | ` for debug hitboxes');
}

// Wait for DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
