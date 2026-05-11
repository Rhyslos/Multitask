// Smooths remote cursor positions (and selection-ring bounds) between the
// discrete awareness samples we receive over the wire.
//
// useAwareness throttles cursor broadcasts to ~50ms (20Hz). Without
// interpolation, peers' cursors render as 20 discrete jumps per second —
// correct, but visibly snappy. This hook eases each remote peer's cursor
// toward its latest sample on every animation frame, and does the same for
// the bounding rectangle of their selection (so the dashed ring slides
// between shapes rather than teleporting).
//
// Design notes:
//   - State lives in a ref, not useState. We don't want each frame of the
//     ease to trigger a React re-render — that would defeat the purpose of
//     rAF batching. Instead, we mutate the ref in the rAF loop, return its
//     `.current` directly, and let GraphCanvas's `tick` counter drive the
//     canvas redraw.
//   - First sample for a peer initializes current = target. Otherwise a
//     peer who just joined would have their cursor fly in from (0, 0).
//   - The rAF loop only runs while at least one peer has a cursor we're
//     still easing toward. When everyone's settled, we stop and let the
//     next awareness change start it back up.
//   - Easing is framerate-independent: 1 - exp(-dt / TAU). At TAU = 35ms
//     this settles ~95% within ~100ms, which feels live without overshoot.

import { useEffect, useRef, useState } from 'react';

const CURSOR_TAU_MS = 35;      // cursor ease time constant
const SELECTION_TAU_MS = 60;   // selection ring is bigger; slower ease reads as smoother
const SETTLE_EPSILON = 0.25;   // px — below this we snap and stop animating that peer

/**
 * @param {Record<number, {user, cursor?, selection?}>} peers - from useAwareness
 * @param {Array} elements - current elements snapshot, used to resolve selection IDs to bounds
 * @returns {{
 *   peersForRender: Record<number, {user, cursor?, selectionBounds?}>,
 *   tick: number     // increments every animation frame the loop runs; use as a redraw trigger
 * }}
 */
export default function useInterpolatedCursors(peers, elements) {
    // The interpolation buffer. Map<clientId, {
    //   user,
    //   cursor:    { current: {x,y}, target: {x,y} } | null,
    //   selection: { current: bounds, target: bounds, targetId } | null,
    // }>
    // Mutated in place by the rAF loop; never replaced.
    const bufferRef = useRef(new Map());

    // The object we hand to the renderer. Same shape as `peers` but with
    // interpolated values. Rebuilt on every frame the loop runs.
    const renderRef = useRef({});

    // A bump counter so consumers (GraphCanvas) can include it in their
    // render dep array and redraw on every animated frame.
    const [tick, setTick] = useState(0);

    // Resolve a selection ID to its current bounding rectangle. Returns null
    // if the element doesn't exist (deleted, or not yet synced).
    const elementsRef = useRef(elements);
    elementsRef.current = elements;

    // Sync incoming `peers` into the buffer. Don't replace existing entries —
    // just update their `.target`. New peers are seeded with current = target
    // so they don't fly in from (0, 0).
    useEffect(() => {
        const buf = bufferRef.current;
        const seenIds = new Set();

        for (const [clientIdStr, state] of Object.entries(peers)) {
            const clientId = Number(clientIdStr);
            seenIds.add(clientId);

            let entry = buf.get(clientId);
            if (!entry) {
                entry = { user: state.user, cursor: null, selection: null };
                buf.set(clientId, entry);
            }
            entry.user = state.user;

            // Cursor target.
            if (state.cursor) {
                if (!entry.cursor) {
                    // First sample — snap.
                    entry.cursor = {
                        current: { x: state.cursor.x, y: state.cursor.y },
                        target:  { x: state.cursor.x, y: state.cursor.y },
                    };
                } else {
                    entry.cursor.target = { x: state.cursor.x, y: state.cursor.y };
                }
            } else if (entry.cursor) {
                // Peer cleared their cursor — drop it instantly.
                entry.cursor = null;
            }

            // Selection target. We interpolate the bounding rect rather than
            // the raw element ID, so the ring slides between shapes.
            if (state.selection) {
                const bounds = resolveBounds(elementsRef.current, state.selection);
                if (bounds) {
                    if (!entry.selection || entry.selection.targetId !== state.selection) {
                        if (!entry.selection) {
                            // First selection — snap.
                            entry.selection = {
                                current: { ...bounds },
                                target:  { ...bounds },
                                targetId: state.selection,
                            };
                        } else {
                            // Selection changed — keep current where it is, retarget.
                            entry.selection.target = { ...bounds };
                            entry.selection.targetId = state.selection;
                        }
                    } else {
                        // Same selection, but the shape may have moved/resized.
                        entry.selection.target = { ...bounds };
                    }
                }
            } else if (entry.selection) {
                entry.selection = null;
            }
        }

        // Drop peers that disappeared.
        for (const id of buf.keys()) {
            if (!seenIds.has(id)) buf.delete(id);
        }

        // Kick the rAF loop if it isn't running. The loop self-stops once
        // everything is settled.
        startLoopIfNeeded();
    }, [peers]);

    // rAF loop. Stored on the ref so we can stop/restart without leaking.
    const rafStateRef = useRef({ running: false, lastTime: 0 });

    const startLoopIfNeeded = () => {
        if (rafStateRef.current.running) return;
        rafStateRef.current.running = true;
        rafStateRef.current.lastTime = performance.now();
        requestAnimationFrame(step);
    };

    const step = (now) => {
        const rafState = rafStateRef.current;
        const dt = now - rafState.lastTime;
        rafState.lastTime = now;

        const buf = bufferRef.current;
        let anyAnimating = false;

        // Ease each peer toward its target.
        const cursorAlpha    = 1 - Math.exp(-dt / CURSOR_TAU_MS);
        const selectionAlpha = 1 - Math.exp(-dt / SELECTION_TAU_MS);

        for (const entry of buf.values()) {
            if (entry.cursor) {
                const c = entry.cursor;
                const dx = c.target.x - c.current.x;
                const dy = c.target.y - c.current.y;
                if (Math.abs(dx) > SETTLE_EPSILON || Math.abs(dy) > SETTLE_EPSILON) {
                    c.current.x += dx * cursorAlpha;
                    c.current.y += dy * cursorAlpha;
                    anyAnimating = true;
                } else {
                    c.current.x = c.target.x;
                    c.current.y = c.target.y;
                }
            }

            if (entry.selection) {
                const s = entry.selection;
                let stillMoving = false;
                for (const k of ['x', 'y', 'width', 'height']) {
                    const d = s.target[k] - s.current[k];
                    if (Math.abs(d) > SETTLE_EPSILON) {
                        s.current[k] += d * selectionAlpha;
                        stillMoving = true;
                    } else {
                        s.current[k] = s.target[k];
                    }
                }
                if (stillMoving) anyAnimating = true;
            }
        }

        // Rebuild the render-facing object. Same shape useAwareness produced,
        // but with interpolated cursor coords and a resolved `selectionBounds`
        // for the renderer to draw the ring from.
        const next = {};
        for (const [clientId, entry] of buf) {
            const out = { user: entry.user };
            if (entry.cursor) {
                out.cursor = { x: entry.cursor.current.x, y: entry.cursor.current.y };
            }
            if (entry.selection) {
                out.selectionBounds = { ...entry.selection.current };
                out.selection = entry.selection.targetId; // keep for back-compat / debug
            }
            next[clientId] = out;
        }
        renderRef.current = next;

        // Trigger a canvas redraw.
        setTick(t => (t + 1) & 0x7fffffff);

        if (anyAnimating) {
            requestAnimationFrame(step);
        } else {
            rafState.running = false;
        }
    };

    // If `elements` changes (e.g. someone's selected shape just moved), the
    // target bounds for their selection ring are now stale. Re-resolve.
    useEffect(() => {
        const buf = bufferRef.current;
        let touched = false;
        for (const entry of buf.values()) {
            if (!entry.selection) continue;
            const fresh = resolveBounds(elements, entry.selection.targetId);
            if (fresh) {
                entry.selection.target = { ...fresh };
                touched = true;
            }
        }
        if (touched) startLoopIfNeeded();
    }, [elements]);

    return { peersForRender: renderRef.current, tick };
}

// Resolve an element ID to its axis-aligned bounding rectangle. We accept
// the same shapes the renderer does (rect/circle/etc — anything with x/y/
// width/height). Returns null if the element isn't found or isn't a node.
function resolveBounds(elements, elementId) {
    if (!elementId || !elements) return null;
    const el = elements.find(e => e.id === elementId);
    if (!el) return null;
    if (typeof el.width !== 'number' || typeof el.height !== 'number') return null;
    return { x: el.x, y: el.y, width: el.width, height: el.height };
}
