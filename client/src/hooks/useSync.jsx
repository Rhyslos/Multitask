import { createContext, useContext, useEffect, useState } from 'react';
import { SyncManager } from '../sync/syncManager';

// variables
const SyncContext = createContext(null);

// context provider
//
// Owns the React-shaped surface: context creation, online state for renders,
// userEmail state for consumer hooks (e.g. useWorkspacePresence).
// The SSE connection itself is owned by SyncManager — its lifecycle matches
// the manager's, not any component's, so it doesn't belong here.
export function SyncProvider({ children }) {
    const [sm, setSm] = useState(null);
    const [online, setOnline] = useState(navigator.onLine);
    const [ready, setReady] = useState(false);
    const [userEmail, setUserEmail] = useState(null);

    useEffect(() => {
        let active = true;
        let unsub;

        const initSync = async () => {
            const manager = await SyncManager.getInstance();
            if (!active) return;

            setSm(manager);
            setReady(true);
            setOnline(manager.isOnline);
            // SyncManager._notify fires on every local mutation, server merge,
            // and online/offline transition — we mirror its online state so
            // components re-render when connectivity flips.
            unsub = manager.subscribe(() => {
                if (active) setOnline(manager.isOnline);
            });
        };

        initSync();

        return () => {
            active = false;
            if (unsub) unsub();
        };
    }, []);

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
