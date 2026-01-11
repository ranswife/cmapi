import { AwsClient } from 'aws4fetch';

interface SignOptions {
    awsClient: AwsClient;
    endpoint: string;
    bucketName: string;
    key: string;
    contentType?: string;
    expires?: number;
}

/**
 * Generate a presigned PUT URL for S3-compatible storage (R2)
 * @param options Signing options including AWS client, endpoint, bucket, key
 * @returns Presigned URL valid for the specified expiration time
 */
export async function getPresignedPutUrl({
    awsClient,
    endpoint,
    bucketName,
    key,
    contentType,
    expires = 3600
}: SignOptions): Promise<string> {
    // Remove trailing slash from endpoint
    const cleanEndpoint = endpoint.replace(/\/$/, '');
    const url = new URL(`${cleanEndpoint}/${bucketName}/${key}`);

    url.searchParams.set('X-Amz-Expires', expires.toString());

    const signedRequest = await awsClient.sign(url.toString(), {
        method: 'PUT',
        aws: { signQuery: true },
        headers: {
            ...(contentType ? { 'Content-Type': contentType } : {}),
            'x-amz-content-sha256': 'UNSIGNED-PAYLOAD'
        },
    });

    return signedRequest.url;
}