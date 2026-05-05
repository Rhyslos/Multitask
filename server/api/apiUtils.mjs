// Error handling functions
export const catchAsync = (fn) => {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
};

// Generates a millisecond-precision UTC timestamp matching the server schema's
// STRFTIME('%Y-%m-%d %H:%M:%f', 'now') format (see TS_DEFAULT in db.mjs).
//
// MUST be used in every server-side UPDATE that touches a row in a synced table.
// Schema DEFAULTs only fire on INSERT, so updates need to bind this explicitly.
// Using SQLite's CURRENT_TIMESTAMP here would produce second-precision values
// that the sync engine's "WHERE updatedAt > ?" filter can silently skip.
//
// Format mirrors SyncManager.nowIso() on the client — both produce the same
// string for the same instant, so timestamps are comparable across the wire.
export function nowIso() {
    const d = new Date();
    const pad = (n, w = 2) => String(n).padStart(w, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
           `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}`;
}