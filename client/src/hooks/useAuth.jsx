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

    useEffect(() => {
        if (user?.id) {
            SyncManager.getInstance().then(async sm => {
                await sm.setUser(user.id);
            });
        }
    }, [user?.id]);

    async function login(username, password) {
        try {
            const res = await fetch(`${API}/users/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data.user));
            const sm = await SyncManager.getInstance();
            await sm.setUser(data.user.id);
            setUser(data.user);
            return data.user;
        } catch (err) {
            const sm = await SyncManager.getInstance();
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const cached = JSON.parse(stored);
                if (cached.username === username) {
                    await sm.setUser(cached.id);
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
        const sm = await SyncManager.getInstance();
        await sm.setUser(data.user.id);
        setUser(data.user);
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