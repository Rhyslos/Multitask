// Right-click context menu for the graph canvas.

// imports
import { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { isNodeType } from './GraphHelper';
import { STROKES, FILLS, NO_STROKE, NO_FILL } from './graphColors';

// layout constants
const MENU_WIDTH = 200;
const COLOR_SUBMENU_WIDTH = 220;
const TYPE_SUBMENU_WIDTH = 160;

// data configs
const SHAPE_TYPES_FOR_TYPE_CHANGE = [
    { type: 'rectangle', label: 'Rectangle' },
    { type: 'circle',    label: 'Circle' },
];

// main context menu component
export default function GraphContextMenu({
    variant,
    screenPos,
    worldPos,
    target,
    hasClipboard,
    actions,
    onClose,
}) {
    // state and refs
    const rootRef = useRef(null);
    const [adjustedPos, setAdjustedPos] = useState(screenPos);
    const [openSubmenu, setOpenSubmenu] = useState(null);

    // layout adjustments
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

    // cleanup and external click handlers
    useEffect(() => {
        function handleMouseDown(e) {
            if (rootRef.current && !rootRef.current.contains(e.target)) onClose();
        }
        function handleKeyDown(e) {
            if (e.key === 'Escape') { e.preventDefault(); onClose(); }
        }
        function handleScroll() { onClose(); }
        function handleBlur() { onClose(); }

        document.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('keydown', handleKeyDown);
        window.addEventListener('blur', handleBlur);
        window.addEventListener('scroll', handleScroll, true);
        return () => {
            document.removeEventListener('mousedown', handleMouseDown);
            document.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('blur', handleBlur);
            window.removeEventListener('scroll', handleScroll, true);
        };
    }, [onClose]);

    // action wrapper
    const run = (fn) => (...args) => {
        try { fn?.(...args); } finally { onClose(); }
    };

    // computed target states
    const isShape = variant === 'shape';
    const targetIsNode = isShape && target && isNodeType(target.type);
    const canChangeType = isShape && target && (target.type === 'rectangle' || target.type === 'circle');
    const targetHasFill = isShape && target && isNodeType(target.type);

    // render
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
                    <MenuItem
                        label="Colors"
                        hasSubmenu
                        isSubmenuOpen={openSubmenu === 'color'}
                        onMouseEnter={() => setOpenSubmenu('color')}
                    >
                        {openSubmenu === 'color' && (
                            <ColorPanel
                                currentStroke={target?.stroke}
                                currentFill={target?.fill}
                                showFill={targetHasFill}
                                onPickStroke={(hex) => run(actions.onSetStroke)(hex)}
                                onPickFill={(hex) => run(actions.onSetFill)(hex)}
                            />
                        )}
                    </MenuItem>
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

// menu item layout
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

// divider layout
function Divider() {
    return <div style={{ height: 1, background: '#e5e7eb', margin: '4px 0' }} />;
}

// color picking panel view
function ColorPanel({ currentStroke, currentFill, showFill, onPickStroke, onPickFill }) {
    return (
        <div
            style={{
                ...submenuStyle(),
                width: COLOR_SUBMENU_WIDTH,
                padding: 10,
            }}
            onMouseEnter={(e) => e.stopPropagation()}
        >
            <ColorSection
                label="Line"
                swatches={STROKES}
                current={currentStroke}
                noneValue={NO_STROKE}
                noneLabel="No line"
                onPick={onPickStroke}
            />
            {showFill && (
                <>
                    <div style={{ height: 8 }} />
                    <ColorSection
                        label="Background"
                        swatches={FILLS}
                        current={currentFill}
                        noneValue={NO_FILL}
                        noneLabel="No fill"
                        onPick={onPickFill}
                    />
                </>
            )}
        </div>
    );
}

// swatch row structure
function ColorSection({ label, swatches, current, noneValue, noneLabel, onPick }) {
    return (
        <div>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {label}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                {swatches.map(({ name, hex }) => (
                    <Swatch
                        key={name}
                        hex={hex}
                        isSelected={current === hex}
                        onClick={(e) => { e.stopPropagation(); onPick(hex); }}
                        ariaLabel={`${label} ${name}`}
                    />
                ))}
                <Swatch
                    hex="transparent"
                    isNone
                    isSelected={current === noneValue}
                    onClick={(e) => { e.stopPropagation(); onPick(noneValue); }}
                    ariaLabel={noneLabel}
                />
            </div>
        </div>
    );
}

// individual color button
function Swatch({ hex, isSelected, isNone, onClick, ariaLabel }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={ariaLabel}
            style={{
                width: 28,
                height: 28,
                background: isNone ? '#ffffff' : hex,
                border: '1px solid #e5e7eb',
                outline: isSelected ? '2px solid #3b82f6' : 'none',
                outlineOffset: '1px',
                borderRadius: 4,
                cursor: 'pointer',
                padding: 0,
                position: 'relative',
                overflow: 'hidden',
            }}
        >
            {isNone && (
                <span style={{
                    position: 'absolute',
                    top: '50%',
                    left: '-10%',
                    width: '120%',
                    height: 2,
                    background: '#ef4444',
                    transform: 'rotate(-45deg)',
                    transformOrigin: 'center',
                }} />
            )}
        </button>
    );
}

// shape type switcher menu
function TypeSubmenu({ currentType, onPick }) {
    return (
        <div style={{ ...submenuStyle(), width: TYPE_SUBMENU_WIDTH }}>
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

// layout styling helpers
function submenuStyle() {
    return {
        position: 'absolute',
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