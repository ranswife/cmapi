import { authMiddleware } from '../middleware/auth';
import { Hono } from 'hono';
import { Bindings, Variables } from '../type';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

const posts = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const getPostSchema = z.object({
    postId: z.uuid()
});

// Get post by ID
posts.get('/:postId', authMiddleware, zValidator('param', getPostSchema), async (c) => {
    const { postId } = c.req.valid('param');

    const post = await c.env.D1_DB.prepare(
        "SELECT id, content, images, userId, parentId, parentType, createdAt FROM posts WHERE id = ?"
    ).bind(postId).first<{
        id: string;
        content: string;
        images: string;
        userId: string;
        parentId: string | null;
        parentType: string | null;
        createdAt: string;
    }>();

    if (!post) {
        return c.json({ success: false, error: 'Post not found' }, 404);
    }

    return c.json({
        success: true,
        data: {
            ...post,
            images: JSON.parse(post.images || '[]') as string[]
        }
    });
});

const createPostSchema = z.object({
    content: z.string().min(1).max(16384),
    images: z.array(z.uuid()).default([]),
    parentId: z.uuid().optional(),
    parentType: z.enum(['post', 'image']).optional()
}).refine(
    data => (data.parentId && data.parentType) || (!data.parentId && !data.parentType),
    { message: 'parentId and parentType must both be provided or both omitted' }
);

// Create post or reply
posts.post('/', authMiddleware, zValidator('json', createPostSchema), async (c) => {
    const userId = c.get('userId');
    const { content, images, parentId, parentType } = c.req.valid('json');

    // Verify parent exists if creating a reply
    if (parentId && parentType) {
        const table = parentType === 'post' ? 'posts' : 'images';
        const idCol = parentType === 'post' ? 'id' : 'imageId';
        const exists = await c.env.D1_DB.prepare(
            `SELECT 1 FROM ${table} WHERE ${idCol} = ?`
        ).bind(parentId).first();
        if (!exists) {
            return c.json({ success: false, error: 'Parent not found' }, 404);
        }
    }

    // Verify all images belong to the current user
    if (images.length > 0) {
        const placeholders = images.map(() => '?').join(',');
        const { results } = await c.env.D1_DB.prepare(
            `SELECT imageId FROM images WHERE imageId IN (${placeholders}) AND userId = ?`
        ).bind(...images, userId).all();
        if (results.length !== images.length) {
            return c.json({ success: false, error: 'Invalid image IDs' }, 400);
        }
    }

    const postId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    await c.env.D1_DB.prepare(
        "INSERT INTO posts (id, content, images, userId, parentId, parentType, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(
        postId,
        content,
        JSON.stringify(images),
        userId,
        parentId || null,
        parentType || null,
        createdAt
    ).run();

    return c.json({ success: true, data: { id: postId } });
});

const deletePostSchema = z.object({
    postId: z.uuid()
});

// Delete post
posts.delete('/:postId', authMiddleware, zValidator('param', deletePostSchema), async (c) => {
    const userRole = c.get('userRole');
    const userId = c.get('userId');
    const { postId } = c.req.valid('param');

    const post = await c.env.D1_DB.prepare(
        "SELECT userId FROM posts WHERE id = ?"
    ).bind(postId).first<{ userId: string }>();

    if (!post) {
        return c.json({ success: false, error: 'Post not found' }, 404);
    }

    const isAdmin = ['global_admin', 'admin'].includes(userRole);
    const isOwner = userId === post.userId;

    if (!isAdmin && !isOwner) {
        return c.json({ success: false, error: 'Forbidden' }, 403);
    }

    await c.env.D1_DB.prepare("DELETE FROM posts WHERE id = ?").bind(postId).run();

    return c.json({ success: true });
});

// Get replies to a post
const getRepliesParamSchema = z.object({
    postId: z.uuid()
});

const getRepliesQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20)
});

posts.get('/:postId/replies', authMiddleware, zValidator('param', getRepliesParamSchema), zValidator('query', getRepliesQuerySchema), async (c) => {
    const { postId } = c.req.valid('param');
    const { page, limit } = c.req.valid('query');
    const offset = (page - 1) * limit;

    const { results } = await c.env.D1_DB.prepare(
        "SELECT id, content, images, userId, createdAt FROM posts WHERE parentId = ? AND parentType = 'post' ORDER BY createdAt ASC LIMIT ? OFFSET ?"
    ).bind(postId, limit, offset).all();

    const data = results.map((row: { images?: string | null } & Record<string, unknown>) => ({
        ...row,
        images: row.images ? JSON.parse(row.images as string) : []
    }));

    return c.json({ success: true, data, page, limit });
});

// Get post feed (top-level posts only, excluding replies)
const feedQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    userId: z.uuid().optional()
});

posts.get('/', authMiddleware, zValidator('query', feedQuerySchema), async (c) => {
    const { page, limit, userId } = c.req.valid('query');
    const offset = (page - 1) * limit;

    // Only get top-level posts (not replies)
    let query = "SELECT id, content, images, userId, createdAt FROM posts WHERE parentId IS NULL";
    const params: (string | number)[] = [];

    if (userId) {
        query += " AND userId = ?";
        params.push(userId);
    }

    query += " ORDER BY createdAt DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const { results } = await c.env.D1_DB.prepare(query).bind(...params).all();

    const data = results.map((row: { images?: string | null } & Record<string, unknown>) => ({
        ...row,
        images: row.images ? JSON.parse(row.images as string) : []
    }));

    return c.json({ success: true, data, page, limit });
});

export default posts;