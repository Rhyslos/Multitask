import { useState, useEffect } from 'react';
import { useSync } from './useSync';
import { SyncManager } from '../sync/syncManager';

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

        setGroups(fetchedGroups);
        setPages(fetchedPages);
        setLoading(false);
    };

    useEffect(() => {
        if (!sm || !workspaceID) return;
        load();
        // sm.subscribe fires on every local mutation AND every server merge,
        // so the sidebar stays in sync without any manual triggers.
        const unsub = sm.subscribe(load);
        return unsub;
    }, [sm, workspaceID]);

    // Note: every sm.execute() below already schedules a debounced push to the server
    // automatically. Calling sm.triggerSync() afterwards (the old API) was redundant
    // and the new API doesn't need it at all.

    async function createPage(title = 'Untitled', groupID = null) {
        const id = crypto.randomUUID();
        const pagesInGroup = pages.filter(p => p.groupID === groupID);
        await sm.execute(
            `INSERT INTO notation_pages (id, title, workspaceID, groupID, pageOrder, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`,
            [id, title, workspaceID, groupID, pagesInGroup.length, SyncManager.nowIso()]
        );
        return id;
    }

    async function createGroup(name) {
        const id = crypto.randomUUID();
        await sm.execute(
            `INSERT INTO notation_groups (id, name, workspaceID, groupOrder, updatedAt) VALUES (?, ?, ?, ?, ?)`,
            [id, name, workspaceID, groups.length, SyncManager.nowIso()]
        );
    }

    async function renameGroup(id, name) {
        await sm.execute(
            `UPDATE notation_groups SET name = ?, updatedAt = ? WHERE id = ?`,
            [name, SyncManager.nowIso(), id]
        );
    }

    async function renamePage(id, title) {
        await sm.execute(
            `UPDATE notation_pages SET title = ?, updatedAt = ? WHERE id = ?`,
            [title, SyncManager.nowIso(), id]
        );
    }

    async function colorGroup(id, color) {
        await sm.execute(
            `UPDATE notation_groups SET color = ?, updatedAt = ? WHERE id = ?`,
            [color, SyncManager.nowIso(), id]
        );
    }

    return { groups, pages, loading, createGroup, createPage, renameGroup, renamePage, colorGroup };
}