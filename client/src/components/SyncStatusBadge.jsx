// component functions
import { useSync } from '../hooks/useSync';

export default function SyncStatusBadge() {
    const { online, ready } = useSync();

    if (!ready) return null;

    if (online) {
        return (
            <span style={{
                fontSize: '11px', fontWeight: 600,
                padding: '3px 8px', borderRadius: '20px',
                background: '#d1fae5', color: '#065f46',
                marginLeft: '10px' 
            }}>
                ● Online
            </span>
        );
    }

    return (
        <span style={{
            fontSize: '11px', fontWeight: 600,
            padding: '3px 8px', borderRadius: '20px',
            background: '#fef3c7', color: '#92400e',
            cursor: 'default',
            marginLeft: '10px'
        }}
            title="Changes will sync when reconnected"
        >
            ⚡ Offline
        </span>
    );
}