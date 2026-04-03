import { createContext, useContext, useEffect, useState } from 'react';
import { SyncManager } from '../sync/syncManager';

const SyncContext = createContext(null);

export function SyncProvider({ children }) {
    const [sm, setSm] = useState(null);
    const [online, setOnline] = useState(navigator.onLine);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let unsub;
        SyncManager.getInstance().then(manager => {
            setSm(manager);
            setReady(true);
            setOnline(manager.isOnline); // Set initial state

            // Listen to the manager's heartbeat instead of the browser's Wi-Fi state
            unsub = manager.subscribe(() => {
                setOnline(manager.isOnline);
            });
        });

        return () => {
            if (unsub) unsub();
        };
    }, []);

    return (
        <SyncContext.Provider value={{ sm, online, ready }}>
            {children}
        </SyncContext.Provider>
    );
}

export function useSync() {
    return useContext(SyncContext);
}