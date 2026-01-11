import { Hono } from 'hono';
import { Bindings, Variables } from '../type';
import { verifyPassword, hashPassword } from '../lib/auth';
import { verifyTotp } from '../lib/totp';
import { authMiddleware } from '../middleware/auth';
import { rateLimit } from '../middleware/rate-limit';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

const account = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Schema for user registration with constraints
const signupSchema = z.object({
    username: z.string()
        .min(3)
        .max(32)
        .regex(/^[a-zA-Z0-9_]+$/)
        .refine((val) => val.toLowerCase() !== 'me', {
            message: "Username 'me' is not allowed"
        })
        .nonoptional(),
    password: z.string().min(8).max(64).nonoptional(),
    nickname: z.string().min(1).max(16).nonoptional(),
    inviteCode: z.string().optional()
});

// Sign up route
account.post(
    '/signup',
    rateLimit({ limit: 5, window: 3600 }),
    zValidator('json', signupSchema),
    async (c) => {
        const { username, password, nickname, inviteCode } = c.req.valid('json');

        // Verify invite code against environment variable
        if (inviteCode !== c.env.INVITE_CODE) {
            return c.json({ success: false, error: 'Invalid Invite Code' }, 400);
        }

        // Check if username already exists
        const existingUser = await c.env.D1_DB.prepare(
            "SELECT userId FROM users WHERE username = ?"
        ).bind(username).first<{ userId: string }>();
        if (existingUser) {
            return c.json({ success: false, error: 'Username already exists' }, 409);
        }

        const passwordHash = await hashPassword(password);
        const userId = crypto.randomUUID();

        await c.env.D1_DB.prepare(
            "INSERT INTO users (userId, username, passwordHash, nickname) VALUES (?, ?, ?, ?)"
        ).bind(userId, username, passwordHash, nickname).run();

        return c.json({ success: true, message: 'User registered successfully' });
    }
);

const loginSchema = z.object({
    username: z.string().nonoptional(),
    password: z.string().nonoptional(),
    otpCode: z.string().optional()
});

// Login route
account.post(
    '/login',
    rateLimit({ limit: 10, window: 600 }),
    zValidator('json', loginSchema),
    async (c) => {
        const { username, password, otpCode } = c.req.valid('json');

        const user = await c.env.D1_DB.prepare(
            "SELECT userId, passwordHash, totpSecret FROM users WHERE username = ?"
        ).bind(username).first<{
            userId: string;
            passwordHash: string;
            totpSecret: string | null;
        }>();

        if (!user || !(await verifyPassword(password, user.passwordHash))) {
            return c.json({ success: false, error: 'Auth Failed' }, 401);
        }

        // If user has TOTP enabled, verify the code
        if (user.totpSecret) {
            if (!otpCode) {
                return c.json({ success: false, error: '2FA Required', require2FA: true }, 401);
            }
            if (!(await verifyTotp(user.totpSecret, otpCode))) {
                return c.json({ success: false, error: 'Invalid 2FA Code' }, 401);
            }
        }

        const refreshToken = crypto.randomUUID();

        // Store Refresh Token in KV with 7 days expiration
        await c.env.KV.put(`rt:${refreshToken}`, user.userId.toString(), {
            expirationTtl: 604800
        });

        return c.json({ success: true, data: { refreshToken } });
    }
);

const refreshSchema = z.object({
    refreshToken: z.uuid().nonoptional()
});

// Refresh access token route
account.post(
    '/refresh',
    zValidator('json', refreshSchema),
    async (c) => {
        const { refreshToken } = c.req.valid('json');

        const userId = await c.env.KV.get(`rt:${refreshToken}`);
        if (!userId) return c.json({ success: false, error: 'Invalid Refresh Token' }, 401);

        const accessToken = crypto.randomUUID();

        // Store Access Token in KV with 1 hour expiration
        await c.env.KV.put(`at:${accessToken}`, userId, {
            expirationTtl: 3600
        });

        return c.json({ success: true, data: { accessToken } });
    }
);

const logoutSchema = z.object({
    refreshToken: z.uuid().nonoptional()
});

// Logout route
account.post(
    '/logout',
    zValidator('json', logoutSchema),
    async (c) => {
        const { refreshToken } = c.req.valid('json');

        await c.env.KV.delete(`rt:${refreshToken}`);

        return c.json({ success: true, message: 'Successfully logged out' });
    }
);

const getProfileSchema = z.object({
    username: z.string().nonoptional()
});

// Get user profile route
account.get(
    '/profile/:username',
    authMiddleware,
    zValidator('param', getProfileSchema),
    async (c) => {
        const { username } = c.req.valid('param');

        // 'me' keyword returns the current authenticated user's profile
        if (username === 'me') {
            const userId = c.get('userId');

            const user = await c.env.D1_DB.prepare(
                "SELECT userId, nickname, bio, avatar, role FROM users WHERE userId = ?"
            ).bind(userId).first<{
                userId: string;
                nickname: string;
                bio: string;
                avatar: string;
                role: string;
            }>();

            if (!user) {
                console.error("Get Profile Error: Authenticated user not found in database", { userId });
                return c.json({ success: false, error: 'User account not found' }, 404);
            }

            return c.json({
                success: true,
                data: user
            });
        }

        const user = await c.env.D1_DB.prepare(
            "SELECT userId, nickname, bio, avatar, role FROM users WHERE username = ?"
        ).bind(username).first<{
            userId: string;
            nickname: string;
            bio: string;
            avatar: string;
            role: string;
        }>();

        if (!user) {
            return c.json({ success: false, error: 'User not found' }, 404);
        }

        return c.json({
            success: true,
            data: user
        });
    }
);

export default account;