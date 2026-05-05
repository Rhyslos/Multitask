// Pure rendering. Takes a 2D context and a state object; produces no React effects.
// Called once per frame from GraphCanvas's useLayoutEffect.

import {
    drawElement,
    drawAnchorDots,
    drawArrowLine,
    drawResizeHandles,
    resolveAnchor,
    isNodeType,
} from './GraphHelper';

// state shape:
//   { width, height, camera: {x,y,zoom}, elements, selectedId, starterId,
//     highlightedIds: Set, activeTool, hoverNodeId, action, pendingConnection }
export function renderCanvas(ctx, state) {
    const {
        width, height, camera, elements,
        selectedId, starterId, highlightedIds,
        activeTool, hoverNodeId, action, pendingConnection,
    } = state;

    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    // 1. all elements (arrows resolve their endpoints from connected nodes)
    elements.forEach(el => drawElement(ctx, el, {
        isSelected: el.id === selectedId,
        isHighlighted: highlightedIds?.has(el.id) || false,
        isStarter: el.id === starterId,
    }, elements));

    // 2. anchor dots when arrow tool hovers a node
    if (activeTool === 'arrow' && hoverNodeId) {
        const node = elements.find(e => e.id === hoverNodeId);
        if (node && isNodeType(node.type)) drawAnchorDots(ctx, node);
    }

    // 3. resize handles around the selected node
    if (activeTool === 'select' && selectedId) {
        const sel = elements.find(e => e.id === selectedId);
        if (sel && isNodeType(sel.type)) drawResizeHandles(ctx, sel);
    }

    // 4. rubber-band line for in-progress connection
    if (action === 'connecting' && pendingConnection) {
        const fromEl = elements.find(e => e.id === pendingConnection.fromId);
        if (fromEl) {
            const fromPt = resolveAnchor(fromEl, pendingConnection.fromAnchor);
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            drawArrowLine(ctx, fromPt.x, fromPt.y, pendingConnection.toPoint.x, pendingConnection.toPoint.y);
            ctx.setLineDash([]);
        }
    }

    ctx.restore();
}