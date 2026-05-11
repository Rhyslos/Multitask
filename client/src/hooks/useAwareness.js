// Cursor + presence layer, on top of Yjs Awareness.
//
// Awareness is Yjs's built-in ephemeral channel — it doesn't go into the doc,
// doesn't persist, expires when peers disconnect. Perfect fit for cursors,
// selection rings, "I'm currently typing" indicators, etc.
//
// This hook does two jobs:
//   1. Subscribes to remote awareness changes and exposes a plain object
//      keyed by clientId. Components read this and render overlays.
//   2. Returns a throttled `broadcastCursor` function that callers (the
//      pointer handler) invoke on every pointermove. We throttle to ~50ms
//      because cursors don't need 144Hz fidelity and 50ms still feels live.
//
// We deliberately filter our OWN clientId out of the returned peers — we
// don't want to render our own cursor as a remote one.

import { useEffect, useState, useRef, useMemo, useCallback } from 'react';

const CURSOR_THROTTLE_MS = 50;

/**
 * @param {Awareness|null} awareness  - from useGraphSync
 * @param {number|null}    selfClientId - doc.clientID, used to filter ourselves out
 * @returns {{
 *   peers: Record<number, {user: {email, color}, cursor?: {x, y}, selection?: string}>,
 *   broadcastCursor: (worldX: number, worldY: number) => void,
 *   broadcastSelection: (elementId: string|null) => void,
 * }}
 */
export default function useAwareness(awareness, selfClientId) {
    const [peers, setPeers] = useState({});

    // Subscribe to awareness changes.
    useEffect(() => {
        if (!awareness) {
            setPeers({});
            return;
        }

        const rebuild = () => {
            const states = awareness.getStates(); // Map<clientId, state>
            const next = {};
            states.forEach((state, clientId) => {
                if (clientId === selfClientId) return;
                if (!state) return;
                next[clientId] = state;
            });
            setPeers(next);
        };

        rebuild();
        awareness.on('change', rebuild);
        return () => awareness.off('change', rebuild);
    }, [awareness, selfClientId]);

    // Throttled cursor broadcast. Stored in a ref so we can call it from
    // pointer handlers without re-subscribing on every render.
    const lastCursorRef = useRef({ time: 0, pending: null, timer: null });

    const broadcastCursor = useCallback((worldX, worldY) => {
        if (!awareness) return;
        const ref = lastCursorRef.current;
        const now = Date.now();
        const elapsed = now - ref.time;

        const send = (x, y) => {
            ref.time = Date.now();
            awareness.setLocalStateField('cursor', { x, y });
        };

        if (elapsed >= CURSOR_THROTTLE_MS) {
            ref.pending = null;
            if (ref.timer) { clearTimeout(ref.timer); ref.timer = null; }
            send(worldX, worldY);
        } else {
            ref.pending = { x: worldX, y: worldY };
            if (!ref.timer) {
                ref.timer = setTimeout(() => {
                    ref.timer = null;
                    if (ref.pending) {
                        const p = ref.pending;
                        ref.pending = null;
                        send(p.x, p.y);
                    }
                }, CURSOR_THROTTLE_MS - elapsed);
            }
        }
    }, [awareness]);

    const broadcastSelection = useCallback((elementId) => {
        if (!awareness) return;
        awareness.setLocalStateField('selection', elementId);
    }, [awareness]);

    return useMemo(
        () => ({ peers, broadcastCursor, broadcastSelection }),
        [peers, broadcastCursor, broadcastSelection]
    );
}
