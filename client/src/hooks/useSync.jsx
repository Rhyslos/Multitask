import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { SyncManager } from '../sync/syncManager';

// variables
const SyncContext = createContext(null);
const API = 'http://localhost:8080/api';

// context provider
export function SyncProvider({ children }) {
    const [sm, setSm] = useState(null);
    const [online, setOnline] = useState(navigator.onLine);
    const [ready, setReady] = useState(false);
    const [userEmail, setUserEmail] = useState(null);
    const esRef = useRef(null);

    // effect hooks
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

    useEffect(() => {
        if (!userEmail || !sm || !ready) return;

        let retryTimeout = null;
        let retryDelay = 1000;
        let isCancelled = false;

        const connect = () => {
            if (isCancelled) return;

            if (esRef.current) esRef.current.close();

            const es = new EventSource(`${API}/network/stream/${userEmail}`);
            esRef.current = es;

            es.onopen = () => {
                retryDelay = 1000;
            };

            es.onmessage = (event) => {
                const data = JSON.parse(event.data);

                if (data.type === 'kanban_updated') sm.syncNow();
                if (data.type === 'invites_updated')
                    window.dispatchEvent(new CustomEvent('invites_updated', { detail: data }));
                if (data.type === 'presence_updated')
                    window.dispatchEvent(new CustomEvent('presence_updated', { detail: data }));
            };

            es.onerror = () => {
                es.close();
                esRef.current = null;

                if (!isCancelled) {
                    retryTimeout = setTimeout(() => {
                        retryDelay = Math.min(retryDelay * 2, 30000);
                        connect();
                    }, retryDelay);
                }
            };
        };

        const initTimer = setTimeout(connect, 100); // ← only change

        return () => {
            isCancelled = true;
            clearTimeout(initTimer);        // ← and clear it on cleanup
            clearTimeout(retryTimeout);
            if (esRef.current) {
                esRef.current.close();
                esRef.current = null;
            }
        };
    }, [userEmail, sm, ready]); // ← added ready

    // return values
    return (
        <SyncContext.Provider value={{ sm, online, ready, userEmail, setUserEmail }}>
            {children}
        </SyncContext.Provider>
    );
}

// custom hook
export function useSync() {
    return useContext(SyncContext);
}