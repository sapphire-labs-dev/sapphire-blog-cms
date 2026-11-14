/** Signing helpers: sessions (HS256) and the GitHub App JWT (RS256), using only Web Crypto. */

const encoder = new TextEncoder();

export function base64url(input: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof input === 'string' ? encoder.encode(input) : new Uint8Array(input);
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64url(input: string): Uint8Array<ArrayBuffer> {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));

  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function decodeJwtPayload<T>(jwt: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(fromBase64url(jwt.split('.')[1] ?? ''))) as T;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signHs256(payload: object, secret: string): Promise<string> {
  const data = `${base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${base64url(JSON.stringify(payload))}`;
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(data));

  return `${data}.${base64url(signature)}`;
}

/** Returns the payload if the signature is valid and the token has not expired. */
export async function verifyHs256<T extends { exp: number }>(token: string, secret: string): Promise<T | null> {
  const [header, payload, signature] = token.split('.');

  if (!header || !payload || !signature) {
    return null;
  }

  let valid = false;

  try {
    valid = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromBase64url(signature), encoder.encode(`${header}.${payload}`));
  } catch {
    return null;
  }

  const data = valid ? decodeJwtPayload<T>(token) : null;

  return data && typeof data.exp === 'number' && data.exp > Date.now() / 1000 ? data : null;
}

function derLength(length: number): number[] {
  if (length < 0x80) {
    return [length];
  }

  const bytes: number[] = [];

  for (let n = length; n > 0; n >>= 8) {
    bytes.unshift(n & 0xff);
  }

  return [0x80 | bytes.length, ...bytes];
}

/** GitHub hands out the key as PKCS#1 ("BEGIN RSA PRIVATE KEY"); Web Crypto only reads PKCS#8. */
export function pemToPkcs8(pem: string): Uint8Array<ArrayBuffer> {
  const body = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0));

  if (!pem.includes('BEGIN RSA PRIVATE KEY')) {
    return body;
  }

  const rsaAlgorithm = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
  const inner = [0x02, 0x01, 0x00, ...rsaAlgorithm, 0x04, ...derLength(body.length), ...body];

  return Uint8Array.from([0x30, ...derLength(inner.length), ...inner]);
}

export async function signRs256(payload: object, pem: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const data = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(JSON.stringify(payload))}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(data));

  return `${data}.${base64url(signature)}`;
}
