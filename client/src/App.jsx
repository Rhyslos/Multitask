/**
 * App.jsx — add SyncProvider wrapping the whole app
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { SyncProvider } from './hooks/useSync';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Kanban from './pages/Kanban';
import Notation from './pages/Notation';

function PrivateRoute({ children }) {
    const { user } = useAuth();
    return user ? children : <Navigate to="/login" replace />;
}

function AppRoutes() {
    const { user } = useAuth();
    return (
        <Routes>
            <Route path="/login"    element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
            <Route path="/register" element={user ? <Navigate to="/dashboard" replace /> : <Register />} />
            <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
            <Route path="/workspace/:workspaceID/kanban"   element={<PrivateRoute><Kanban /></PrivateRoute>} />
            <Route path="/workspace/:workspaceID/notation" element={<PrivateRoute><Notation /></PrivateRoute>} />
            <Route path="*" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
        </Routes>
    );
}

export default function App() {
    return (
        <SyncProvider>
            <AuthProvider>
                <BrowserRouter>
                    <AppRoutes />
                </BrowserRouter>
            </AuthProvider>
        </SyncProvider>
    );
}


/**
 * ─────────────────────────────────────────────────────
 * Navbar.jsx — add SyncStatusBadge to navbar-right
 * ─────────────────────────────────────────────────────
 *
 * In your existing Navbar.jsx, import SyncStatusBadge and add it:
 *
 *   import SyncStatusBadge from './SyncStatusBadge';
 *
 *   // inside the .navbar-right div, before the username:
 *   <SyncStatusBadge />
 *
 * ─────────────────────────────────────────────────────
 * File / folder layout for the new files
 * ─────────────────────────────────────────────────────
 *
 *  src/
 *   sync/
 *     syncManager.js       ← syncManager.js  (new)
 *   hooks/
 *     useSync.jsx          ← useSync.jsx      (new)
 *     useAuth.jsx          ← replaces existing
 *     useKanban.jsx        ← replaces existing
 *     useTabs.jsx          ← replaces existing
 *     useWorkspaces.jsx    ← replaces existing
 *     useNotes.jsx         ← replaces existing
 *   components/
 *     SyncStatusBadge.jsx  ← SyncStatusBadge.jsx (new)
 *
 *  server/   (or root, wherever your .mjs files live)
 *   server.mjs             ← replaces existing
 *   api/
 *     syncAPI.mjs          ← syncAPI.mjs      (new)
 *     workspaceAPI.mjs     ← replaces existing
 */
