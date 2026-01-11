// Type definitions for Cloudflare Workers bindings and context variables

export type Bindings = {
    // Cloudflare Workers Bindings
    D1_DB: D1Database;
    KV: KVNamespace;
    R2_BUCKET: R2Bucket;
    // R2 S3 Compatible Settings
    R2_ACCESS_KEY_ID: string;
    R2_SECRET_ACCESS_KEY: string;
    R2_ENDPOINT: string;
    R2_BUCKET_NAME: string;
    INVITE_CODE: string;
};

export type Variables = {
    userId: string;
    userRole: 'global_admin' | 'admin' | 'user';
};