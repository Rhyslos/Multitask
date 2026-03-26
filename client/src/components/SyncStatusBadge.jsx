/**
 * SyncStatusBadge.jsx
 *
 * Shows a small pill in the Navbar indicating online/offline state and
 * how many operations are waiting to sync.
 *
 * Usage: drop <SyncStatusBadge /> inside Navbar's .navbar-right div.
 */
import { useSync } from '../hooks/useSync';

export default function SyncStatusBadge() {
    const { online, pending, ready } = useSync();

    if (!ready) return null;

    if (online && pending === 0) {
        return (
            <span style={{
                fontSize: '11px', fontWeight: 600,
                padding: '3px 8px', borderRadius: '20px',
                background: '#d1fae5', color: '#065f46',
            }}>
                ● Online
            </span>
        );
    }

    if (!online || pending > 0) {
        return (
            <span style={{
                fontSize: '11px', fontWeight: 600,
                padding: '3px 8px', borderRadius: '20px',
                background: '#fef3c7', color: '#92400e',
                cursor: 'default',
            }}
                title={`${pending} operation${pending !== 1 ? 's' : ''} pending sync`}
            >
                ⚡ {pending > 0 ? `${pending} pending` : 'Offline'}
            </span>
        );
    }
}
