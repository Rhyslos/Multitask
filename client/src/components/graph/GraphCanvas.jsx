// imports
import { useRef, useLayoutEffect, useState, useCallback } from 'react';
import { renderCanvas } from './GraphRenderer';
import useCanvasCamera from '../../hooks/useCanvasCamera';
import useCanvasPointer from '../../hooks/useCanvasPointer';
import useInterpolatedCursors from '../../hooks/useInterpolatedCursors';
import ZoomBadge from './ZoomBadge';
import GraphContextMenu from './GraphContextMenu';
import { isHittingEdge, isNodeType, getNodeBounds } from './GraphHelper';

// main component
export default function GraphCanvas({
    activeTool,
    elements,
    mutator,
    selectedId,
    selectedIds,
    setSelectedId,
    starterId,
    highlightedIds,
    peers,
    broadcastCursor,
    clipboard,
    setClipboard,
}) {
    // state and refs
    const canvasRef = useRef(null);
    const [editingText, setEditingText] = useState(null);
    const [pendingConnection, setPendingConnection] = useState(null);
    const [pendingMarquee, setPendingMarquee] = useState(null);
    const [contextMenu, setContextMenu] = useState(null);

    // hooks
    const { camera, setCamera, screenToWorld, resetView } = useCanvasCamera(canvasRef);

    const { peersForRender, tick } = useInterpolatedCursors(peers, elements);

    const {
        handlePointerDown,
        handlePointerMove,
        handlePointerUp,
        hoverNodeId,
        hoverHandle,
        hoverLabelNodeId,
        hoverEdgeNodeId,
        activeCursor,
        isActive,
    } = useCanvasPointer({
        canvasRef,
        elements,
        mutator,
        selectedId,
        selectedIds,
        setSelectedId,
        camera, setCamera, screenToWorld,
        activeTool,
        editingText,
        setPendingConnection,
        setPendingMarquee,
        broadcastCursor,
        suppressHover: !!contextMenu,
    });

    // side effects
    useLayoutEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        renderCanvas(ctx, {
            width: canvas.width,
            height: canvas.height,
            camera,
            elements,
            selectedId,
            selectedIds,
            starterId,
            highlightedIds,
            activeTool,
            hoverNodeId,
            action: pendingConnection ? 'connecting' : null,
            pendingConnection,
            pendingMarquee,
            hoverEdgeNodeId,
            peers: peersForRender,
        });
    }, [
        camera, elements, selectedId, selectedIds, starterId, highlightedIds, activeTool,
        hoverNodeId, pendingConnection, pendingMarquee, hoverEdgeNodeId,
        peersForRender, tick,
    ]);

    // event handlers
    const handleContextMenu = useCallback((e) => {
        e.preventDefault();
        if (editingText || isActive()) return;

        const { offsetX, offsetY, clientX, clientY } = e.nativeEvent;
        const { x: worldX, y: worldY } = screenToWorld(offsetX, offsetY);

        const hit = [...elements].reverse().find(el =>
            isHittingEdge(worldX, worldY, el, elements)
        );

        if (hit) {
            setContextMenu({
                variant: 'shape',
                screenPos: { x: clientX, y: clientY },
                worldPos: { x: worldX, y: worldY },
                target: hit,
            });
        } else {
            setContextMenu({
                variant: 'canvas',
                screenPos: { x: clientX, y: clientY },
                worldPos: { x: worldX, y: worldY },
                target: null,
            });
        }
    }, [editingText, isActive, elements, screenToWorld]);

    // context menu selection helpers
    const operativeIds = () => {
        const id = contextMenu?.target?.id;
        return id ? [id] : [];
    };

    // context menu actions
    const actions = {
        onDelete: () => {
            const ids = operativeIds();
            if (ids.length === 0) return;
            const all = new Set(ids);
            for (const el of elements) {
                if ((el.type === 'arrow' || el.type === 'line') &&
                    (all.has(el.fromId) || all.has(el.toId))) {
                    all.add(el.id);
                }
            }
            mutator.removeMany([...all]);
            setSelectedId(null);
        },
        onDuplicate: () => {
            const ids = operativeIds();
            if (ids.length === 0) return;
            if (ids.length === 1) {
                const target = elements.find(e => e.id === ids[0]);
                if (target) setClipboard({ element: target });
            }
            const newIds = [];
            for (const id of ids) {
                const newId = mutator.duplicate(id);
                if (newId) newIds.push(newId);
            }
            if (newIds.length > 0) setSelectedId(newIds);
        },
        onBringToFront: () => contextMenu?.target && mutator.bringToFront(contextMenu.target.id),
        onBringForward: () => contextMenu?.target && mutator.bringForward(contextMenu.target.id),
        onSendBackward: () => contextMenu?.target && mutator.sendBackward(contextMenu.target.id),
        onSendToBack:   () => contextMenu?.target && mutator.sendToBack(contextMenu.target.id),
        onSetStroke: (hex) => {
            for (const id of operativeIds()) mutator.setStroke(id, hex);
        },
        onSetFill: (hex) => {
            for (const id of operativeIds()) mutator.setFill(id, hex);
        },
        onChangeType: (type) => {
            for (const id of operativeIds()) {
                const el = elements.find(e => e.id === id);
                if (el && (el.type === 'rectangle' || el.type === 'circle')) {
                    mutator.changeType(id, type);
                }
            }
        },
        onPaste: (worldPos) => {
            if (!clipboard?.element || !worldPos) return;
            const src = clipboard.element;
            const copy = {
                ...src,
                id: crypto.randomUUID(),
                x: worldPos.x,
                y: worldPos.y,
            };
            mutator.create(copy);
            setSelectedId(copy.id);
        },
        onAddShape: (type, worldPos) => {
            if (!worldPos) return;
            if (type === 'text') {
                setEditingText({
                    mode: 'newText',
                    id: crypto.randomUUID(),
                    type: 'text',
                    x: worldPos.x,
                    y: worldPos.y,
                    text: '',
                });
                return;
            }
            const id = crypto.randomUUID();
            mutator.create({
                id,
                type,
                x: worldPos.x,
                y: worldPos.y,
                width: 120,
                height: 80,
            });
            setSelectedId(id);
        },
    };

    // pointer and input interactions
    const handleCanvasPointerDown = (e) => {
        if (contextMenu) setContextMenu(null);

        if (activeTool === 'text' && !isActive() && !editingText) {
            e.preventDefault();
            const { offsetX, offsetY } = e.nativeEvent;
            const { x: worldX, y: worldY } = screenToWorld(offsetX, offsetY);
            setEditingText({
                mode: 'newText',
                id: crypto.randomUUID(),
                type: 'text',
                x: worldX, y: worldY,
                text: '',
            });
            return;
        }
        handlePointerDown(e);
    };

    const handleCanvasDoubleClick = (e) => {
        if (editingText) return;
        const { offsetX, offsetY } = e.nativeEvent;
        const { x: worldX, y: worldY } = screenToWorld(offsetX, offsetY);

        const hit = [...elements].reverse().find(el =>
            isNodeType(el.type) && isHittingEdge(worldX, worldY, el, elements)
        );
        if (!hit) return;

        e.preventDefault();
        const b = getNodeBounds(hit);

        if (hit.type === 'text') {
            setEditingText({
                mode: 'editLabel',
                targetId: hit.id,
                x: hit.x,
                y: hit.y,
                width: Math.max(100, hit.width || 100),
                text: hit.text || '',
                isTextNode: true,
            });
        } else {
            setEditingText({
                mode: 'editLabel',
                targetId: hit.id,
                x: b.minX,
                y: b.minY + b.h / 2 - 10,
                width: b.w,
                text: hit.label || '',
                isTextNode: false,
            });
        }
        setSelectedId(hit.id);
    };

    const handleTextBlur = () => {
        if (!editingText || !mutator) return;

        if (editingText.mode === 'newText') {
            if (editingText.text.trim()) {
                const ctx = canvasRef.current.getContext('2d');
                ctx.font = '16px Arial, sans-serif';
                const metrics = ctx.measureText(editingText.text);
                const { mode, ...persisted } = editingText;
                mutator.create({ ...persisted, width: metrics.width, height: 16 });
            }
        } else if (editingText.mode === 'editLabel') {
            const newText = editingText.text.trim();
            const target = elements.find(el => el.id === editingText.targetId);
            if (target) {
                if (target.type === 'text') {
                    const ctx = canvasRef.current.getContext('2d');
                    ctx.font = '16px Arial, sans-serif';
                    const metrics = ctx.measureText(newText);
                    mutator.update(target.id, { text: newText, width: metrics.width });
                } else {
                    mutator.update(target.id, { label: newText || undefined });
                }
            }
        }
        setEditingText(null);
    };

    const handleTextKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.target.blur();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setEditingText(null);
        }
    };

    // dynamic cursor selection
    let canvasCursor;
    if (activeCursor) {
        canvasCursor = activeCursor;
    } else if (activeTool === 'hand') {
        canvasCursor = 'grab';
    } else if (activeTool === 'eraser') {
        canvasCursor = 'cell';
    } else if (activeTool === 'select' && hoverHandle) {
        canvasCursor = hoverHandle.cursor;
    } else if (hoverLabelNodeId) {
        canvasCursor = 'text';
    } else if (activeTool === 'text') {
        canvasCursor = 'text';
    } else if (activeTool === 'arrow' || activeTool === 'line') {
        canvasCursor = 'crosshair';
    } else if (activeTool === 'select' && hoverEdgeNodeId) {
        canvasCursor = 'move';
    } else if (activeTool === 'select') {
        canvasCursor = 'default';
    } else {
        canvasCursor = 'crosshair';
    }

    // render
    return (
        <>
            <canvas
                ref={canvasRef}
                width={window.innerWidth}
                height={window.innerHeight}
                style={{ display: 'block', touchAction: 'none', cursor: canvasCursor }}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onDoubleClick={handleCanvasDoubleClick}
                onContextMenu={handleContextMenu}
                onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
                onAuxClick={(e) => { if (e.button === 1) e.preventDefault(); }}
            />
            {editingText && (
                <textarea
                    autoFocus
                    value={editingText.text}
                    onChange={(e) => setEditingText({ ...editingText, text: e.target.value })}
                    onBlur={handleTextBlur}
                    onKeyDown={handleTextKeyDown}
                    style={{
                        position: 'absolute',
                        top: editingText.y * camera.zoom + camera.y,
                        left: editingText.x * camera.zoom + camera.x,
                        width: editingText.mode === 'editLabel' && !editingText.isTextNode
                            ? editingText.width * camera.zoom
                            : undefined,
                        margin: 0,
                        padding: 0,
                        border: '1px dashed #3b82f6',
                        background: 'transparent',
                        font: editingText.mode === 'editLabel' && !editingText.isTextNode
                            ? `${14 * camera.zoom}px Arial, sans-serif`
                            : `${16 * camera.zoom}px Arial, sans-serif`,
                        color: '#1e1e1e',
                        outline: 'none',
                        resize: 'none',
                        overflow: 'hidden',
                        whiteSpace: editingText.mode === 'editLabel' && !editingText.isTextNode ? 'pre-wrap' : 'pre',
                        lineHeight: '1',
                        textAlign: editingText.mode === 'editLabel' && !editingText.isTextNode ? 'center' : 'left',
                        minWidth: '50px',
                        minHeight: '20px',
                        zIndex: 50,
                    }}
                />
            )}
            {contextMenu && (
                <GraphContextMenu
                    variant={contextMenu.variant}
                    screenPos={contextMenu.screenPos}
                    worldPos={contextMenu.worldPos}
                    target={contextMenu.target}
                    hasClipboard={!!clipboard?.element}
                    actions={actions}
                    onClose={() => setContextMenu(null)}
                />
            )}
            <ZoomBadge zoom={camera.zoom} onReset={resetView} />
        </>
    );
}