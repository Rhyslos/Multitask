import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { SyncProvider } from './hooks/useSync';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Kanban from './pages/Kanban';
import Notation from './pages/Notation';
import UserProfile from './pages/UserProfile';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import Settings from './pages/Settings';
import Navbar from './components/Navbar'; // Update path if needed

export const appName = Object.freeze("Example App Name");

// routing components
function PrivateRoute({ children }) {
    const { user } = useAuth();
    return user ? children : <Navigate to="/login" replace />;
}

function AppRoutes() {
    const { user } = useAuth();
    return (
        <>
            {user && <Navbar />}
            <Routes>
                <Route path="/login"    element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
                <Route path="/register" element={user ? <Navigate to="/dashboard" replace /> : <Register />} />
                
                <Route path="/privacy"  element={<PrivacyPolicy />} />
                <Route path="/tos"      element={<TermsOfService />} />
                
                <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
                <Route path="/settings"  element={<PrivateRoute><Settings /></PrivateRoute>} />
                <Route path="/profile"   element={<PrivateRoute><UserProfile /></PrivateRoute>} />
                
                <Route path="/workspace/:workspaceID/kanban"   element={<PrivateRoute><Kanban /></PrivateRoute>} />
                <Route path="/workspace/:workspaceID/notation" element={<PrivateRoute><Notation /></PrivateRoute>} />
                <Route path="*" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
            </Routes>
        </>
    );
}

// root component
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