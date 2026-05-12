import { useState, useEffect } from 'react';
import { useSync } from './useSync';
import { SyncManager } from '../sync/syncManager';

export function useNotationSidebar(workspaceID) {
    // state hooks
    const { sm } = useSync();
    const [groups, setGroups] = useState([]);
    const [pages, setPages] = useState([]);
    const [loading, setLoading] = useState(true);

    // data loaders
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

        if (fetchedPages.length === 0) {
            const id = crypto.randomUUID();
            await sm.execute(
                `INSERT INTO notation_pages (id, title, workspaceID, groupID, pageOrder, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`,
                [id, 'Untitled', workspaceID, null, 0, SyncManager.nowIso()]
            );
            return;
        }

        setGroups(fetchedGroups);
        setPages(fetchedPages);
        setLoading(false);
    };

    // side effects
    useEffect(() => {
        if (!sm || !workspaceID) return;
        load();
        const unsub = sm.subscribe(load);
        return unsub;
    }, [sm, workspaceID]);

    // mutation functions
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

    async function reorderPages(draggedPageID, targetGroupID, targetIndex) {
        setPages(prev => {
            const list = [...prev];
            const oldIndex = list.findIndex(p => p.id === draggedPageID);
            if (oldIndex === -1) return prev;

            const [movedPage] = list.splice(oldIndex, 1);
            movedPage.groupID = targetGroupID;

            const targetGroupPages = list.filter(p => p.groupID === targetGroupID);
            const insertBeforePage = targetGroupPages[targetIndex];

            if (insertBeforePage) {
                const globalInsertIndex = list.findIndex(p => p.id === insertBeforePage.id);
                list.splice(globalInsertIndex, 0, movedPage);
            } else {
                list.push(movedPage);
            }

            const updatedGroupPages = list.filter(p => p.groupID === targetGroupID);
            updatedGroupPages.forEach((p, idx) => { p.pageOrder = idx; });

            return list;
        });

        const currentPages = [...pages];
        const pageToMove = currentPages.find(p => p.id === draggedPageID);
        if (!pageToMove) return;

        const remainingPages = currentPages.filter(p => p.id !== draggedPageID);
        const targetList = remainingPages.filter(p => p.groupID === targetGroupID);
        
        const updatedTargetList = [...targetList];
        updatedTargetList.splice(targetIndex, 0, { ...pageToMove, groupID: targetGroupID });

        const now = SyncManager.nowIso();
        const promises = updatedTargetList.map((p, idx) => 
            sm.execute(
                `UPDATE notation_pages SET groupID = ?, pageOrder = ?, updatedAt = ? WHERE id = ?`,
                [targetGroupID, idx, now, p.id]
            )
        );

        await Promise.all(promises);
    }

    return { 
        groups, 
        pages, 
        loading, 
        createGroup, 
        createPage, 
        renameGroup, 
        renamePage, 
        colorGroup, 
        reorderPages 
    };
}