// utils.js - Shared utilities for Shadow Fight game
// Provides vector math, easing functions, collision detection, color utilities, and game constants.

// ============================================================================
// Constants
// ============================================================================

/** @constant {number} CANVAS_WIDTH - Width of the game canvas in pixels */
export const CANVAS_WIDTH = 1200;

/** @constant {number} CANVAS_HEIGHT - Height of the game canvas in pixels */
export const CANVAS_HEIGHT = 600;

/** @constant {number} GROUND_Y - Y coordinate of the ground level */
export const GROUND_Y = 480;

/** @constant {number} GRAVITY - Gravity acceleration in pixels per second squared */
export const GRAVITY = 1800;

/** @constant {number} STAGE_LEFT - Left boundary of the stage */
export const STAGE_LEFT = 50;

/** @constant {number} STAGE_RIGHT - Right boundary of the stage */
export const STAGE_RIGHT = 1150;

// ============================================================================
// Vector2 Class
// ============================================================================

/**
 * 2D Vector class for position, velocity, and force calculations.
 */
export class Vector2 {
    /**
     * Create a new Vector2.
     * @param {number} [x=0] - The x component.
     * @param {number} [y=0] - The y component.
     */
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    /**
     * Add another vector to this one.
     * @param {Vector2} v - The vector to add.
     * @returns {Vector2} A new Vector2 representing the sum.
     */
    add(v) {
        return new Vector2(this.x + v.x, this.y + v.y);
    }

    /**
     * Subtract another vector from this one.
     * @param {Vector2} v - The vector to subtract.
     * @returns {Vector2} A new Vector2 representing the difference.
     */
    sub(v) {
        return new Vector2(this.x - v.x, this.y - v.y);
    }

    /**
     * Scale this vector by a scalar value.
     * @param {number} s - The scalar to multiply by.
     * @returns {Vector2} A new scaled Vector2.
     */
    scale(s) {
        return new Vector2(this.x * s, this.y * s);
    }

    /**
     * Calculate the magnitude (length) of this vector.
     * @returns {number} The magnitude of the vector.
     */
    magnitude() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    /**
     * Return a normalized (unit length) version of this vector.
     * If the vector has zero length, returns a zero vector.
     * @returns {Vector2} A new normalized Vector2.
     */
    normalize() {
        const mag = this.magnitude();
        if (mag === 0) {
            return new Vector2(0, 0);
        }
        return new Vector2(this.x / mag, this.y / mag);
    }

    /**
     * Calculate the dot product of this vector with another.
     * @param {Vector2} v - The other vector.
     * @returns {number} The dot product.
     */
    dot(v) {
        return this.x * v.x + this.y * v.y;
    }

    /**
     * Calculate the Euclidean distance between two vectors.
     * @param {Vector2} a - The first vector.
     * @param {Vector2} b - The second vector.
     * @returns {number} The distance between a and b.
     */
    static distance(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Linearly interpolate between two vectors.
     * @param {Vector2} a - The start vector.
     * @param {Vector2} b - The end vector.
     * @param {number} t - Interpolation factor (0 = a, 1 = b).
     * @returns {Vector2} A new interpolated Vector2.
     */
    static lerp(a, b, t) {
        return new Vector2(
            a.x + (b.x - a.x) * t,
            a.y + (b.y - a.y) * t
        );
    }
}

// ============================================================================
// Math Utilities
// ============================================================================

/**
 * Linearly interpolate between two numbers.
 * @param {number} a - Start value.
 * @param {number} b - End value.
 * @param {number} t - Interpolation factor (0 = a, 1 = b).
 * @returns {number} The interpolated value.
 */
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * Clamp a number between a minimum and maximum value.
 * @param {number} v - The value to clamp.
 * @param {number} min - The minimum allowed value.
 * @param {number} max - The maximum allowed value.
 * @returns {number} The clamped value.
 */
export function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

/**
 * Generate a random floating-point number within a range.
 * @param {number} min - The minimum value (inclusive).
 * @param {number} max - The maximum value (exclusive).
 * @returns {number} A random float in [min, max).
 */
export function randomRange(min, max) {
    return min + Math.random() * (max - min);
}

/**
 * Generate a random integer within a range (inclusive on both ends).
 * @param {number} min - The minimum integer value (inclusive).
 * @param {number} max - The maximum integer value (inclusive).
 * @returns {number} A random integer in [min, max].
 */
export function randomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ============================================================================
// Easing Functions
// ============================================================================

/**
 * Smooth ease-in-out using a cubic Hermite curve (smoothstep).
 * @param {number} t - Input value, typically in [0, 1].
 * @returns {number} The eased value.
 */
export function easeInOut(t) {
    return t * t * (3 - 2 * t);
}

/**
 * Elastic ease-out with a bouncy overshoot effect.
 * Useful for impactful animations like hit reactions or UI pop-ins.
 * @param {number} t - Input value, typically in [0, 1].
 * @returns {number} The eased value.
 */
export function easeOutElastic(t) {
    if (t === 0) return 0;
    if (t === 1) return 1;
    const p = 0.3;
    const s = p / 4;
    return Math.pow(2, -10 * t) * Math.sin((t - s) * (2 * Math.PI) / p) + 1;
}

/**
 * Cubic ease-out for smooth deceleration.
 * @param {number} t - Input value, typically in [0, 1].
 * @returns {number} The eased value.
 */
export function easeOutCubic(t) {
    const t1 = t - 1;
    return t1 * t1 * t1 + 1;
}

// ============================================================================
// Collision Detection
// ============================================================================

/**
 * Test if two axis-aligned bounding boxes intersect.
 * @param {{x: number, y: number, w: number, h: number}} a - First AABB.
 * @param {{x: number, y: number, w: number, h: number}} b - Second AABB.
 * @returns {boolean} True if the AABBs overlap.
 */
export function aabbIntersect(a, b) {
    return (
        a.x < b.x + b.w &&
        a.x + a.w > b.x &&
        a.y < b.y + b.h &&
        a.y + a.h > b.y
    );
}

/**
 * Calculate the overlap area between two axis-aligned bounding boxes.
 * @param {{x: number, y: number, w: number, h: number}} a - First AABB.
 * @param {{x: number, y: number, w: number, h: number}} b - Second AABB.
 * @returns {{x: number, y: number, w: number, h: number, overlapX: number, overlapY: number}|null}
 *          The overlap rectangle with overlap amounts, or null if no overlap.
 */
export function aabbOverlap(a, b) {
    const overlapX1 = Math.max(a.x, b.x);
    const overlapY1 = Math.max(a.y, b.y);
    const overlapX2 = Math.min(a.x + a.w, b.x + b.w);
    const overlapY2 = Math.min(a.y + a.h, b.y + b.h);

    const overlapW = overlapX2 - overlapX1;
    const overlapH = overlapY2 - overlapY1;

    if (overlapW <= 0 || overlapH <= 0) {
        return null;
    }

    return {
        x: overlapX1,
        y: overlapY1,
        w: overlapW,
        h: overlapH,
        overlapX: overlapW,
        overlapY: overlapH
    };
}

// ============================================================================
// Angle Conversion
// ============================================================================

/**
 * Convert degrees to radians.
 * @param {number} deg - Angle in degrees.
 * @returns {number} Angle in radians.
 */
export function degToRad(deg) {
    return deg * (Math.PI / 180);
}

/**
 * Convert radians to degrees.
 * @param {number} rad - Angle in radians.
 * @returns {number} Angle in degrees.
 */
export function radToDeg(rad) {
    return rad * (180 / Math.PI);
}

// ============================================================================
// Color Utilities
// ============================================================================

/**
 * Create a CSS rgba() color string.
 * @param {number} r - Red channel (0-255).
 * @param {number} g - Green channel (0-255).
 * @param {number} b - Blue channel (0-255).
 * @param {number} [a=1] - Alpha channel (0-1).
 * @returns {string} A CSS rgba color string.
 */
export function rgba(r, g, b, a = 1) {
    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
}

/**
 * Convert HSL color values to RGB.
 * @param {number} h - Hue (0-1).
 * @param {number} s - Saturation (0-1).
 * @param {number} l - Lightness (0-1).
 * @returns {number[]} An array [r, g, b] with values in 0-255.
 */
export function hslToRgb(h, s, l) {
    let r, g, b;

    if (s === 0) {
        // Achromatic (grey)
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;

        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/**
 * Linearly interpolate between two RGB color arrays.
 * @param {number[]} color1 - Start color as [r, g, b] (0-255).
 * @param {number[]} color2 - End color as [r, g, b] (0-255).
 * @param {number} t - Interpolation factor (0 = color1, 1 = color2).
 * @returns {number[]} Interpolated color as [r, g, b].
 */
export function colorLerp(color1, color2, t) {
    return [
        Math.round(color1[0] + (color2[0] - color1[0]) * t),
        Math.round(color1[1] + (color2[1] - color1[1]) * t),
        Math.round(color1[2] + (color2[2] - color1[2]) * t)
    ];
}
