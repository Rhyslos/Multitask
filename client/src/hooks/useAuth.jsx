import { useState, createContext, useContext } from 'react';

const AuthContext = createContext(null);

const API = 'http://localhost:8080/api';
const STORAGE_KEY = 'studyspace_user';


// Provider
export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? JSON.parse(stored) : null;
        } catch {
            return null;
        }
    });

    async function login(username, password) {
        const res = await fetch(`${API}/users/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data.user));
        setUser(data.user);
        return data.user;
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
        return data.user;
    }

    function logout() {
        localStorage.removeItem(STORAGE_KEY);
        setUser(null);
    }

    return (
        <AuthContext.Provider value={{ user, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    );
}


// Hook
export function useAuth() {
    return useContext(AuthContext);
}