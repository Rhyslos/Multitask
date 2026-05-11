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
// The renderer reads the override via the `overrides` argument we pass to
// drawElement (see GraphCanvas changes). The override is *additive*: an
// element's stored x/y/width come from Yjs, but if the override has an x,
// we use that. This way unrelated fields (label, type, etc) are still live.

import * as Y from 'yjs';

const DRAG_THROTTLE_MS = 1000 / 30; // 30Hz

/**
 * @param {Y.Doc}       doc
 * @param {Y.Map}       yElements   - Y.Map<id, Y.Map<field, value>>
 * @param {object}      localState  - { setOverride, clearOverride } from useLocalOverrides
 */
export function makeGraphMutator(doc, yElements, localState) {
    // One throttle window per element id. Two simultaneous drags (rare but
    // possible — e.g. dragging on touch with a separate keyboard action) get
    // independent throttles so they don't starve each other.
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

    return {
        /**
         * Create a new element. Use for one-shot creations (drawing a shape,
         * connecting an arrow). Not throttled — creation should be instant.
         */
        create(element) {
            doc.transact(() => {
                const ymap = new Y.Map();
                for (const [k, v] of Object.entries(element)) {
                    ymap.set(k, v);
                }
                yElements.set(element.id, ymap);
            });
        },

        /**
         * Apply a partial patch immediately. Use for committed changes:
         * dragEnd, resize end, label edit blur, etc.
         */
        update(id, patch) {
            // If a throttled drag was in flight for this element, flush its
            // pending tick first so we don't write OLD coordinates AFTER the
            // commit. Order matters.
            flushThrottle(id);
            writeUpdate(id, patch);
        },

        /**
         * Apply a partial patch with throttling. Use during drags / resizes
         * where we get many pointermove events per frame and only want to
         * push to the network at ~30Hz. The local override is set immediately
         * so the dragging user sees their own movement at full framerate.
         *
         * Always pair with a final `update(id, finalPatch)` on dragEnd so
         * the last coordinates are guaranteed to land.
         */
        throttledUpdate(id, patch) {
            // Local override: instant for the drag-er.
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
                // Coalesce: if pending exists, merge; else stash.
                t.pending = { ...(t.pending || {}), ...patch };
                if (!t.timer) {
                    t.timer = setTimeout(() => {
                        t.timer = null;
                        flushThrottle(id);
                    }, DRAG_THROTTLE_MS - elapsed);
                }
            }
        },

        /**
         * Drop the local override and flush any pending throttled write.
         * Call from action.onEnd after the final commit.
         */
        endDrag(id) {
            flushThrottle(id);
            localState.clearOverride(id);
        },

        /**
         * Replace an element entirely. Used by normalizeBounds-style
         * operations that produce a whole new element shape rather than a
         * field patch. Equivalent to delete+create but in one transaction.
         */
        replace(element) {
            flushThrottle(element.id);
            doc.transact(() => {
                const ymap = new Y.Map();
                for (const [k, v] of Object.entries(element)) {
                    ymap.set(k, v);
                }
                yElements.set(element.id, ymap);
            });
        },

        remove(id) {
            const t = throttles.get(id);
            if (t?.timer) clearTimeout(t.timer);
            throttles.delete(id);
            localState.clearOverride(id);
            doc.transact(() => yElements.delete(id));
        },

        /**
         * Bulk delete — used by the keyboard handler in useCanvasPointer when
         * a node is deleted (also kills connected arrows). One transaction
         * means peers see all the deletions atomically.
         */
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
    };
}
