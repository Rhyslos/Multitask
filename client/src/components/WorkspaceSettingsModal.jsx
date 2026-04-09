import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

// Component
export default function WorkspaceSettingsModal({ workspace, onClose }) {
    const { user } = useAuth();
    const [inviteEmail, setInviteEmail] = useState('');
    const [status, setStatus] = useState({ type: '', text: '' });
    const [loading, setLoading] = useState(false);

    async function handleSendInvite(e) {
        e.preventDefault();
        if (!inviteEmail.trim()) return;

        setLoading(true);
        setStatus({ type: '', text: '' });

        try {
            const res = await fetch('http://localhost:8080/api/invites/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    workspaceID: workspace.id,
                    senderID: user.id,
                    receiverEmail: inviteEmail.trim()
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to send invite');

            setStatus({ type: 'success', text: 'Invite sent successfully!' });
            setInviteEmail('');
        } catch (err) {
            setStatus({ type: 'error', text: err.message });
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 className="modal-title" style={{ margin: 0 }}>{workspace.name} Settings</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'inherit' }}>✕</button>
                </div>

                <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '1rem', marginBottom: '12px' }}>Invite Members</h3>
                    <form className="modal-form" onSubmit={handleSendInvite}>
                        <div className="modal-field">
                            <label>Email Address</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    type="email"
                                    placeholder="colleague@example.com"
                                    value={inviteEmail}
                                    onChange={e => setInviteEmail(e.target.value)}
                                    disabled={loading}
                                    required
                                    style={{ flex: 1 }}
                                />
                                <button 
                                    type="submit" 
                                    className="modal-submit" 
                                    disabled={loading || !inviteEmail}
                                    style={{ margin: 0, padding: '0 16px', whiteSpace: 'nowrap' }}
                                >
                                    {loading ? 'Sending…' : 'Invite'}
                                </button>
                            </div>
                        </div>
                    </form>
                    
                    {status.text && (
                        <p className={status.type === 'error' ? 'modal-error' : ''} style={{ marginTop: '8px', fontSize: '0.9rem', color: status.type === 'success' ? '#7ab648' : undefined }}>
                            {status.text}
                        </p>
                    )}
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color, #333)', margin: '24px 0' }} />

                <div>
                    <h3 style={{ fontSize: '1rem', marginBottom: '12px' }}>Current Members</h3>
                    <div style={{ textAlign: 'center', padding: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', fontSize: '0.9rem', color: '#888' }}>
                        Member management coming soon...
                    </div>
                </div>
            </div>
        </div>
    );
}