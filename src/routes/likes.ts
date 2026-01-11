import { Hono } from 'hono';
import { authMiddleware } from "../middleware/auth";
import { Bindings, Variables } from '../type';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

const likes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const likeParamSchema = z.object({
    targetType: z.enum(['post', 'image']),
    targetId: z.uuid()
});

/**
 * Check if a target (post or image) exists in the database
 */
async function targetExists(db: D1Database, targetType: string, targetId: string): Promise<boolean> {
    const table = targetType === 'post' ? 'posts' : 'images';
    const idCol = targetType === 'post' ? 'id' : 'imageId';
    const result = await db.prepare(`SELECT 1 FROM ${table} WHERE ${idCol} = ?`).bind(targetId).first();
    return !!result;
}

// Like a post or image
likes.put('/:targetType/:targetId', authMiddleware, zValidator('param', likeParamSchema), async (c) => {
    const userId = c.get('userId');
    const { targetType, targetId } = c.req.valid('param');

    if (!(await targetExists(c.env.D1_DB, targetType, targetId))) {
        return c.json({ success: false, error: 'Target not found' }, 404);
    }

    // Use INSERT OR IGNORE for idempotent behavior
    await c.env.D1_DB.prepare(
        "INSERT OR IGNORE INTO likes (userId, targetId, targetType) VALUES (?, ?, ?)"
    ).bind(userId, targetId, targetType).run();

    return c.json({ success: true, liked: true });
});

// Unlike a post or image
likes.delete('/:targetType/:targetId', authMiddleware, zValidator('param', likeParamSchema), async (c) => {
    const userId = c.get('userId');
    const { targetType, targetId } = c.req.valid('param');

    await c.env.D1_DB.prepare(
        "DELETE FROM likes WHERE userId = ? AND targetId = ? AND targetType = ?"
    ).bind(userId, targetId, targetType).run();

    return c.json({ success: true, liked: false });
});

// Batch get like status for multiple targets
const statusQuerySchema = z.object({
    targetType: z.enum(['post', 'image']),
    targetIds: z.string().transform(s => s.split(',').filter(Boolean))
});

likes.get('/status', authMiddleware, zValidator('query', statusQuerySchema), async (c) => {
    const userId = c.get('userId');
    const { targetType, targetIds } = c.req.valid('query');

    if (targetIds.length === 0) {
        return c.json({ success: true, data: {} });
    }

    // Validate each ID is a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const id of targetIds) {
        if (!uuidRegex.test(id)) {
            return c.json({ success: false, error: 'Invalid target ID format' }, 400);
        }
    }

    // Initialize status map with default values
    const statusMap: Record<string, { count: number; isLiked: boolean }> = {};
    targetIds.forEach(id => { statusMap[id] = { count: 0, isLiked: false }; });

    // Batch query for counts and current user's like status
    const placeholders = targetIds.map(() => '?').join(',');
    const { results } = await c.env.D1_DB.prepare(`
        SELECT
            targetId,
            COUNT(*) as count,
            MAX(CASE WHEN userId = ? THEN 1 ELSE 0 END) as isLiked
        FROM likes
        WHERE targetId IN (${placeholders}) AND targetType = ?
        GROUP BY targetId
    `).bind(userId, ...targetIds, targetType).all<{ targetId: string; count: number; isLiked: number }>();

    results.forEach(row => {
        statusMap[row.targetId] = { count: row.count, isLiked: row.isLiked === 1 };
    });

    return c.json({ success: true, data: statusMap });
});

export default likes;