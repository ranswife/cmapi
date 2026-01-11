/**
 * TOTP (Time-based One-Time Password) implementation for Cloudflare Workers
 * Uses Web Crypto API, no external dependencies
 */

// Base32 alphabet (RFC 4648)
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Generate a random TOTP secret (Base32 encoded, 20 bytes = 32 chars)
 */
export function generateTotpSecret(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    return base32Encode(bytes);
}

/**
 * Verify a TOTP token against a secret
 * @param secret Base32 encoded secret
 * @param token 6-digit token from authenticator app
 * @param window Number of time steps to check before/after current (default: 1)
 */
export async function verifyTotp(
    secret: string,
    token: string,
    window: number = 1
): Promise<boolean> {
    if (!/^\d{6}$/.test(token)) return false;

    const secretBytes = base32Decode(secret);
    const currentTime = Math.floor(Date.now() / 1000);
    const timeStep = 30;

    // Check current time step and window before/after
    for (let i = -window; i <= window; i++) {
        const counter = Math.floor((currentTime / timeStep) + i);
        const expectedToken = await generateTotp(secretBytes, counter);
        if (expectedToken === token) {
            return true;
        }
    }

    return false;
}

/**
 * Generate otpauth:// URI for QR code generation
 */
export function getTotpUri(secret: string, username: string): string {
    const issuer = 'ClassMemories';
    const encodedIssuer = encodeURIComponent(issuer);
    const encodedUsername = encodeURIComponent(username);
    return `otpauth://totp/${encodedIssuer}:${encodedUsername}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Generate a TOTP token for a given counter value
 */
async function generateTotp(secret: Uint8Array, counter: number): Promise<string> {
    // Convert counter to 8-byte big-endian buffer
    const counterBuffer = new ArrayBuffer(8);
    const counterView = new DataView(counterBuffer);
    counterView.setBigUint64(0, BigInt(counter), false);

    // HMAC-SHA1
    const key = await crypto.subtle.importKey(
        'raw',
        secret,
        { name: 'HMAC', hash: 'SHA-1' },
        false,
        ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, counterBuffer);
    const hmac = new Uint8Array(signature);

    // Dynamic truncation (RFC 4226)
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary =
        ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);

    // Generate 6-digit code
    const otp = binary % 1000000;
    return otp.toString().padStart(6, '0');
}

/**
 * Base32 encode bytes to string
 */
function base32Encode(bytes: Uint8Array): string {
    let result = '';
    let buffer = 0;
    let bitsLeft = 0;

    for (const byte of bytes) {
        buffer = (buffer << 8) | byte;
        bitsLeft += 8;

        while (bitsLeft >= 5) {
            bitsLeft -= 5;
            result += BASE32_CHARS[(buffer >> bitsLeft) & 0x1f];
        }
    }

    if (bitsLeft > 0) {
        result += BASE32_CHARS[(buffer << (5 - bitsLeft)) & 0x1f];
    }

    return result;
}

/**
 * Base32 decode string to bytes
 */
function base32Decode(str: string): Uint8Array {
    const cleanStr = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
    const bytes: number[] = [];
    let buffer = 0;
    let bitsLeft = 0;

    for (const char of cleanStr) {
        const value = BASE32_CHARS.indexOf(char);
        if (value === -1) continue;

        buffer = (buffer << 5) | value;
        bitsLeft += 5;

        if (bitsLeft >= 8) {
            bitsLeft -= 8;
            bytes.push((buffer >> bitsLeft) & 0xff);
        }
    }

    return new Uint8Array(bytes);
}
