
// sentinels
export const NO_FILL = 'transparent';
export const NO_STROKE = 'none';

// default palettes
export const STROKES = [
    { name: 'ink',     hex: '#1e1e1e' },
    { name: 'red',     hex: '#ef4444' },
    { name: 'orange',  hex: '#f97316' },
    { name: 'amber',   hex: '#eab308' },
    { name: 'emerald', hex: '#10b981' },
    { name: 'sky',     hex: '#0ea5e9' },
    { name: 'indigo',  hex: '#6366f1' },
    { name: 'violet',  hex: '#a855f7' },
    { name: 'pink',    hex: '#ec4899' },
];

export const FILLS = [
    { name: 'paper',   hex: '#fafaf9' },
    { name: 'red',     hex: '#fee2e2' },
    { name: 'orange',  hex: '#ffedd5' },
    { name: 'amber',   hex: '#fef3c7' },
    { name: 'emerald', hex: '#d1fae5' },
    { name: 'sky',     hex: '#e0f2fe' },
    { name: 'indigo',  hex: '#e0e7ff' },
    { name: 'violet',  hex: '#f3e8ff' },
    { name: 'pink',    hex: '#fce7f3' },
];

// state feedback themes
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

// color resolution logic
export function resolveColors(element, flags = {}) {
    const { isSelected, isHighlighted, isStarter } = flags;

    if (isHighlighted) return { ...STATE_COLORS.highlighted, skipFill: false, skipStroke: false };
    if (isSelected)    return { ...STATE_COLORS.selected,    skipFill: false, skipStroke: false };
    if (isStarter)     return { ...STATE_COLORS.starter,     skipFill: false, skipStroke: false };

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

// pairing utility functions
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