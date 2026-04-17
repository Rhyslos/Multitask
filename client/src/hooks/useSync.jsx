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
        if (!userEmail || !sm) return;

        if (esRef.current) esRef.current.close();

        const es = new EventSource(`${API}/network/stream/${userEmail}`);
        esRef.current = es;

        // event listeners
        es.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.type === 'kanban_updated') {
                sm.syncNow();
            }
            if (data.type === 'invites_updated') {
                window.dispatchEvent(new CustomEvent('invites_updated', { detail: data }));
            }
            if (data.type === 'presence_updated') {
                window.dispatchEvent(new CustomEvent('presence_updated', { detail: data }));
            }
        };

        es.onerror = () => {
        };

        return () => {
            es.close();
            esRef.current = null;
        };
    }, [userEmail, sm]);

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