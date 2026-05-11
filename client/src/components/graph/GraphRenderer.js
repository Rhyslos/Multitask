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
        hoverEdgeNodeId,
        peers,                        // { [clientId]: {user, cursor?, selection?, selectionBounds?} }
    } = state;

    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    elements.forEach(el => drawElement(ctx, el, {
        isSelected: el.id === selectedId,
        isHighlighted: highlightedIds?.has(el.id) || false,
        isStarter: el.id === starterId,
        isHovered: el.id === hoverEdgeNodeId,
    }, elements));

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

    if (peers) {
        for (const peerState of Object.values(peers)) {
            if (!peerState?.cursor || !peerState?.user) continue;
            drawRemoteCursor(ctx, peerState.cursor.x, peerState.cursor.y, peerState.user, camera.zoom);
        }
    }

    ctx.restore();
}

function drawRemoteCursor(ctx, x, y, user, zoom) {
    // Scale-invariant: cursors stay the same on-screen size regardless of zoom.
    const s = 1 / zoom;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);

    // Arrow shape — small triangle pointing up-left, like a real cursor.
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

    // Label. Prefer displayName (set by useGraphSync from user.displayName);
    // fall back to email only if displayName isn't on the awareness payload
    // for some reason. The fallback exists for resilience — fresh signups
    // always have a displayName, but a stale cached user record could lack one.
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