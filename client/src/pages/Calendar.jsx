// import functions
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useWorkspacePresence } from '../hooks/useWorkspacePresence';
import { useSync } from '../hooks/useSync';
import { SyncManager } from '../sync/syncManager';

/* ------------------------------------------------------------------ *
 *  Calendar — team availability scheduler
 *
 *  Availability is persisted in the synced `availability` table
 *  (OPFS SQLite locally, mirrored to the server via SyncManager).
 *  One row per painted slot:
 *    id           = `${workspaceID}_${userID}_${slot}`  (deterministic)
 *    userID       = who painted it
 *    workspaceID  = which workspace
 *    slot         = 'YYYY-MM-DDTHH:mm'
 *    status       = 'available' | 'unavailable'
 *    updatedAt    = sync watermark   isDeleted = soft-delete flag
 *
 *  All reads/writes go through the useAvailability hook below, which
 *  is the single place that touches SQL. Painting updates local state
 *  immediately (optimistic) and the Save button commits a batch to the
 *  DB; the SyncManager subscription re-reads when remote changes land.
 * ------------------------------------------------------------------ */

// ---- configuration ----
// Calendar runs from the start of 2026 with no upper bound.
const DATE_MIN = new Date('2026-01-01');

// half-hour slots from 08:00 to 18:00
const TIMES = (() => {
    const t = [];
    for (let h = 8; h <= 18; h++) {
        t.push(`${String(h).padStart(2, '0')}:00`);
        t.push(`${String(h).padStart(2, '0')}:30`);
    }
    return t;
})();

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Fallback roster so the page is populated before presence resolves.
// Colors mirror the prototype; real members override these via useWorkspacePresence.
const FALLBACK_MEMBERS = [
    { id: 'u-yuna',  displayName: 'Yuna',       cursorColor: '#3B82F6' },
    { id: 'u-freya', displayName: 'Freya',      cursorColor: '#FFDA03' },
    { id: 'u-alek',  displayName: 'Aleksandra', cursorColor: '#f2aeee' },
    { id: 'u-vic',   displayName: 'Victoria',   cursorColor: '#F97316' },
];

// ---- date helpers ----
function clampDate(d) {
    if (d < DATE_MIN) return new Date(DATE_MIN);
    return d;
}

function getLocalDateString(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function formatEuroDate(d) {
    const day = String(d.getDate()).padStart(2, '0');
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}/${m}/${d.getFullYear()}`;
}

// Monday-based start of the week containing d
function startOfWeek(d) {
    const out = new Date(d);
    const day = out.getDay();
    const diff = out.getDate() - day + (day === 0 ? -6 : 1);
    out.setDate(diff);
    return out;
}

function add30(t) {
    const [h, m] = t.split(':').map(Number);
    const total = h * 60 + m + 30;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function isConsecutive(t1, t2) {
    const [h1, m1] = t1.split(':').map(Number);
    const [h2, m2] = t2.split(':').map(Number);
    return (h2 * 60 + m2) - (h1 * 60 + m1) === 30;
}

// ---- member helpers ----
function memberName(m) {
    return m.displayName || m.firstName || m.email || 'Unknown';
}

function memberColor(m) {
    if (m.cursorColor) return m.cursorColor;
    // stable hash fallback (same approach as Navbar avatars)
    let hash = 0;
    const str = m.email || m.id || 'default';
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00ffffff).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
}

// dark text on light user colors, white otherwise
function contrastText(hex) {
    const h = hex.replace('#', '');
    if (h.length !== 6) return '#ffffff';
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#1f2937' : '#ffffff';
}

// deterministic row id so re-painting a slot updates the same row
function slotRowId(workspaceID, userID, slot) {
    return `${workspaceID}_${userID}_${slot}`;
}

/* ------------------------------------------------------------------ *
 *  useAvailability — the only place that touches the availability SQL.
 *
 *  Returns:
 *    rows        live array of { id, userID, workspaceID, slot, status }
 *                for this workspace (isDeleted = 0), kept in sync via the
 *                SyncManager subscription.
 *    ready       whether the DB is available to read/write
 *    saveSlots   commit the current user's slots for a date window:
 *                  saveSlots(userID, slotMap, startStr, endStr)
 *                writes a batch (upserts touched slots, soft-deletes
 *                cleared ones) through sm.runBatch, which pushes to sync.
 * ------------------------------------------------------------------ */
function useAvailability(workspaceID) {
    const { sm, ready: syncReady } = useSync() || {};
    const [rows, setRows] = useState([]);
    const ready = !!sm && syncReady;

    const reload = useCallback(async () => {
        if (!sm || !workspaceID) return;
        try {
            const result = await sm.query(
                `SELECT id, userID, workspaceID, slot, status
                   FROM availability
                  WHERE workspaceID = ? AND isDeleted = 0`,
                [workspaceID]
            );
            setRows(Array.isArray(result) ? result : []);
        } catch (e) {
            console.error('[calendar] load availability failed:', e.message);
        }
    }, [sm, workspaceID]);

    // initial load + re-read on any sync notification (local or remote)
    useEffect(() => {
        if (!ready) return;
        reload();
        const unsub = sm.subscribe(() => reload());
        return () => { if (unsub) unsub(); };
    }, [ready, sm, reload]);

    // Commit one user's slots within [startStr, endStr]. slotMap is
    // Map<slot, status>. Anything previously stored in the window but no
    // longer in slotMap is soft-deleted.
    const saveSlots = useCallback(async (userID, slotMap, startStr, endStr) => {
        if (!sm || !userID || !workspaceID) return;

        const now = SyncManager.nowIso();
        const statements = [];

        // upsert every currently-painted slot in the window
        const seen = new Set();
        slotMap.forEach((status, slot) => {
            const date = slot.split('T')[0];
            if (date < startStr || date > endStr) return;
            const id = slotRowId(workspaceID, userID, slot);
            seen.add(id);
            statements.push({
                sql: `INSERT INTO availability (id, userID, workspaceID, slot, status, updatedAt, isDeleted)
                      VALUES (?, ?, ?, ?, ?, ?, 0)
                      ON CONFLICT(id) DO UPDATE SET
                        status = excluded.status,
                        updatedAt = excluded.updatedAt,
                        isDeleted = 0`,
                params: [id, userID, workspaceID, slot, status, now],
            });
        });

        // soft-delete this user's previously-stored slots in the window
        // that are no longer painted
        const existing = rows.filter(r =>
            r.userID === userID &&
            r.slot.split('T')[0] >= startStr &&
            r.slot.split('T')[0] <= endStr
        );
        existing.forEach(r => {
            if (!seen.has(r.id)) {
                statements.push({
                    sql: `UPDATE availability SET isDeleted = 1, updatedAt = ? WHERE id = ?`,
                    params: [now, r.id],
                });
            }
        });

        if (statements.length === 0) return;

        try {
            await sm.runBatch(statements);
            await reload();
        } catch (e) {
            console.error('[calendar] save availability failed:', e.message);
        }
    }, [sm, workspaceID, rows, reload]);

    return { rows, ready, saveSlots, reload };
}

// ================================================================== //

export default function Calendar() {
    const { workspaceID } = useParams();
    const { user } = useAuth();
    const { members: presenceMembers } = useWorkspacePresence(workspaceID);

    // roster: real presence members if available, else fallback mock
    const members = useMemo(() => {
        if (presenceMembers && presenceMembers.length > 0) return presenceMembers;
        return FALLBACK_MEMBERS;
    }, [presenceMembers]);

    // the logged-in user's id (FK used in the availability table)
    const currentUserId = user?.id ?? null;

    // current user resolved against the roster (falls back to first member)
    const currentName = useMemo(() => {
        if (user?.displayName) return user.displayName;
        const me = members.find(m => m.id === currentUserId);
        return me ? memberName(me) : memberName(members[0]);
    }, [user, members, currentUserId]);

    // userID -> display name, and name -> color, for rendering rows
    const nameById = useMemo(() => {
        const map = {};
        members.forEach(m => { map[m.id] = memberName(m); });
        return map;
    }, [members]);

    const colorByName = useMemo(() => {
        const map = {};
        members.forEach(m => { map[memberName(m)] = memberColor(m); });
        return map;
    }, [members]);

    const myColor = colorByName[currentName] || 'var(--accent)';

    // ---- availability (synced) ----
    const { rows: availabilityRows, ready: dataReady, saveSlots } = useAvailability(workspaceID);

    // allAvailability: [{ name, slot, status }] — derived from synced rows,
    // mapped from userID to display name for the grid/indicators.
    const allAvailability = useMemo(() => {
        return availabilityRows.map(r => ({
            name: nameById[r.userID] || 'Unknown',
            userID: r.userID,
            slot: r.slot,
            status: r.status,
        }));
    }, [availabilityRows, nameById]);

    // mySelectedSlots: Map<slotId, status> for the logged-in user (editable)
    const [mySelectedSlots, setMySelectedSlots] = useState(new Map());
    const [logs, setLogs] = useState([]);
    const [logOpen, setLogOpen] = useState(false);

    // view state
    const [view, setView] = useState('week');        // 'week' | 'month'
    const [paintMode, setPaintMode] = useState('available'); // 'available' | 'unavailable'
    const [filter, setFilter] = useState('all');     // 'all' | 'active' | 'consensus'
    const [currentDate, setCurrentDate] = useState(() => clampDate(new Date()));
    const [pickerOpen, setPickerOpen] = useState(false);

    // drag state (refs so listeners read fresh values without re-binding)
    const isDragging = useRef(false);
    const dragAction = useRef(null);
    const pickerRef = useRef(null);

    // track whether the user has unsaved paint edits, so incoming sync
    // re-reads don't clobber in-progress work
    const dirtyRef = useRef(false);
    const [isDirty, setIsDirty] = useState(false);
    const markDirty = useCallback(() => { dirtyRef.current = true; setIsDirty(true); }, []);
    const clearDirty = useCallback(() => { dirtyRef.current = false; setIsDirty(false); }, []);

    // hydrate "my" selections from synced rows whenever they change —
    // but not while the user has unsaved edits in flight
    useEffect(() => {
        if (dirtyRef.current) return;
        const mine = new Map();
        availabilityRows.forEach(r => {
            if (r.userID === currentUserId) mine.set(r.slot, r.status);
        });
        setMySelectedSlots(mine);
    }, [availabilityRows, currentUserId]);

    // global mouseup ends any drag even if released outside the grid
    useEffect(() => {
        const up = () => { isDragging.current = false; dragAction.current = null; };
        window.addEventListener('mouseup', up);
        return () => window.removeEventListener('mouseup', up);
    }, []);

    // close the month/year picker on outside click or Escape
    useEffect(() => {
        if (!pickerOpen) return;
        const onDown = (e) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target)) setPickerOpen(false);
        };
        const onKey = (e) => { if (e.key === 'Escape') setPickerOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [pickerOpen]);

    // jump straight to a chosen month + year from the picker
    const jumpTo = (year, month) => {
        let target = new Date(year, month, 1);
        target = clampDate(target);
        if (view === 'week') target = startOfWeek(target);
        setCurrentDate(target);
        setPickerOpen(false);
    };

    // ---- view switching ----
    const switchView = (next) => {
        setView(next);
        setCurrentDate(prev => {
            const d = new Date(prev);
            if (next === 'month') d.setDate(1);
            else return startOfWeek(d);
            return d;
        });
    };

    const changeDate = (offset) => {
        setCurrentDate(prev => {
            const d = new Date(prev);
            if (view === 'week') d.setDate(d.getDate() + offset * 7);
            else d.setMonth(d.getMonth() + offset);
            return clampDate(d);
        });
    };

    const goToWeek = (dateStr) => {
        setView('week');
        setCurrentDate(startOfWeek(clampDate(new Date(dateStr))));
    };

    // ---- painting ----
    const paintCell = useCallback((slotId) => {
        setMySelectedSlots(prev => {
            const next = new Map(prev);
            if (dragAction.current === 'remove') next.delete(slotId);
            else next.set(slotId, dragAction.current);
            return next;
        });
    }, []);

    const startPaint = (slotId) => {
        if (view !== 'week') return;
        isDragging.current = true;
        markDirty();
        const current = mySelectedSlots.get(slotId);
        dragAction.current = current === paintMode ? 'remove' : paintMode;
        paintCell(slotId);
    };

    const enterPaint = (slotId) => {
        if (isDragging.current) paintCell(slotId);
    };

    // ---- log generation (delta against saved state for current week) ----
    const buildLogMessages = (startStr, endStr) => {
        const oldMap = new Map();
        allAvailability
            .filter(a => a.name === currentName && a.slot.split('T')[0] >= startStr && a.slot.split('T')[0] <= endStr)
            .forEach(a => oldMap.set(a.slot, a.status));

        const newMap = new Map();
        mySelectedSlots.forEach((status, slot) => {
            const date = slot.split('T')[0];
            if (date >= startStr && date <= endStr) newMap.set(slot, status);
        });

        const deltas = [];
        newMap.forEach((status, slot) => {
            if (!oldMap.has(slot) || oldMap.get(slot) !== status) deltas.push({ slot, status });
        });
        oldMap.forEach((status, slot) => {
            if (!newMap.has(slot)) deltas.push({ slot, status: 'removed' });
        });
        if (deltas.length === 0) return [];

        // group by date + status, collapse consecutive slots into time blocks
        const groups = {};
        deltas.forEach(({ slot, status }) => {
            const [date, time] = slot.split('T');
            const key = `${date}|${status}`;
            (groups[key] ||= []).push(time);
        });

        const messages = [];
        Object.keys(groups).forEach(key => {
            const [dateStr, status] = key.split('|');
            const tms = groups[key].sort();
            const blocks = [];
            let blockStart = tms[0];
            let prev = tms[0];
            for (let i = 1; i < tms.length; i++) {
                if (isConsecutive(prev, tms[i])) prev = tms[i];
                else { blocks.push(`${blockStart}-${add30(prev)}`); blockStart = tms[i]; prev = tms[i]; }
            }
            blocks.push(`${blockStart}-${add30(prev)}`);

            const d = new Date(dateStr);
            const fd = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
            let action = '';
            if (status === 'unavailable') action = 'blocked off';
            else if (status === 'available') action = 'is available on';
            else action = 'cleared their times on';

            messages.push({ name: currentName, action, date: fd, blocks: blocks.join(', '), status });
        });
        return messages;
    };

    // ---- save (persist to synced DB) ----
    const saveData = async () => {
        if (view !== 'week') return;
        if (!currentUserId) {
            console.warn('[calendar] no current user id; cannot save');
            return;
        }
        const weekStart = startOfWeek(currentDate);
        const startStr = getLocalDateString(weekStart);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const endStr = getLocalDateString(weekEnd);

        // build the activity-log delta before we commit (compares against
        // what's currently in the synced rows for this user/window)
        const messages = buildLogMessages(startStr, endStr);

        // commit to the DB → SyncManager pushes to the server
        await saveSlots(currentUserId, mySelectedSlots, startStr, endStr);

        // edits are now persisted; allow incoming sync to refresh again
        clearDirty();

        if (messages.length > 0) {
            const now = new Date();
            const time = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getFullYear()).slice(2)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            setLogs(prev => [...messages.map(m => ({ time, ...m })), ...prev].slice(0, 50));
        }
    };

    // ---- derived: week grid model ----
    const weekDays = useMemo(() => {
        const start = startOfWeek(currentDate);
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(start);
            d.setDate(d.getDate() + i);
            return d;
        });
    }, [currentDate]);

    // availability lookup: slotId -> { avail:[names], unavail:[names] }
    const slotIndex = useMemo(() => {
        const idx = new Map();
        allAvailability.forEach(a => {
            if (!idx.has(a.slot)) idx.set(a.slot, { avail: [], unavail: [] });
            if (a.status === 'unavailable') idx.get(a.slot).unavail.push(a.name);
            else idx.get(a.slot).avail.push(a.name);
        });
        return idx;
    }, [allAvailability]);

    // day lookup for month view: 'YYYY-MM-DD' -> { avail:Set, unavail:Set }
    const dayIndex = useMemo(() => {
        const idx = new Map();
        allAvailability.forEach(a => {
            const date = a.slot.split('T')[0];
            if (!idx.has(date)) idx.set(date, { avail: new Set(), unavail: new Set() });
            if (a.status === 'unavailable') idx.get(date).unavail.add(a.name);
            else idx.get(date).avail.add(a.name);
        });
        return idx;
    }, [allAvailability]);

    // month grid (6 weeks)
    const monthWeeks = useMemo(() => {
        const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        let d = new Date(monthStart);
        const dow = d.getDay();
        d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
        const weeks = [];
        for (let w = 0; w < 6; w++) {
            const row = [];
            for (let i = 0; i < 7; i++) {
                row.push(new Date(d));
                d.setDate(d.getDate() + 1);
            }
            weeks.push(row);
            if (d.getMonth() > monthStart.getMonth() || d.getFullYear() > monthStart.getFullYear()) break;
        }
        return weeks;
    }, [currentDate]);

    const dateDisplay = useMemo(() => {
        if (view === 'week') return `Week of ${formatEuroDate(startOfWeek(currentDate))}`;
        const name = currentDate.toLocaleString('default', { month: 'long' });
        return `${name} ${currentDate.getFullYear()}`;
    }, [view, currentDate]);

    // year list for the picker: 2026 through at least a few years past the
    // current view, so users can always scroll forward into the future.
    const pickerYears = useMemo(() => {
        const minYear = DATE_MIN.getFullYear();
        const horizon = Math.max(new Date().getFullYear(), currentDate.getFullYear()) + 5;
        const years = [];
        for (let y = minYear; y <= horizon; y++) years.push(y);
        return years;
    }, [currentDate]);

    const viewYear = currentDate.getFullYear();
    const viewMonth = currentDate.getMonth();
    // is a given year/month before the 2026 floor?
    const beforeFloor = (y, m) =>
        y < DATE_MIN.getFullYear() ||
        (y === DATE_MIN.getFullYear() && m < DATE_MIN.getMonth());

    // filter test for a week cell
    const cellDimmed = (avail) => {
        const isMine = (slotStatus) => slotStatus !== undefined;
        return (slotId, slotStatus) => {
            if (filter === 'all') return false;
            const users = avail || [];
            if (filter === 'active') return users.length === 0 && !isMine(slotStatus);
            if (filter === 'consensus') {
                const set = new Set([...users, currentName]);
                return set.size < members.length;
            }
            return false;
        };
    };
    const dimTest = cellDimmed();

    // ================================================================ //
    return (
        <div className="cal-root" onMouseLeave={() => { isDragging.current = false; }}>

            {/* header / controls */}
            <div className="cal-controls">
                <div className="cal-viewtoggle">
                    <button
                        className={view === 'week' ? 'active' : ''}
                        onClick={() => switchView('week')}
                    >Weekly</button>
                    <button
                        className={view === 'month' ? 'active' : ''}
                        onClick={() => switchView('month')}
                    >Monthly</button>
                </div>

                <button className="cal-navbtn" onClick={() => changeDate(-1)}>&larr; Prev</button>

                <div className="cal-datepicker" ref={pickerRef}>
                    <button
                        className="cal-datedisplay"
                        onClick={() => setPickerOpen(o => !o)}
                        aria-haspopup="true"
                        aria-expanded={pickerOpen}
                        title="Jump to month and year"
                    >
                        {dateDisplay}
                        <span className="cal-datedisplay-caret">▾</span>
                    </button>

                    {pickerOpen && (
                        <div className="cal-picker" role="dialog" aria-label="Pick month and year">
                            <div className="cal-picker-years">
                                {pickerYears.map(y => (
                                    <button
                                        key={y}
                                        className={`cal-picker-year ${y === viewYear ? 'active' : ''}`}
                                        onClick={() => jumpTo(y, beforeFloor(y, viewMonth) ? DATE_MIN.getMonth() : viewMonth)}
                                    >
                                        {y}
                                    </button>
                                ))}
                            </div>
                            <div className="cal-picker-months">
                                {MONTHS_SHORT.map((m, i) => {
                                    const disabled = beforeFloor(viewYear, i);
                                    return (
                                        <button
                                            key={m}
                                            className={`cal-picker-month ${i === viewMonth ? 'active' : ''}`}
                                            disabled={disabled}
                                            onClick={() => jumpTo(viewYear, i)}
                                            title={MONTHS[i]}
                                        >
                                            {m}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                <button className="cal-navbtn" onClick={() => changeDate(1)}>Next &rarr;</button>

                <select
                    className="cal-filter"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                >
                    <option value="all">Show all</option>
                    <option value="active">Hide empty slots</option>
                    <option value="consensus">Needs consensus</option>
                </select>

                <div className="cal-badge" title="You are logged in as">
                    <span className="cal-colorbox" style={{ background: myColor }} />
                    <span>{currentName}</span>
                </div>

                <button className="cal-logbtn" onClick={() => setLogOpen(o => !o)}>
                    Activity log
                </button>
            </div>

            {/* paint tools (week only) */}
            {view === 'week' && (
                <div className="cal-painttools">
                    <div className="cal-viewtoggle">
                        <button
                            className={paintMode === 'available' ? 'active' : ''}
                            onClick={() => setPaintMode('available')}
                        >Book available</button>
                        <button
                            className={paintMode === 'unavailable' ? 'active' : ''}
                            onClick={() => setPaintMode('unavailable')}
                        >Mark unavailable</button>
                    </div>
                    <button
                        className="cal-savebtn"
                        onClick={saveData}
                        disabled={!dataReady || !isDirty}
                        title={!dataReady ? 'Loading…' : (isDirty ? 'Save your availability' : 'No unsaved changes')}
                    >
                        {isDirty ? 'Save availability' : 'Saved'}
                    </button>
                </div>
            )}

            {/* grid */}
            {view === 'week' ? (
                <div className="cal-grid cal-grid--week">
                    <div className="cal-row cal-row--week cal-headerrow">
                        <div className="cal-timelabel">Time</div>
                        {weekDays.map((d, i) => (
                            <div key={i} className="cal-daycol cal-headercell">{formatEuroDate(d)}</div>
                        ))}
                    </div>

                    {TIMES.map((timeStr) => (
                        <div key={timeStr} className="cal-row cal-row--week">
                            <div className="cal-timelabel">{timeStr}</div>
                            {weekDays.map((d, i) => {
                                const slotId = `${getLocalDateString(d)}T${timeStr}`;
                                const myStatus = mySelectedSlots.get(slotId);
                                const data = slotIndex.get(slotId) || { avail: [], unavail: [] };
                                const dimmed = dimTest(slotId, myStatus);

                                let cls = 'cal-daycol cal-timecell';
                                if (myStatus === 'unavailable') cls += ' is-unavail';
                                else if (myStatus === 'available') cls += ' is-mine';

                                return (
                                    <div
                                        key={i}
                                        className={cls}
                                        style={{ opacity: dimmed ? 0.2 : 1 }}
                                        onMouseDown={() => startPaint(slotId)}
                                        onMouseEnter={() => enterPaint(slotId)}
                                    >
                                        <div className="cal-indicators">
                                            {data.avail.map((name, k) => (
                                                <span
                                                    key={k}
                                                    className="cal-indicator"
                                                    style={{ background: colorByName[name] || 'var(--muted)' }}
                                                    title={name}
                                                />
                                            ))}
                                            {data.unavail.length > 0 && (
                                                <span
                                                    className="cal-indicator cal-indicator-danger"
                                                    title={`Unavailable: ${data.unavail.join(', ')}`}
                                                />
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="cal-grid cal-grid--month">
                    <div className="cal-row cal-row--month cal-headerrow">
                        {WEEKDAYS.map(d => (
                            <div key={d} className="cal-daycol cal-headercell">{d}</div>
                        ))}
                    </div>
                    {monthWeeks.map((week, wi) => (
                        <div key={wi} className="cal-row cal-row--month">
                            {week.map((d, i) => {
                                const dateStr = getLocalDateString(d);
                                const inMonth = d.getMonth() === currentDate.getMonth();
                                const data = dayIndex.get(dateStr) || { avail: new Set(), unavail: new Set() };
                                return (
                                    <div
                                        key={i}
                                        className="cal-daycol cal-monthcell"
                                        style={{ opacity: inMonth ? 1 : 0.3 }}
                                        onDoubleClick={() => goToWeek(dateStr)}
                                        title="Double-click to open this week"
                                    >
                                        <span className="cal-monthdate">{d.getDate()}</span>
                                        <div className="cal-monthindicators">
                                            {[...data.avail].map((name, k) => (
                                                <span
                                                    key={k}
                                                    className="cal-monthdot"
                                                    style={{ background: colorByName[name] || 'var(--muted)' }}
                                                    title={name}
                                                />
                                            ))}
                                            {data.unavail.size > 0 && (
                                                <span
                                                    className="cal-monthdot cal-monthdot-danger"
                                                    title={`Unavailable: ${[...data.unavail].join(', ')}`}
                                                />
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            )}

            {/* activity log side panel */}
            <div className={`cal-sidepanel ${logOpen ? 'open' : ''}`}>
                <div className="cal-sidepanel-header">
                    <h3>Activity log</h3>
                    <button className="cal-close" onClick={() => setLogOpen(false)}>✕</button>
                </div>
                <ul className="cal-loglist">
                    {logs.length === 0 ? (
                        <li className="cal-logitem cal-logempty">No activity yet.</li>
                    ) : (
                        logs.map((log, i) => (
                            <li key={i} className="cal-logitem">
                                <span className="cal-logtime">{log.time}</span>
                                <span>
                                    <b style={{ color: colorByName[log.name] || 'var(--ink)' }}>{log.name}</b>{' '}
                                    {log.status === 'unavailable'
                                        ? <span className="cal-log-danger">blocked off</span>
                                        : log.action}{' '}
                                    {log.date} at {log.blocks}
                                </span>
                            </li>
                        ))
                    )}
                </ul>
            </div>
            {logOpen && <div className="cal-sidepanel-scrim" onClick={() => setLogOpen(false)} />}
        </div>
    );
}