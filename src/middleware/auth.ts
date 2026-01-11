import { createMiddleware } from 'hono/factory';
import { Bindings, Variables } from '../type';

/**
 * Authentication middleware
 * Validates Bearer token from Authorization header against KV store
 * Sets userId and userRole in context variables for downstream handlers
 */
export const authMiddleware = createMiddleware<{
    Bindings: Bindings;
    Variables: Variables;
}>(async (c, next) => {
    const token = c.req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return c.json({ success: false, error: 'Unauthorized: Missing Token' }, 401);
    }

    // Lookup access token in KV store
    const userId = await c.env.KV.get(`at:${token}`);
    if (!userId) {
        return c.json({ success: false, error: 'Unauthorized: Invalid Token' }, 401);
    }

    // Fetch user role from database
    const user = await c.env.D1_DB.prepare(
        "SELECT userId, role FROM users WHERE userId = ?"
    ).bind(userId).first<{ userId: string; role: 'global_admin' | 'admin' | 'user' }>();

    if (!user) {
        return c.json({ success: false, error: 'Unauthorized: User Not Found' }, 401);
    }

    // Set context variables for downstream handlers
    c.set('userId', userId);
    c.set('userRole', user.role);

    await next();
});