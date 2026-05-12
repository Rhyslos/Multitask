// user functions
import {
    drawElement,
    drawAnchorDots,
    drawArrowLine,
    drawLine,
    drawResizeHandles,
    resolveAnchor,
    isNodeType,
} from './GraphHelper';

export function renderCanvas(ctx, state) {
    const {
        width, height, camera, elements,
        selectedId, selectedIds, starterId, highlightedIds,
        activeTool, hoverNodeId, action, pendingConnection,
        pendingMarquee,
        hoverEdgeNodeId,
        peers,
    } = state;

    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    // Selection set: prefer the multi-select set, fall back to the single
    // id for callers that haven't been migrated. drawElement only knows
    // about isSelected (boolean), so we compute it per-element.
    const selSet = selectedIds && selectedIds.size > 0
        ? selectedIds
        : (selectedId ? new Set([selectedId]) : new Set());

    elements.forEach(el => drawElement(ctx, el, {
        isSelected: selSet.has(el.id),
        isHighlighted: highlightedIds?.has(el.id) || false,
        isStarter: el.id === starterId,
        isHovered: el.id === hoverEdgeNodeId,
    }, elements));

    // Remote selection rings — drawn from peers' interpolated bounds.
    if (peers) {
        const ringsByTarget = new Map();
        for (const peerState of Object.values(peers)) {
            if (!peerState?.selection || !peerState?.user || !peerState?.selectionBounds) continue;
            if (!ringsByTarget.has(peerState.selection)) ringsByTarget.set(peerState.selection, []);
            ringsByTarget.get(peerState.selection).push({
                user: peerState.user,
                bounds: peerState.selectionBounds,
            });
        }

        for (const [elId, rings] of ringsByTarget) {
            const el = elements.find(e => e.id === elId);
            const isCircle = el?.type === 'circle';
            rings.forEach(({ user, bounds }, i) => {
                const inset = -4 - i * 3;
                ctx.strokeStyle = user.color || '#3b82f6';
                ctx.lineWidth = 2 / camera.zoom;
                ctx.setLineDash([6 / camera.zoom, 4 / camera.zoom]);
                if (isCircle) {
                    ctx.beginPath();
                    ctx.ellipse(
                        bounds.x + bounds.width / 2,
                        bounds.y + bounds.height / 2,
                        Math.abs(bounds.width / 2) - inset,
                        Math.abs(bounds.height / 2) - inset,
                        0, 0, Math.PI * 2,
                    );
                    ctx.stroke();
                } else {
                    ctx.strokeRect(
                        bounds.x + inset,
                        bounds.y + inset,
                        bounds.width - 2 * inset,
                        bounds.height - 2 * inset,
                    );
                }
                ctx.setLineDash([]);
            });
        }
    }

    if (activeTool === 'arrow' && hoverNodeId) {
        const node = elements.find(e => e.id === hoverNodeId);
        if (node && isNodeType(node.type)) drawAnchorDots(ctx, node);
    }

    // Resize handles only when exactly one node-type shape is selected.
    // Multi-selection or arrow-only selection: no handles. Matches the
    // resize action's gating in GraphActions.js.
    if (activeTool === 'select' && selSet.size === 1) {
        const onlyId = selSet.values().next().value;
        const sel = elements.find(e => e.id === onlyId);
        if (sel && isNodeType(sel.type)) drawResizeHandles(ctx, sel);
    }

    if (action === 'connecting' && pendingConnection) {
        let fromPt = null;
        if (pendingConnection.fromPoint) {
            fromPt = pendingConnection.fromPoint;
        } else if (pendingConnection.fromId) {
            const fromEl = elements.find(e => e.id === pendingConnection.fromId);
            if (fromEl) fromPt = resolveAnchor(fromEl, pendingConnection.fromAnchor);
        }

        if (fromPt) {
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            if (pendingConnection.kind === 'line') {
                drawLine(ctx, fromPt.x, fromPt.y, pendingConnection.toPoint.x, pendingConnection.toPoint.y);
            } else {
                drawArrowLine(ctx, fromPt.x, fromPt.y, pendingConnection.toPoint.x, pendingConnection.toPoint.y);
            }
            ctx.setLineDash([]);
        }
    }

    // Marquee selection box. Drawn in world space so it pans/zooms with
    // the canvas. Translucent blue fill + dashed outline — matches Figma /
    // Photoshop visual language.
    if (pendingMarquee) {
        const m = pendingMarquee;
        const w = m.maxX - m.minX;
        const h = m.maxY - m.minY;
        ctx.save();
        ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
        ctx.fillRect(m.minX, m.minY, w, h);
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1 / camera.zoom;
        ctx.setLineDash([6 / camera.zoom, 4 / camera.zoom]);
        ctx.strokeRect(m.minX, m.minY, w, h);
        ctx.setLineDash([]);
        ctx.restore();
    }

    if (peers) {
        for (const peerState of Object.values(peers)) {
            if (!peerState?.cursor || !peerState?.user) continue;
            drawRemoteCursor(ctx, peerState.cursor.x, peerState.cursor.y, peerState.user, camera.zoom);
        }
    }

    ctx.restore();
}

function drawRemoteCursor(ctx, x, y, user, zoom) {
    const s = 1 / zoom;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);

    ctx.fillStyle = user.color || '#3b82f6';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 14);
    ctx.lineTo(4, 10);
    ctx.lineTo(10, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const label = user.displayName || user.email;
    if (label) {
        ctx.font = '11px Arial, sans-serif';
        const padX = 5;
        const metrics = ctx.measureText(label);
        const w = metrics.width + padX * 2;
        const h = 16;
        const lx = 12, ly = 14;
        ctx.fillStyle = user.color || '#3b82f6';
        ctx.fillRect(lx, ly, w, h);
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, lx + padX, ly + h / 2);
    }

    ctx.restore();
}