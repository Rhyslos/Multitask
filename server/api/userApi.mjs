// user functions
import { Router } from 'express';
import crypto from 'crypto';
import { promisify } from 'util';
import { catchAsync } from './apiUtils.mjs';

const scrypt = promisify(crypto.scrypt);

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

// routes
export default function createUserRouter(db) {
    const router = Router();

    // user registration route
    router.post('/register', catchAsync(async (req, res) => {
        const { email, password, countryIso } = req.body;

        if (!email || !password)
            return res.status(400).json({ error: 'Email and password are required.' });
        if (password.length < 6)
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });

        const existing = await db.get('SELECT id FROM users WHERE email = ?', email);
        if (existing)
            return res.status(409).json({ error: 'Email already registered.' });

        const password_hash = await hashPassword(password);
        const id = crypto.randomUUID();

        await db.run(
            'INSERT INTO users (id, email, password_hash, countryIso, privacySettings) VALUES (?, ?, ?, ?, ?)',
            id, email, password_hash, countryIso || 'us', '{}'
        );

        return res.status(201).json({ 
            user: { 
                id, 
                email, 
                firstName: null, 
                lastName: null, 
                countryIso: countryIso || 'us',
                phoneNumber: null, 
                skillset: '[]', 
                gender: null,
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
                firstName: user.firstName,
                lastName: user.lastName,
                countryIso: user.countryIso,
                phoneNumber: user.phoneNumber,
                skillset: user.skillset,
                gender: user.gender,
                privacySettings: user.privacySettings
            } 
        });
    }));

    // user profile functions
    router.get('/:id/profile', catchAsync(async (req, res) => {
        const user = await db.get(
            'SELECT id, email, firstName, lastName, countryIso, phoneNumber, skillset, gender, privacySettings FROM users WHERE id = ?',
            req.params.id
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        return res.json({ user });
    }));

    // profile update route
    router.patch('/:id/profile', catchAsync(async (req, res) => {
        const { firstName, lastName, email, countryIso, phoneNumber, skillset, gender, privacySettings } = req.body;
        
        const existing = await db.get('SELECT id FROM users WHERE email = ? AND id != ?', email, req.params.id);
        if (existing) return res.status(409).json({ error: 'Email already in use by another account.' });

        const skillsetStr = skillset ? JSON.stringify(skillset) : '[]';

        await db.run(
            'UPDATE users SET firstName = ?, lastName = ?, email = ?, countryIso = ?, phoneNumber = ?, skillset = ?, gender = ?, privacySettings = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
            firstName || null, lastName || null, email, countryIso || null, phoneNumber || null, skillsetStr, gender || null, privacySettings || '{}', req.params.id
        );
        
        const user = await db.get('SELECT id, email, firstName, lastName, countryIso, phoneNumber, skillset, gender, privacySettings FROM users WHERE id = ?', req.params.id);
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
        await db.run('UPDATE users SET password_hash = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?', newHash, req.params.id);
        
        return res.json({ message: 'Password updated successfully.' });
    }));

    return router;
}