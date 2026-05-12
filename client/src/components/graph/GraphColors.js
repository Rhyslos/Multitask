// Color system for graph elements.
//
// Single source of truth. Every consumer that needs to know what color to
// paint an element — the renderer, the color picker, exports, hypothetical
// theme switchers — goes through this module. Changes here propagate
// automatically.
//
// Two palettes:
//   - STROKES: bright, saturated. Used for outlines and line/arrow strokes.
//   - FILLS:   pastel, low-saturation. Used for shape backgrounds.
//
// They're paired by semantic name (red, amber, emerald, etc.) so future
// features that want a "matched pair" can ask for one. Users can still mix
// any stroke with any fill — the pairing is just a default suggestion.
//
// Special values:
//   - NO_FILL sentinel ('transparent') means no fill paint at all. Treated
//     specially by the renderer (skips ctx.fill()).
//   - NO_STROKE sentinel ('none') means no outline. Skipped by the renderer.
//     Mostly meaningful for shapes, since arrows/lines with no stroke are
//     invisible.
//
// State flag precedence in resolveColors:
//   highlighted > selected > starter > user-set > default
// — i.e. interactive feedback always wins over the user's choice, because
// the alternative is invisible feedback when a user picks an unfortunate
// custom color.

export const NO_FILL = 'transparent';
export const NO_STROKE = 'none';

// Bright, "poppy" line colors. Tailwind-500ish saturation, plus pure black
// for legibility. Order is intentional — picker shows them in this order.
export const STROKES = [
    { name: 'ink',     hex: '#1e1e1e' }, // default ink
    { name: 'red',     hex: '#ef4444' },
    { name: 'orange',  hex: '#f97316' },
    { name: 'amber',   hex: '#eab308' },
    { name: 'emerald', hex: '#10b981' },
    { name: 'sky',     hex: '#0ea5e9' },
    { name: 'indigo',  hex: '#6366f1' },
    { name: 'violet',  hex: '#a855f7' },
    { name: 'pink',    hex: '#ec4899' },
];

// Pastel fills. Tailwind-50/100ish. Paired by name with STROKES — "red"
// stroke and "red" fill go together but neither requires the other.
export const FILLS = [
    { name: 'paper',   hex: '#fafaf9' }, // default neutral
    { name: 'red',     hex: '#fee2e2' },
    { name: 'orange',  hex: '#ffedd5' },
    { name: 'amber',   hex: '#fef3c7' },
    { name: 'emerald', hex: '#d1fae5' },
    { name: 'sky',     hex: '#e0f2fe' },
    { name: 'indigo',  hex: '#e0e7ff' },
    { name: 'violet',  hex: '#f3e8ff' },
    { name: 'pink',    hex: '#fce7f3' },
];

// State-feedback colors. These override user-set colors when the element
// is in the given state. Selected blue matches the historic UI accent.
export const STATE_COLORS = {
    default: {
        stroke: '#1e1e1e',
        fill:   '#fafaf9',
        lineWidth: 1.5,
    },
    selected: {
        stroke: '#3b82f6',
        fill:   '#eff6ff',
        lineWidth: 2,
    },
    highlighted: {
        stroke: '#f59e0b',
        fill:   '#fef3c7',
        lineWidth: 2.5,
    },
    starter: {
        stroke: '#10b981',
        fill:   '#ecfdf5',
        lineWidth: 2,
    },
};

export const HOVER_STROKE = 'rgba(59, 130, 246, 0.3)';

/**
 * Resolve final paint colors for an element.
 *
 * @param {object} element  - the graph element. Reads `stroke` and `fill` if present.
 * @param {object} flags    - { isSelected, isHighlighted, isStarter }
 * @returns {{ stroke: string, fill: string, lineWidth: number,
 *             skipFill: boolean, skipStroke: boolean }}
 *
 * skipFill/skipStroke are renderer hints — when true, the renderer omits
 * ctx.fill() / ctx.stroke() entirely instead of painting in the default.
 */
export function resolveColors(element, flags = {}) {
    const { isSelected, isHighlighted, isStarter } = flags;

    // State precedence. Highlighted (trace running) beats everything, then
    // selected, then starter. None of these read user-set colors — they
    // present unambiguous interactive feedback.
    if (isHighlighted) return { ...STATE_COLORS.highlighted, skipFill: false, skipStroke: false };
    if (isSelected)    return { ...STATE_COLORS.selected,    skipFill: false, skipStroke: false };
    if (isStarter)     return { ...STATE_COLORS.starter,     skipFill: false, skipStroke: false };

    // No state override: user-set colors take effect, falling back to default.
    const userStroke = element.stroke;
    const userFill   = element.fill;

    return {
        stroke:    userStroke && userStroke !== NO_STROKE ? userStroke : STATE_COLORS.default.stroke,
        fill:      userFill   && userFill   !== NO_FILL   ? userFill   : STATE_COLORS.default.fill,
        skipStroke: userStroke === NO_STROKE,
        skipFill:   userFill   === NO_FILL,
        lineWidth: STATE_COLORS.default.lineWidth,
    };
}

/**
 * Find the paired stroke for a given fill hex (or vice versa), or null if
 * the hex isn't in either palette. Useful for "make this matched" UI later.
 */
export function findPairedFill(strokeHex) {
    const stroke = STROKES.find(s => s.hex === strokeHex);
    if (!stroke) return null;
    const fill = FILLS.find(f => f.name === stroke.name);
    return fill ? fill.hex : null;
}

export function findPairedStroke(fillHex) {
    const fill = FILLS.find(f => f.hex === fillHex);
    if (!fill) return null;
    const stroke = STROKES.find(s => s.name === fill.name);
    return stroke ? stroke.hex : null;
}