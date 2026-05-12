// imports
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

// helper functions
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

// intersection functions
function elementIntersectsRect(el, allElements, rect) {
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

function segmentIntersectsRect(x1, y1, x2, y2, minX, minY, maxX, maxY) {
    const inside = (x, y) => x >= minX && x <= maxX && y >= minY && y <= maxY;
    if (inside(x1, y1) || inside(x2, y2)) return true;
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

// action definitions
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

export const selectMoveAction = {
    name: 'selectMove',
    priority: 50,
    tryStart(ctx, evt) {
        if (ctx.activeTool !== 'select' || evt.button !== 0) return null;
        const hit = [...ctx.elements].reverse().find(el => isHittingEdge(evt.worldX, evt.worldY, el, ctx.elements));
        if (!hit) {
            if (!evt.shiftKey) ctx.setSelectedId(null);
            return null;
        }

        const sel = ctx.selectedIds || new Set();
        const alreadySelected = sel.has(hit.id);

        let groupIds;
        if (evt.shiftKey) {
            if (alreadySelected) {
                const next = new Set(sel);
                next.delete(hit.id);
                ctx.setSelectedId(next);
                return null;
            }
            const next = new Set(sel);
            next.add(hit.id);
            ctx.setSelectedId(next);
            groupIds = [...next];
        } else if (alreadySelected && sel.size > 1) {
            groupIds = [...sel];
        } else {
            ctx.setSelectedId(hit.id);
            groupIds = [hit.id];
        }

        const draggable = groupIds.filter(id => {
            const el = ctx.elements.find(e => e.id === id);
            return el && isNodeType(el.type);
        });
        if (draggable.length === 0) return null;

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

export const marqueeSelectAction = {
    name: 'marqueeSelect',
    priority: 30,
    tryStart(ctx, evt) {
        if (ctx.activeTool !== 'select' || evt.button !== 0) return null;
        const hit = ctx.elements.find(el => isHittingEdge(evt.worldX, evt.worldY, el, ctx.elements));
        if (hit) return null;

        return {
            startX: evt.worldX,
            startY: evt.worldY,
            additive: !!evt.shiftKey,
            initial: new Set(ctx.selectedIds || []),
        };
    },
    onMove(ctx, ds, evt) {
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

// exported action list
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