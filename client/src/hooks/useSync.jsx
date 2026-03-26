/**
 * useSync.jsx
 *
 * Bootstraps SyncManager and exposes:
 *   - sm          : SyncManager instance (null while loading)
 *   - online      : boolean — server is reachable
 *   - pending     : number  — ops waiting to flush
 *   - ready       : boolean — local DB is initialised
 *
 * Wrap your app with <SyncProvider> and consume with useSync().
 */
import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { SyncManager } from '../sync/syncManager';

const SyncContext = createContext(null);

export function SyncProvider({ children }) {
    const [sm, setSm] = useState(null);
    const [online, setOnline] = useState(navigator.onLine);
    const [pending, setPending] = useState(0);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let unsub;
        SyncManager.getInstance().then(manager => {
            setSm(manager);
            setReady(true);

            // Keep online/pending in sync
            unsub = manager.subscribe(() => {
                setPending(manager.pendingCount());
            });

            const onOnline = () => setOnline(true);
            const onOffline = () => setOnline(false);
            window.addEventListener('online', onOnline);
            window.addEventListener('offline', onOffline);
        });

        return () => {
            if (unsub) unsub();
        };
    }, []);

    return (
        <SyncContext.Provider value={{ sm, online, pending, ready }}>
            {children}
        </SyncContext.Provider>
    );
}

export function useSync() {
    return useContext(SyncContext);
}
