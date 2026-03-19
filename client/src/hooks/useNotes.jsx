import { useState, useEffect, useRef, useCallback } from 'react';

const API = 'http://localhost:8080/api';


// Hook
export function useNotes(workspaceID) {
    const [content, setContent] = useState(null);
    const [saved, setSaved] = useState(true);
    const [loading, setLoading] = useState(true);
    const saveTimer = useRef(null);

    useEffect(() => {
        if (!workspaceID) return;
        fetch(`${API}/notes/${workspaceID}`)
            .then(r => r.json())
            .then(data => {
                try {
                    const parsed = JSON.parse(data.note.content);
                    const hasContent = parsed && Object.keys(parsed).length > 0;
                    setContent(hasContent ? parsed : null);
                } catch {
                    setContent(null);
                }
            })
            .finally(() => setLoading(false));
    }, [workspaceID]);

    const save = useCallback(async (newContent) => {
        await fetch(`${API}/notes/${workspaceID}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: newContent }),
        });
        setSaved(true);
    }, [workspaceID]);

    function handleUpdate(newContent) {
        setContent(newContent);
        setSaved(false);

        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => save(newContent), 1000);
    }

    return { content, saved, loading, handleUpdate };
}