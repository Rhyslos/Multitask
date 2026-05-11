// Mutation adapter for graph elements.
//
// Replaces the `setElements(prev => prev.map(...))` calls scattered through
// GraphActions.js with three operations: create / update / remove. Plus two
// throttling primitives needed for live drag:
//
//   - throttledUpdate: 30Hz writes to Yjs during a drag, so we don't ship a
//     network update on every pointermove (~144Hz on modern browsers).
//   - localOverride:   per-element transient state that the renderer prefers
//     over the Yjs snapshot. Without this, OUR OWN drag would stutter at
//     30Hz on our own screen — because the renderer reads from the Y-backed
//     snapshot, which only updates when a throttled write lands. The override
//     is a Map<elementId, partial-element-fields> that's cleared on drag end.
//
// Z-ordering uses a numeric `z` field on each element, NOT Y.Map insertion
// order. Y.Map is unordered by spec — peers may observe different iteration
// orders, so any approach that relies on map-order is broken under sync.
// The renderer sorts elements by z ascending (low z = back, high z = front),
// and reorder ops just update the z value on the moved element. Stable and
// peer-safe.

import * as Y from 'yjs';

const DRAG_THROTTLE_MS = 1000 / 30; // 30Hz
const Z_STEP = 1;

/**
 * @param {Y.Doc}       doc
 * @param {Y.Map}       yElements   - Y.Map<id, Y.Map<field, value>>
 * @param {object}      localState  - { setOverride, clearOverride } from useLocalOverrides
 */
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

    // Read z, treating missing/non-numeric as 0. The fallback is mostly for
    // legacy elements created before z existed — once data is migrated, every
    // element will have a real number.
    function getZ(ymap) {
        const z = ymap.get('z');
        return typeof z === 'number' ? z : 0;
    }

    // Compute the next z for a newly created element. We use max(z) + STEP
    // so new shapes always start on top, mirroring user expectation.
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

    // For "Bring Forward" / "Send Backward" we want the element-and-z of
    // the nearest neighbor in the given direction. Returns {id, z} or null.
    // We need the id (not just the z) because the operation is a SWAP —
    // see the comment in bringForward.
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
            // Auto-assign z if the caller didn't (which is the common case).
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

        // ─────────────────────────────────────────────────────────────
        // Z-order. Each op writes a single `z` field on the moved element.
        // ─────────────────────────────────────────────────────────────

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
            if (!neighbor) return; // already at top
            // Swap z values with the neighbor directly above. This guarantees
            // the target crosses past the neighbor (which a midpoint approach
            // doesn't — midpoint stays on the same side of the neighbor).
            // Wrap both writes in a single transaction so peers see the swap
            // atomically and no intermediate state ever flashes.
            doc.transact(() => {
                writeUpdate(id, { z: neighbor.z });
                writeUpdate(neighbor.id, { z: current });
            });
        },

        sendBackward(id) {
            if (!yElements.has(id)) return;
            const current = getZ(yElements.get(id));
            const neighbor = findZNeighbor(id, current, 'down');
            if (!neighbor) return; // already at bottom
            doc.transact(() => {
                writeUpdate(id, { z: neighbor.z });
                writeUpdate(neighbor.id, { z: current });
            });
        },

        // ─────────────────────────────────────────────────────────────
        // Duplicate — produces a copy with a fresh id, offset by +20 world
        // units, placed on top of the stack.
        // ─────────────────────────────────────────────────────────────

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

        changeColor(id, hex) {
            this.update(id, { color: hex });
        },

        changeType(id, type) {
            this.update(id, { type });
        },
    };
}