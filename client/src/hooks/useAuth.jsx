/**
 * useAuth.jsx — integrates with SyncManager
 *
 * After login/register the SyncManager is told the userId so it loads
 * the correct per-user local DB, then triggers a server pull.
 */
import { useState, createContext, useContext, useEffect } from 'react';
import { SyncManager } from '../sync/syncManager';

const AuthContext = createContext(null);

const API = 'http://localhost:8080/api';
const STORAGE_KEY = 'studyspace_user';

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? JSON.parse(stored) : null;
        } catch {
            return null;
        }
    });

    // Wire up userId on page load if already logged in
    useEffect(() => {
        if (user?.id) {
            SyncManager.getInstance().then(sm => {
                sm.setUser(user.id);
                sm.pullFromServer(user.id);
            });
        }
    }, []);

    async function login(username, password) {
        // Always try the server first for login
        try {
            const res = await fetch(`${API}/users/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data.user));
            setUser(data.user);

            // Seed local DB with this user and pull server state
            const sm = await SyncManager.getInstance();
            sm.setUser(data.user.id);
            await sm.pullFromServer(data.user.id);
            return data.user;
        } catch (err) {
            // Offline fallback: check if we have a local user record
            const sm = await SyncManager.getInstance();
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const cached = JSON.parse(stored);
                if (cached.username === username) {
                    sm.setUser(cached.id);
                    setUser(cached);
                    return cached;
                }
            }
            throw err;
        }
    }

    async function register(username, password) {
        const res = await fetch(`${API}/users/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data.user));
        setUser(data.user);

        const sm = await SyncManager.getInstance();
        sm.setUser(data.user.id);
        return data.user;
    }

    function logout() {
        localStorage.removeItem(STORAGE_KEY);
        setUser(null);
        SyncManager.reset();
    }

    return (
        <AuthContext.Provider value={{ user, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
