import { afterEach, describe, expect, it, vi } from 'vitest';

import worker, { isAllowedDomain, originHostsFor } from './index';

const env = { GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'secret', ALLOWED_DOMAINS: 'mysite.com, *.example.com, localhost' };
const get = (path: string, headers: Record<string, string> = {}) =>
  worker.fetch(new Request(`https://auth.test${path}`, { headers }), env);

afterEach(() => vi.restoreAllMocks());

describe('domains', () => {
  it('accepts exact domains and wildcards', () => {
    expect(isAllowedDomain('mysite.com', env.ALLOWED_DOMAINS)).toBe(true);
    expect(isAllowedDomain('blog.example.com', env.ALLOWED_DOMAINS)).toBe(true);
    expect(isAllowedDomain('example.com', env.ALLOWED_DOMAINS)).toBe(true);
    expect(isAllowedDomain('mysite.com.evil.io', env.ALLOWED_DOMAINS)).toBe(false);
    expect(isAllowedDomain('notexample.com', env.ALLOWED_DOMAINS)).toBe(false);
    expect(isAllowedDomain('anything.com', '')).toBe(false);
  });

  it('accepts domains written as URLs', () => {
    expect(isAllowedDomain('blog.workers.dev', 'https://blog.workers.dev/')).toBe(true);
    expect(isAllowedDomain('mysite.com', ' HTTP://MySite.com:443 , other.com')).toBe(true);
    expect(isAllowedDomain('evil.com', 'https://blog.workers.dev')).toBe(false);
  });

  it('handles the Decap/Sveltia localhost site_id', () => {
    expect(originHostsFor('cms.netlify.com')).toContain('localhost');
    expect(originHostsFor('mysite.com')).toEqual(['mysite.com']);
  });
});

describe('/auth', () => {
  it('redirects to GitHub with the state in a cookie', async () => {
    const res = await get('/auth?provider=github&site_id=mysite.com&scope=repo');
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('Location')!);
    expect(location.origin).toBe('https://github.com');
    expect(location.searchParams.get('client_id')).toBe('id');
    const state = location.searchParams.get('state')!;
    expect(res.headers.get('Set-Cookie')).toContain(encodeURIComponent(`${state}|mysite.com`));
  });

  it('rejects a domain that is not allowed', async () => {
    const res = await get('/auth?provider=github&site_id=evil.com');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('UNSUPPORTED_DOMAIN');
  });
});

describe('/callback', () => {
  it('rejects a state that does not match the cookie', async () => {
    const res = await get('/callback?code=c&state=b', { Cookie: `scms_auth=${encodeURIComponent('a|mysite.com')}` });
    expect(await res.text()).toContain('CSRF_DETECTED');
  });

  it('exchanges the code and only hands the token to the originating site', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ access_token: 'tok</script>' })));
    const res = await get('/callback?code=c&state=a', { Cookie: `scms_auth=${encodeURIComponent('a|mysite.com')}` });
    const html = await res.text();
    expect(html).toContain('authorization:github:success');
    expect(html).toContain('["mysite.com"]');
    expect(html).not.toContain('tok</script>');
    expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });
});
