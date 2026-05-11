// user functions
import { useRef, useLayoutEffect, useState, useCallback } from 'react';
import { renderCanvas } from './GraphRenderer';
import useCanvasCamera from '../../hooks/useCanvasCamera';
import useCanvasPointer from '../../hooks/useCanvasPointer';
import useInterpolatedCursors from '../../hooks/useInterpolatedCursors';
import ZoomBadge from './ZoomBadge';
import GraphContextMenu from './GraphContextMenu';
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
    peers,
    broadcastCursor,
    clipboard,           // { element } | null — owned by Graph.jsx
    setClipboard,        // setter for the above
}) {
    const canvasRef = useRef(null);
    const [editingText, setEditingText] = useState(null);
    const [pendingConnection, setPendingConnection] = useState(null);
    // Context menu state. `variant` distinguishes shape vs. canvas menus;
    // `target` is the element clicked (shape variant) or null (canvas);
    // `worldPos` is needed by canvas actions like paste-here / add-shape.
    const [contextMenu, setContextMenu] = useState(null);

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
        selectedId, setSelectedId,
        camera, setCamera, screenToWorld,
        activeTool,
        editingText,
        setPendingConnection,
        broadcastCursor,
        suppressHover: !!contextMenu,  // freeze hover state while menu is open
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

    // ───────────────────────────────────────────────────────────────
    // Right-click → context menu
    //
    // Ignored while a drag is active or while editing text. Hit-tests in
    // reverse z-order (same as selectMove) so the top-most shape wins.
    // ───────────────────────────────────────────────────────────────
    const handleContextMenu = useCallback((e) => {
        e.preventDefault();
        if (editingText || isActive()) return;

        const { offsetX, offsetY, clientX, clientY } = e.nativeEvent;
        const { x: worldX, y: worldY } = screenToWorld(offsetX, offsetY);

        const hit = [...elements].reverse().find(el =>
            isHittingEdge(worldX, worldY, el, elements)
        );

        if (hit) {
            // Right-click implicitly selects the target. Matches every
            // graphics tool (Figma, Illustrator, etc.) — users expect the
            // shape to be visibly the focus while the menu is open.
            setSelectedId(hit.id);
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
    }, [editingText, isActive, elements, screenToWorld, setSelectedId]);

    // ───────────────────────────────────────────────────────────────
    // Context menu actions. Each handler captures the target from the
    // open menu state — we don't trust selectedId here because some flows
    // (canvas menu paste-here) don't involve selection.
    // ───────────────────────────────────────────────────────────────
    const actions = {
        onDelete: () => {
            const id = contextMenu?.target?.id;
            if (!id) return;
            // Mirror useCanvasPointer's keyboard delete: cascade connected arrows.
            const ids = [id];
            for (const el of elements) {
                if (el.type === 'arrow' && (el.fromId === id || el.toId === id)) {
                    ids.push(el.id);
                }
            }
            mutator.removeMany(ids);
            setSelectedId(null);
        },
        onDuplicate: () => {
            const target = contextMenu?.target;
            if (!target) return;
            // Stash a clipboard entry too, so the user's "duplicate" flow
            // also seeds paste — same gesture in spirit.
            setClipboard({ element: target });
            const newId = mutator.duplicate(target.id);
            if (newId) setSelectedId(newId);
        },
        onBringToFront: () => contextMenu?.target && mutator.bringToFront(contextMenu.target.id),
        onBringForward: () => contextMenu?.target && mutator.bringForward(contextMenu.target.id),
        onSendBackward: () => contextMenu?.target && mutator.sendBackward(contextMenu.target.id),
        onSendToBack:   () => contextMenu?.target && mutator.sendToBack(contextMenu.target.id),
        onChangeColor: (hex) => {
            // Persists the color on the element. The renderer doesn't yet
            // read this field — when it does, existing data is ready.
            if (contextMenu?.target) mutator.changeColor(contextMenu.target.id, hex);
        },
        onChangeType: (type) => {
            if (contextMenu?.target) mutator.changeType(contextMenu.target.id, type);
        },
        onPaste: (worldPos) => {
            if (!clipboard?.element || !worldPos) return;
            const src = clipboard.element;
            // Paste arrives at the click point, not src+offset like Duplicate.
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
                // Reuse the editing-text path so the user gets to type immediately,
                // same as clicking with the Text tool.
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
            // Default size for shapes added via menu — drag-to-draw isn't
            // available here, so we pick a comfortable starting bound.
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

    const handleCanvasPointerDown = (e) => {
        // Close any open context menu when the user clicks anywhere on the
        // canvas. The menu's own outside-mousedown listener handles this
        // too, but doing it here means the pointer-down also begins a drag
        // / selection seamlessly.
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
