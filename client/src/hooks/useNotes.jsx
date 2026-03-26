/**
 * useNotes.jsx — offline-first
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSync } from './useSync';

const API = 'http://localhost:8080/api';

export function useNotes(workspaceID) {
    const { sm, ready } = useSync();
    const [content, setContent] = useState(null);
    const [saved, setSaved] = useState(true);
    const [loading, setLoading] = useState(true);
    const saveTimer = useRef(null);

    useEffect(() => {
        if (!sm || !workspaceID) return;

        const load = () => {
            const rows = sm.query('SELECT * FROM notes WHERE workspaceID = ?', [workspaceID]);
            if (rows.length > 0) {
                try {
                    const parsed = JSON.parse(rows[0].content);
                    const hasContent = parsed && Object.keys(parsed).length > 0;
                    setContent(hasContent ? parsed : null);
                } catch {
                    setContent(null);
                }
            }
            setLoading(false);
        };

        load();
        const unsub = sm.subscribe(load);
        return unsub;
    }, [sm, workspaceID]);

    // Ensure a note row exists when workspace loads
    useEffect(() => {
        if (!ready || !workspaceID || !sm) return;
        const existing = sm.query('SELECT id FROM notes WHERE workspaceID = ?', [workspaceID]);
        if (existing.length === 0) {
            const id = crypto.randomUUID();
            sm.execute(
                `INSERT OR IGNORE INTO notes (id, content, workspaceID) VALUES (?,?,?)`,
                [id, '{}', workspaceID]
            );
        }
    }, [ready, workspaceID, sm]);

    function handleUpdate(newContent) {
        setContent(newContent);
        setSaved(false);
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(async () => {
            const contentStr = JSON.stringify(newContent);
            await sm.execute(
                `UPDATE notes SET content = ?, updatedAt = datetime('now') WHERE workspaceID = ?`,
                [contentStr, workspaceID],
                { serverMethod: 'PUT', serverPath: `/api/notes/${workspaceID}`, serverBody: { content: newContent } }
            );
            setSaved(true);
        }, 1000);
    }

    return { content, saved, loading, handleUpdate };
}
