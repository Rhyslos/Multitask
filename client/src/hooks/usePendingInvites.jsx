import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import { useSync } from './useSync';

const API = 'http://localhost:8080/api';

export function usePendingInvites() {
    const { user } = useAuth();
    const { sm } = useSync();
    const [invites, setInvites] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchInvites = useCallback(async () => {
        if (!user?.email) return;
        try {
            const res = await fetch(`${API}/invites/pending/${user.email}`);
            if (!res.ok) throw new Error('Failed to fetch invites');
            const data = await res.json();
            setInvites(data.invites || []);
        } catch (err) {
            console.error('Error fetching invites:', err);
        } finally {
            setLoading(false);
        }
    }, [user?.email]);

    useEffect(() => {
        if (!user?.email) return;

        // Initial fetch on mount
        fetchInvites();

        // Listen for invite events forwarded from the SyncProvider's SSE connection.
        // We no longer open our own EventSource here — the connection lives in
        // useSync.jsx so it stays open across all page navigations.
        function handleInvitesUpdated(e) {
            setInvites(e.detail.invites || []);
        }

        window.addEventListener('invites_updated', handleInvitesUpdated);
        return () => window.removeEventListener('invites_updated', handleInvitesUpdated);
    }, [user?.email, fetchInvites]);

    const respondToInvite = async (inviteID, action) => {
        try {
            const res = await fetch(`${API}/invites/respond`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ inviteID, userID: user.id, action })
            });

            if (!res.ok) throw new Error(`Failed to ${action} invite`);

            setInvites(prev => prev.filter(inv => inv.id !== inviteID));

            if (action === 'accept') {
                // Pull the newly shared workspace from the server immediately.
                // (Previously this called triggerSync, which has been replaced by
                // pullFromServer for SSE-driven catch-up.)
                if (sm) await sm.pullFromServer();
                window.dispatchEvent(new Event('workspacesUpdated'));
            }
        } catch (err) {
            console.error(err);
            alert(`Error: Could not ${action} invite.`);
        }
    };

    return { invites, loading, respondToInvite };
}