import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { adminHtml, createAdminRoute, PANEL_VERSION } from './admin';
import { getPost, getPosts, parseMarkdown } from './content';
import { SapphireContent } from './SapphireContent';

const folder = mkdtempSync(path.join(tmpdir(), 'scms-next-'));
writeFileSync(path.join(folder, 'old.md'), '---\ntitle: Old\npubDate: 2026-01-01\n---\nOld text');
writeFileSync(path.join(folder, 'new.md'), '---\ntitle: New\npubDate: 2026-11-10\n---\n\nNew text');
writeFileSync(path.join(folder, 'draft.md'), '---\ntitle: Draft\ndraft: true\n---\nNot yet');
writeFileSync(path.join(folder, 'notes.txt'), 'ignored');

afterEach(() => vi.unstubAllEnvs());

describe('reading posts', () => {
  it('splits the front matter from the text', () => {
    expect(parseMarkdown('---\ntitle: Hi\n---\n\nBody')).toEqual({ data: { title: 'Hi' }, body: 'Body' });
    expect(parseMarkdown('No fields')).toEqual({ data: {}, body: 'No fields' });
  });

  it('sorts newest first and hides drafts in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect((await getPosts(folder)).map((p) => p.slug)).toEqual(['new', 'old']);
    expect(await getPost(folder, 'draft')).toBeNull();
    expect((await getPosts(folder, { drafts: true })).map((p) => p.slug)).toContain('draft');
  });

  it('reads a post and rejects unsafe slugs', async () => {
    expect((await getPost(folder, 'new'))?.body).toBe('New text');
    expect(await getPost(folder, 'missing')).toBeNull();
    expect(await getPost(folder, '../secret')).toBeNull();
  });
});

describe('SapphireContent', () => {
  it('renders Markdown with the HTML the editor writes', () => {
    const source = [
      'Text <u>underlined</u> and <span style="color: #b5651d">color</span>.',
      '<p style="text-align: center">Middle</p>',
      '| a | b |\n|---|---|\n| 1 | 2 |',
    ].join('\n\n');
    const html = renderToStaticMarkup(<SapphireContent source={source} />);

    expect(html).toContain('<article class="sapphire-prose">');
    expect(html).toContain('<u>underlined</u>');
    expect(html).toContain('style="color:#b5651d"');
    expect(html).toContain('style="text-align:center"');
    expect(html).toContain('<table>');
  });

  it('removes scripts, event handlers, script links and foreign iframes', () => {
    const source = [
      '<script>alert(1)</script>',
      '<img src="/a.png" onerror="alert(1)" alt="a">',
      '<a href="javascript:alert(1)">bad</a> [also bad](javascript:alert(1))',
      '<span style="color: #b5651d; background: url(https://evil.example)">kept color</span>',
      '<iframe src="https://evil.example"></iframe>',
      '<div data-youtube-video><iframe src="https://www.youtube-nocookie.com/embed/abc"></iframe></div>',
    ].join('\n\n');
    const html = renderToStaticMarkup(<SapphireContent source={source} />);

    expect(html).not.toMatch(/<script|onerror|javascript:|evil\.example|url\(/i);
    expect(html).toContain('style="color:#b5651d"');
    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/abc"');
    expect(html).toContain('src="/a.png"');
  });

  it('keeps raw HTML when allowUnsafeHtml is set', () => {
    const html = renderToStaticMarkup(<SapphireContent source={'<iframe src="https://maps.example/embed"></iframe>'} allowUnsafeHtml />);

    expect(html).toContain('maps.example');
  });
});

describe('panel page', () => {
  it('loads the script and embeds the config safely', async () => {
    const html = adminHtml({ scriptUrl: '/admin/sapphire-cms.js', config: { site_title: 'Blog</script>' } });

    expect(html).toContain('<script src="/admin/sapphire-cms.js"></script>');
    expect(html).not.toContain('Blog</script>');
    expect(html).toContain('<title>Blog&lt;/script&gt;</title>');

    const res = createAdminRoute().GET();
    expect(res.headers.get('Content-Type')).toContain('text/html');
    expect(await res.text()).toContain(`unpkg.com/@sapphirelabs/blog-cms@${PANEL_VERSION}/`);
  });
});

describe('panel version', () => {
  it('pins the same version as @sapphirelabs/blog-cms', () => {
    const panel = JSON.parse(readFileSync(path.join(__dirname, '../../app/package.json'), 'utf8')) as { version: string };
    expect(PANEL_VERSION).toBe(panel.version);
  });
});
