/**
 * syncAPI.mjs
 *
 * Two endpoints:
 *
 *   GET  /api/sync/pull?userID=xxx
 *     Returns the full server-side state for a user so the client can
 *     merge it into the local sql.js DB.
 *
 *   POST /api/sync/flush
 *     Body: { ops: [{ method, path, body }] }
 *     Replays each operation against the existing API handlers in order.
 *     Returns { applied, failed } counts.
 *
 * Also registers GET /api/health so the client can probe connectivity.
 */
import { Router } from 'express';
import { catchAsync } from './apiUtils.mjs';

export default function createSyncRouter(db, app) {
    const router = Router();

    // ── Health check ──────────────────────────────────────────────────────────
    // This is mounted at /api/health by server.mjs
    // (we export a separate tiny handler for clarity)

    // ── Pull: full state for a user ───────────────────────────────────────────
    router.get('/pull', catchAsync(async (req, res) => {
        const { userID } = req.query;
        if (!userID) return res.status(400).json({ error: 'userID required' });

        const workspaces = await db.all(
            'SELECT * FROM workspaces WHERE userID = ?', [userID]
        );
        const categories = await db.all(
            'SELECT * FROM categories WHERE userID = ?', [userID]
        );

        const wsIds = workspaces.map(w => w.id);

        let tabs = [], lists = [], tasks = [], notes = [];
        if (wsIds.length > 0) {
            const ph = wsIds.map(() => '?').join(',');
            tabs  = await db.all(`SELECT * FROM kanban_tabs WHERE workspaceID IN (${ph})`, wsIds);
            lists = await db.all(`SELECT * FROM lists WHERE workspaceID IN (${ph})`, wsIds);
            notes = await db.all(`SELECT * FROM notes WHERE workspaceID IN (${ph})`, wsIds);

            const listIds = lists.map(l => l.id);
            if (listIds.length > 0) {
                const lph = listIds.map(() => '?').join(',');
                tasks = await db.all(`SELECT * FROM tasks WHERE listID IN (${lph})`, listIds);
            }
        }

        return res.json({ workspaces, categories, tabs, lists, tasks, notes });
    }));

    // ── Flush: replay pending ops from client ─────────────────────────────────
    router.post('/flush', catchAsync(async (req, res) => {
        const { ops } = req.body;
        if (!Array.isArray(ops)) return res.status(400).json({ error: 'ops must be an array' });

        let applied = 0;
        const errors = [];

        for (const op of ops) {
            try {
                await replayOp(db, op);
                applied++;
            } catch (err) {
                errors.push({ op, error: err.message });
            }
        }

        return res.json({ applied, failed: errors.length, errors });
    }));

    return router;
}

/**
 * Replay a single { method, path, body } operation directly against the DB.
 *
 * We do NOT go through Express routing (would require an internal HTTP call).
 * Instead we inline the relevant DB logic here, mirroring kanbanAPI / workspaceAPI / notesAPI.
 *
 * Paths handled:
 *   POST   /api/kanban/lists
 *   PUT    /api/kanban/lists/reorder
 *   PUT    /api/kanban/lists/:id
 *   DELETE /api/kanban/lists/:id
 *   POST   /api/kanban/tasks
 *   PUT    /api/kanban/tasks/reorder
 *   PUT    /api/kanban/tasks/:id
 *   DELETE /api/kanban/tasks/:id
 *   POST   /api/kanban/tabs
 *   PUT    /api/kanban/tabs/:id
 *   PUT    /api/kanban/tabs/:id/archive
 *   POST   /api/workspaces
 *   DELETE /api/workspaces/:id
 *   PATCH  /api/workspaces/:id
 *   POST   /api/workspaces/categories
 *   DELETE /api/workspaces/categories/:id
 *   PUT    /api/notes/:workspaceID
 */
async function replayOp(db, { method, path, body }) {
    // Strip the /api prefix
    const p = path.replace(/^\/api/, '');
    const M = method.toUpperCase();

    // ── Kanban lists ──────────────────────────────────────────────────────────
    if (M === 'POST' && p === '/kanban/lists') {
        const { id, name, category, color, direction, workspaceID, columnIndex, tabID } = body;
        await db.run(
            `INSERT OR IGNORE INTO lists (id, name, category, color, direction, workspaceID, columnIndex, tabID)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, name, category ?? '', color ?? '', direction, workspaceID, columnIndex ?? 0, tabID ?? null]
        );
        return;
    }
    if (M === 'PUT' && p === '/kanban/lists/reorder') {
        for (const { id, columnIndex } of (body.updates || [])) {
            await db.run('UPDATE lists SET columnIndex = ? WHERE id = ?', [columnIndex, id]);
        }
        return;
    }
    const listMatch = p.match(/^\/kanban\/lists\/([^/]+)$/);
    if (listMatch) {
        const listId = listMatch[1];
        if (M === 'PUT') {
            const { name, category, color } = body;
            await db.run('UPDATE lists SET name=?, category=?, color=? WHERE id=?', [name, category, color, listId]);
        } else if (M === 'DELETE') {
            await db.run('DELETE FROM lists WHERE id = ?', [listId]);
        }
        return;
    }

    // ── Kanban tasks ──────────────────────────────────────────────────────────
    if (M === 'POST' && p === '/kanban/tasks') {
        const { id, title, description, isCompleted, originalCategory, color, listID, taskOrder } = body;
        await db.run(
            `INSERT OR IGNORE INTO tasks (id, title, description, isCompleted, originalCategory, color, listID, taskOrder)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, title, description, isCompleted ? 1 : 0, originalCategory, color ?? '', listID, taskOrder ?? 0]
        );
        return;
    }
    if (M === 'PUT' && p === '/kanban/tasks/reorder') {
        for (const { id, listID, taskOrder } of (body.updates || [])) {
            await db.run('UPDATE tasks SET listID=?, taskOrder=? WHERE id=?', [listID, taskOrder, id]);
        }
        return;
    }
    const taskMatch = p.match(/^\/kanban\/tasks\/([^/]+)$/);
    if (taskMatch) {
        const taskId = taskMatch[1];
        if (M === 'PUT') {
            const { title, description, isCompleted, listID, originalCategory, color, taskOrder } = body;
            await db.run(
                'UPDATE tasks SET title=?,description=?,isCompleted=?,listID=?,originalCategory=?,color=?,taskOrder=? WHERE id=?',
                [title, description, isCompleted ? 1 : 0, listID, originalCategory, color, taskOrder, taskId]
            );
        } else if (M === 'DELETE') {
            await db.run('DELETE FROM tasks WHERE id=?', [taskId]);
        }
        return;
    }

    // ── Kanban tabs ───────────────────────────────────────────────────────────
    if (M === 'POST' && p === '/kanban/tabs') {
        const { id, name, color, tabOrder, workspaceID } = body;
        await db.run(
            `INSERT OR IGNORE INTO kanban_tabs (id, name, color, tabOrder, isArchived, workspaceID) VALUES (?,?,?,?,?,?)`,
            [id, name ?? 'New Tab', color ?? '#888888', tabOrder ?? 0, 0, workspaceID]
        );
        return;
    }
    const archiveMatch = p.match(/^\/kanban\/tabs\/([^/]+)\/archive$/);
    if (archiveMatch) {
        await db.run('UPDATE kanban_tabs SET isArchived=1 WHERE id=?', [archiveMatch[1]]);
        return;
    }
    const tabMatch = p.match(/^\/kanban\/tabs\/([^/]+)$/);
    if (tabMatch) {
        const { name, color } = body;
        await db.run('UPDATE kanban_tabs SET name=?,color=? WHERE id=?', [name, color, tabMatch[1]]);
        return;
    }

    // ── Workspaces ────────────────────────────────────────────────────────────
    if (M === 'POST' && p === '/workspaces') {
        const { name, userID, categoryID } = body;
        // id was already written locally; we need to INSERT OR IGNORE
        // but the local id must match — the body includes it from useWorkspaces
        const id = body.id || require('crypto').randomUUID();
        await db.run(
            `INSERT OR IGNORE INTO workspaces (id, name, userID, categoryID) VALUES (?,?,?,?)`,
            [id, name, userID, categoryID || null]
        );
        return;
    }
    const wsMatch = p.match(/^\/workspaces\/([^/]+)$/);
    if (wsMatch) {
        const wsId = wsMatch[1];
        if (M === 'DELETE') await db.run('DELETE FROM workspaces WHERE id=?', [wsId]);
        if (M === 'PATCH') {
            const { name, categoryID } = body;
            await db.run('UPDATE workspaces SET name=?,categoryID=? WHERE id=?', [name, categoryID || null, wsId]);
        }
        return;
    }

    // ── Categories ────────────────────────────────────────────────────────────
    if (M === 'POST' && p === '/workspaces/categories') {
        const { id, name, color, userID } = body;
        await db.run(
            `INSERT OR IGNORE INTO categories (id, name, color, userID) VALUES (?,?,?,?)`,
            [id, name, color, userID]
        );
        return;
    }
    const catMatch = p.match(/^\/workspaces\/categories\/([^/]+)$/);
    if (catMatch) {
        await db.run('DELETE FROM categories WHERE id=?', [catMatch[1]]);
        return;
    }

    // ── Notes ─────────────────────────────────────────────────────────────────
    const noteMatch = p.match(/^\/notes\/([^/]+)$/);
    if (noteMatch && M === 'PUT') {
        const workspaceID = noteMatch[1];
        const contentStr = typeof body.content === 'string' ? body.content : JSON.stringify(body.content);
        await db.run(
            `UPDATE notes SET content=?, updatedAt=CURRENT_TIMESTAMP WHERE workspaceID=?`,
            [contentStr, workspaceID]
        );
        return;
    }

    console.warn('[syncAPI] Unknown op — skipped:', M, p);
}
