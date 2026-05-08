

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

export const resizeAction = {
    name: 'resize',
    priority: 60, // beat selectMove — handles can sit on the node edge
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
        const updated = applyResize(ds.start, ds.side, evt.worldX, evt.worldY);
        ctx.setElements(prev => prev.map(el =>
            el.id === ctx.selectedId ? { ...el, ...updated } : el
        ));
    },
    onEnd(ctx, ds, evt, opts) {
        if (opts?.cancelled) {
            ctx.setElements(prev => prev.map(el =>
                el.id === ctx.selectedId ? { ...el, ...ds.start } : el
            ));
            return;
        }
        // Normalize negative w/h after the drag.
        ctx.setElements(prev => prev.map(el =>
            el.id === ctx.selectedId ? normalizeBounds(el) : el
        ));
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
        // Arrows are selectable but not draggable here.
        if (hit.type === 'arrow') return null;
        return { offsetX: evt.worldX - hit.x, offsetY: evt.worldY - hit.y, id: hit.id };
    },
    onMove(ctx, ds, evt) {
        ctx.setElements(prev => prev.map(el =>
            el.id === ds.id ? { ...el, x: evt.worldX - ds.offsetX, y: evt.worldY - ds.offsetY } : el
        ));
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
                ctx.setElements(prev => [
                    ...prev,
                    {
                        id: Date.now().toString(),
                        type: 'arrow',
                        fromId: ds.fromId,
                        fromAnchor: ds.fromAnchor,
                        toId: found.el.id,
                        toAnchor,
                    },
                ]);
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
        const id = Date.now().toString();
        const newEl = { id, type: ctx.activeTool, x: evt.worldX, y: evt.worldY, width: 0, height: 0 };
        ctx.setElements(prev => [...prev, newEl]);
        return { id, startX: evt.worldX, startY: evt.worldY };
    },
    onMove(ctx, ds, evt) {
        ctx.setElements(prev => prev.map(el =>
            el.id === ds.id ? { ...el, width: evt.worldX - ds.startX, height: evt.worldY - ds.startY } : el
        ));
    },
    onEnd(ctx, ds, evt, opts) {
        if (opts?.cancelled) {
            ctx.setElements(prev => prev.filter(el => el.id !== ds.id));
            return;
        }
        // Normalize and drop zero-size shapes (accidental clicks).
        ctx.setElements(prev => prev
            .map(el => el.id === ds.id ? normalizeBounds(el) : el)
            .filter(el => el.id !== ds.id || (Math.abs(el.width) > 2 && Math.abs(el.height) > 2))
        );
    },
    getCursor: () => 'crosshair',
};

// Ordered list — dispatcher will sort by priority anyway, but a stable list
// makes the registry easy to scan.
export const ALL_ACTIONS = [
    middleMousePanAction,
    resizeAction,
    handPanAction,
    selectMoveAction,
    connectAction,
    drawAction,
];