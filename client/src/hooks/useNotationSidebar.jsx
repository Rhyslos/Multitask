import { useState, useEffect } from 'react';
import { useSync } from './useSync';

export function useNotationSidebar(workspaceID) {
    const { sm } = useSync();
    const [groups, setGroups] = useState([]);
    const [pages, setPages] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        if (!sm || !workspaceID) return;

        const [fetchedGroups, fetchedPages] = await Promise.all([
            sm.query(
                `SELECT * FROM notation_groups WHERE workspaceID = ? AND isDeleted = 0 ORDER BY groupOrder ASC`,
                [workspaceID]
            ),
            sm.query(
                `SELECT * FROM notation_pages WHERE workspaceID = ? AND isDeleted = 0 ORDER BY pageOrder ASC`,
                [workspaceID]
            ),
        ]);

        console.log('[sidebar] groups:', fetchedGroups);
        console.log('[sidebar] pages:', fetchedPages);
        console.log('[sidebar] loading done');

        setGroups(fetchedGroups);
        setPages(fetchedPages);
        setLoading(false);
    };

    useEffect(() => {
        console.log('[sidebar] sm:', sm);
        console.log('[sidebar] workspaceID:', workspaceID);
        if (!sm || !workspaceID) return;
        load();
        const unsub = sm.subscribe(load);
        return unsub;
    }, [sm, workspaceID]);

    async function createGroup(name) {
        const id = crypto.randomUUID();
        await sm.execute(
            'INSERT INTO notation_groups (id, name, workspaceID, grouporder) VALUES (?, ?, ?, ?)',
            [id, name, workspaceID, groups.length]
        );
        await sm.syncNow();
    }

    async function createPage(title = 'Untitled', groupID = null) {
        const id = crypto.randomUUID();
        const pagesInGroup = pages.filter(p => p.groupID === groupID);
        await sm.execute(
            'INSERT INTO notation_pages (id, title, workspaceID, groupID, pageOrder) VALUES (?, ?, ?, ?, ?)',
            [id, title, workspaceID, groupID, pagesInGroup.length]
        );
        await sm.syncNow();
        return id;
    }

    async function renameGroup(id, name) {
        await sm.execute(
            `UPDATE notation_groups SET name = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
            [name, id]
        );
        await sm.syncNow();
    }

    async function renamePage(id, title) {
        await sm.execute(
            `UPDATE notation_pages SET title = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
            [title, id]
        );
        await sm.syncNow();
    }

    async function colorGroup(id, color) {
        await sm.execute(
            `UPDATE notation_groups SET color = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
            [color, id]
        );
        await sm.syncNow();
    }

    return { groups, pages, loading, createGroup, createPage, renameGroup, renamePage, colorGroup };
}