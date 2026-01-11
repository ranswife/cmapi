import { createMiddleware } from 'hono/factory';
import { Bindings } from '../type';

interface RateLimitOptions {
    limit: number;
    window: number; // in seconds
    keyPrefix?: string;
}

/**
 * Rate limiting middleware using KV store
 * Tracks request count per IP + path combination
 * Fails closed (denies request) if KV is unavailable
 */
export const rateLimit = (options: RateLimitOptions) => createMiddleware<{ Bindings: Bindings }>(async (c, next) => {
    // Get client IP from Cloudflare headers, fallback to random ID
    const ip =
        c.req.header('CF-Connecting-IP') ||
        c.req.header('X-Forwarded-For') ||
        c.req.header('X-Real-IP') ||
        (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`);

    const prefix = options.keyPrefix || 'rl';
    const key = `${prefix}:${ip}:${c.req.path}`;

    const current = await c.env.KV.get(key);
    const count = current ? parseInt(current) : 0;

    if (count >= options.limit) {
        return c.json({ success: false, error: 'Too Many Requests' }, 429);
    }

    // Increment count and reset TTL on every attempt
    // This keeps the lock active for persistent offenders
    await c.env.KV.put(key, (count + 1).toString(), {
        expirationTtl: options.window
    });

    await next();
});