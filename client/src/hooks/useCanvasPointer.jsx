// Pointer + keyboard input dispatcher.
//
// Owns:
//   - which action is currently active (one at a time)
//   - dragStart payload from that action's tryStart
//   - hover state (anchor-dot hover, resize-handle hover) — only computed when no action is active
//
// Action contract: see GraphActions.js header.
//
// Context object (passed to every action call) — kept current via ref so actions
// never see stale closure values:
//   {
//     elements, selectedId, camera, activeTool,                   // state reads
//     setElements, setSelectedId, setCamera, setPendingConnection // state writes
//   }
//
// Lifecycle guarantees:
//   - tryStart loop runs in priority order on pointer-down; first non-null wins.
//   - Once an action is active, new pointer-downs are ignored until pointer-up.
//   - Pointer capture ensures pointer-up fires even if cursor leaves the canvas.
//   - On pointer-up: active action's onEnd runs, then dispatcher state is reset
//     unconditionally (no leaks possible).
//   - cancel() calls onEnd with {cancelled: true} and resets dispatcher state.

import { useEffect, useRef, useState, useCallback } from 'react';
import {
    isNodeType,
    getHandleAtPoint,
    getAnchorFromPoint,
} from '../components/graph/GraphHelper';
import { ALL_ACTIONS } from '../components/graph/GraphActions';

const SORTED_ACTIONS = [...ALL_ACTIONS].sort((a, b) => b.priority - a.priority);

export default function useCanvasPointer({
    canvasRef,
    elements, setElements,
    selectedId, setSelectedId,
    camera, setCamera, screenToWorld,
    activeTool,
    editingText,
    setPendingConnection,
}) {
    // Hover state — only meaningful when no action is active.
    const [hoverNodeId, setHoverNodeId] = useState(null);
    const [hoverHandle, setHoverHandle] = useState(null); // { side, cursor } | null

    // Active action and its dragStart. Refs (not state) so handlers within a single
    // pointer gesture see updates immediately without re-renders.
    const activeRef = useRef(null);     // { action, dragStart } | null
    // Cursor for the active action — kept in state because cursor is rendered.
    const [activeCursor, setActiveCursor] = useState(null);

    // Live context object for actions. Updated every render so refs/closures
    // never go stale. Actions read from ctxRef.current.
    const ctxRef = useRef({});
    ctxRef.current = {
        elements, selectedId, camera, activeTool,
        setElements, setSelectedId, setCamera, setPendingConnection,
    };

    // Build the event-shape passed to actions.
    const buildEvt = useCallback((nativeEvent) => {
        const { offsetX, offsetY, button, shiftKey } = nativeEvent;
        const { x: worldX, y: worldY } = screenToWorld(offsetX, offsetY);
        return {
            worldX, worldY,
            screenX: offsetX, screenY: offsetY,
            button, shiftKey,
            native: nativeEvent,
        };
    }, [screenToWorld]);

    // ── lifecycle helpers ──────────────────────────────────────

    const finishAction = useCallback((evt, opts) => {
        const active = activeRef.current;
        if (!active) return;
        try {
            active.action.onEnd?.(ctxRef.current, active.dragStart, evt, opts);
        } finally {
            // Unconditional reset — protects against actions that throw or forget cleanup.
            activeRef.current = null;
            setActiveCursor(null);
        }
    }, []);

    const cancel = useCallback(() => {
        // Called when something external aborts (Esc key, mode change, etc.).
        // The synthetic evt has zero coords — every action's onEnd checks opts.cancelled
        // before reading evt, so coords are effectively ignored on cancel.
        finishAction({ worldX: 0, worldY: 0, screenX: 0, screenY: 0, button: 0, shiftKey: false, native: null }, { cancelled: true });
    }, [finishAction]);

    // ── pointer handlers ───────────────────────────────────────

    const handlePointerDown = useCallback((e) => {
        if (editingText) return;
        if (activeRef.current) return; // already in an action — ignore

        const evt = buildEvt(e.nativeEvent);
        for (const action of SORTED_ACTIONS) {
            const dragStart = action.tryStart(ctxRef.current, evt);
            if (dragStart != null) {
                activeRef.current = { action, dragStart };
                setActiveCursor(action.getCursor?.(ctxRef.current, dragStart) ?? null);
                // Pointer capture: route all subsequent pointer events for this gesture
                // to the canvas, so pointer-up fires reliably even if cursor leaves.
                try {
                    e.currentTarget.setPointerCapture(e.pointerId);
                } catch { /* not all targets support capture; non-fatal */ }
                return;
            }
        }
    }, [editingText, buildEvt]);

    const handlePointerMove = useCallback((e) => {
        const evt = buildEvt(e.nativeEvent);

        if (activeRef.current) {
            // Active action: route move, skip hover.
            activeRef.current.action.onMove?.(ctxRef.current, activeRef.current.dragStart, evt);
            return;
        }

        // Passive hover (only when no action is active).
        // Anchor-dot hover for the arrow tool.
        if (activeTool === 'arrow') {
            let nodeIdAtEdge = null;
            for (let i = elements.length - 1; i >= 0; i--) {
                const el = elements[i];
                if (!isNodeType(el.type)) continue;
                if (getAnchorFromPoint(el, evt.worldX, evt.worldY)) {
                    nodeIdAtEdge = el.id;
                    break;
                }
            }
            if (nodeIdAtEdge !== hoverNodeId) setHoverNodeId(nodeIdAtEdge);
        } else if (hoverNodeId !== null) {
            setHoverNodeId(null);
        }

        // Resize-handle hover for the select tool.
        if (activeTool === 'select' && selectedId) {
            const sel = elements.find(el => el.id === selectedId);
            const h = sel && isNodeType(sel.type) ? getHandleAtPoint(sel, evt.worldX, evt.worldY) : null;
            const newHandle = h ? { side: h.side, cursor: h.cursor } : null;
            if ((newHandle?.side ?? null) !== (hoverHandle?.side ?? null)) {
                setHoverHandle(newHandle);
            }
        } else if (hoverHandle !== null) {
            setHoverHandle(null);
        }
    }, [buildEvt, activeTool, elements, selectedId, hoverNodeId, hoverHandle]);

    const handlePointerUp = useCallback((e) => {
        if (!activeRef.current) return;
        const evt = buildEvt(e.nativeEvent);
        finishAction(evt);
        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch { /* non-fatal */ }
    }, [buildEvt, finishAction]);

    // ── keyboard ───────────────────────────────────────────────

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (editingText) return;

            // Esc cancels any in-progress action.
            if (e.key === 'Escape' && activeRef.current) {
                cancel();
                return;
            }

            // Delete / Backspace removes selected element (and arrows attached to a deleted node).
            if ((e.key === 'Backspace' || e.key === 'Delete') && selectedId) {
                setElements(prev => prev.filter(el =>
                    el.id !== selectedId &&
                    !(el.type === 'arrow' && (el.fromId === selectedId || el.toId === selectedId))
                ));
                setSelectedId(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [editingText, selectedId, setElements, setSelectedId, cancel]);

    return {
        handlePointerDown,
        handlePointerMove,
        handlePointerUp,
        hoverNodeId,
        hoverHandle,
        activeAction: activeRef.current?.action.name ?? null,
        activeCursor,
        cancel,
        // Exposed so the renderer can know an action is active (for cursor + draw decisions)
        isActive: () => activeRef.current !== null,
    };
}