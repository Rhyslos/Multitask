// user functions
import { Router } from 'express';
import crypto from 'crypto';
import { promisify } from 'util';
import { catchAsync, nowIso } from './apiUtils.mjs';

const scrypt = promisify(crypto.scrypt);

const DISPLAY_NAME_MIN = 2;
const DISPLAY_NAME_MAX = 32;

// password hashing functions
async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await scrypt(password, salt, 64);
    return `${salt}:${hash.toString('hex')}`;
}

async function verifyPassword(password, stored) {
    const [salt, storedHash] = stored.split(':');
    const hash = await scrypt(password, salt, 64);
    return crypto.timingSafeEqual(
        Buffer.from(hash.toString('hex')),
        Buffer.from(storedHash)
    );
}

// Centralize the display-name rule so register and profile-update agree on
// it. Mirrors the client-side check in Register.jsx / UserProfile.jsx, but
// the server is the source of truth — never trust the client.
function validateDisplayName(raw) {
    if (typeof raw !== 'string') return 'Display name is required.';
    const trimmed = raw.trim();
    if (!trimmed) return 'Display name is required.';
    if (trimmed.length < DISPLAY_NAME_MIN) return `Display name must be at least ${DISPLAY_NAME_MIN} characters.`;
    if (trimmed.length > DISPLAY_NAME_MAX) return `Display name must be at most ${DISPLAY_NAME_MAX} characters.`;
    return null;
}

// routes
export default function createUserRouter(db) {
    const router = Router();

    // user registration route
    router.post('/register', catchAsync(async (req, res) => {
        const { email, password, countryIso, displayName } = req.body;

        if (!email || !password)
            return res.status(400).json({ error: 'Email and password are required.' });
        if (password.length < 8)
            return res.status(400).json({ error: 'Password must be at least 8 characters.' });

        const nameError = validateDisplayName(displayName);
        if (nameError) return res.status(400).json({ error: nameError });
        const trimmedName = displayName.trim();

        const existingEmail = await db.get('SELECT id FROM users WHERE email = ?', email);
        if (existingEmail)
            return res.status(409).json({ error: 'Email already registered.' });

        const existingName = await db.get(
            'SELECT id FROM users WHERE LOWER(displayName) = LOWER(?)',
            trimmedName
        );
        if (existingName)
            return res.status(409).json({ error: 'Display name already taken.' });

        const password_hash = await hashPassword(password);
        const id = crypto.randomUUID();

        await db.run(
            'INSERT INTO users (id, email, password_hash, countryIso, privacySettings, displayName) VALUES (?, ?, ?, ?, ?, ?)',
            id, email, password_hash, countryIso || 'us', '{}', trimmedName
        );

        return res.status(201).json({
            user: {
                id,
                email,
                displayName: trimmedName,
                firstName: null,
                lastName: null,
                countryIso: countryIso || 'us',
                phoneNumber: null,
                privacySettings: '{}'
            }
        });
    }));

    // user authentication route
    router.post('/login', catchAsync(async (req, res) => {
        const { email, password } = req.body;

        if (!email || !password)
            return res.status(400).json({ error: 'Email and password are required.' });

        const user = await db.get('SELECT * FROM users WHERE email = ?', email);
        if (!user)
            return res.status(401).json({ error: 'Invalid email or password.' });

        const valid = await verifyPassword(password, user.password_hash);
        if (!valid)
            return res.status(401).json({ error: 'Invalid email or password.' });

        return res.json({
            user: {
                id: user.id,
                email: user.email,
                displayName: user.displayName,
                firstName: user.firstName,
                lastName: user.lastName,
                countryIso: user.countryIso,
                phoneNumber: user.phoneNumber,
                privacySettings: user.privacySettings
            }
        });
    }));

    // user profile functions
    router.get('/:id/profile', catchAsync(async (req, res) => {
        const user = await db.get(
            'SELECT id, email, displayName, firstName, lastName, countryIso, phoneNumber, privacySettings FROM users WHERE id = ?',
            req.params.id
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        return res.json({ user });
    }));

    // profile update route
    router.patch('/:id/profile', catchAsync(async (req, res) => {
        const { displayName, firstName, lastName, email, countryIso, phoneNumber, privacySettings } = req.body;

        const nameError = validateDisplayName(displayName);
        if (nameError) return res.status(400).json({ error: nameError });
        const trimmedName = displayName.trim();

        const existingEmail = await db.get('SELECT id FROM users WHERE email = ? AND id != ?', email, req.params.id);
        if (existingEmail) return res.status(409).json({ error: 'Email already in use by another account.' });

        const existingName = await db.get(
            'SELECT id FROM users WHERE LOWER(displayName) = LOWER(?) AND id != ?',
            trimmedName, req.params.id
        );
        if (existingName) return res.status(409).json({ error: 'Display name already taken.' });

        await db.run(
            'UPDATE users SET displayName = ?, firstName = ?, lastName = ?, email = ?, countryIso = ?, phoneNumber = ?, privacySettings = ?, updatedAt = ? WHERE id = ?',
            trimmedName, firstName || null, lastName || null, email, countryIso || null, phoneNumber || null, privacySettings || '{}', nowIso(), req.params.id
        );

        const user = await db.get('SELECT id, email, displayName, firstName, lastName, countryIso, phoneNumber, privacySettings FROM users WHERE id = ?', req.params.id);
        return res.json({ user });
    }));

    // user password update route
    router.patch('/:id/password', catchAsync(async (req, res) => {
        const { currentPassword, newPassword } = req.body;

        if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });

        const user = await db.get('SELECT * FROM users WHERE id = ?', req.params.id);

        const valid = await verifyPassword(currentPassword, user.password_hash);
        if (!valid) return res.status(401).json({ error: 'Invalid current password.' });

        const newHash = await hashPassword(newPassword);
        await db.run('UPDATE users SET password_hash = ?, updatedAt = ? WHERE id = ?', newHash, nowIso(), req.params.id);

        return res.json({ message: 'Password updated successfully.' });
    }));

    return router;
}
