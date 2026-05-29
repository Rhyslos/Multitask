import { useState, useEffect, useCallback } from 'react';
import { useSync } from './useSync';

// variables
const API = 'http://localhost:8080/api';

// custom hook
export function useWorkspacePresence(workspaceID) {
    const { sm, userEmail } = useSync();
    const [members, setMembers] = useState([]);
    const [onlineEmails, setOnlineEmails] = useState([]);

    // fetch functions
    const loadMembers = useCallback(async () => {
        if (!sm || !workspaceID) return;
        
        try {
            const results = await sm.query(`
                SELECT u.id, u.email, u.displayName, u.firstName, u.lastName, u.countryIso, u.phoneNumber, u.gender, u.skillset, u.privacySettings, u.cursorColor, wm.role 
                FROM workspace_members wm
                JOIN users u ON wm.userID = u.id
                WHERE wm.workspaceID = ? AND wm.isDeleted = 0
            `, [workspaceID]);
            setMembers(results);
        } catch (err) {
            console.error('Failed to load members:', err);
        }
    }, [sm, workspaceID]);

    // effect hooks
    useEffect(() => {
        loadMembers();
        if (!sm) return;
        const unsub = sm.subscribe(loadMembers);
        return unsub;
    }, [sm, loadMembers]);

    useEffect(() => {
        if (!userEmail) return;

        const updatePresence = async (wsID) => {
            try {
                const res = await fetch(`${API}/network/presence`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: userEmail, workspaceID: wsID })
                });
                // Seed presence directly from the POST response. The SSE
                // broadcast can arrive before this client's stream is
                // connected (notably right after a refresh), so relying on
                // the presence_updated event alone leaves members grey until
                // the next change. Using the response makes join/refresh
                // populate immediately.
                if (res.ok && wsID) {
                    const data = await res.json();
                    if (Array.isArray(data.onlineEmails)) {
                        setOnlineEmails(data.onlineEmails);
                    }
                }
            } catch (e) {
                console.error('Presence ping failed:', e);
            }
        };

        updatePresence(workspaceID);

        return () => {
            updatePresence(null);
        };
    }, [userEmail, workspaceID]);

    useEffect(() => {
        // event listeners
        const handlePresence = (e) => {
            const data = e.detail;
            if (data.workspaceID === workspaceID) {
                setOnlineEmails(data.onlineEmails || []);
            }
        };

        window.addEventListener('presence_updated', handlePresence);
        return () => window.removeEventListener('presence_updated', handlePresence);
    }, [workspaceID]);

    // return values
    const membersWithPresence = members.map(m => ({
        ...m,
        displayName: m.displayName || (m.firstName && m.lastName ? `${m.firstName} ${m.lastName}` : null),
        isOnline: onlineEmails.includes(m.email)
    }));

    return { members: membersWithPresence };
}