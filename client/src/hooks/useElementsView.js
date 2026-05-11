// Bridges a Y.Map<elementId, Y.Map<field, value>> to a plain-JS array that
// React (and the existing renderer/hit-tester/action code) consumes.
//
// The renderer was written against `[{id, type, x, y, ...}, ...]`. We don't
// want to rewrite it to call ymap.get('x') everywhere — that would couple
// every drawing primitive to Yjs. Instead, this hook materializes a snapshot
// on every change and feeds it through normal React state.
//
// Z-order: Y.Map iteration order is NOT a CRDT-safe ordering primitive —
// peers can observe different orders. So we sort the snapshot by an
// explicit `z` field (assigned and maintained by graphMutator). Elements
// without z (legacy data) sort as z=0; ties break on id for determinism.
//
// Cost: each Yjs update rebuilds the snapshot. For graphs of <1000 elements
// this is cheaper than the React reconcile that follows it. If we ever need
// to optimize, we'd switch to a stable-reference cache where unchanged
// elements keep the same object identity, but that's premature now.

import { useEffect, useState } from 'react';

/**
 * @param {Y.Map|null} yElements
 * @returns {Array} plain JS snapshot sorted by z, e.g. [{id, type, x, y, z, ...}, ...]
 */
export default function useElementsView(yElements) {
    const [snapshot, setSnapshot] = useState([]);

    useEffect(() => {
        if (!yElements) {
            setSnapshot([]);
            return;
        }

        const rebuild = () => setSnapshot(toSortedArray(yElements));
        rebuild();

        // observeDeep fires on changes inside child Y.Maps too — i.e. when an
        // element's `x` changes, not just when an element is added/removed.
        // That's what we want: any field change → rebuild snapshot → re-render.
        // It also fires on `z` changes, so reorder ops re-sort automatically.
        yElements.observeDeep(rebuild);
        return () => yElements.unobserveDeep(rebuild);
    }, [yElements]);

    return snapshot;
}

function toSortedArray(yElements) {
    const out = [];
    yElements.forEach((value) => {
        if (value && typeof value.toJSON === 'function') {
            out.push(value.toJSON());
        } else {
            out.push({ ...value });
        }
    });
    // Sort ascending by z (low z = back, drawn first; high z = front,
    // drawn last on top). Fallback to id for elements with equal or missing
    // z, which keeps the order deterministic across rebuilds and peers.
    out.sort((a, b) => {
        const az = typeof a.z === 'number' ? a.z : 0;
        const bz = typeof b.z === 'number' ? b.z : 0;
        if (az !== bz) return az - bz;
        // Lexicographic id tiebreak. UUIDs sort consistently across clients.
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    return out;
}