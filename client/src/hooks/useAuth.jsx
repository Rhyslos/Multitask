import { useState, createContext, useContext, useEffect } from 'react';
import { SyncManager } from '../sync/syncManager';
import { useSync } from './useSync';

const AuthContext = createContext(null);
const API = 'http://localhost:8080/api';
const STORAGE_KEY = 'studyspace_user';

// context provider
export function AuthProvider({ children }) {
    const { setUserEmail } = useSync();

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
            if (user?.email) setUserEmail(user.email);
        }
    }, [user?.id]);

    async function login(email, password) {
        try {
            const res = await fetch(`${API}/users/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            localStorage.setItem(STORAGE_KEY, JSON.stringify(data.user));
            const sm = await SyncManager.getInstance();
            await sm.setUser(data.user.id);
            setUserEmail(data.user.email);
            setUser(data.user);
            return data.user;
        } catch (err) {
            const sm = await SyncManager.getInstance();
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const cached = JSON.parse(stored);
                if (cached.email === email) {
                    await sm.setUser(cached.id);
                    setUserEmail(cached.email);
                    setUser(cached);
                    return cached;
                }
            }
            throw err;
        }
    }

    // In useAuth.jsx
    async function register(email, password, countryCode) {
        const res = await fetch(`${API}/users/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, countryCode }), // Add it to the payload
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        localStorage.setItem(STORAGE_KEY, JSON.stringify(data.user));
        const sm = await SyncManager.getInstance();
        await sm.setUser(data.user.id);
        setUserEmail(data.user.email);
        setUser(data.user);
        return data.user;
    }

    function logout() {
        localStorage.removeItem(STORAGE_KEY);
        setUser(null);
        setUserEmail(null);
        SyncManager.reset();
    }

    function updateUser(updatedData) {
        setUser(prev => {
            const newUser = { ...prev, ...updatedData };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newUser));
            return newUser;
        });
        
        if (updatedData.email && updatedData.email !== user?.email) {
            setUserEmail(updatedData.email);
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
