// ui.js - UI/HUD system for Shadow Fight game
// Handles all UI overlays, menus, and HUD elements with dark atmospheric Shadow Fight 2 style

import { CANVAS_WIDTH, CANVAS_HEIGHT, lerp, easeOutCubic, easeInOut } from './utils.js';

export class UI {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Menu state
        this.selectedMenuItem = 0;
        this.menuItems = ['FIGHT', 'TRAINING', 'DIFFICULTY', 'RESET AI'];
        this.difficulty = 'medium'; // easy, medium, hard

        // Announcement system
        this.announcement = null; // { text, timer, duration, style }

        // Combo display
        this.comboDisplay = null; // { count, timer, x, y }

        // Stats panel (shows RL stats)
        this.showStats = false;

        // Tutorial hints
        this.showControls = true;
        this.controlsFadeTimer = 10; // seconds to show controls

        // Ambient particle effects for menus
        this._menuParticles = [];
        for (let i = 0; i < 40; i++) {
            this._menuParticles.push({
                x: Math.random() * CANVAS_WIDTH,
                y: Math.random() * CANVAS_HEIGHT,
                vx: (Math.random() - 0.5) * 15,
                vy: -Math.random() * 20 - 5,
                size: Math.random() * 2.5 + 0.5,
                alpha: Math.random() * 0.5 + 0.1,
                life: Math.random()
            });
        }

        // Pulse timer for animated glows
        this._pulseTime = 0;
    }

    // =========================================================================
    // MAIN MENU
    // =========================================================================

    /**
     * Draw the main menu screen.
     * Dark atmospheric background with game title "SHADOW FIGHT" in large glowing text.
     * Menu items with glow highlight on selected. Controls info at bottom.
     * @param {number} selectedIndex - Currently highlighted menu item index
     */
    drawMainMenu(selectedIndex) {
        const ctx = this.ctx;

        // --- Dark atmospheric background ---
        const bgGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
        bgGrad.addColorStop(0, '#0a0a12');
        bgGrad.addColorStop(0.5, '#0d0d1a');
        bgGrad.addColorStop(1, '#050510');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Subtle radial vignette
        const vignetteGrad = ctx.createRadialGradient(
            CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_HEIGHT * 0.2,
            CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_HEIGHT * 0.9
        );
        vignetteGrad.addColorStop(0, 'rgba(20, 20, 50, 0.0)');
        vignetteGrad.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
        ctx.fillStyle = vignetteGrad;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Ambient floating particles
        this._drawMenuParticles(ctx);

        // Horizontal decorative line behind title
        const lineY = 145;
        const lineGrad = ctx.createLinearGradient(CANVAS_WIDTH * 0.15, 0, CANVAS_WIDTH * 0.85, 0);
        lineGrad.addColorStop(0, 'rgba(100, 180, 255, 0)');
        lineGrad.addColorStop(0.3, 'rgba(100, 180, 255, 0.25)');
        lineGrad.addColorStop(0.5, 'rgba(100, 180, 255, 0.5)');
        lineGrad.addColorStop(0.7, 'rgba(100, 180, 255, 0.25)');
        lineGrad.addColorStop(1, 'rgba(100, 180, 255, 0)');
        ctx.fillStyle = lineGrad;
        ctx.fillRect(CANVAS_WIDTH * 0.15, lineY, CANVAS_WIDTH * 0.7, 1);

        // --- Title: "SHADOW FIGHT" ---
        const pulse = Math.sin(this._pulseTime * 1.5) * 0.15 + 0.85;
        this.drawGlowText('SHADOW FIGHT', CANVAS_WIDTH / 2, 110,
            72, `rgba(200, 220, 255, ${pulse})`, 'rgba(80, 140, 255, 0.9)', 'center');

        // Subtitle
        ctx.save();
        ctx.font = '14px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(120, 150, 200, 0.6)';
        ctx.letterSpacing = '6px';
        ctx.fillText('AI  COMBAT  ARENA', CANVAS_WIDTH / 2, 155);
        ctx.restore();

        // --- Menu Items ---
        const menuStartY = 230;
        const menuSpacing = 65;
        for (let i = 0; i < this.menuItems.length; i++) {
            const y = menuStartY + i * menuSpacing;
            const isSelected = i === selectedIndex;
            this.drawMenuItem(this.menuItems[i], CANVAS_WIDTH / 2, y, isSelected, 320, 50);
        }

        // --- Controls info at bottom ---
        ctx.save();
        ctx.font = '13px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(100, 130, 170, 0.5)';
        ctx.fillText('↑↓ Navigate   •   ENTER Select   •   TAB RL Stats', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 30);
        ctx.restore();

        // --- Version ---
        ctx.save();
        ctx.font = '11px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = 'rgba(80, 100, 140, 0.35)';
        ctx.fillText('v1.0', CANVAS_WIDTH - 15, CANVAS_HEIGHT - 10);
        ctx.restore();
    }

    // =========================================================================
    // HUD (In-Game)
    // =========================================================================

    /**
     * Draw the HUD during gameplay.
     * Health bars, special meters, round counter, timer, combo counters.
     */
    drawHUD(playerHealth, playerMaxHealth, playerSpecial, playerMaxSpecial,
            aiHealth, aiMaxHealth, aiSpecial, aiMaxSpecial,
            round, maxRounds, timer, playerCombo, aiCombo) {
        const ctx = this.ctx;

        // ---- Health Bars ----
        const hpBarWidth = 400;
        const hpBarHeight = 22;
        const hpBarY = 22;
        const hpPadding = 30;

        // Player health (left side, fills right-to-left so damage appears from right)
        const playerHpX = hpPadding;
        this._drawHealthBar(playerHpX, hpBarY, hpBarWidth, hpBarHeight,
            playerHealth, playerMaxHealth, 'left');

        // AI health (right side, fills left-to-right so damage appears from left)
        const aiHpX = CANVAS_WIDTH - hpPadding - hpBarWidth;
        this._drawHealthBar(aiHpX, hpBarY, hpBarWidth, hpBarHeight,
            aiHealth, aiMaxHealth, 'right');

        // ---- Names ----
        ctx.save();
        ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
        ctx.textBaseline = 'bottom';

        // Player name
        ctx.textAlign = 'left';
        ctx.shadowColor = 'rgba(60, 140, 255, 0.7)';
        ctx.shadowBlur = 6;
        ctx.fillStyle = 'rgba(150, 200, 255, 0.9)';
        ctx.fillText('PLAYER', playerHpX, hpBarY - 3);

        // AI name
        ctx.textAlign = 'right';
        ctx.shadowColor = 'rgba(255, 60, 60, 0.7)';
        ctx.fillStyle = 'rgba(255, 150, 150, 0.9)';
        ctx.fillText('AI SHADOW', aiHpX + hpBarWidth, hpBarY - 3);
        ctx.restore();

        // ---- Special Meter Bars ----
        const spBarWidth = 200;
        const spBarHeight = 6;
        const spBarY = hpBarY + hpBarHeight + 5;

        // Player special meter
        this.drawProgressBar(playerHpX, spBarY, spBarWidth, spBarHeight,
            playerSpecial, playerMaxSpecial,
            'rgba(160, 80, 255, 0.9)', 'rgba(140, 60, 255, 0.7)');

        // AI special meter
        this.drawProgressBar(CANVAS_WIDTH - hpPadding - spBarWidth, spBarY, spBarWidth, spBarHeight,
            aiSpecial, aiMaxSpecial,
            'rgba(160, 80, 255, 0.9)', 'rgba(140, 60, 255, 0.7)');

        // ---- Center HUD: Round counter ----
        const centerX = CANVAS_WIDTH / 2;
        ctx.save();
        ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(200, 200, 255, 0.5)';
        ctx.shadowBlur = 8;
        ctx.fillStyle = 'rgba(180, 190, 220, 0.85)';
        ctx.fillText(`ROUND ${round}/${maxRounds}`, centerX, 20);
        ctx.restore();

        // ---- Center HUD: Timer ----
        const timerSeconds = Math.max(0, Math.ceil(timer));
        const timerColor = timerSeconds <= 10
            ? `rgba(255, ${80 + Math.sin(this._pulseTime * 6) * 80}, 80, 0.95)`
            : 'rgba(220, 230, 255, 0.9)';
        this.drawGlowText(String(timerSeconds), centerX, 50,
            32, timerColor, timerSeconds <= 10 ? 'rgba(255, 50, 50, 0.5)' : 'rgba(100, 140, 200, 0.3)', 'center');

        // ---- Combo Counters ----
        if (playerCombo && playerCombo.count >= 2) {
            this.drawComboCounter(playerCombo.count, playerCombo.x || 200, playerCombo.y || 180, playerCombo.timer || 1);
        }
        if (aiCombo && aiCombo.count >= 2) {
            this.drawComboCounter(aiCombo.count, aiCombo.x || CANVAS_WIDTH - 200, aiCombo.y || 180, aiCombo.timer || 1);
        }
    }

    /**
     * Internal helper to draw a health bar with gradient fill that changes color
     * based on remaining health percentage (green → yellow → red).
     */
    _drawHealthBar(x, y, width, height, health, maxHealth, side) {
        const ctx = this.ctx;
        const ratio = Math.max(0, Math.min(1, health / maxHealth));

        // Background
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.strokeStyle = 'rgba(60, 80, 120, 0.4)';
        ctx.lineWidth = 1;
        this._roundRect(ctx, x, y, width, height, 3);
        ctx.fill();
        ctx.stroke();

        // Health fill
        if (ratio > 0) {
            const fillWidth = width * ratio;
            // Choose gradient based on health percentage
            let fillGrad;
            if (side === 'left') {
                // Player: fill from left, damage removes from right
                fillGrad = ctx.createLinearGradient(x, 0, x + fillWidth, 0);
            } else {
                // AI: fill from right, damage removes from left
                fillGrad = ctx.createLinearGradient(x + width - fillWidth, 0, x + width, 0);
            }

            if (ratio > 0.6) {
                fillGrad.addColorStop(0, 'rgba(40, 200, 80, 0.9)');
                fillGrad.addColorStop(1, 'rgba(80, 220, 120, 0.9)');
            } else if (ratio > 0.3) {
                fillGrad.addColorStop(0, 'rgba(220, 200, 40, 0.9)');
                fillGrad.addColorStop(1, 'rgba(240, 220, 60, 0.9)');
            } else {
                fillGrad.addColorStop(0, 'rgba(220, 50, 40, 0.9)');
                fillGrad.addColorStop(1, 'rgba(255, 80, 60, 0.9)');
            }

            ctx.fillStyle = fillGrad;

            // Glow effect
            const glowColor = ratio > 0.6 ? 'rgba(40, 200, 80, 0.5)'
                : ratio > 0.3 ? 'rgba(220, 200, 40, 0.5)'
                : 'rgba(220, 50, 40, 0.6)';
            ctx.shadowColor = glowColor;
            ctx.shadowBlur = 8;

            if (side === 'left') {
                this._roundRect(ctx, x, y, fillWidth, height, 3);
            } else {
                this._roundRect(ctx, x + width - fillWidth, y, fillWidth, height, 3);
            }
            ctx.fill();

            // Shine highlight on top half
            ctx.shadowBlur = 0;
            const shineGrad = ctx.createLinearGradient(0, y, 0, y + height * 0.5);
            shineGrad.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
            shineGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = shineGrad;
            if (side === 'left') {
                this._roundRect(ctx, x, y, fillWidth, height * 0.5, 3);
            } else {
                this._roundRect(ctx, x + width - fillWidth, y, fillWidth, height * 0.5, 3);
            }
            ctx.fill();
        }

        // HP text
        ctx.shadowBlur = 0;
        ctx.font = 'bold 11px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fillText(`${Math.ceil(health)} / ${maxHealth}`, x + width / 2, y + height / 2 + 1);
        ctx.restore();
    }

    // =========================================================================
    // ANNOUNCEMENTS
    // =========================================================================

    /**
     * Draw a round announcement overlay.
     * Large text in center: "ROUND 1", "FIGHT!", "K.O.!", "YOU WIN!", "YOU LOSE!", "DRAW!"
     * Animated: scales in, holds, fades out.
     * @param {string} text - Announcement text
     * @param {number} progress - Animation progress 0 to 1
     */
    drawAnnouncement(text, progress) {
        const ctx = this.ctx;
        ctx.save();

        // Semi-transparent overlay
        const overlayAlpha = progress < 0.2
            ? easeOutCubic(progress / 0.2) * 0.4
            : progress > 0.8
                ? (1 - easeOutCubic((progress - 0.8) / 0.2)) * 0.4
                : 0.4;
        ctx.fillStyle = `rgba(0, 0, 0, ${overlayAlpha})`;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Scale and alpha animation
        let scale, alpha;
        if (progress < 0.15) {
            // Scale in
            const t = easeOutCubic(progress / 0.15);
            scale = lerp(2.5, 1, t);
            alpha = t;
        } else if (progress < 0.75) {
            // Hold
            scale = 1;
            alpha = 1;
        } else {
            // Fade/scale out
            const t = easeOutCubic((progress - 0.75) / 0.25);
            scale = lerp(1, 0.85, t);
            alpha = 1 - t;
        }

        // Determine color based on text content
        let color, glowColor;
        const upperText = text.toUpperCase();
        if (upperText.includes('WIN')) {
            color = `rgba(80, 255, 140, ${alpha})`;
            glowColor = `rgba(40, 200, 100, ${alpha * 0.9})`;
        } else if (upperText.includes('LOSE')) {
            color = `rgba(255, 80, 80, ${alpha})`;
            glowColor = `rgba(200, 40, 40, ${alpha * 0.9})`;
        } else if (upperText.includes('K.O')) {
            color = `rgba(255, 200, 60, ${alpha})`;
            glowColor = `rgba(255, 150, 30, ${alpha * 0.9})`;
        } else if (upperText.includes('FIGHT')) {
            color = `rgba(255, 220, 100, ${alpha})`;
            glowColor = `rgba(255, 180, 50, ${alpha * 0.9})`;
        } else if (upperText.includes('DRAW')) {
            color = `rgba(180, 180, 220, ${alpha})`;
            glowColor = `rgba(120, 120, 180, ${alpha * 0.9})`;
        } else {
            color = `rgba(200, 220, 255, ${alpha})`;
            glowColor = `rgba(100, 150, 255, ${alpha * 0.9})`;
        }

        ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
        ctx.scale(scale, scale);

        // Draw glow layers
        ctx.font = `bold 80px "Segoe UI", Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 40;
        ctx.fillStyle = color;
        ctx.fillText(text, 0, 0);
        // Double pass for stronger glow
        ctx.fillText(text, 0, 0);

        // Inner bright core
        ctx.shadowBlur = 10;
        ctx.fillText(text, 0, 0);

        ctx.restore();
    }

    /**
     * Update announcement timer.
     * @param {number} dt - Delta time in seconds
     * @returns {boolean} True if announcement is still active
     */
    updateAnnouncement(dt) {
        if (!this.announcement) return false;
        this.announcement.timer -= dt;
        if (this.announcement.timer <= 0) {
            this.announcement = null;
            return false;
        }
        return true;
    }

    /**
     * Show a new announcement.
     * @param {string} text - Text to display
     * @param {number} duration - Duration in seconds
     * @param {string} style - Style variant ('default', 'victory', 'defeat')
     */
    showAnnouncement(text, duration = 2, style = 'default') {
        this.announcement = {
            text,
            timer: duration,
            duration,
            style
        };
    }

    // =========================================================================
    // COMBO COUNTER
    // =========================================================================

    /**
     * Draw combo counter floating text.
     * Shows "X HIT COMBO!" with scaling animation near the fighter.
     * @param {number} count - Combo hit count
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {number} timer - Remaining display time (0-1 normalized or seconds)
     */
    drawComboCounter(count, x, y, timer) {
        const ctx = this.ctx;
        const alpha = Math.min(1, timer);
        const scale = 1 + easeOutCubic(1 - Math.min(1, timer)) * 0.3;
        const floatY = y - (1 - alpha) * 30;

        ctx.save();
        ctx.translate(x, floatY);
        ctx.scale(scale, scale);

        // Count number (large)
        const size = Math.min(48, 28 + count * 3);
        const countColor = count >= 5
            ? `rgba(255, 200, 50, ${alpha})`
            : `rgba(255, 255, 255, ${alpha})`;
        const countGlow = count >= 5
            ? `rgba(255, 150, 0, ${alpha * 0.8})`
            : `rgba(100, 180, 255, ${alpha * 0.7})`;

        ctx.font = `bold ${size}px "Segoe UI", Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = countGlow;
        ctx.shadowBlur = 16;
        ctx.fillStyle = countColor;
        ctx.fillText(`${count}`, 0, -10);

        // "HIT COMBO!" text (smaller, below number)
        ctx.font = `bold 14px "Segoe UI", Arial, sans-serif`;
        ctx.shadowBlur = 8;
        ctx.fillStyle = `rgba(200, 220, 255, ${alpha * 0.9})`;
        ctx.fillText('HIT COMBO!', 0, 14);

        ctx.restore();
    }

    // =========================================================================
    // GAME OVER SCREEN
    // =========================================================================

    /**
     * Draw game over screen.
     * Shows winner with dramatic reveal, stats, and replay options.
     * @param {string} winner - 'player' or 'ai' or 'draw'
     * @param {object} stats - Game statistics
     * @param {number} selectedOption - Currently selected option (0=Play Again, 1=Main Menu)
     */
    drawGameOver(winner, stats, selectedOption) {
        const ctx = this.ctx;

        // Dark overlay
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Result text
        let resultText, resultColor, resultGlow;
        if (winner === 'player') {
            resultText = 'VICTORY';
            resultColor = 'rgba(80, 255, 160, 0.95)';
            resultGlow = 'rgba(40, 200, 100, 0.8)';
        } else if (winner === 'ai') {
            resultText = 'DEFEAT';
            resultColor = 'rgba(255, 80, 80, 0.95)';
            resultGlow = 'rgba(200, 40, 40, 0.8)';
        } else {
            resultText = 'DRAW';
            resultColor = 'rgba(180, 180, 220, 0.95)';
            resultGlow = 'rgba(120, 120, 180, 0.8)';
        }

        this.drawGlowText(resultText, CANVAS_WIDTH / 2, 100, 64, resultColor, resultGlow, 'center');

        // Decorative line
        const lineGrad = ctx.createLinearGradient(CANVAS_WIDTH * 0.25, 0, CANVAS_WIDTH * 0.75, 0);
        lineGrad.addColorStop(0, 'rgba(100, 150, 220, 0)');
        lineGrad.addColorStop(0.5, 'rgba(100, 150, 220, 0.4)');
        lineGrad.addColorStop(1, 'rgba(100, 150, 220, 0)');
        ctx.fillStyle = lineGrad;
        ctx.fillRect(CANVAS_WIDTH * 0.25, 140, CANVAS_WIDTH * 0.5, 1);

        // Stats panel
        if (stats) {
            const statX = CANVAS_WIDTH / 2;
            let statY = 180;
            const lineH = 28;

            ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(100, 150, 255, 0.4)';
            ctx.shadowBlur = 6;
            ctx.fillStyle = 'rgba(140, 170, 220, 0.85)';
            ctx.fillText('— BATTLE STATS —', statX, statY);
            statY += lineH + 8;

            ctx.shadowBlur = 0;
            ctx.font = '14px "Segoe UI", Arial, sans-serif';
            const statItems = [
                ['Rounds Won', `${stats.playerRoundsWon || 0} - ${stats.aiRoundsWon || 0}`],
                ['Damage Dealt', `${stats.playerDamage || 0}`],
                ['Damage Taken', `${stats.aiDamage || 0}`],
                ['Max Combo', `${stats.maxCombo || 0} Hits`],
                ['Fight Duration', `${stats.duration || 0}s`],
            ];

            for (const [label, value] of statItems) {
                // Label
                ctx.textAlign = 'right';
                ctx.fillStyle = 'rgba(140, 160, 200, 0.7)';
                ctx.fillText(label, statX - 15, statY);
                // Value
                ctx.textAlign = 'left';
                ctx.fillStyle = 'rgba(200, 220, 255, 0.9)';
                ctx.fillText(value, statX + 15, statY);
                statY += lineH;
            }

            // RL stats if available
            if (stats.rlStats) {
                statY += 10;
                ctx.textAlign = 'center';
                ctx.fillStyle = 'rgba(160, 120, 255, 0.7)';
                ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
                ctx.fillText('— AI LEARNING —', statX, statY);
                statY += lineH;
                ctx.font = '13px "Segoe UI", Arial, sans-serif';

                const rlItems = [
                    ['Episodes', `${stats.rlStats.episodes || 0}`],
                    ['Win Rate', `${((stats.rlStats.winRate || 0) * 100).toFixed(1)}%`],
                    ['Epsilon', `${(stats.rlStats.epsilon || 0).toFixed(3)}`],
                ];
                for (const [label, value] of rlItems) {
                    ctx.textAlign = 'right';
                    ctx.fillStyle = 'rgba(140, 120, 200, 0.6)';
                    ctx.fillText(label, statX - 15, statY);
                    ctx.textAlign = 'left';
                    ctx.fillStyle = 'rgba(180, 160, 255, 0.85)';
                    ctx.fillText(value, statX + 15, statY);
                    statY += lineH - 4;
                }
            }
        }

        // Options
        const optionY = CANVAS_HEIGHT - 110;
        this.drawMenuItem('PLAY AGAIN', CANVAS_WIDTH / 2, optionY, selectedOption === 0, 280, 45);
        this.drawMenuItem('MAIN MENU', CANVAS_WIDTH / 2, optionY + 60, selectedOption === 1, 280, 45);

        ctx.restore();
    }

    // =========================================================================
    // PAUSE OVERLAY
    // =========================================================================

    /**
     * Draw pause overlay.
     * Semi-transparent dark overlay with "PAUSED" text and options.
     * @param {number} selectedOption - Currently selected option (0=Resume, 1=Main Menu)
     */
    drawPauseOverlay(selectedOption) {
        const ctx = this.ctx;
        ctx.save();

        // Dark overlay
        ctx.fillStyle = 'rgba(0, 0, 5, 0.7)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // "PAUSED" title
        this.drawGlowText('PAUSED', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 80,
            56, 'rgba(180, 200, 240, 0.9)', 'rgba(80, 120, 200, 0.6)', 'center');

        // Options
        this.drawMenuItem('RESUME', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 10, selectedOption === 0, 280, 48);
        this.drawMenuItem('MAIN MENU', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 70, selectedOption === 1, 280, 48);

        // Hint
        ctx.font = '12px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(100, 120, 160, 0.5)';
        ctx.fillText('Press ESC to resume', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 130);

        ctx.restore();
    }

    // =========================================================================
    // RL STATS PANEL
    // =========================================================================

    /**
     * Draw RL stats panel (toggled with Tab key).
     * Shows: States explored, Epsilon, Episodes, Win rate, Episode reward.
     * Small semi-transparent panel in corner.
     * @param {object} rlStats - RL statistics object
     */
    drawRLStats(rlStats) {
        if (!rlStats) return;
        const ctx = this.ctx;
        ctx.save();

        const panelW = 220;
        const panelH = 190;
        const panelX = CANVAS_WIDTH - panelW - 10;
        const panelY = 60;

        // Panel background
        ctx.fillStyle = 'rgba(5, 5, 20, 0.8)';
        ctx.strokeStyle = 'rgba(80, 100, 180, 0.3)';
        ctx.lineWidth = 1;
        this._roundRect(ctx, panelX, panelY, panelW, panelH, 6);
        ctx.fill();
        ctx.stroke();

        // Header
        ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(100, 140, 255, 0.5)';
        ctx.shadowBlur = 6;
        ctx.fillStyle = 'rgba(120, 160, 255, 0.9)';
        ctx.fillText('AI BRAIN STATS', panelX + panelW / 2, panelY + 18);
        ctx.shadowBlur = 0;

        // Divider
        ctx.fillStyle = 'rgba(80, 100, 180, 0.3)';
        ctx.fillRect(panelX + 10, panelY + 32, panelW - 20, 1);

        // Stats
        const items = [
            ['States Explored', `${(rlStats.statesExplored || 0).toLocaleString()}`],
            ['Epsilon (ε)', `${(rlStats.epsilon || 0).toFixed(4)}`],
            ['Episodes', `${rlStats.episodes || 0}`],
            ['Win Rate', `${((rlStats.winRate || 0) * 100).toFixed(1)}%`],
            ['Avg Reward', `${(rlStats.avgReward || 0).toFixed(2)}`],
            ['Episode Reward', `${(rlStats.episodeReward || 0).toFixed(2)}`],
        ];

        ctx.font = '12px "Segoe UI", Arial, sans-serif';
        let sy = panelY + 50;
        for (const [label, value] of items) {
            ctx.textAlign = 'left';
            ctx.fillStyle = 'rgba(130, 150, 190, 0.7)';
            ctx.fillText(label, panelX + 12, sy);

            ctx.textAlign = 'right';
            ctx.fillStyle = 'rgba(180, 200, 255, 0.9)';
            ctx.fillText(value, panelX + panelW - 12, sy);
            sy += 22;
        }

        // Toggle hint
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(90, 110, 150, 0.45)';
        ctx.font = '10px "Segoe UI", Arial, sans-serif';
        ctx.fillText('Press TAB to hide', panelX + panelW / 2, panelY + panelH - 10);

        ctx.restore();
    }

    // =========================================================================
    // CONTROLS HELP
    // =========================================================================

    /**
     * Draw controls help overlay.
     * Shows key bindings at bottom of screen. Fades out after a few seconds.
     * @param {number} alpha - Opacity 0 to 1
     */
    drawControls(alpha) {
        if (alpha <= 0) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.globalAlpha = alpha;

        const panelW = 500;
        const panelH = 95;
        const panelX = (CANVAS_WIDTH - panelW) / 2;
        const panelY = CANVAS_HEIGHT - panelH - 10;

        // Background
        ctx.fillStyle = 'rgba(5, 5, 20, 0.75)';
        ctx.strokeStyle = 'rgba(80, 100, 160, 0.25)';
        ctx.lineWidth = 1;
        this._roundRect(ctx, panelX, panelY, panelW, panelH, 8);
        ctx.fill();
        ctx.stroke();

        // Title
        ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(140, 170, 220, 0.8)';
        ctx.fillText('CONTROLS', CANVAS_WIDTH / 2, panelY + 16);

        // Key bindings
        const controls = [
            ['A / D', 'Move'],
            ['W', 'Jump'],
            ['S', 'Crouch'],
            ['J', 'Punch'],
            ['K', 'Kick'],
            ['L', 'Special'],
            ['ESC', 'Pause'],
        ];

        ctx.font = '11px "Segoe UI", Arial, sans-serif';
        const startX = panelX + 30;
        const colW = (panelW - 60) / 4;
        let cx = startX;
        let cy = panelY + 40;
        let col = 0;

        for (const [key, action] of controls) {
            // Key box
            const keyW = ctx.measureText(key).width + 12;
            ctx.fillStyle = 'rgba(60, 80, 130, 0.5)';
            this._roundRect(ctx, cx, cy - 9, keyW, 18, 3);
            ctx.fill();

            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(200, 220, 255, 0.9)';
            ctx.fillText(key, cx + keyW / 2, cy);

            // Action label
            ctx.textAlign = 'left';
            ctx.fillStyle = 'rgba(140, 160, 200, 0.7)';
            ctx.fillText(action, cx + keyW + 6, cy);

            col++;
            if (col >= 4) {
                col = 0;
                cx = startX;
                cy += 26;
            } else {
                cx += colW;
            }
        }

        ctx.restore();
    }

    // =========================================================================
    // DIFFICULTY MENU
    // =========================================================================

    /**
     * Draw difficulty selection sub-menu.
     * @param {string} currentDifficulty - Currently set difficulty
     * @param {number} selectedIndex - Currently highlighted option index
     */
    drawDifficultyMenu(currentDifficulty, selectedIndex) {
        const ctx = this.ctx;
        ctx.save();

        // Overlay
        ctx.fillStyle = 'rgba(0, 0, 5, 0.8)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Title
        this.drawGlowText('DIFFICULTY', CANVAS_WIDTH / 2, 120,
            48, 'rgba(200, 220, 255, 0.9)', 'rgba(80, 140, 255, 0.6)', 'center');

        const difficulties = ['EASY', 'MEDIUM', 'HARD'];
        const descriptions = [
            'Slower AI with simpler strategies',
            'Balanced AI with adaptive tactics',
            'Aggressive AI with advanced combos'
        ];
        const colors = [
            { main: 'rgba(80, 220, 120, 0.8)', glow: 'rgba(40, 180, 80, 0.5)' },
            { main: 'rgba(220, 200, 60, 0.8)', glow: 'rgba(180, 160, 30, 0.5)' },
            { main: 'rgba(255, 80, 60, 0.8)', glow: 'rgba(200, 50, 30, 0.5)' },
        ];

        const startY = 210;
        const spacing = 80;

        for (let i = 0; i < difficulties.length; i++) {
            const y = startY + i * spacing;
            const isSelected = i === selectedIndex;
            const isCurrent = difficulties[i].toLowerCase() === currentDifficulty;

            this.drawMenuItem(difficulties[i], CANVAS_WIDTH / 2, y, isSelected, 320, 48);

            // Current marker
            if (isCurrent) {
                ctx.font = 'bold 11px "Segoe UI", Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = colors[i].glow;
                ctx.shadowBlur = 6;
                ctx.fillStyle = colors[i].main;
                ctx.fillText('● CURRENT', CANVAS_WIDTH / 2, y + 30);
                ctx.shadowBlur = 0;
            }

            // Description
            ctx.font = '12px "Segoe UI", Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(120, 140, 180, 0.5)';
            ctx.fillText(descriptions[i], CANVAS_WIDTH / 2, y + (isCurrent ? 46 : 32));
        }

        // Back hint
        ctx.font = '12px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(100, 120, 160, 0.45)';
        ctx.fillText('Press ESC to go back', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 40);

        ctx.restore();
    }

    // =========================================================================
    // TRAINING UI
    // =========================================================================

    /**
     * Draw training mode UI (shows training progress, speed controls).
     * @param {object} trainingStats - Training statistics
     */
    drawTrainingUI(trainingStats) {
        if (!trainingStats) return;
        const ctx = this.ctx;
        ctx.save();

        const panelW = 300;
        const panelH = 170;
        const panelX = (CANVAS_WIDTH - panelW) / 2;
        const panelY = 15;

        // Panel background
        ctx.fillStyle = 'rgba(5, 5, 20, 0.85)';
        ctx.strokeStyle = 'rgba(120, 80, 200, 0.35)';
        ctx.lineWidth = 1;
        this._roundRect(ctx, panelX, panelY, panelW, panelH, 8);
        ctx.fill();
        ctx.stroke();

        // Title
        ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(140, 80, 255, 0.6)';
        ctx.shadowBlur = 8;
        ctx.fillStyle = 'rgba(180, 140, 255, 0.95)';
        ctx.fillText('TRAINING MODE', panelX + panelW / 2, panelY + 20);
        ctx.shadowBlur = 0;

        // Divider
        ctx.fillStyle = 'rgba(120, 80, 200, 0.25)';
        ctx.fillRect(panelX + 15, panelY + 35, panelW - 30, 1);

        // Stats
        const items = [
            ['Episode', `${trainingStats.episode || 0} / ${trainingStats.maxEpisodes || '∞'}`],
            ['Speed', `${trainingStats.speed || 1}x`],
            ['Win Rate', `${((trainingStats.winRate || 0) * 100).toFixed(1)}%`],
            ['Avg Reward', `${(trainingStats.avgReward || 0).toFixed(2)}`],
        ];

        ctx.font = '12px "Segoe UI", Arial, sans-serif';
        let sy = panelY + 55;
        for (const [label, value] of items) {
            ctx.textAlign = 'left';
            ctx.fillStyle = 'rgba(140, 120, 200, 0.7)';
            ctx.fillText(label, panelX + 18, sy);
            ctx.textAlign = 'right';
            ctx.fillStyle = 'rgba(200, 180, 255, 0.9)';
            ctx.fillText(value, panelX + panelW - 18, sy);
            sy += 22;
        }

        // Progress bar
        sy += 5;
        const progressRatio = trainingStats.maxEpisodes
            ? (trainingStats.episode || 0) / trainingStats.maxEpisodes
            : 0;
        this.drawProgressBar(panelX + 18, sy, panelW - 36, 8,
            progressRatio, 1,
            'rgba(160, 100, 255, 0.9)', 'rgba(140, 80, 255, 0.6)');

        // Speed controls hint
        ctx.font = '10px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(100, 90, 150, 0.45)';
        ctx.fillText('[+/-] Speed   •   [ESC] Stop Training', panelX + panelW / 2, panelY + panelH - 10);

        ctx.restore();
    }

    // =========================================================================
    // UPDATE
    // =========================================================================

    /**
     * Update UI timers and animations.
     * @param {number} dt - Delta time in seconds
     */
    update(dt) {
        this._pulseTime += dt;

        // Update announcement
        this.updateAnnouncement(dt);

        // Update controls fade
        if (this.showControls && this.controlsFadeTimer > 0) {
            this.controlsFadeTimer -= dt;
            if (this.controlsFadeTimer <= 0) {
                this.showControls = false;
            }
        }

        // Update menu particles
        for (const p of this._menuParticles) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt * 0.05;
            if (p.y < -10 || p.x < -10 || p.x > CANVAS_WIDTH + 10 || p.life <= 0) {
                p.x = Math.random() * CANVAS_WIDTH;
                p.y = CANVAS_HEIGHT + Math.random() * 20;
                p.vx = (Math.random() - 0.5) * 15;
                p.vy = -Math.random() * 20 - 5;
                p.alpha = Math.random() * 0.5 + 0.1;
                p.life = 1;
            }
        }
    }

    // =========================================================================
    // HELPER: Glow Text
    // =========================================================================

    /**
     * Draw text with a glow effect using ctx.shadowBlur.
     * @param {string} text - Text to draw
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {number} fontSize - Font size in pixels
     * @param {string} color - Text fill color
     * @param {string} glowColor - Shadow/glow color
     * @param {string} align - Text alignment ('center', 'left', 'right')
     */
    drawGlowText(text, x, y, fontSize, color, glowColor, align = 'center') {
        const ctx = this.ctx;
        ctx.save();

        ctx.font = `bold ${fontSize}px "Segoe UI", Arial, sans-serif`;
        ctx.textAlign = align;
        ctx.textBaseline = 'middle';

        // Outer glow (large blur)
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 25;
        ctx.fillStyle = color;
        ctx.fillText(text, x, y);

        // Mid glow (medium blur, re-draw for intensity)
        ctx.shadowBlur = 12;
        ctx.fillText(text, x, y);

        // Sharp core
        ctx.shadowBlur = 4;
        ctx.fillText(text, x, y);

        ctx.restore();
    }

    // =========================================================================
    // HELPER: Menu Item
    // =========================================================================

    /**
     * Draw a styled button/menu item.
     * @param {string} text - Button text
     * @param {number} x - Center X position
     * @param {number} y - Center Y position
     * @param {boolean} isSelected - Whether this item is currently highlighted
     * @param {number} width - Button width
     * @param {number} height - Button height
     */
    drawMenuItem(text, x, y, isSelected, width = 300, height = 50) {
        const ctx = this.ctx;
        ctx.save();

        const bx = x - width / 2;
        const by = y - height / 2;

        if (isSelected) {
            // Selected: brighter background with glow
            const selGrad = ctx.createLinearGradient(bx, by, bx + width, by);
            selGrad.addColorStop(0, 'rgba(40, 80, 180, 0.0)');
            selGrad.addColorStop(0.3, 'rgba(40, 80, 180, 0.25)');
            selGrad.addColorStop(0.5, 'rgba(60, 100, 200, 0.35)');
            selGrad.addColorStop(0.7, 'rgba(40, 80, 180, 0.25)');
            selGrad.addColorStop(1, 'rgba(40, 80, 180, 0.0)');
            ctx.fillStyle = selGrad;
            this._roundRect(ctx, bx, by, width, height, 6);
            ctx.fill();

            // Border glow
            ctx.shadowColor = 'rgba(80, 140, 255, 0.5)';
            ctx.shadowBlur = 10;
            ctx.strokeStyle = 'rgba(80, 140, 255, 0.5)';
            ctx.lineWidth = 1.5;
            this._roundRect(ctx, bx, by, width, height, 6);
            ctx.stroke();

            // Selection indicator arrows
            ctx.shadowBlur = 8;
            ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(100, 180, 255, 0.8)';
            const arrowPulse = Math.sin(this._pulseTime * 4) * 4;
            ctx.fillText('▸', bx - 18 - arrowPulse, y);
            ctx.fillText('◂', bx + width + 18 + arrowPulse, y);

            // Text (bright)
            ctx.shadowColor = 'rgba(100, 180, 255, 0.7)';
            ctx.shadowBlur = 12;
            ctx.font = `bold 20px "Segoe UI", Arial, sans-serif`;
            ctx.fillStyle = 'rgba(200, 230, 255, 0.95)';
            ctx.textAlign = 'center';
            ctx.fillText(text, x, y + 1);
        } else {
            // Unselected: subtle background
            ctx.fillStyle = 'rgba(20, 25, 50, 0.3)';
            this._roundRect(ctx, bx, by, width, height, 6);
            ctx.fill();

            ctx.strokeStyle = 'rgba(60, 80, 120, 0.2)';
            ctx.lineWidth = 1;
            this._roundRect(ctx, bx, by, width, height, 6);
            ctx.stroke();

            // Text (dimmer)
            ctx.font = `bold 18px "Segoe UI", Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(120, 140, 180, 0.6)';
            ctx.fillText(text, x, y + 1);
        }

        ctx.restore();
    }

    // =========================================================================
    // HELPER: Progress Bar
    // =========================================================================

    /**
     * Draw a progress bar with glow effect.
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {number} width - Total width
     * @param {number} height - Bar height
     * @param {number} value - Current value
     * @param {number} maxValue - Maximum value
     * @param {string} fillColor - Fill color
     * @param {string} glowColor - Glow color
     * @param {boolean} showText - Whether to show percentage text
     */
    drawProgressBar(x, y, width, height, value, maxValue, fillColor, glowColor, showText = false) {
        const ctx = this.ctx;
        const ratio = Math.max(0, Math.min(1, maxValue > 0 ? value / maxValue : 0));

        ctx.save();

        // Background track
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this._roundRect(ctx, x, y, width, height, height / 2);
        ctx.fill();

        // Fill
        if (ratio > 0) {
            const fillW = Math.max(height, width * ratio); // Min width = height so rounded ends look good
            ctx.shadowColor = glowColor;
            ctx.shadowBlur = 8;
            ctx.fillStyle = fillColor;
            this._roundRect(ctx, x, y, Math.min(fillW, width), height, height / 2);
            ctx.fill();

            // Shine
            ctx.shadowBlur = 0;
            const shineGrad = ctx.createLinearGradient(0, y, 0, y + height * 0.5);
            shineGrad.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
            shineGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = shineGrad;
            this._roundRect(ctx, x, y, Math.min(fillW, width), height * 0.5, height / 2);
            ctx.fill();
        }

        // Text
        if (showText) {
            ctx.shadowBlur = 0;
            ctx.font = `bold ${Math.max(9, height - 2)}px "Segoe UI", Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.fillText(`${Math.round(ratio * 100)}%`, x + width / 2, y + height / 2);
        }

        ctx.restore();
    }

    // =========================================================================
    // INTERNAL HELPERS
    // =========================================================================

    /**
     * Draw a rounded rectangle path.
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

    /**
     * Draw ambient menu particles (rising embers / dust motes).
     * @param {CanvasRenderingContext2D} ctx
     */
    _drawMenuParticles(ctx) {
        ctx.save();
        for (const p of this._menuParticles) {
            const a = p.alpha * Math.min(1, p.life);
            ctx.fillStyle = `rgba(80, 140, 255, ${a})`;
            ctx.shadowColor = `rgba(80, 140, 255, ${a * 0.5})`;
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}
