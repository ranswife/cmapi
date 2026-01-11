import { authMiddleware } from '../middleware/auth';
import { Hono } from 'hono';
import { Bindings, Variables } from '../type';
import { AwsClient } from 'aws4fetch';
import { getPresignedPutUrl } from '../lib/s3';
import { timeline } from './timeline';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

const images = new Hono<{ Bindings: Bindings; Variables: Variables }>();

images.route('/timeline', timeline);

const listImagesSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    date: z.string().optional()
});

// List images with optional date filter
images.get('/', authMiddleware, zValidator('query', listImagesSchema), async (c) => {
    const { page, limit, date } = c.req.valid('query');
    const offset = (page - 1) * limit;

    let sql = "SELECT imageId, originalExt, createdAt, userId FROM images";
    const params: (string | number)[] = [];

    // Filter by date (UTC+8 timezone)
    if (date) {
        sql += " WHERE strftime('%Y-%m-%d', datetime(createdAt, '+8 hours')) = ?";
        params.push(date);
    }

    sql += " ORDER BY createdAt DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const { results } = await c.env.D1_DB.prepare(sql).bind(...params).all();

    return c.json({ success: true, data: results, page, limit });
});

const imageIdSchema = z.object({
    imageId: z.uuid()
});

const imageTypeSchema = z.object({
    type: z.enum(['preview', 'origin']).default('preview')
});

// Get image content (preview or original)
images.get('/:imageId', authMiddleware, zValidator('param', imageIdSchema), zValidator('query', imageTypeSchema), async (c) => {
    const { imageId } = c.req.valid('param');
    const { type } = c.req.valid('query');

    if (type === 'preview') {
        // Get WebP preview from R2
        const object = await c.env.R2_BUCKET.get(imageId + '.webp');
        if (!object) {
            return c.json({ success: false, error: 'Image Not Found' }, 404);
        }
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        return new Response(object.body, { headers });
    } else {
        // Get original image from R2 (filename format: {imageId}_raw.{ext})
        const list = await c.env.R2_BUCKET.list({ prefix: imageId + '_raw', limit: 1 });
        if (list.objects.length === 0) {
            return c.json({ success: false, error: 'Image Not Found' }, 404);
        }
        const fullKey = list.objects[0].key;
        const object = await c.env.R2_BUCKET.get(fullKey);
        if (!object) {
            return c.json({ success: false, error: 'Internal Server Error' }, 500);
        }
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        headers.set('Content-Disposition', `attachment; filename="${fullKey}"`);
        return new Response(object.body, { headers });
    }
});

const uploadImageSchema = z.object({
    originalExt: z.string().startsWith('.'),
    createdAt: z.iso.date()
});

// Upload image (returns presigned URLs for client-side upload)
images.post('/', authMiddleware, zValidator('json', uploadImageSchema), async (c) => {
    const userId = c.get('userId');
    const { originalExt, createdAt } = c.req.valid('json');

    const awsClient = new AwsClient({
        accessKeyId: c.env.R2_ACCESS_KEY_ID,
        secretAccessKey: c.env.R2_SECRET_ACCESS_KEY,
        service: 's3',
        region: 'auto',
    });

    const imageId = crypto.randomUUID();
    const ext = originalExt.toLowerCase().replace('.', '');

    // Generate presigned URLs for both preview (WebP) and original
    const [previewUrl, originalUrl] = await Promise.all([
        getPresignedPutUrl({
            awsClient,
            endpoint: c.env.R2_ENDPOINT,
            bucketName: c.env.R2_BUCKET_NAME,
            key: `${imageId}.webp`,
            contentType: 'image/webp'
        }),
        getPresignedPutUrl({
            awsClient,
            endpoint: c.env.R2_ENDPOINT,
            bucketName: c.env.R2_BUCKET_NAME,
            key: `${imageId}_raw.${ext}`
        })
    ]);

    await c.env.D1_DB.prepare(
        "INSERT INTO images (imageId, userId, createdAt, originalExt) VALUES (?, ?, ?, ?)"
    ).bind(imageId, userId, createdAt, ext).run();

    return c.json({
        success: true,
        data: { imageId, uploadUrls: { preview: previewUrl, original: originalUrl } }
    });
});

// Delete image
images.delete('/:imageId', authMiddleware, zValidator('param', imageIdSchema), async (c) => {
    const userId = c.get('userId');
    const userRole = c.get('userRole');
    const { imageId } = c.req.valid('param');

    const result = await c.env.D1_DB.prepare(
        "SELECT originalExt, userId FROM images WHERE imageId = ?"
    ).bind(imageId).first<{ originalExt: string; userId: string }>();

    if (!result) {
        return c.json({ success: false, error: 'Image Not Found' }, 404);
    }

    const isAdmin = ['global_admin', 'admin'].includes(userRole);
    const isOwner = userId === result.userId;

    if (!isAdmin && !isOwner) {
        return c.json({ success: false, error: 'Forbidden' }, 403);
    }

    // Delete from database and R2
    await c.env.D1_DB.prepare("DELETE FROM images WHERE imageId = ?").bind(imageId).run();
    await c.env.R2_BUCKET.delete([`${imageId}.webp`, `${imageId}_raw.${result.originalExt}`]);

    return c.json({ success: true });
});

// Get replies (comments) for an image
const repliesQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20)
});

images.get('/:imageId/replies', authMiddleware, zValidator('param', imageIdSchema), zValidator('query', repliesQuerySchema), async (c) => {
    const { imageId } = c.req.valid('param');
    const { page, limit } = c.req.valid('query');
    const offset = (page - 1) * limit;

    const { results } = await c.env.D1_DB.prepare(
        "SELECT id, content, images, userId, createdAt FROM posts WHERE parentId = ? AND parentType = 'image' ORDER BY createdAt ASC LIMIT ? OFFSET ?"
    ).bind(imageId, limit, offset).all();

    const data = results.map((row: { images?: string | null } & Record<string, unknown>) => ({
        ...row,
        images: row.images ? JSON.parse(row.images as string) : []
    }));

    return c.json({ success: true, data, page, limit });
});

export default images;