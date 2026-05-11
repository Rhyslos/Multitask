// user functions
import { useRef, useLayoutEffect, useState } from 'react';
import { renderCanvas } from './GraphRenderer';
import useCanvasCamera from '../../hooks/useCanvasCamera';
import useCanvasPointer from '../../hooks/useCanvasPointer';
import useInterpolatedCursors from '../../hooks/useInterpolatedCursors';
import ZoomBadge from './ZoomBadge';
import { isHittingEdge, isNodeType, getNodeBounds } from './GraphHelper';

export default function GraphCanvas({
    activeTool,
    activeMode,
    elements,
    mutator,
    selectedId,
    setSelectedId,
    starterId,
    highlightedIds,
    peers,              // raw peers from useAwareness — discrete samples
    broadcastCursor,
}) {
    const canvasRef = useRef(null);
    const [editingText, setEditingText] = useState(null);
    const [pendingConnection, setPendingConnection] = useState(null);

    const { camera, setCamera, screenToWorld, resetView } = useCanvasCamera(canvasRef);

    // Smoothed peers. `tick` increments every animated frame while any peer
    // is mid-ease; including it in the render effect's dep array drives the
    // canvas redraw on each frame of the animation.
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
        selectedId, setSelectedId,
        camera, setCamera, screenToWorld,
        activeTool,
        editingText,
        setPendingConnection,
        broadcastCursor,
    });

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
            starterId,
            highlightedIds,
            activeTool,
            hoverNodeId,
            action: pendingConnection ? 'connecting' : null,
            pendingConnection,
            hoverEdgeNodeId,
            peers: peersForRender,
        });
    }, [
        camera, elements, selectedId, starterId, highlightedIds, activeTool,
        hoverNodeId, pendingConnection, hoverEdgeNodeId,
        peersForRender, tick,
    ]);

    const handleCanvasPointerDown = (e) => {
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

    let canvasCursor;
    if (activeCursor) {
        canvasCursor = activeCursor;
    } else if (activeTool === 'hand') {
        canvasCursor = 'grab';
    } else if (activeTool === 'select' && hoverHandle) {
        canvasCursor = hoverHandle.cursor;
    } else if (hoverLabelNodeId) {
        canvasCursor = 'text';
    } else if (activeTool === 'text') {
        canvasCursor = 'text';
    } else if (activeTool === 'arrow') {
        canvasCursor = hoverNodeId ? 'crosshair' : 'default';
    } else if (activeTool === 'select' && hoverEdgeNodeId) {
        canvasCursor = 'move';
    } else if (activeTool === 'select') {
        canvasCursor = 'default';
    } else {
        canvasCursor = 'crosshair';
    }

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
            <ZoomBadge zoom={camera.zoom} onReset={resetView} />
        </>
    );
}
