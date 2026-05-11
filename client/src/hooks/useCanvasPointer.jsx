// user functions
import { useEffect, useRef, useState, useCallback } from 'react';
import {
    isNodeType,
    getHandleAtPoint,
    getAnchorFromPoint,
    isHittingLabel,
    isHittingEdge,
} from '../components/graph/GraphHelper';
import { ALL_ACTIONS } from '../components/graph/GraphActions';

const SORTED_ACTIONS = [...ALL_ACTIONS].sort((a, b) => b.priority - a.priority);

export default function useCanvasPointer({
    canvasRef,
    elements,
    mutator,
    selectedId, setSelectedId,
    camera, setCamera, screenToWorld,
    activeTool,
    editingText,
    setPendingConnection,
    broadcastCursor,
}) {
    const [hoverNodeId, setHoverNodeId] = useState(null);
    const [hoverHandle, setHoverHandle] = useState(null);
    const [hoverLabelNodeId, setHoverLabelNodeId] = useState(null);
    const [hoverEdgeNodeId, setHoverEdgeNodeId] = useState(null);

    const activeRef = useRef(null);
    const [activeCursor, setActiveCursor] = useState(null);

    // Last seen pointer position + modifier state, kept fresh so we can replay
    // an onMove when the user presses/releases shift mid-drag. Without this,
    // shift-constrain only takes effect on the next physical pointer move.
    const lastEvtRef = useRef(null);

    const ctxRef = useRef({});
    ctxRef.current = {
        elements, selectedId, camera, activeTool,
        mutator,
        setSelectedId, setCamera, setPendingConnection,
    };

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

    const finishAction = useCallback((evt, opts) => {
        const active = activeRef.current;
        if (!active) return;
        try {
            active.action.onEnd?.(ctxRef.current, active.dragStart, evt, opts);
        } finally {
            activeRef.current = null;
            setActiveCursor(null);
        }
    }, []);

    const cancel = useCallback(() => {
        finishAction({ worldX: 0, worldY: 0, screenX: 0, screenY: 0, button: 0, shiftKey: false, native: null }, { cancelled: true });
    }, [finishAction]);

    const handlePointerDown = useCallback((e) => {
        if (editingText) return;
        if (activeRef.current) return;

        const evt = buildEvt(e.nativeEvent);
        lastEvtRef.current = evt;
        for (const action of SORTED_ACTIONS) {
            const dragStart = action.tryStart(ctxRef.current, evt);
            if (dragStart != null) {
                activeRef.current = { action, dragStart };
                setActiveCursor(action.getCursor?.(ctxRef.current, dragStart) ?? null);
                try {
                    e.currentTarget.setPointerCapture(e.pointerId);
                } catch { }
                return;
            }
        }
    }, [editingText, buildEvt]);

    const handlePointerMove = useCallback((e) => {
        const evt = buildEvt(e.nativeEvent);
        lastEvtRef.current = evt;

        if (broadcastCursor) {
            broadcastCursor(evt.worldX, evt.worldY);
        }

        if (activeRef.current) {
            activeRef.current.action.onMove?.(ctxRef.current, activeRef.current.dragStart, evt);
            return;
        }

        let labelHitId = null;
        for (let i = elements.length - 1; i >= 0; i--) {
            const el = elements[i];
            if (isNodeType(el.type) && isHittingLabel(evt.worldX, evt.worldY, el)) {
                labelHitId = el.id;
                break;
            }
        }
        if (labelHitId !== hoverLabelNodeId) setHoverLabelNodeId(labelHitId);

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

        let newHandle = null;
        if (activeTool === 'select' && selectedId) {
            const sel = elements.find(el => el.id === selectedId);
            const h = sel && isNodeType(sel.type) ? getHandleAtPoint(sel, evt.worldX, evt.worldY) : null;
            newHandle = h ? { side: h.side, cursor: h.cursor } : null;
            if ((newHandle?.side ?? null) !== (hoverHandle?.side ?? null)) {
                setHoverHandle(newHandle);
            }
        } else if (hoverHandle !== null) {
            setHoverHandle(null);
        }

        let edgeHitId = null;
        if (activeTool === 'select' && !newHandle) {
            const hit = [...elements].reverse().find(el => isHittingEdge(evt.worldX, evt.worldY, el, elements));
            if (hit) edgeHitId = hit.id;
        }
        if (edgeHitId !== hoverEdgeNodeId) setHoverEdgeNodeId(edgeHitId);

    }, [buildEvt, broadcastCursor, activeTool, elements, selectedId, hoverNodeId, hoverHandle, hoverLabelNodeId, hoverEdgeNodeId]);

    const handlePointerUp = useCallback((e) => {
        if (!activeRef.current) return;
        const evt = buildEvt(e.nativeEvent);
        lastEvtRef.current = evt;
        finishAction(evt);
        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch { }
    }, [buildEvt, finishAction]);

    useEffect(() => {
        const replayActiveMove = (shiftKey) => {
            // Re-fire onMove with the last known pointer position but the
            // updated shift state. Lets shift-to-constrain toggle live during
            // an in-progress drag without waiting for the next pointer event.
            const active = activeRef.current;
            const last = lastEvtRef.current;
            if (!active || !last) return;
            const synthetic = { ...last, shiftKey };
            lastEvtRef.current = synthetic;
            active.action.onMove?.(ctxRef.current, active.dragStart, synthetic);
        };

        const handleKeyDown = (e) => {
            if (editingText) return;

            if (e.key === 'Shift' && activeRef.current) {
                replayActiveMove(true);
                return;
            }

            if (e.key === 'Escape' && activeRef.current) {
                cancel();
                return;
            }

            if ((e.key === 'Backspace' || e.key === 'Delete') && selectedId) {
                const idsToRemove = [selectedId];
                for (const el of elements) {
                    if (el.type === 'arrow' && (el.fromId === selectedId || el.toId === selectedId)) {
                        idsToRemove.push(el.id);
                    }
                }
                mutator.removeMany(idsToRemove);
                setSelectedId(null);
            }
        };

        const handleKeyUp = (e) => {
            if (e.key === 'Shift' && activeRef.current) {
                replayActiveMove(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [editingText, selectedId, elements, mutator, setSelectedId, cancel]);

    return {
        handlePointerDown,
        handlePointerMove,
        handlePointerUp,
        hoverNodeId,
        hoverHandle,
        hoverLabelNodeId,
        hoverEdgeNodeId,
        activeAction: activeRef.current?.action.name ?? null,
        activeCursor,
        cancel,
        isActive: () => activeRef.current !== null,
    };
}
