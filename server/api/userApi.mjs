import { Router } from 'express';
import crypto from 'crypto';
import { promisify } from 'util';
import { catchAsync } from './apiUtils.mjs';

const scrypt = promisify(crypto.scrypt);


// Password hashing
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


// Routes
export default function createUserRouter(db) {
    const router = Router();

    router.post('/register', catchAsync(async (req, res) => {
        const { username, password } = req.body;

        if (!username || !password)
            return res.status(400).json({ error: 'Username and password are required.' });
        if (username.length < 3)
            return res.status(400).json({ error: 'Username must be at least 3 characters.' });
        if (password.length < 6)
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });

        const existing = await db.get('SELECT id FROM users WHERE username = ?', username);
        if (existing)
            return res.status(409).json({ error: 'Username already taken.' });

        const password_hash = await hashPassword(password);
        const id = crypto.randomUUID();

        await db.run(
            'INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)',
            id, username, password_hash
        );

        return res.status(201).json({ user: { id, username } });
    }));

    router.post('/login', catchAsync(async (req, res) => {
        const { username, password } = req.body;

        if (!username || !password)
            return res.status(400).json({ error: 'Username and password are required.' });

        const user = await db.get('SELECT * FROM users WHERE username = ?', username);
        if (!user)
            return res.status(401).json({ error: 'Invalid username or password.' });

        const valid = await verifyPassword(password, user.password_hash);
        if (!valid)
            return res.status(401).json({ error: 'Invalid username or password.' });

        return res.json({ user: { id: user.id, username: user.username } });
    }));

    return router;
}