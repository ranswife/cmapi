/**
 * Password hashing and verification using PBKDF2
 * Uses Web Crypto API for Cloudflare Workers compatibility
 */

/**
 * Convert ArrayBuffer to hexadecimal string
 */
function bufToHex(buf: ArrayBuffer): string {
    return Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Verify a password against a stored hash
 * @param password Plain text password to verify
 * @param storedHash Hash in format "salt:hash" (both hex encoded)
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
    const [saltHex, hashHex] = storedHash.split(':');

    if (!saltHex || !hashHex) return false;

    // Convert hex salt back to bytes
    const salt = new Uint8Array(
        saltHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
    );

    const passwordBuf = new TextEncoder().encode(password);

    // Import password as PBKDF2 key
    const baseKey = await crypto.subtle.importKey(
        'raw',
        passwordBuf,
        'PBKDF2',
        false,
        ['deriveBits']
    );

    // Derive bits using same parameters as hashing
    const derivedBits = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 100000,
            hash: 'SHA-256'
        },
        baseKey,
        256
    );

    return bufToHex(derivedBits) === hashHex;
}

/**
 * Hash a password using PBKDF2 with random salt
 * @param password Plain text password to hash
 * @returns Hash in format "salt:hash" (both hex encoded)
 */
export async function hashPassword(password: string): Promise<string> {
    const passwordBuf = new TextEncoder().encode(password);

    // Generate random 16-byte salt
    const salt = crypto.getRandomValues(new Uint8Array(16));

    // Import password as PBKDF2 key
    const baseKey = await crypto.subtle.importKey(
        'raw',
        passwordBuf,
        'PBKDF2',
        false,
        ['deriveBits']
    );

    // Derive 256 bits (32 bytes) using PBKDF2
    const derivedBits = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 100000,
            hash: 'SHA-256'
        },
        baseKey,
        256
    );

    const saltHex = bufToHex(salt.buffer);
    const hashHex = bufToHex(derivedBits);

    return `${saltHex}:${hashHex}`;
}