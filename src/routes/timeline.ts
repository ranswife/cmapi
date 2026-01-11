import { authMiddleware } from '../middleware/auth';
import { Hono } from 'hono';
import { Bindings } from '../type';

export const timeline = new Hono<{ Bindings: Bindings }>();

interface TimelineItem {
    date: string;
    count: number;
}

// Get timeline data: dates with image counts (UTC+8 timezone)
timeline.get('/', authMiddleware, async (c) => {
    const { results } = await c.env.D1_DB.prepare(`
        SELECT 
            strftime('%Y-%m-%d', datetime(createdAt, '+8 hours')) as date, 
            COUNT(*) as count 
        FROM images 
        GROUP BY date 
        ORDER BY date DESC
    `).all<TimelineItem>();

    return c.json({ success: true, data: results });
});