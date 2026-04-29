import { useState, createContext, useContext, useEffect } from 'react';
import { SyncManager } from '../sync/syncManager';
import { useSync } from './useSync';

const AuthContext = createContext(null);
const API = 'http://localhost:8080/api';
const STORAGE_KEY = 'studyspace_user';

// how long an offline-cached session is allowed to auto-resume without a fresh server check.
// after this, the user must re-authenticate online.
const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// context provider
export function AuthProvider({ children }) {
    const sync = useSync();
    const setUserEmail = sync?.setUserEmail ?? (() => {});

    const [user, setUser] = useState(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? JSON.parse(stored) : null;
        } catch {
            return null;
        }
    });

    useEffect(() => {
        if (user?.id) {
            SyncManager.getInstance().then(async sm => {
                await sm.setUser(user.id, user.email);
            });
            if (user?.email) setUserEmail(user.email);
        }
    }, [user?.id, setUserEmail]);

    useEffect(() => {
        function handleForceLogout() {
            logout();
            window.location.href = '/';
        }

        window.addEventListener('force_logout', handleForceLogout);
        return () => window.removeEventListener('force_logout', handleForceLogout);
    }, []);

    /** Persist the user with a fresh "lastVerifiedAt" so we know how stale the cache is. */
    function persistUser(userData) {
        const enriched = { ...userData, lastVerifiedAt: Date.now() };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(enriched));
        return enriched;
    }

    async function login(email, password) {
        try {
            const res = await fetch(`${API}/users/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            const stored = persistUser(data.user);
            const sm = await SyncManager.getInstance();
            await sm.setUser(stored.id, stored.email);
            setUserEmail(stored.email);
            setUser(stored);
            return stored;
        } catch (err) {
            // offline fallback: only resume a cached session if it was verified recently
            // AND the email matches. password is NOT bypassed — if you have no recent
            // server-issued session, you cannot log in offline. this prevents a stolen
            // device from being unlocked with an arbitrary password.
            const stored = localStorage.getItem(STORAGE_KEY);
            if (!stored) throw err;

            let cached;
            try {
                cached = JSON.parse(stored);
            } catch {
                throw err;
            }

            const isFresh = cached.lastVerifiedAt &&
                            (Date.now() - cached.lastVerifiedAt) < OFFLINE_GRACE_MS;
            const emailMatches = cached.email === email;

            // surface a network-specific error so the UI can distinguish "wrong password"
            // from "you're offline and your cached session expired".
            if (!isFresh || !emailMatches) throw err;

            const sm = await SyncManager.getInstance();
            await sm.setUser(cached.id, cached.email);
            setUserEmail(cached.email);
            setUser(cached);
            return cached;
        }
    }

    async function register(email, password, countryIso) {
        const res = await fetch(`${API}/users/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email,
                password,
                countryIso,
            }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        const stored = persistUser(data.user);
        const sm = await SyncManager.getInstance();
        await sm.setUser(stored.id, stored.email);
        setUserEmail(stored.email);
        setUser(stored);
        return stored;
    }

    function logout() {
        localStorage.removeItem(STORAGE_KEY);
        // also clear sync watermarks for this user so a future login starts clean
        if (user?.id) localStorage.removeItem(`sync_time_${user.id}`);
        setUser(null);
        setUserEmail(null);
        SyncManager.reset();
    }

    function updateUser(updatedData) {
        setUser(prev => {
            const newUser = { ...prev, ...updatedData, lastVerifiedAt: Date.now() };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newUser));
            return newUser;
        });

        if (updatedData.email && updatedData.email !== user?.email) {
            setUserEmail(updatedData.email);
            // reconnect SSE under the new email — server routes events by email,
            // so without this the user would silently stop receiving them.
            // setUser is a no-op for same userId but reconnects the stream when
            // the email argument differs from the current _streamEmail.
            if (user?.id) {
                SyncManager.getInstance().then(sm => sm.setUser(user.id, updatedData.email));
            }
        }
    }

    return (
        <AuthContext.Provider value={{ user, login, register, logout, updateUser }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}