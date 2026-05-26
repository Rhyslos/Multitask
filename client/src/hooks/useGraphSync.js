// Opens a Yjs document for one workspace's graph and keeps it synced.
//
// This hook owns the Y.Doc lifetime, the network provider, and the local
// IndexedDB cache. It does NOT know anything about graph elements specifically —
// see useElementsView.js for the React-shaped projection of the data, and
// graphMutator.js for the write side.
//
// Why two layers (this hook + useElementsView): keeping doc/provider lifecycle
// separate from the snapshot subscription means a remount of the canvas
// component doesn't tear down the network connection. It also means we can
// swap the network provider (y-websocket → y-webrtc → custom) without
// touching the rendering code.

import { useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';

// Same backend host as the rest of the app. WebsocketProvider takes a base URL
// (no path) and appends the room name itself. That base URL must be ws:// or
// wss:// — we derive it from the API origin.
const API_HTTP = 'http://localhost:8080';
const WS_BASE = API_HTTP.replace(/^http/, 'ws');

/**
 * @param {string|null} workspaceID  - room name on the WS server. If null, no connection.
 * @param {object|null} user         - { id, email, displayName } from useAuth(). Required for auth.
 * @returns {{
 *   doc:        Y.Doc | null,
 *   yElements:  Y.Map | null,        // Y.Map<elementId, Y.Map<field, value>>
 *   awareness:  Awareness | null,    // for cursors / selection / presence
 *   connected:  boolean,
 *   clientId:   number | null,       // doc.clientID — stable per browser tab
 * }}
 */
export default function useGraphSync(workspaceID, user) {
    const doc = useMemo(() => {
        if (!workspaceID) return null;
        return new Y.Doc();
    }, [workspaceID]);

    const yElements = useMemo(() => doc?.getMap('elements') ?? null, [doc]);

    const [provider, setProvider] = useState(null);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        if (!doc || !workspaceID || !user?.id || !user?.email) return;

        const idb = new IndexeddbPersistence(`graph:${workspaceID}`, doc);

        // Room name is prefixed so the shared WS server can distinguish
        // graph traffic from notation traffic. The server rejects any
        // unprefixed room, so this prefix is required, not cosmetic.
        const ws = new WebsocketProvider(WS_BASE, `graph/${workspaceID}`, doc, {
            params: {
                userId: user.id,
                email: user.email,
            },
        });

        const onStatus = ({ status }) => setConnected(status === 'connected');
        ws.on('status', onStatus);

        // Awareness identity. Both fields are broadcast; the renderer (and the
        // privacy layer that filters them) picks which to display.
        //
        // displayName is the primary label per the product decision; email is
        // included so a future privacy setting can choose to reveal it to
        // associates without forcing a reconnect. If displayName is somehow
        // missing (e.g. a cached pre-displayName user record), we fall back to
        // the email so the cursor isn't completely unlabeled — UserProfile /
        // Register prevent this case for fresh signups, but defending against
        // it here is cheap and avoids ever showing a nameless cursor.
        ws.awareness.setLocalStateField('user', {
            displayName: user.displayName || user.email,
            email: user.email,
            color: user.cursorColor || pickColor(user.id),
        });

        setProvider(ws);

        return () => {
            ws.off('status', onStatus);
            ws.destroy();
            idb.destroy();
            // Don't destroy the doc here — the second useEffect below owns
            // doc lifetime. Destroying it twice would throw.
            setProvider(null);
            setConnected(false);
        };
        // NOTE: displayName is deliberately NOT a dependency. The connection
        // does not depend on it — only awareness does, and the effect below
        // patches awareness in place when displayName changes. Including it
        // here would tear down and rebuild the whole WebSocket on every
        // display-name change (and on any user-object churn), causing a
        // reconnect loop.
    }, [doc, workspaceID, user?.id, user?.email]);

    // If the user changes their displayName or cursor color mid-session
    // (UserProfile save), patch the awareness state in place so peers see the
    // change without tearing down and rebuilding the WS connection.
    useEffect(() => {
        if (!provider || !user?.id) return;
        const current = provider.awareness.getLocalState();
        if (!current?.user) return;
        provider.awareness.setLocalStateField('user', {
            ...current.user,
            displayName: user.displayName || user.email,
            email: user.email,
            color: user.cursorColor || pickColor(user.id),
        });
    }, [provider, user?.displayName, user?.email, user?.cursorColor, user?.id]);

    // Separate effect for doc destruction so it runs on workspaceID change
    // even when user is unchanged.
    useEffect(() => {
        return () => {
            if (doc) doc.destroy();
        };
    }, [doc]);

    return {
        doc,
        yElements,
        awareness: provider?.awareness ?? null,
        connected,
        clientId: doc?.clientID ?? null,
    };
}

// Stable per-user color from the userID. HSL with fixed S/L for consistency
// across users — the only varying axis is hue, so cursors are visually
// distinct without anyone getting an unreadable color.
function pickColor(userId) {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        hash = (hash * 31 + userId.charCodeAt(i)) | 0;
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 50%)`;
}