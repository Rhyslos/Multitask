import { useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import HamburgerMenu from './HamburgerMenu';


// Component
export default function Navbar() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const { workspaceID } = useParams();
    const [menuOpen, setMenuOpen] = useState(false);

    const inWorkspace = !!workspaceID;

    function navTo(page) {
        if (workspaceID) navigate(`/workspace/${workspaceID}/${page}`);
    }

    function isActive(page) {
        return location.pathname.includes(`/${page}`);
    }

    return (
        <>
            <nav className="navbar">
                <div className="navbar-brand" onClick={() => navigate('/dashboard')} style={{ cursor: 'pointer' }}>
                    <span className="navbar-logo">✦</span>
                    <span className="navbar-name">Multitask - For Students!</span>
                </div>

                {inWorkspace && (
                    <div className="navbar-pages">
                        <button
                            className={`navbar-page-btn ${isActive('graph') ? 'active' : ''}`}
                            onClick={() => navTo('graph')}
                        >
                            Graph Editor
                        </button>
                        <button
                            className={`navbar-page-btn ${isActive('kanban') ? 'active' : ''}`}
                            onClick={() => navTo('kanban')}
                        >
                            Kanban
                        </button>
                        <button
                            className={`navbar-page-btn ${isActive('notation') ? 'active' : ''}`}
                            onClick={() => navTo('notation')}
                        >
                            Notation
                        </button>
                    </div>
                )}

                <div className="navbar-right">
                    <span className="navbar-user">{user?.username}</span>
                    <button className="navbar-hamburger" onClick={() => setMenuOpen(true)}>
                        <span /><span /><span />
                    </button>
                </div>
            </nav>
            <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
        </>
    );
}