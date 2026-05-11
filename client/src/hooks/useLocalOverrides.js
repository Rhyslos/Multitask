// Local override map for in-progress drags/resizes.
//
// Why this exists: the canvas renders from `useElementsView`, which reflects
// Yjs state. During a drag we throttle Yjs writes to 30Hz so the network
// doesn't see ~144 ops/sec. But that means OUR OWN drag, on OUR OWN screen,
// would also stutter at 30Hz — because we're rendering from the same
// throttled source.
//
// Fix: keep a local Map<id, partialFields> that the renderer overlays on top
// of the snapshot. The mutator sets the override on every pointermove
// (instant), schedules the throttled Yjs write separately, and clears the
// override on dragEnd.
//
// State shape: useState with a Map. We replace the map on every set so React
// notices the change. For a few simultaneous drags this is fine; if you ever
// see perf issues, switch to useSyncExternalStore + a mutable map with a
// version counter.

import { useState, useCallback, useMemo } from 'react';

export default function useLocalOverrides() {
    const [overrides, setOverrides] = useState(() => new Map());

    const setOverride = useCallback((id, patch) => {
        setOverrides(prev => {
            const next = new Map(prev);
            const merged = { ...(prev.get(id) || {}), ...patch };
            next.set(id, merged);
            return next;
        });
    }, []);

    const clearOverride = useCallback((id) => {
        setOverrides(prev => {
            if (!prev.has(id)) return prev;
            const next = new Map(prev);
            next.delete(id);
            return next;
        });
    }, []);

    // Stable interface for makeGraphMutator. Memoizing means the mutator
    // doesn't get rebuilt on every override change.
    const localState = useMemo(() => ({ setOverride, clearOverride }), [setOverride, clearOverride]);

    return { overrides, localState };
}

/**
 * Apply overrides to a snapshot array. Called by the renderer to get the
 * final list of elements to draw. Pure function — easy to test.
 */
export function applyOverrides(elements, overrides) {
    if (!overrides || overrides.size === 0) return elements;
    return elements.map(el => {
        const patch = overrides.get(el.id);
        return patch ? { ...el, ...patch } : el;
    });
}
