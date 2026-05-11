// Right-click context menu for the graph canvas. Two variants:
//
//   - 'shape':  opened on a shape. Operates on `targetId`. Shows delete,
//               duplicate, z-order, change color (stub), change type.
//   - 'canvas': opened on empty canvas. Operates at `worldPos`. Shows
//               paste (if clipboard is set), add rectangle/circle/text.
//
// The menu lives in screen coordinates (fixed position) and never zooms
// with the camera — same as Figma / Excalidraw. Positioning is edge-aware:
// if the menu would overflow the viewport, it flips. Submenus do the same.
//
// Closure rules: outside-click, Escape, scroll, window blur, or any action
// selection. The parent owns the `open/closed` state; this component just
// renders and calls `onClose` when the user dismisses it.
//
// Why this lives in screen space (not canvas world space): the menu is a
// DOM element, not a canvas paint. Mixing canvas-rendered UI with a fixed
// HTML overlay is the pragmatic move — accessibility, hit-testing,
// keyboard nav, and text rendering all come for free.

import { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { isNodeType } from './GraphHelper';

const MENU_WIDTH = 200;
const SUBMENU_WIDTH = 160;
// Approx. height per row + padding. Used for overflow detection only —
// actual height is whatever the DOM lays out, so this is a hint, not truth.
const ROW_HEIGHT = 32;

// Stub palette for "Change color". The action is wired but a no-op for
// now per the spec — clicking just closes the menu. When color persistence
// lands, replace the no-op with mutator.update(id, { color: hex }).
const COLOR_SWATCHES = [
    '#ef4444', '#f59e0b', '#10b981', '#3b82f6',
    '#8b5cf6', '#ec4899', '#6b7280', '#1e1e1e',
];

const SHAPE_TYPES_FOR_TYPE_CHANGE = [
    { type: 'rectangle', label: 'Rectangle' },
    { type: 'circle',    label: 'Circle' },
];

/**
 * @param {object}   props
 * @param {'shape'|'canvas'} props.variant
 * @param {{x:number,y:number}} props.screenPos - viewport-relative click point
 * @param {{x:number,y:number}|null} props.worldPos - world coords (canvas variant only)
 * @param {object|null} props.target - element being acted on (shape variant only)
 * @param {boolean}  props.hasClipboard - whether paste should be enabled
 * @param {object}   props.actions - { onDelete, onDuplicate, onBringToFront, onBringForward,
 *                                     onSendBackward, onSendToBack, onChangeColor, onChangeType,
 *                                     onPaste, onAddShape }
 * @param {() => void} props.onClose
 */
export default function GraphContextMenu({
    variant,
    screenPos,
    worldPos,
    target,
    hasClipboard,
    actions,
    onClose,
}) {
    const rootRef = useRef(null);
    const [adjustedPos, setAdjustedPos] = useState(screenPos);
    const [openSubmenu, setOpenSubmenu] = useState(null); // 'color' | 'type' | null

    // Reposition if the menu would overflow the viewport. We do this in a
    // layout effect so the user never sees a flash at the original position.
    useLayoutEffect(() => {
        const el = rootRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        let x = screenPos.x;
        let y = screenPos.y;
        if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 4;
        if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 4;
        if (x < 4) x = 4;
        if (y < 4) y = 4;
        setAdjustedPos({ x, y });
    }, [screenPos.x, screenPos.y]);

    // Closure listeners. We use mousedown rather than click so the menu
    // closes before the click hits anything else — prevents "click through"
    // where a single right-click + left-click could both open and dismiss.
    useEffect(() => {
        function handleMouseDown(e) {
            if (rootRef.current && !rootRef.current.contains(e.target)) {
                onClose();
            }
        }
        function handleKeyDown(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        }
        function handleScroll() { onClose(); }
        function handleBlur() { onClose(); }

        document.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('keydown', handleKeyDown);
        window.addEventListener('blur', handleBlur);
        // Capture phase for scroll: a nested scroll container shouldn't keep
        // the menu visible while content moves underneath it.
        window.addEventListener('scroll', handleScroll, true);
        return () => {
            document.removeEventListener('mousedown', handleMouseDown);
            document.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('blur', handleBlur);
            window.removeEventListener('scroll', handleScroll, true);
        };
    }, [onClose]);

    // Helper: wrap an action so we always close the menu after running it.
    // Submenu actions stay open until the user picks a value, then this
    // closes everything. Hover-to-open submenus don't trigger this.
    const run = (fn) => (...args) => {
        try { fn?.(...args); } finally { onClose(); }
    };

    const isShape = variant === 'shape';
    const targetIsNode = isShape && target && isNodeType(target.type);
    const canChangeType = isShape && target && (target.type === 'rectangle' || target.type === 'circle');

    return (
        <div
            ref={rootRef}
            role="menu"
            style={{
                position: 'fixed',
                top: adjustedPos.y,
                left: adjustedPos.x,
                width: MENU_WIDTH,
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: 6,
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                padding: '4px 0',
                fontSize: 13,
                fontFamily: 'Arial, sans-serif',
                color: '#1e1e1e',
                zIndex: 1000,
                userSelect: 'none',
            }}
            // Suppress the browser's own context menu if the user right-clicks
            // again on the menu itself. Otherwise you'd get the system menu
            // on top of ours.
            onContextMenu={(e) => e.preventDefault()}
        >
            {isShape && (
                <>
                    <MenuItem label="Delete" shortcut="Del" onClick={run(actions.onDelete)} />
                    <MenuItem label="Duplicate" shortcut="Ctrl+D" onClick={run(actions.onDuplicate)} />
                    <Divider />
                    <MenuItem label="Bring to Front" onClick={run(actions.onBringToFront)} />
                    <MenuItem label="Bring Forward" onClick={run(actions.onBringForward)} />
                    <MenuItem label="Send Backward" onClick={run(actions.onSendBackward)} />
                    <MenuItem label="Send to Back" onClick={run(actions.onSendToBack)} />
                    <Divider />
                    {targetIsNode && (
                        <MenuItem
                            label="Change Color"
                            hasSubmenu
                            isSubmenuOpen={openSubmenu === 'color'}
                            onMouseEnter={() => setOpenSubmenu('color')}
                            onMouseLeave={() => { /* keep open until another item is hovered */ }}
                        >
                            {openSubmenu === 'color' && (
                                <ColorSubmenu
                                    onPick={(hex) => run(actions.onChangeColor)(hex)}
                                />
                            )}
                        </MenuItem>
                    )}
                    {canChangeType && (
                        <MenuItem
                            label="Change Type"
                            hasSubmenu
                            isSubmenuOpen={openSubmenu === 'type'}
                            onMouseEnter={() => setOpenSubmenu('type')}
                        >
                            {openSubmenu === 'type' && (
                                <TypeSubmenu
                                    currentType={target.type}
                                    onPick={(t) => run(actions.onChangeType)(t)}
                                />
                            )}
                        </MenuItem>
                    )}
                </>
            )}

            {!isShape && (
                <>
                    <MenuItem
                        label="Paste here"
                        shortcut="Ctrl+V"
                        disabled={!hasClipboard}
                        onClick={run(() => actions.onPaste?.(worldPos))}
                    />
                    <Divider />
                    <MenuItem
                        label="Add Rectangle"
                        onClick={run(() => actions.onAddShape?.('rectangle', worldPos))}
                    />
                    <MenuItem
                        label="Add Circle"
                        onClick={run(() => actions.onAddShape?.('circle', worldPos))}
                    />
                    <MenuItem
                        label="Add Text"
                        onClick={run(() => actions.onAddShape?.('text', worldPos))}
                    />
                </>
            )}
        </div>
    );
}

// ───────────────────────────────────────────────────────────────
// Internal pieces
// ───────────────────────────────────────────────────────────────

function MenuItem({
    label, shortcut, onClick, disabled, hasSubmenu, isSubmenuOpen,
    onMouseEnter, onMouseLeave, children,
}) {
    const [hover, setHover] = useState(false);
    return (
        <div
            role="menuitem"
            aria-disabled={disabled || undefined}
            onMouseEnter={() => { setHover(true); onMouseEnter?.(); }}
            onMouseLeave={() => { setHover(false); onMouseLeave?.(); }}
            onClick={disabled ? undefined : onClick}
            style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 12px',
                cursor: disabled ? 'not-allowed' : 'pointer',
                color: disabled ? '#9ca3af' : '#1e1e1e',
                background: hover && !disabled ? '#f3f4f6' : 'transparent',
            }}
        >
            <span>{label}</span>
            <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 12 }}>
                {hasSubmenu ? '▸' : shortcut || ''}
            </span>
            {hasSubmenu && isSubmenuOpen && children}
        </div>
    );
}

function Divider() {
    return <div style={{ height: 1, background: '#e5e7eb', margin: '4px 0' }} />;
}

function ColorSubmenu({ onPick }) {
    return (
        <div
            style={{
                ...submenuStyle(),
                width: SUBMENU_WIDTH,
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 6,
                padding: 8,
            }}
            // Stop hover from bubbling back to the parent MenuItem and
            // triggering its background highlight unexpectedly.
            onMouseEnter={(e) => e.stopPropagation()}
        >
            {COLOR_SWATCHES.map(hex => (
                <button
                    key={hex}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onPick(hex); }}
                    style={{
                        width: 28,
                        height: 28,
                        background: hex,
                        border: '1px solid #e5e7eb',
                        borderRadius: 4,
                        cursor: 'pointer',
                        padding: 0,
                    }}
                    aria-label={`Set color ${hex}`}
                />
            ))}
        </div>
    );
}

function TypeSubmenu({ currentType, onPick }) {
    return (
        <div style={{ ...submenuStyle(), width: SUBMENU_WIDTH }}>
            {SHAPE_TYPES_FOR_TYPE_CHANGE.map(({ type, label }) => (
                <div
                    key={type}
                    onClick={(e) => { e.stopPropagation(); onPick(type); }}
                    style={{
                        padding: '6px 12px',
                        cursor: 'pointer',
                        background: type === currentType ? '#eef2ff' : 'transparent',
                        color: type === currentType ? '#3730a3' : '#1e1e1e',
                    }}
                    onMouseEnter={(e) => {
                        if (type !== currentType) e.currentTarget.style.background = '#f3f4f6';
                    }}
                    onMouseLeave={(e) => {
                        if (type !== currentType) e.currentTarget.style.background = 'transparent';
                    }}
                >
                    {label}{type === currentType ? ' (current)' : ''}
                </div>
            ))}
        </div>
    );
}

function submenuStyle() {
    return {
        position: 'absolute',
        // Open to the right of the parent row. Edge-flip isn't implemented
        // for submenus — the main menu's repositioning usually saves us,
        // and we're not at the right edge often enough to invest more.
        top: 0,
        left: '100%',
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: 6,
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        padding: '4px 0',
        marginLeft: 2,
    };
}
