import { useState } from 'react';
import Subbar from './Subbar';
import { usePendingInvites } from '../../hooks/usePendingInvites';

// Component
export default function DefaultSubbar() {
    const [collapsed, setCollapsed] = useState(false);
    const { invites, loading, respondToInvite } = usePendingInvites();

    const renderActionItems = () => {
        if (loading || invites.length === 0) return null;

        return (
            <div 
                className="subbar-section" 
                style={{ 
                    minWidth: 'auto', 
                    paddingRight: '24px', 
                    marginRight: '8px',
                    borderRight: '1px solid var(--border)' 
                }}
            >
                <span className="subbar-label" style={{ color: 'var(--accent)' }}>Action Required</span>
                
                <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '6px', 
                    marginTop: '4px',
                    maxHeight: '44px', 
                    overflowY: 'auto', 
                    paddingRight: '4px' 
                }}>
                    {invites.map(invite => (
                        <div 
                            key={invite.id} 
                            style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '12px', 
                                fontSize: '13px',
                                color: 'var(--ink)'
                            }}
                        >
                            <span style={{ 
                                whiteSpace: 'nowrap', 
                                overflow: 'hidden', 
                                textOverflow: 'ellipsis',
                                maxWidth: '200px' 
                            }}>
                                <strong>{invite.senderEmail}</strong> invited you
                            </span>
                            
                            <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
                                <button 
                                    onClick={() => respondToInvite(invite.id, 'accept')}
                                    style={{ 
                                        padding: '2px 8px', 
                                        background: 'var(--ink)', 
                                        color: 'white', 
                                        border: 'none', 
                                        borderRadius: '6px', 
                                        fontSize: '11px', 
                                        cursor: 'pointer' 
                                    }}
                                >
                                    Accept
                                </button>
                                <button 
                                    onClick={() => respondToInvite(invite.id, 'reject')}
                                    style={{ 
                                        padding: '2px 8px', 
                                        background: 'transparent', 
                                        color: 'var(--muted)', 
                                        border: '1px solid var(--border)', 
                                        borderRadius: '6px', 
                                        fontSize: '11px', 
                                        cursor: 'pointer' 
                                    }}
                                >
                                    Decline
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <Subbar>
            {renderActionItems()}

            {/* STANDARD SECTIONS */}
            <div className="subbar-section">
                <span className="subbar-label">Recent</span>
                <div className="subbar-placeholder">No recent workspaces</div>
            </div>
            <div className="subbar-section">
                <span className="subbar-label">Deadlines</span>
                <div className="subbar-placeholder">No upcoming deadlines</div>
            </div>
            <div className="subbar-section">
                <span className="subbar-label">Activity</span>
                <div className="subbar-placeholder">No recent activity</div>
            </div>

            <button
                className="subbar-collapse-btn"
                onClick={() => setCollapsed(o => !o)}
            >
                {collapsed ? '▲ Hide' : '☰ Overview'}
            </button>

            {collapsed && (
                <div className="subbar-collapsed-dropdown">
                    {renderActionItems()}
                    <div className="subbar-collapsed-section">
                        <span className="subbar-label">Recent</span>
                        <div className="subbar-placeholder">No recent workspaces</div>
                    </div>
                    <div className="subbar-collapsed-section">
                        <span className="subbar-label">Deadlines</span>
                        <div className="subbar-placeholder">No upcoming deadlines</div>
                    </div>
                    <div className="subbar-collapsed-section">
                        <span className="subbar-label">Activity</span>
                        <div className="subbar-placeholder">No recent activity</div>
                    </div>
                </div>
            )}
        </Subbar>
    );
}