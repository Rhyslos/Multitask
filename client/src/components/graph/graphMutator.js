// Mutation adapter for graph elements. See useElementsView.js for the read
// side and useLocalOverrides.js for the local-only drag overlay.

import * as Y from 'yjs';

const DRAG_THROTTLE_MS = 1000 / 30;
const Z_STEP = 1;

export function makeGraphMutator(doc, yElements, localState) {
    const throttles = new Map();

    function getThrottle(id) {
        let t = throttles.get(id);
        if (!t) {
            t = { lastFlush: 0, pending: null, timer: null };
            throttles.set(id, t);
        }
        return t;
    }

    function flushThrottle(id) {
        const t = throttles.get(id);
        if (!t || !t.pending) return;
        const patch = t.pending;
        t.pending = null;
        if (t.timer) { clearTimeout(t.timer); t.timer = null; }
        t.lastFlush = Date.now();
        writeUpdate(id, patch);
    }

    function writeUpdate(id, patch) {
        if (!yElements.has(id)) return;
        const ymap = yElements.get(id);
        doc.transact(() => {
            for (const [k, v] of Object.entries(patch)) {
                ymap.set(k, v);
            }
        });
    }

    function getZ(ymap) {
        const z = ymap.get('z');
        return typeof z === 'number' ? z : 0;
    }

    function nextTopZ() {
        let max = -Infinity;
        yElements.forEach((ymap) => {
            const z = getZ(ymap);
            if (z > max) max = z;
        });
        return Number.isFinite(max) ? max + Z_STEP : 0;
    }

    function nextBottomZ() {
        let min = Infinity;
        yElements.forEach((ymap) => {
            const z = getZ(ymap);
            if (z < min) min = z;
        });
        return Number.isFinite(min) ? min - Z_STEP : 0;
    }

    function findZNeighbor(selfId, targetZ, direction) {
        let best = null;
        yElements.forEach((ymap, id) => {
            if (id === selfId) return;
            const z = getZ(ymap);
            if (direction === 'up' && z > targetZ) {
                if (best === null || z < best.z) best = { id, z };
            } else if (direction === 'down' && z < targetZ) {
                if (best === null || z > best.z) best = { id, z };
            }
        });
        return best;
    }

    return {
        create(element) {
            const withZ = element.z == null
                ? { ...element, z: nextTopZ() }
                : element;
            doc.transact(() => {
                const ymap = new Y.Map();
                for (const [k, v] of Object.entries(withZ)) {
                    ymap.set(k, v);
                }
                yElements.set(withZ.id, ymap);
            });
        },

        update(id, patch) {
            flushThrottle(id);
            writeUpdate(id, patch);
        },

        throttledUpdate(id, patch) {
            localState.setOverride(id, patch);

            const t = getThrottle(id);
            const now = Date.now();
            const elapsed = now - t.lastFlush;

            if (elapsed >= DRAG_THROTTLE_MS) {
                t.lastFlush = now;
                t.pending = null;
                if (t.timer) { clearTimeout(t.timer); t.timer = null; }
                writeUpdate(id, patch);
            } else {
                t.pending = { ...(t.pending || {}), ...patch };
                if (!t.timer) {
                    t.timer = setTimeout(() => {
                        t.timer = null;
                        flushThrottle(id);
                    }, DRAG_THROTTLE_MS - elapsed);
                }
            }
        },

        endDrag(id) {
            flushThrottle(id);
            localState.clearOverride(id);
        },

        replace(element) {
            flushThrottle(element.id);
            const withZ = element.z == null
                ? { ...element, z: nextTopZ() }
                : element;
            doc.transact(() => {
                const ymap = new Y.Map();
                for (const [k, v] of Object.entries(withZ)) {
                    ymap.set(k, v);
                }
                yElements.set(withZ.id, ymap);
            });
        },

        remove(id) {
            const t = throttles.get(id);
            if (t?.timer) clearTimeout(t.timer);
            throttles.delete(id);
            localState.clearOverride(id);
            doc.transact(() => yElements.delete(id));
        },

        removeMany(ids) {
            for (const id of ids) {
                const t = throttles.get(id);
                if (t?.timer) clearTimeout(t.timer);
                throttles.delete(id);
                localState.clearOverride(id);
            }
            doc.transact(() => {
                for (const id of ids) yElements.delete(id);
            });
        },

        bringToFront(id) {
            if (!yElements.has(id)) return;
            const newZ = nextTopZ();
            this.update(id, { z: newZ });
        },

        sendToBack(id) {
            if (!yElements.has(id)) return;
            const newZ = nextBottomZ();
            this.update(id, { z: newZ });
        },

        bringForward(id) {
            if (!yElements.has(id)) return;
            const current = getZ(yElements.get(id));
            const neighbor = findZNeighbor(id, current, 'up');
            if (!neighbor) return;
            doc.transact(() => {
                writeUpdate(id, { z: neighbor.z });
                writeUpdate(neighbor.id, { z: current });
            });
        },

        sendBackward(id) {
            if (!yElements.has(id)) return;
            const current = getZ(yElements.get(id));
            const neighbor = findZNeighbor(id, current, 'down');
            if (!neighbor) return;
            doc.transact(() => {
                writeUpdate(id, { z: neighbor.z });
                writeUpdate(neighbor.id, { z: current });
            });
        },

        duplicate(id, offset = 20) {
            if (!yElements.has(id)) return null;
            const source = yElements.get(id).toJSON();
            const copy = {
                ...source,
                id: crypto.randomUUID(),
                x: (source.x ?? 0) + offset,
                y: (source.y ?? 0) + offset,
                z: nextTopZ(),
            };
            this.create(copy);
            return copy.id;
        },

        // ─── Color ───────────────────────────────────────────────────
        // Two separate fields so users can mix any stroke with any fill.
        // Both accept the NO_STROKE / NO_FILL sentinels from graphColors —
        // we don't validate here; the renderer/picker handle them.

        setStroke(id, hex) {
            this.update(id, { stroke: hex });
        },

        setFill(id, hex) {
            this.update(id, { fill: hex });
        },

        // Set both at once. Useful for matched-pair color picks. Pass null
        // for either to leave that field unchanged.
        setColors(id, { stroke, fill }) {
            const patch = {};
            if (stroke !== undefined && stroke !== null) patch.stroke = stroke;
            if (fill   !== undefined && fill   !== null) patch.fill   = fill;
            if (Object.keys(patch).length > 0) this.update(id, patch);
        },

        // Deprecated alias kept for back-compat with the early menu wiring.
        // Maps to setStroke (the old "change color" really meant outline).
        // Remove once no callers reference it.
        changeColor(id, hex) {
            this.setStroke(id, hex);
        },

        changeType(id, type) {
            this.update(id, { type });
        },
    };
}