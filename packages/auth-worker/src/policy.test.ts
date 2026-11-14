import { afterEach, describe, expect, it, vi } from 'vitest';

import { signHs256 } from './crypto';
import worker, { isAllowedDomain, type Env } from './index';
import { canRead, dangerousContent, writeError, type SiteConfig } from './policy';

const open: SiteConfig = { editors: [] };
const scoped: SiteConfig = { editors: [], paths: ['src/content/', '/public/uploads'] };

describe('paths', () => {
  it('blocks traversal, hidden files and absolute paths', () => {
    for (const path of ['../x.md', 'a/../b.md', '/etc/x.md', '.github/workflows/x.yml', 'src/.env.md', 'a//b.md', 'a\\b.md', '']) {
      expect(writeError(path, open), path).not.toBeNull();
      expect(canRead(path, open), path).toBe(false);
    }
  });

  it('only accepts content and media files, never code or config', () => {
    expect(writeError('src/content/blog/post.md', open)).toBeNull();
    expect(writeError('public/uploads/photo.webp', open)).toBeNull();
    expect(writeError('src/data/site.json', open)).toBeNull();

    for (const path of ['src/pages/index.astro', 'app/page.tsx', 'scripts/build.js', 'public/x.html', 'public/uploads/logo.svg', 'package.json', 'vercel.json', 'tsconfig.app.json', 'public/admin/config.yml']) {
      expect(writeError(path, open), path).not.toBeNull();
    }
  });

  it('keeps editors inside the configured folders', () => {
    expect(writeError('src/content/blog/post.md', scoped)).toBeNull();
    expect(writeError('public/uploads/a.png', scoped)).toBeNull();
    expect(writeError('src/data/site.json', scoped)).toContain('outside');
    expect(writeError('src/contentx/post.md', scoped)).toContain('outside');
    expect(canRead('src/content/blog/post.md', scoped)).toBe(true);
    expect(canRead('README.md', scoped)).toBe(false);
  });
});

describe('dangerous content', () => {
  it('accepts everything the editor produces', () => {
    const post = [
      '---\ntitle: Hi\n---',
      'Text with **bold**, <u>underline</u>, <span style="color: #b5651d">color</span> and a [link](https://example.com).',
      '<mark data-color="#fef08a" style="background-color: #fef08a">highlight</mark>',
      '<p style="text-align: center">Centered</p>',
      '<div data-youtube-video><iframe src="https://www.youtube-nocookie.com/embed/abc" width="640" height="360" allowfullscreen></iframe></div>',
      '| a | b |\n|---|---|\n| 1 | 2 |',
      'JavaScript: the good parts, and someone = something.',
      '![photo](/uploads/photo.webp)',
    ].join('\n\n');

    expect(dangerousContent(post)).toBeNull();
  });

  it('rejects scripts, handlers and script links, including obfuscated ones', () => {
    for (const text of [
      '<script>alert(1)</script>',
      '<SCRIPT src=//evil.example></SCRIPT>',
      '<img src=x onerror=alert(1)>',
      '<a href="#"\nonclick="alert(1)">x</a>',
      '<svg/onload=alert(1)>',
      '<iframe src="https://evil.example"></iframe>',
      '<iframe srcdoc="<script>alert(1)</script>" src="https://www.youtube.com/embed/x"></iframe>',
      '<a href="javascript:alert(1)">x</a>',
      '<a href="jav&#x09;ascript:alert(1)">x</a>',
      '<a href="&#106;avascript:alert(1)">x</a>',
      "<a href='  JaVaScRiPt:alert(1)'>x</a>",
      '[x](javascript:alert(1))',
      '[x]: javascript:alert(1)',
      '<object data="data:text/html,x"></object>',
      '<style>body{display:none}</style>',
      '<meta http-equiv="refresh" content="0;url=https://evil.example">',
    ]) {
      expect(dangerousContent(text), text).not.toBeNull();
    }
  });
});

describe('allowed domains', () => {
  it('ignores a bare "*"', () => {
    expect(isAllowedDomain('evil.example', '*')).toBe(false);
    expect(isAllowedDomain('blog.mysite.com', '*, *.mysite.com')).toBe(true);
  });
});

describe('API rules', () => {
  const secret = 'test-secret-that-is-long-enough-to-pass';
  const env: Env = {
    ALLOWED_DOMAINS: 'mysite.com',
    SESSION_SECRET: secret,
    SITES: { get: async () => JSON.stringify({ editors: ['ana@example.com'], paths: ['src/content/'], branch: 'main' }) },
    GITHUB_APP_ID: '1',
    GITHUB_APP_PRIVATE_KEY: 'unused',
  };
  const commit = async (body: object, sessionSecret = secret) =>
    worker.fetch(
      new Request('https://auth.test/api/commit', {
        method: 'POST',
        headers: {
          Origin: 'https://mysite.com',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await signHs256({ email: 'ana@example.com', name: 'Ana', repo: 'owner/blog', exp: Date.now() / 1000 + 60 }, sessionSecret)}`,
        },
        body: JSON.stringify(body),
      }),
      env,
    );
  const base64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));

  afterEach(() => vi.restoreAllMocks());

  it('refuses files outside the site paths, other branches and scripts before calling GitHub', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    const outside = await commit({ message: 'x', additions: [{ path: 'package.json', contents: base64('{}') }] });
    expect(outside.status).toBe(403);

    const otherBranch = await commit({ branch: 'gh-pages', message: 'x', additions: [{ path: 'src/content/a.md', contents: base64('hi') }] });
    expect(otherBranch.status).toBe(403);

    const script = await commit({ message: 'x', additions: [{ path: 'src/content/a.md', contents: base64('<script>alert(1)</script>') }] });
    expect(script.status).toBe(422);
    expect((await script.json()).error).toContain('<script>');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects sessions when SESSION_SECRET is too short', async () => {
    const weak = { ...env, SESSION_SECRET: 'short' };
    const token = await signHs256({ email: 'ana@example.com', name: 'Ana', repo: 'owner/blog', exp: Date.now() / 1000 + 60 }, 'short');
    const res = await worker.fetch(
      new Request('https://auth.test/api/me', { headers: { Origin: 'https://mysite.com', Authorization: `Bearer ${token}` } }),
      weak,
    );

    expect(res.status).toBe(401);
  });
});
