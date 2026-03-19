import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';


// Component
export default function HamburgerMenu({ open, onClose }) {
    const { logout } = useAuth();
    const navigate = useNavigate();

    function handleLogout() {
        logout();
        navigate('/login');
        onClose();
    }

    return (
        <>
            <div className={`hamburger-overlay ${open ? 'open' : ''}`} onClick={onClose} />
            <div className={`hamburger-panel ${open ? 'open' : ''}`}>
                <button className="hamburger-close" onClick={onClose}>✕</button>
                <div className="hamburger-links">
                    <button className="hamburger-item">Profile</button>
                    <button className="hamburger-item">Settings</button>
                    <button className="hamburger-item">Help</button>
                    <button className="hamburger-item">About</button>
                    <hr className="hamburger-divider" />
                    <button className="hamburger-item hamburger-item--danger" onClick={handleLogout}>
                        Sign out
                    </button>
                </div>
            </div>
        </>
    );
}