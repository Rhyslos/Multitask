import { useState, useEffect, useRef } from 'react';
import { useSync } from './useSync';

export function useNotes(workspaceID) {
    const { sm } = useSync();
    const [content, setContent] = useState(null);
    const [saved, setSaved] = useState(true);
    const [loading, setLoading] = useState(true);
    const saveTimer = useRef(null);

    useEffect(() => {
        if (!sm || !workspaceID) return;

        const load = async () => {
            const rows = await sm.query('SELECT * FROM notes WHERE workspaceID = ? AND isDeleted = 0', [workspaceID]);
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

    useEffect(() => {
        if (!sm || !workspaceID) return;
        const checkSeed = async () => {
            const existing = await sm.query('SELECT id FROM notes WHERE workspaceID = ?', [workspaceID]);
            if (existing.length === 0) {
                const id = crypto.randomUUID();
                await sm.execute(
                    `INSERT OR IGNORE INTO notes (id, content, workspaceID) VALUES (?,?,?)`,
                    [id, '{}', workspaceID]
                );
            }
        };
        checkSeed();
    }, [sm, workspaceID]);

    function handleUpdate(newContent) {
        setContent(newContent);
        setSaved(false);
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(async () => {
            const contentStr = JSON.stringify(newContent);
            await sm.execute(
                `UPDATE notes SET content = ?, updatedAt = CURRENT_TIMESTAMP WHERE workspaceID = ?`,
                [contentStr, workspaceID]
            );
            setSaved(true);
        }, 1000);
    }

    return { content, saved, loading, handleUpdate };
}