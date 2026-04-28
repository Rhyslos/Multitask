import { useState } from 'react';
import { useNavigate, useLocation, matchPath } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useWorkspacePresence } from '../hooks/useWorkspacePresence'; 
import HamburgerMenu from './HamburgerMenu';
import UserProfileModal from './UserProfileModal'; 
import { appName } from '../App';

// helper functions
function getAvatarLetter(member) {
    if (member.displayName) return member.displayName.charAt(0).toUpperCase();
    if (member.firstName) return member.firstName.charAt(0).toUpperCase();
    if (member.email) return member.email.charAt(0).toUpperCase();
    return '?';
}

function getAvatarColor(member) {
    if (!member.isOnline) return '#4A4A4A'; 
    
    let hash = 0;
    const str = member.email || member.id || 'default';
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
}

// component
export default function Navbar() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    
    // routing states
    const match = matchPath({ path: "/workspace/:workspaceID/*" }, location.pathname);
    const workspaceID = match?.params?.workspaceID;
    
    const [menuOpen, setMenuOpen] = useState(false);
    const [selectedMember, setSelectedMember] = useState(null); 

    const inWorkspace = !!workspaceID;
    const { members } = useWorkspacePresence(workspaceID);

    // navigation handlers
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
                    <span className="navbar-name">{appName}</span>
                </div>

                {inWorkspace && (
                    <>
                        <div className="navbar-pages">
                            <button 
                                className={`navbar-page-btn ${isActive('graph editor') ? 'active' : ''}`}
                                onClick={() => navTo('graph editor')}
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

                        <div className="navbar-presence">
                            {members?.map(member => (
                                <div 
                                    key={member.id} 
                                    className={`navbar-avatar ${member.isOnline ? 'online' : 'offline'}`}
                                    style={{ 
                                        backgroundColor: getAvatarColor(member),
                                        cursor: 'pointer' 
                                    }}
                                    title={member.displayName || member.firstName || member.email}
                                    onClick={() => setSelectedMember(member)} 
                                >
                                    {getAvatarLetter(member)}
                                </div>
                            ))}
                        </div>
                    </>
                )}

                <div className="navbar-right" style={{ marginLeft: inWorkspace ? '0' : 'auto' }}>
                    <span className="navbar-user">{user?.username}</span>
                    <button className="navbar-hamburger" onClick={() => setMenuOpen(true)}>
                        <span /><span /><span />
                    </button>
                </div>
            </nav>
            
            <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
            <UserProfileModal member={selectedMember} onClose={() => setSelectedMember(null)} />
        </>
    );
}