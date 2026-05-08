// user functions
import {
    drawElement,
    drawAnchorDots,
    drawArrowLine,
    drawResizeHandles,
    resolveAnchor,
    isNodeType,
} from './GraphHelper';

export function renderCanvas(ctx, state) {
    const {
        width, height, camera, elements,
        selectedId, starterId, highlightedIds,
        activeTool, hoverNodeId, action, pendingConnection,
        hoverEdgeNodeId
    } = state;

    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    elements.forEach(el => drawElement(ctx, el, {
        isSelected: el.id === selectedId,
        isHighlighted: highlightedIds?.has(el.id) || false,
        isStarter: el.id === starterId,
        isHovered: el.id === hoverEdgeNodeId
    }, elements));

    if (activeTool === 'arrow' && hoverNodeId) {
        const node = elements.find(e => e.id === hoverNodeId);
        if (node && isNodeType(node.type)) drawAnchorDots(ctx, node);
    }

    if (activeTool === 'select' && selectedId) {
        const sel = elements.find(e => e.id === selectedId);
        if (sel && isNodeType(sel.type)) drawResizeHandles(ctx, sel);
    }

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