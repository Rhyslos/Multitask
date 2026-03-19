import { useState, createContext, useContext } from 'react';

const AuthContext = createContext(null);

const API = 'http://localhost:8080/api';


// Provider
export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);

    async function login(username, password) {
        const res = await fetch(`${API}/users/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
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
        setUser(data.user);
        return data.user;
    }

    function logout() {
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