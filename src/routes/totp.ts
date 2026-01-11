import { Hono } from 'hono';
import { Bindings, Variables } from '../type';
import { authMiddleware } from '../middleware/auth';
import { generateTotpSecret, verifyTotp, getTotpUri } from '../lib/totp';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

const totp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Generate TOTP secret and return URI for QR code generation
totp.post('/setup', authMiddleware, async (c) => {
    const userId = c.get('userId');

    const user = await c.env.D1_DB.prepare(
        "SELECT username, totpSecret FROM users WHERE userId = ?"
    ).bind(userId).first<{ username: string; totpSecret: string | null }>();

    if (!user) {
        return c.json({ success: false, error: 'User not found' }, 404);
    }

    if (user.totpSecret) {
        return c.json({ success: false, error: 'TOTP already enabled' }, 400);
    }

    const secret = generateTotpSecret();
    const uri = getTotpUri(secret, user.username);

    // Store secret temporarily in KV (5 min expiry), save to DB only after verification
    await c.env.KV.put(`totp_pending:${userId}`, secret, { expirationTtl: 300 });

    return c.json({ success: true, data: { secret, uri } });
});

const codeSchema = z.object({
    code: z.string().length(6).regex(/^\d{6}$/)
});

// Verify code and enable TOTP
totp.post('/enable', authMiddleware, zValidator('json', codeSchema), async (c) => {
    const userId = c.get('userId');
    const { code } = c.req.valid('json');

    const pendingSecret = await c.env.KV.get(`totp_pending:${userId}`);
    if (!pendingSecret) {
        return c.json({ success: false, error: 'No pending TOTP setup' }, 400);
    }

    if (!(await verifyTotp(pendingSecret, code))) {
        return c.json({ success: false, error: 'Invalid code' }, 400);
    }

    // Save verified secret to database
    await c.env.D1_DB.prepare(
        "UPDATE users SET totpSecret = ? WHERE userId = ?"
    ).bind(pendingSecret, userId).run();

    // Clean up temporary secret
    await c.env.KV.delete(`totp_pending:${userId}`);

    return c.json({ success: true, message: 'TOTP enabled' });
});

// Disable TOTP (requires current code verification)
totp.post('/disable', authMiddleware, zValidator('json', codeSchema), async (c) => {
    const userId = c.get('userId');
    const { code } = c.req.valid('json');

    const user = await c.env.D1_DB.prepare(
        "SELECT totpSecret FROM users WHERE userId = ?"
    ).bind(userId).first<{ totpSecret: string | null }>();

    if (!user?.totpSecret) {
        return c.json({ success: false, error: 'TOTP not enabled' }, 400);
    }

    if (!(await verifyTotp(user.totpSecret, code))) {
        return c.json({ success: false, error: 'Invalid code' }, 400);
    }

    // Clear TOTP secret from database
    await c.env.D1_DB.prepare(
        "UPDATE users SET totpSecret = NULL WHERE userId = ?"
    ).bind(userId).run();

    return c.json({ success: true, message: 'TOTP disabled' });
});

// Get TOTP status
totp.get('/status', authMiddleware, async (c) => {
    const userId = c.get('userId');

    const user = await c.env.D1_DB.prepare(
        "SELECT totpSecret FROM users WHERE userId = ?"
    ).bind(userId).first<{ totpSecret: string | null }>();

    return c.json({ success: true, data: { enabled: !!user?.totpSecret } });
});

export default totp;
