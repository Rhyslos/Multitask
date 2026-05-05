// GraphCanvas — thin composition layer.
// State machine, drawing, and camera control all live in hooks/renderer modules.
// This file's job is to wire them together and own the "shape" of the component
// (the canvas element, the inline text editor, the zoom badge).

import { useRef, useLayoutEffect, useState } from 'react';
import { renderCanvas } from './GraphRenderer';
import useCanvasCamera from '../../hooks/useCanvasCamera';
import useCanvasPointer from '../../hooks/useCanvasPointer';
import ZoomBadge from './ZoomBadge';

// component functions
export default function GraphCanvas({
    activeTool,
    activeMode,        // currently unused here, kept for future per-mode behavior
    elements,
    setElements,
    selectedId,
    setSelectedId,
    starterId,
    highlightedIds,
}) {
    const canvasRef = useRef(null);
    const [editingText, setEditingText] = useState(null);
    const [pendingConnection, setPendingConnection] = useState(null);

    const { camera, setCamera, screenToWorld, resetView } = useCanvasCamera(canvasRef);

    const {
        handlePointerDown,
        handlePointerMove,
        handlePointerUp,
        hoverNodeId,
        hoverHandle,
        activeCursor,
        isActive,
    } = useCanvasPointer({
        canvasRef,
        elements, setElements,
        selectedId, setSelectedId,
        camera, setCamera, screenToWorld,
        activeTool,
        editingText,
        setPendingConnection,
    });

    // ── render the canvas every time relevant state changes ───
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
        });
    }, [camera, elements, selectedId, starterId, highlightedIds, activeTool, hoverNodeId, pendingConnection]);

    // ── text-tool: pointer down on empty canvas opens an inline textarea ──
    // (Text creation isn't an "action" because it's not a drag gesture — it opens a UI overlay.)
    const handleCanvasPointerDown = (e) => {
        if (activeTool === 'text' && !isActive() && !editingText) {
            e.preventDefault();
            const { offsetX, offsetY } = e.nativeEvent;
            const { x: worldX, y: worldY } = screenToWorld(offsetX, offsetY);
            setEditingText({ id: Date.now().toString(), type: 'text', x: worldX, y: worldY, text: '' });
            return;
        }
        handlePointerDown(e);
    };

    const handleTextBlur = () => {
        if (editingText && editingText.text.trim()) {
            const ctx = canvasRef.current.getContext('2d');
            ctx.font = '16px Arial, sans-serif';
            const metrics = ctx.measureText(editingText.text);
            setElements(prev => [...prev, { ...editingText, width: metrics.width, height: 16 }]);
        }
        setEditingText(null);
        setSelectedId(null);
    };

    // ── cursor: active action wins; otherwise tool default with hover overrides ──
    let canvasCursor;
    if (activeCursor) {
        canvasCursor = activeCursor;
    } else if (activeTool === 'hand')        canvasCursor = 'grab';
    else if (activeTool === 'select')        canvasCursor = hoverHandle ? hoverHandle.cursor : 'default';
    else if (activeTool === 'text')          canvasCursor = 'text';
    else if (activeTool === 'arrow')         canvasCursor = hoverNodeId ? 'crosshair' : 'default';
    else                                     canvasCursor = 'crosshair';

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
                onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
                onAuxClick={(e) => { if (e.button === 1) e.preventDefault(); }}
            />
            {editingText && (
                <textarea
                    autoFocus
                    value={editingText.text}
                    onChange={(e) => setEditingText({ ...editingText, text: e.target.value })}
                    onBlur={handleTextBlur}
                    style={{
                        position: 'absolute',
                        top: editingText.y * camera.zoom + camera.y,
                        left: editingText.x * camera.zoom + camera.x,
                        margin: 0,
                        padding: 0,
                        border: '1px dashed #3b82f6',
                        background: 'transparent',
                        font: `${16 * camera.zoom}px Arial, sans-serif`,
                        color: '#1e1e1e',
                        outline: 'none',
                        resize: 'none',
                        overflow: 'hidden',
                        whiteSpace: 'pre',
                        lineHeight: '1',
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