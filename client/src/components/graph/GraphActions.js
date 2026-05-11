
import {
    isHittingEdge,
    getHandleAtPoint,
    getAnchorFromPoint,
    getAnchorDots,
    resolveAnchor,
    applyResize,
    normalizeBounds,
    isNodeType,
} from './GraphHelper';

// ───────────────────────────────────────────────────────────────
// Helpers shared across actions
// ───────────────────────────────────────────────────────────────

function findNodeAtEdge(elements, px, py) {
    for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i];
        if (!isNodeType(el.type)) continue;
        const anchor = getAnchorFromPoint(el, px, py);
        if (anchor) return { el, anchor };
    }
    return null;
}

function findAnchorOnNode(el, px, py) {
    const dots = getAnchorDots(el);
    const SNAP = 12;
    for (const d of dots) {
        if (Math.hypot(d.x - px, d.y - py) <= SNAP) return { side: d.side, t: d.t };
    }
    return getAnchorFromPoint(el, px, py);
}

// Shift-constrain a draw operation to a square. We keep the signs of the
// raw deltas (so the user can still draw in any of the four quadrants from
// the start point) but force |w| == |h| by taking the larger magnitude.
// This matches the behavior of Figma / tldraw / most drawing apps.
function constrainSquare(dx, dy) {
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const size = Math.max(ax, ay);
    return {
        width:  Math.sign(dx) * size || size,   // fall back to +size on zero (first frame)
        height: Math.sign(dy) * size || size,
    };
}

// Shift-constrain a resize. We project the proposed (width, height) onto the
// original aspect ratio. Which axis "wins" depends on which corner/side is
// being dragged: corners use the larger relative change, sides use whichever
// axis they actually control. Falls back to the unconstrained result if the
// original had zero area (e.g. mid-creation).
function constrainResizeToAspect(proposed, original, side) {
    if (!original.width || !original.height) return proposed;
    const aspect = Math.abs(original.width) / Math.abs(original.height);

    const isCornerOrAll = side === 'tl' || side === 'tr' || side === 'bl' || side === 'br';
    const isVerticalOnly   = side === 'l' || side === 'r';
    const isHorizontalOnly = side === 't' || side === 'b';

    let w = proposed.width;
    let h = proposed.height;

    if (isCornerOrAll) {
        // Pick the axis with the larger proportional change relative to the
        // original, then derive the other from the aspect ratio.
        const wRatio = Math.abs(w) / Math.abs(original.width);
        const hRatio = Math.abs(h) / Math.abs(original.height);
        if (wRatio >= hRatio) {
            h = Math.sign(h || original.height) * (Math.abs(w) / aspect);
        } else {
            w = Math.sign(w || original.width) * (Math.abs(h) * aspect);
        }
    } else if (isVerticalOnly) {
        // Side handle drives width; height follows.
        h = Math.sign(h || original.height) * (Math.abs(w) / aspect);
    } else if (isHorizontalOnly) {
        // Top/bottom drives height; width follows.
        w = Math.sign(w || original.width) * (Math.abs(h) * aspect);
    }

    // Now reconstruct x/y. applyResize already produced an (x, y) compatible
    // with the proposed (w, h); if we changed w/h, we have to re-derive the
    // anchor so the *opposite* edge stays fixed.
    let x = proposed.x;
    let y = proposed.y;

    // For each side handle, the fixed edge is the opposite one in the original.
    // Recompute x and y from the original's anchor edges and the new w/h.
    switch (side) {
        case 'tl': {
            // Fixed corner: bottom-right of the original.
            const fixedX = original.x + original.width;
            const fixedY = original.y + original.height;
            x = fixedX - w;
            y = fixedY - h;
            break;
        }
        case 'tr': {
            const fixedX = original.x;
            const fixedY = original.y + original.height;
            x = fixedX;
            y = fixedY - h;
            break;
        }
        case 'bl': {
            const fixedX = original.x + original.width;
            const fixedY = original.y;
            x = fixedX - w;
            y = fixedY;
            break;
        }
        case 'br': {
            x = original.x;
            y = original.y;
            break;
        }
        case 'l': {
            const fixedX = original.x + original.width;
            x = fixedX - w;
            // Keep height centered on the original's vertical center.
            y = original.y + (original.height - h) / 2;
            break;
        }
        case 'r': {
            x = original.x;
            y = original.y + (original.height - h) / 2;
            break;
        }
        case 't': {
            const fixedY = original.y + original.height;
            y = fixedY - h;
            x = original.x + (original.width - w) / 2;
            break;
        }
        case 'b': {
            y = original.y;
            x = original.x + (original.width - w) / 2;
            break;
        }
        default: break;
    }

    return { x, y, width: w, height: h };
}

// ───────────────────────────────────────────────────────────────
// Actions
//
// Each action receives a `ctx` carrying both query state (elements, selectedId,
// camera, activeTool) and mutation primitives (mutator, setSelectedId,
// setCamera, setPendingConnection). Actions never call setElements directly —
// all element writes go through ctx.mutator so they propagate over Yjs.
//
// Throttling rules:
//   - drawAction.onMove and resizeAction.onMove run at pointer rate (~144Hz).
//     They use mutator.throttledUpdate to ship at 30Hz over the wire while
//     keeping local rendering at full rate via the override map.
//   - selectMoveAction.onMove similarly uses throttledUpdate.
//   - All actions call mutator.endDrag(id) (or implicit via update/remove) on
//     onEnd to flush the last throttled tick and clear the override.
//
// Shift constraints:
//   - drawAction: square / circular shape (|w| == |h|).
//   - resizeAction: preserve the element's aspect ratio at drag start.
//   - selectMove and connect: shift has no effect (no constraint needed).
// ───────────────────────────────────────────────────────────────

export const middleMousePanAction = {
    name: 'middleMousePan',
    priority: 100,
    tryStart(ctx, evt) {
        if (evt.button !== 1) return null;
        evt.native?.preventDefault?.();
        return { camX: ctx.camera.x, camY: ctx.camera.y, mouseX: evt.screenX, mouseY: evt.screenY };
    },
    onMove(ctx, ds, evt) {
        ctx.setCamera(prev => ({
            ...prev,
            x: ds.camX + (evt.screenX - ds.mouseX),
            y: ds.camY + (evt.screenY - ds.mouseY),
        }));
    },
    getCursor: () => 'grabbing',
};

export const handPanAction = {
    name: 'handPan',
    priority: 50,
    tryStart(ctx, evt) {
        if (ctx.activeTool !== 'hand' || evt.button !== 0) return null;
        return { camX: ctx.camera.x, camY: ctx.camera.y, mouseX: evt.screenX, mouseY: evt.screenY };
    },
    onMove(ctx, ds, evt) {
        ctx.setCamera(prev => ({
            ...prev,
            x: ds.camX + (evt.screenX - ds.mouseX),
            y: ds.camY + (evt.screenY - ds.mouseY),
        }));
    },
    getCursor: () => 'grabbing',
};

export const resizeAction = {
    name: 'resize',
    priority: 60,
    tryStart(ctx, evt) {
        if (ctx.activeTool !== 'select' || evt.button !== 0 || !ctx.selectedId) return null;
        const sel = ctx.elements.find(e => e.id === ctx.selectedId);
        if (!sel || !isNodeType(sel.type)) return null;
        const handle = getHandleAtPoint(sel, evt.worldX, evt.worldY);
        if (!handle) return null;
        return {
            side: handle.side,
            cursor: handle.cursor,
            start: { x: sel.x, y: sel.y, width: sel.width, height: sel.height },
        };
    },
    onMove(ctx, ds, evt) {
        let updated = applyResize(ds.start, ds.side, evt.worldX, evt.worldY);
        // Shift = preserve aspect ratio of the element as it was at drag start.
        if (evt.shiftKey) {
            updated = constrainResizeToAspect(updated, ds.start, ds.side);
        }
        ctx.mutator.throttledUpdate(ctx.selectedId, updated);
    },
    onEnd(ctx, ds, evt, opts) {
        const id = ctx.selectedId;
        if (opts?.cancelled) {
            ctx.mutator.update(id, ds.start);
            ctx.mutator.endDrag(id);
            return;
        }
        const sel = ctx.elements.find(e => e.id === id);
        if (sel) {
            const normalized = normalizeBounds(sel);
            ctx.mutator.update(id, {
                x: normalized.x,
                y: normalized.y,
                width: normalized.width,
                height: normalized.height,
            });
        }
        ctx.mutator.endDrag(id);
    },
    getCursor: (ctx, ds) => ds.cursor,
};

export const selectMoveAction = {
    name: 'selectMove',
    priority: 50,
    tryStart(ctx, evt) {
        if (ctx.activeTool !== 'select' || evt.button !== 0) return null;
        const hit = [...ctx.elements].reverse().find(el => isHittingEdge(evt.worldX, evt.worldY, el, ctx.elements));
        if (!hit) {
            ctx.setSelectedId(null);
            return null;
        }
        ctx.setSelectedId(hit.id);
        if (hit.type === 'arrow') return null;
        return { offsetX: evt.worldX - hit.x, offsetY: evt.worldY - hit.y, id: hit.id };
    },
    onMove(ctx, ds, evt) {
        ctx.mutator.throttledUpdate(ds.id, {
            x: evt.worldX - ds.offsetX,
            y: evt.worldY - ds.offsetY,
        });
    },
    onEnd(ctx, ds, evt, opts) {
        if (opts?.cancelled) {
            ctx.mutator.endDrag(ds.id);
            return;
        }
        ctx.mutator.update(ds.id, {
            x: evt.worldX - ds.offsetX,
            y: evt.worldY - ds.offsetY,
        });
        ctx.mutator.endDrag(ds.id);
    },
    getCursor: () => 'move',
};

export const connectAction = {
    name: 'connect',
    priority: 50,
    tryStart(ctx, evt) {
        if (ctx.activeTool !== 'arrow' || evt.button !== 0) return null;
        const found = findNodeAtEdge(ctx.elements, evt.worldX, evt.worldY);
        if (!found) return null;
        const anchor = findAnchorOnNode(found.el, evt.worldX, evt.worldY) || found.anchor;
        ctx.setSelectedId(null);
        const pending = {
            fromId: found.el.id,
            fromAnchor: anchor,
            toPoint: { x: evt.worldX, y: evt.worldY },
        };
        ctx.setPendingConnection(pending);
        return { fromId: found.el.id, fromAnchor: anchor };
    },
    onMove(ctx, ds, evt) {
        const found = findNodeAtEdge(ctx.elements, evt.worldX, evt.worldY);
        let toPoint = { x: evt.worldX, y: evt.worldY };
        if (found && found.el.id !== ds.fromId) {
            const snapped = findAnchorOnNode(found.el, evt.worldX, evt.worldY) || found.anchor;
            toPoint = resolveAnchor(found.el, snapped);
        }
        ctx.setPendingConnection({ fromId: ds.fromId, fromAnchor: ds.fromAnchor, toPoint });
    },
    onEnd(ctx, ds, evt, opts) {
        if (!opts?.cancelled) {
            const found = findNodeAtEdge(ctx.elements, evt.worldX, evt.worldY);
            if (found && found.el.id !== ds.fromId) {
                const toAnchor = findAnchorOnNode(found.el, evt.worldX, evt.worldY) || found.anchor;
                ctx.mutator.create({
                    id: crypto.randomUUID(),
                    type: 'arrow',
                    fromId: ds.fromId,
                    fromAnchor: ds.fromAnchor,
                    toId: found.el.id,
                    toAnchor,
                });
            }
        }
        ctx.setPendingConnection(null);
    },
    getCursor: () => 'crosshair',
};

export const drawAction = {
    name: 'draw',
    priority: 40,
    tryStart(ctx, evt) {
        if (evt.button !== 0) return null;
        if (ctx.activeTool !== 'rectangle' && ctx.activeTool !== 'circle') return null;
        ctx.setSelectedId(null);
        const id = crypto.randomUUID();
        const newEl = { id, type: ctx.activeTool, x: evt.worldX, y: evt.worldY, width: 0, height: 0 };
        ctx.mutator.create(newEl);
        return { id, startX: evt.worldX, startY: evt.worldY };
    },
    onMove(ctx, ds, evt) {
        const dx = evt.worldX - ds.startX;
        const dy = evt.worldY - ds.startY;
        // Shift = uniform: square rectangle, circular circle.
        const patch = evt.shiftKey
            ? constrainSquare(dx, dy)
            : { width: dx, height: dy };
        ctx.mutator.throttledUpdate(ds.id, patch);
    },
    onEnd(ctx, ds, evt, opts) {
        if (opts?.cancelled) {
            ctx.mutator.remove(ds.id);
            return;
        }
        const el = ctx.elements.find(e => e.id === ds.id);
        if (!el) {
            ctx.mutator.endDrag(ds.id);
            return;
        }
        if (Math.abs(el.width) <= 2 && Math.abs(el.height) <= 2) {
            ctx.mutator.remove(ds.id);
            return;
        }
        const normalized = normalizeBounds(el);
        ctx.mutator.update(ds.id, {
            x: normalized.x,
            y: normalized.y,
            width: normalized.width,
            height: normalized.height,
        });
        ctx.mutator.endDrag(ds.id);
    },
    getCursor: () => 'crosshair',
};

export const ALL_ACTIONS = [
    middleMousePanAction,
    resizeAction,
    handPanAction,
    selectMoveAction,
    connectAction,
    drawAction,
];
