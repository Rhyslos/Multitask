import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { SyncManager } from '../sync/syncManager';

const SyncContext = createContext(null);

const API = 'http://localhost:8080/api';

export function SyncProvider({ children }) {
    const [sm, setSm] = useState(null);
    const [online, setOnline] = useState(navigator.onLine);
    const [ready, setReady] = useState(false);
    // userEmail drives the SSE connection — set after login, cleared on logout
    const [userEmail, setUserEmail] = useState(null);
    const esRef = useRef(null);

    useEffect(() => {
        let unsub;
        SyncManager.getInstance().then(manager => {
            setSm(manager);
            setReady(true);
            setOnline(manager.isOnline);
            unsub = manager.subscribe(() => setOnline(manager.isOnline));
        });
        return () => { if (unsub) unsub(); };
    }, []);

    // SSE connection — opens once per authenticated session and stays open
    // across all page navigation. Replaces the connection that was in
    // usePendingInvites, which only lived on the Dashboard.
    useEffect(() => {
        if (!userEmail || !sm) return;

        // Close any previous connection before opening a new one
        if (esRef.current) esRef.current.close();

        const es = new EventSource(`${API}/network/stream/${userEmail}`);
        esRef.current = es;

        es.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.type === 'kanban_updated') {
                // syncNow() is a debounce-free pure pull — no push, no broadcast loop
                sm.syncNow();
            }
            // 'invites_updated' events are dispatched as a custom DOM event so
            // usePendingInvites can receive them without its own EventSource.
            if (data.type === 'invites_updated') {
                window.dispatchEvent(new CustomEvent('invites_updated', { detail: data }));
            }
        };

        es.onerror = () => {
            // Browser auto-reconnects EventSource — no action needed here
        };

        return () => {
            es.close();
            esRef.current = null;
        };
    }, [userEmail, sm]);

    return (
        <SyncContext.Provider value={{ sm, online, ready, userEmail, setUserEmail }}>
            {children}
        </SyncContext.Provider>
    );
}

export function useSync() {
    return useContext(SyncContext);
}
