// Bridges a Y.Map<elementId, Y.Map<field, value>> to a plain-JS array that
// React (and the existing renderer/hit-tester/action code) consumes.
//
// The renderer was written against `[{id, type, x, y, ...}, ...]`. We don't
// want to rewrite it to call ymap.get('x') everywhere — that would couple
// every drawing primitive to Yjs. Instead, this hook materializes a snapshot
// on every change and feeds it through normal React state.
//
// Cost: each Yjs update rebuilds the snapshot. For graphs of <1000 elements
// this is cheaper than the React reconcile that follows it. If we ever need
// to optimize, we'd switch to a stable-reference cache where unchanged
// elements keep the same object identity, but that's premature now.

import { useEffect, useState } from 'react';

/**
 * @param {Y.Map|null} yElements
 * @returns {Array} plain JS snapshot, e.g. [{id, type, x, y, ...}, ...]
 */
export default function useElementsView(yElements) {
    const [snapshot, setSnapshot] = useState([]);

    useEffect(() => {
        if (!yElements) {
            setSnapshot([]);
            return;
        }

        const rebuild = () => setSnapshot(toPlainArray(yElements));
        rebuild();

        // observeDeep fires on changes inside child Y.Maps too — i.e. when an
        // element's `x` changes, not just when an element is added/removed.
        // That's what we want: any field change → rebuild snapshot → re-render.
        yElements.observeDeep(rebuild);
        return () => yElements.unobserveDeep(rebuild);
    }, [yElements]);

    return snapshot;
}

function toPlainArray(yElements) {
    const out = [];
    yElements.forEach((value) => {
        // Each value should be a Y.Map. Defensive check in case something
        // upstream put a plain object in there by accident.
        if (value && typeof value.toJSON === 'function') {
            out.push(value.toJSON());
        } else {
            out.push({ ...value });
        }
    });
    return out;
}
