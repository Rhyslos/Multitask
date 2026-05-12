import {
    isHittingEdge,
    getHandleAtPoint,
    getAnchorFromPoint,
    getAnchorDots,
    resolveAnchor,
    applyResize,
    normalizeBounds,
    isNodeType,
    getArrowEndpoints,
    getNodeBounds,
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

function constrainSquare(dx, dy) {
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const size = Math.max(ax, ay);
    return {
        width:  Math.sign(dx) * size || size,
        height: Math.sign(dy) * size || size,
    };
}

function constrainResizeToAspect(proposed, original, side) {
    if (!original.width || !original.height) return proposed;
    const aspect = Math.abs(original.width) / Math.abs(original.height);

    const isCornerOrAll = side === 'tl' || side === 'tr' || side === 'bl' || side === 'br';
    const isVerticalOnly   = side === 'l' || side === 'r';
    const isHorizontalOnly = side === 't' || side === 'b';

    let w = proposed.width;
    let h = proposed.height;

    if (isCornerOrAll) {
        const wRatio = Math.abs(w) / Math.abs(original.width);
        const hRatio = Math.abs(h) / Math.abs(original.height);
        if (wRatio >= hRatio) {
            h = Math.sign(h || original.height) * (Math.abs(w) / aspect);
        } else {
            w = Math.sign(w || original.width) * (Math.abs(h) * aspect);
        }
    } else if (isVerticalOnly) {
        h = Math.sign(h || original.height) * (Math.abs(w) / aspect);
    } else if (isHorizontalOnly) {
        w = Math.sign(w || original.width) * (Math.abs(h) * aspect);
    }

    let x = proposed.x;
    let y = proposed.y;

    switch (side) {
        case 'tl': {
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

// Returns true if an element's bounds intersect a marquee rectangle. For
// nodes (rect/circle/text), it's an AABB overlap. For arrows/lines, it's
// "is any part of the segment inside the rect" — which is true if either
// endpoint is inside OR the segment crosses any of the rect's four edges.
function elementIntersectsRect(el, allElements, rect) {
    // rect = { minX, minY, maxX, maxY } — normalized.
    if (isNodeType(el.type)) {
        const b = getNodeBounds(el);
        return !(
            b.maxX < rect.minX || b.minX > rect.maxX ||
            b.maxY < rect.minY || b.minY > rect.maxY
        );
    }
    if (el.type === 'arrow' || el.type === 'line') {
        const ends = getArrowEndpoints(el, allElements);
        if (!ends) return false;
        return segmentIntersectsRect(
            ends.from.x, ends.from.y, ends.to.x, ends.to.y,
            rect.minX, rect.minY, rect.maxX, rect.maxY
        );
    }
    return false;
}

// Cohen-style cheap path: endpoint-in-rect OR Liang-Barsky line clip. We
// only need a boolean, so the parametric clip is overkill — checking
// endpoints first short-circuits most cases.
function segmentIntersectsRect(x1, y1, x2, y2, minX, minY, maxX, maxY) {
    const inside = (x, y) => x >= minX && x <= maxX && y >= minY && y <= maxY;
    if (inside(x1, y1) || inside(x2, y2)) return true;
    // Segment vs each of the four rect edges.
    return segIntersect(x1, y1, x2, y2, minX, minY, maxX, minY) ||
           segIntersect(x1, y1, x2, y2, maxX, minY, maxX, maxY) ||
           segIntersect(x1, y1, x2, y2, maxX, maxY, minX, maxY) ||
           segIntersect(x1, y1, x2, y2, minX, maxY, minX, minY);
}

function segIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
    const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
    const d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
    const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
           ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

// ───────────────────────────────────────────────────────────────
// Actions
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

export const eraserAction = {
    name: 'eraser',
    priority: 55,
    tryStart(ctx, evt) {
        if (ctx.activeTool !== 'eraser' || evt.button !== 0) return null;
        const hit = [...ctx.elements].reverse().find(el =>
            isHittingEdge(evt.worldX, evt.worldY, el, ctx.elements)
        );
        if (!hit) return null;

        const ids = [hit.id];
        for (const el of ctx.elements) {
            if ((el.type === 'arrow' || el.type === 'line') &&
                (el.fromId === hit.id || el.toId === hit.id)) {
                ids.push(el.id);
            }
        }
        ctx.mutator.removeMany(ids);
        if (ctx.selectedIds?.has(hit.id)) ctx.setSelectedId(null);
        return { erased: hit.id };
    },
    onMove() { },
    onEnd() { },
    getCursor: () => 'cell',
};

export const resizeAction = {
    name: 'resize',
    priority: 60,
    tryStart(ctx, evt) {
        // Resize handles only render for a single selection — multi-select
        // doesn't show them, so this action only fires when exactly one
        // node is selected. Matches the renderer's behavior.
        if (ctx.activeTool !== 'select' || evt.button !== 0) return null;
        if (!ctx.selectedIds || ctx.selectedIds.size !== 1) return null;
        const onlyId = ctx.selectedIds.values().next().value;
        const sel = ctx.elements.find(e => e.id === onlyId);
        if (!sel || !isNodeType(sel.type)) return null;
        const handle = getHandleAtPoint(sel, evt.worldX, evt.worldY);
        if (!handle) return null;
        return {
            id: onlyId,
            side: handle.side,
            cursor: handle.cursor,
            start: { x: sel.x, y: sel.y, width: sel.width, height: sel.height },
        };
    },
    onMove(ctx, ds, evt) {
        let updated = applyResize(ds.start, ds.side, evt.worldX, evt.worldY);
        if (evt.shiftKey) {
            updated = constrainResizeToAspect(updated, ds.start, ds.side);
        }
        ctx.mutator.throttledUpdate(ds.id, updated);
    },
    onEnd(ctx, ds, evt, opts) {
        if (opts?.cancelled) {
            ctx.mutator.update(ds.id, ds.start);
            ctx.mutator.endDrag(ds.id);
            return;
        }
        const sel = ctx.elements.find(e => e.id === ds.id);
        if (sel) {
            const normalized = normalizeBounds(sel);
            ctx.mutator.update(ds.id, {
                x: normalized.x,
                y: normalized.y,
                width: normalized.width,
                height: normalized.height,
            });
        }
        ctx.mutator.endDrag(ds.id);
    },
    getCursor: (ctx, ds) => ds.cursor,
};

// Select + move. With multi-selection: if the clicked shape is already part
// of the selection, the whole group moves together. If it isn't, behavior
// depends on the shift key — shift adds to selection, otherwise replaces.
export const selectMoveAction = {
    name: 'selectMove',
    priority: 50,
    tryStart(ctx, evt) {
        if (ctx.activeTool !== 'select' || evt.button !== 0) return null;
        const hit = [...ctx.elements].reverse().find(el => isHittingEdge(evt.worldX, evt.worldY, el, ctx.elements));
        if (!hit) {
            // No hit and no shift = clear selection. With shift, leave it
            // alone — marquee action will pick this up next.
            if (!evt.shiftKey) ctx.setSelectedId(null);
            return null;
        }

        const sel = ctx.selectedIds || new Set();
        const alreadySelected = sel.has(hit.id);

        // Update selection BEFORE deciding what to drag, so the drag group
        // matches the new selection.
        let groupIds;
        if (evt.shiftKey) {
            if (alreadySelected) {
                // Shift-click on selected member: remove it. No drag.
                const next = new Set(sel);
                next.delete(hit.id);
                ctx.setSelectedId(next);
                return null;
            }
            // Shift-click adds to selection. The newly-added shape becomes
            // part of the drag group along with everything already selected.
            const next = new Set(sel);
            next.add(hit.id);
            ctx.setSelectedId(next);
            groupIds = [...next];
        } else if (alreadySelected && sel.size > 1) {
            // Click on a member of an existing multi-selection: drag the
            // whole group. Don't change the selection.
            groupIds = [...sel];
        } else {
            // Click on a shape (selected or not), no shift: replace selection.
            ctx.setSelectedId(hit.id);
            groupIds = [hit.id];
        }

        // Arrows/lines aren't draggable directly — their endpoints move
        // when their endpoint nodes move. Filter them out of the drag
        // group; if that leaves nothing, no drag.
        const draggable = groupIds.filter(id => {
            const el = ctx.elements.find(e => e.id === id);
            return el && isNodeType(el.type);
        });
        if (draggable.length === 0) return null;

        // Snapshot starting positions for every draggable shape, so onMove
        // can compute final positions from a single delta against origin.
        // Computing relative-to-anchor every frame would be cheaper but
        // floating-point drift would creep in across many move events.
        const starts = new Map();
        for (const id of draggable) {
            const el = ctx.elements.find(e => e.id === id);
            if (!el) continue;
            starts.set(id, { x: el.x, y: el.y });
        }

        return {
            anchorId: hit.id,
            startWorldX: evt.worldX,
            startWorldY: evt.worldY,
            starts,
        };
    },
    onMove(ctx, ds, evt) {
        const dx = evt.worldX - ds.startWorldX;
        const dy = evt.worldY - ds.startWorldY;
        // Apply the same delta to each shape in the group. Per-id throttling
        // means every shape gets its own 30Hz cadence — no shared bottleneck.
        for (const [id, start] of ds.starts) {
            ctx.mutator.throttledUpdate(id, {
                x: start.x + dx,
                y: start.y + dy,
            });
        }
    },
    onEnd(ctx, ds, evt, opts) {
        if (opts?.cancelled) {
            for (const id of ds.starts.keys()) ctx.mutator.endDrag(id);
            return;
        }
        const dx = evt.worldX - ds.startWorldX;
        const dy = evt.worldY - ds.startWorldY;
        for (const [id, start] of ds.starts) {
            ctx.mutator.update(id, { x: start.x + dx, y: start.y + dy });
            ctx.mutator.endDrag(id);
        }
    },
    getCursor: () => 'move',
};

export const connectAction = {
    name: 'connect',
    priority: 50,
    tryStart(ctx, evt) {
        if (evt.button !== 0) return null;
        if (ctx.activeTool !== 'arrow' && ctx.activeTool !== 'line') return null;

        const found = findNodeAtEdge(ctx.elements, evt.worldX, evt.worldY);
        let fromShape;
        if (found) {
            const anchor = findAnchorOnNode(found.el, evt.worldX, evt.worldY) || found.anchor;
            fromShape = { fromId: found.el.id, fromAnchor: anchor };
        } else {
            fromShape = { fromPoint: { x: evt.worldX, y: evt.worldY } };
        }

        ctx.setSelectedId(null);
        ctx.setPendingConnection({
            ...fromShape,
            toPoint: { x: evt.worldX, y: evt.worldY },
            kind: ctx.activeTool,
        });
        return { ...fromShape, kind: ctx.activeTool };
    },
    onMove(ctx, ds, evt) {
        const found = findNodeAtEdge(ctx.elements, evt.worldX, evt.worldY);
        let toPoint = { x: evt.worldX, y: evt.worldY };
        if (found && found.el.id !== ds.fromId) {
            const snapped = findAnchorOnNode(found.el, evt.worldX, evt.worldY) || found.anchor;
            toPoint = resolveAnchor(found.el, snapped);
        }
        ctx.setPendingConnection({
            ...(ds.fromId ? { fromId: ds.fromId, fromAnchor: ds.fromAnchor } : { fromPoint: ds.fromPoint }),
            toPoint,
            kind: ds.kind,
        });
    },
    onEnd(ctx, ds, evt, opts) {
        if (!opts?.cancelled) {
            const found = findNodeAtEdge(ctx.elements, evt.worldX, evt.worldY);
            let toShape;
            if (found && found.el.id !== ds.fromId) {
                const toAnchor = findAnchorOnNode(found.el, evt.worldX, evt.worldY) || found.anchor;
                toShape = { toId: found.el.id, toAnchor };
            } else {
                toShape = { toPoint: { x: evt.worldX, y: evt.worldY } };
            }

            const fromShape = ds.fromId
                ? { fromId: ds.fromId, fromAnchor: ds.fromAnchor }
                : { fromPoint: ds.fromPoint };

            const startPt = ds.fromId ? null : ds.fromPoint;
            const endPt = toShape.toPoint || null;
            if (startPt && endPt && Math.hypot(endPt.x - startPt.x, endPt.y - startPt.y) < 3) {
                ctx.setPendingConnection(null);
                return;
            }

            ctx.mutator.create({
                id: crypto.randomUUID(),
                type: ds.kind,
                ...fromShape,
                ...toShape,
            });
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

// Marquee select. Lowest priority — runs only when select tool is active
// AND no shape was hit (selectMove returned null without consuming the
// event). Renders a translucent rect during the drag. On release, every
// element intersecting the rect joins the selection.
//
// Shift held at start: ADD to existing selection rather than replacing.
// Held mid-drag doesn't matter — only the modifier at tryStart fixes the mode.
export const marqueeSelectAction = {
    name: 'marqueeSelect',
    priority: 30,
    tryStart(ctx, evt) {
        if (ctx.activeTool !== 'select' || evt.button !== 0) return null;
        // Don't start a marquee if there's a shape under the pointer —
        // selectMove (priority 50) handles that path. We're the fallback.
        const hit = ctx.elements.find(el => isHittingEdge(evt.worldX, evt.worldY, el, ctx.elements));
        if (hit) return null;

        return {
            startX: evt.worldX,
            startY: evt.worldY,
            additive: !!evt.shiftKey,
            // Snapshot selection at drag start so additive mode can compute
            // (initial ∪ hits) regardless of intermediate state.
            initial: new Set(ctx.selectedIds || []),
        };
    },
    onMove(ctx, ds, evt) {
        // The marquee rect is driven via setPendingMarquee — same pattern as
        // pendingConnection. Renderer reads it and paints the translucent box.
        ctx.setPendingMarquee?.({
            minX: Math.min(ds.startX, evt.worldX),
            minY: Math.min(ds.startY, evt.worldY),
            maxX: Math.max(ds.startX, evt.worldX),
            maxY: Math.max(ds.startY, evt.worldY),
        });
    },
    onEnd(ctx, ds, evt, opts) {
        ctx.setPendingMarquee?.(null);
        if (opts?.cancelled) return;

        const rect = {
            minX: Math.min(ds.startX, evt.worldX),
            minY: Math.min(ds.startY, evt.worldY),
            maxX: Math.max(ds.startX, evt.worldX),
            maxY: Math.max(ds.startY, evt.worldY),
        };
        // Tiny rect = treat as a click on empty space, not a marquee.
        // (Threshold mirrors the connect-action's no-commit click guard.)
        if (rect.maxX - rect.minX < 3 && rect.maxY - rect.minY < 3) {
            if (!ds.additive) ctx.setSelectedId(null);
            return;
        }

        const hits = ctx.elements.filter(el => elementIntersectsRect(el, ctx.elements, rect));
        const hitIds = hits.map(el => el.id);

        if (ds.additive) {
            const next = new Set(ds.initial);
            for (const id of hitIds) next.add(id);
            ctx.setSelectedId(next);
        } else {
            ctx.setSelectedId(hitIds);
        }
    },
    getCursor: () => 'default',
};

export const ALL_ACTIONS = [
    middleMousePanAction,
    resizeAction,
    eraserAction,
    handPanAction,
    selectMoveAction,
    connectAction,
    drawAction,
    marqueeSelectAction,
];