import { generateKeyPairSync } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { base64url, signHs256, signRs256, verifyHs256 } from './crypto';
import { coAuthor } from './github-app';
import worker, { isEditor, type Env } from './index';

const sites: Record<string, string> = {
  'owner/blog': JSON.stringify({ editors: ['ana@example.com', '*@example.org'] }),
};

const env: Env = {
  ALLOWED_DOMAINS: 'mysite.com, localhost',
  GOOGLE_CLIENT_ID: 'gid',
  GOOGLE_CLIENT_SECRET: 'gsecret',
  SESSION_SECRET: 'test-secret-that-is-long-enough-to-pass',
  SITES: { get: async (key) => sites[key] ?? null },
  GITHUB_APP_ID: '123',
  GITHUB_APP_PRIVATE_KEY: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs1', format: 'pem' }) as string,
};

const call = (path: string, init: RequestInit = {}) => worker.fetch(new Request(`https://auth.test${path}`, init), env);
const fakeIdToken = (claims: object) => `x.${base64url(JSON.stringify(claims))}.y`;
const session = (email = 'ana@example.com', repo = 'owner/blog') =>
  signHs256({ email, name: 'Ana', repo, exp: Math.floor(Date.now() / 1000) + 60 }, env.SESSION_SECRET!);

afterEach(() => vi.restoreAllMocks());

describe('signatures', () => {
  it('a session verifies, expires and rejects tampering', async () => {
    const token = await session();
    expect((await verifyHs256<{ exp: number; email: string }>(token, env.SESSION_SECRET!))?.email).toBe('ana@example.com');
    expect(await verifyHs256(token, 'other')).toBeNull();
    expect(await verifyHs256(token.replace(/\.[^.]+\./, `.${base64url('{"exp":9999999999}')}.`), env.SESSION_SECRET!)).toBeNull();
    const old = await signHs256({ exp: 1 }, env.SESSION_SECRET!);
    expect(await verifyHs256(old, env.SESSION_SECRET!)).toBeNull();
  });

  it('signs the App JWT with the PKCS#1 key GitHub provides', async () => {
    const jwt = await signRs256({ iss: '123' }, env.GITHUB_APP_PRIVATE_KEY!);
    expect(jwt.split('.')).toHaveLength(3);
  });

  it('the editor list accepts e-mails and whole domains', () => {
    expect(isEditor('Ana@Example.com', ['ana@example.com'])).toBe(true);
    expect(isEditor('john@example.org', ['*@example.org'])).toBe(true);
    expect(isEditor('john@example.org.br', ['*@example.org'])).toBe(false);
    expect(isEditor('x@y.com', null)).toBe(false);
    expect(coAuthor({ name: 'Ana <x>', email: 'ana@example.com' })).toBe('Co-authored-by: Ana x <ana@example.com>');
  });
});

describe('Google sign-in', () => {
  it('redirects to Google only for a registered repository', async () => {
    const res = await call('/auth?provider=google&site_id=mysite.com&repo=owner/blog');
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('Location')!);
    expect(location.origin).toBe('https://accounts.google.com');
    expect(location.searchParams.get('scope')).toBe('openid email profile');
    expect(res.headers.get('Set-Cookie')).toContain(encodeURIComponent('|mysite.com|google|owner/blog'));

    const unknown = await call('/auth?provider=google&site_id=mysite.com&repo=other/repo');
    expect(await unknown.text()).toContain('UNKNOWN_SITE');
  });

  const callback = (claims: object) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id_token: fakeIdToken(claims) })));

    return call('/callback?code=c&state=s', { headers: { Cookie: `scms_auth=${encodeURIComponent('s|mysite.com|google|owner/blog')}` } });
  };
  const valid = { iss: 'https://accounts.google.com', aud: 'gid', exp: Date.now() / 1000 + 60, email_verified: true, name: 'Ana' };

  it('issues a session to someone on the list', async () => {
    const html = await (await callback({ ...valid, email: 'ana@example.com' })).text();
    expect(html).toContain('authorization:google:success');
    expect(html).toContain('["mysite.com"]');
  });

  it('rejects someone not on the list or with an unverified e-mail', async () => {
    expect(await (await callback({ ...valid, email: 'bia@example.com' })).text()).toContain('NOT_AN_EDITOR');
    vi.restoreAllMocks();
    expect(await (await callback({ ...valid, email: 'ana@example.com', email_verified: false })).text()).toContain('authorization:google:error');
    vi.restoreAllMocks();
    expect(await (await callback({ ...valid, email: 'ana@example.com', aud: 'other' })).text()).toContain('authorization:google:error');
  });
});

describe('API', () => {
  const origin = { Origin: 'https://mysite.com' };

  it('rejects an unknown origin and an invalid session', async () => {
    expect((await call('/api/me', { headers: { Origin: 'https://evil.com' } })).status).toBe(403);
    expect((await call('/api/me', { headers: { ...origin, Authorization: 'Bearer junk' } })).status).toBe(401);
    const removed = await session('bia@example.com');
    expect((await call('/api/me', { headers: { ...origin, Authorization: `Bearer ${removed}` } })).status).toBe(403);
  });

  it('answers the CORS preflight', async () => {
    const res = await call('/api/commit', { method: 'OPTIONS', headers: origin });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://mysite.com');
  });

  it('commits through the App with the editor as co-author', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);

      if (url.endsWith('/repos/owner/blog/installation')) return Response.json({ id: 7 });
      if (url.endsWith('/app/installations/7/access_tokens')) return Response.json({ token: 'inst', expires_at: new Date(Date.now() + 3600_000).toISOString() });
      if (url.includes('/git/ref/heads/main')) return Response.json({ object: { sha: 'abc' } });
      if (url.endsWith('/graphql')) {
        const { variables } = JSON.parse(String(init?.body));
        expect(variables.input.message.body).toBe('Co-authored-by: Ana <ana@example.com>');
        expect(variables.input.expectedHeadOid).toBe('abc');

        return Response.json({ data: { createCommitOnBranch: { commit: { url: 'https://github.com/c/1' } } } });
      }

      return new Response('?', { status: 500 });
    });

    const res = await call('/api/commit', {
      method: 'POST',
      headers: { ...origin, Authorization: `Bearer ${await session()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch: 'main', message: 'Update post', additions: [{ path: 'a.md', contents: 'b2k=' }] }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://github.com/c/1' });
    expect(fetchMock.mock.calls.some(([, init]) => (init?.headers as Record<string, string>)?.Authorization === 'Bearer inst')).toBe(true);
  });
});
