import { describe, expect, it } from 'vitest';

import { parseEntry, serializeEntry } from './frontmatter';
import { htmlToMarkdown, markdownToHtml } from './markdown';
import { renderSlug, slugify } from './slug';

describe('slug', () => {
  it('removes accents and punctuation', () => {
    expect(slugify('Déjà vu is normal? Yes!')).toBe('deja-vu-is-normal-yes');
  });

  it('applies the collection slug template', () => {
    const now = new Date(2026, 10, 3);
    expect(renderSlug('{{year}}-{{month}}-{{day}}-{{slug}}', { title: 'Hello Wörld' }, 'title', now)).toBe(
      '2026-11-03-hello-world',
    );
  });
});

describe('frontmatter', () => {
  const fields = [
    { name: 'title', widget: 'string' as const, required: true },
    { name: 'cover', widget: 'image' as const, required: false },
    { name: 'draft', widget: 'boolean' as const, required: false },
    { name: 'body', widget: 'markdown' as const, required: true },
  ];

  it('reads and writes without losing unknown fields', () => {
    const text = '---\ntitle: Hi\nextra: 1\npubDate: 2026-01-02\n---\n\nSome **bold** text.\n';
    const data = parseEntry(text, 'md');
    expect(data).toMatchObject({ title: 'Hi', extra: 1, pubDate: '2026-01-02', body: 'Some **bold** text.\n' });
    const out = serializeEntry({ ...data, cover: '', draft: false }, fields, 'md');
    expect(out).toBe('---\ntitle: Hi\ndraft: false\nextra: 1\npubDate: 2026-01-02\n---\n\nSome **bold** text.\n');
  });
});

describe('markdown', () => {
  const roundTrip = (md: string) => htmlToMarkdown(markdownToHtml(md));

  it('keeps basic formatting', () => {
    const md = '## Heading\n\nText with **bold**, *italic* and a [link](https://x.com).\n\n- one\n- two\n\n> quote';
    expect(roundTrip(md)).toBe(md);
  });

  it('saves color, highlight and underline as inline HTML', () => {
    const html =
      '<p><span style="color: #b91c1c">red</span> <u>under</u> <mark data-color="#fde68a" style="background-color: #fde68a; color: inherit">mark</mark> <strong><span style="color: #1d4ed8">blue</span></strong></p>';
    expect(htmlToMarkdown(html)).toBe(
      '<span style="color: #b91c1c">red</span> <u>under</u> <mark data-color="#fde68a" style="background-color: #fde68a">mark</mark> **<span style="color: #1d4ed8">blue</span>**',
    );
  });

  it('color survives the round trip', () => {
    const md = 'A <span style="color: #b91c1c">**colored**</span> phrase';
    expect(markdownToHtml(md)).toContain('<span style="color: #b91c1c"><strong>colored</strong></span>');
  });

  it('editor lists (items wrapped in <p>) stay compact', () => {
    expect(htmlToMarkdown('<ul><li><p>one</p></li><li><p>two</p><ul><li><p>sub</p></li></ul></li></ul><ol><li><p>a</p></li><li><p>b</p></li></ol>')).toBe(
      '- one\n- two\n  - sub\n\n1. a\n2. b',
    );
  });

  it('browser colors are turned back into hex', () => {
    expect(htmlToMarkdown('<p><span style="color: rgb(107, 143, 113)">a</span></p>')).toBe(
      '<span style="color: #6b8f71">a</span>',
    );
  });

  it('keeps text alignment', () => {
    expect(htmlToMarkdown('<p style="text-align: center" class="x">Center</p>')).toBe(
      '<p style="text-align: center">Center</p>',
    );
  });

  it('drops dangerous styles', () => {
    expect(htmlToMarkdown('<p><span style="color: red; background: url(x)">a</span></p>')).toBe(
      '<span style="color: red">a</span>',
    );
  });

  it('protects HTML the editor does not know', () => {
    const md = '<div class="notice">\n  <b>Important</b>\n</div>\n\nAfter.';
    const html = markdownToHtml(md);
    expect(html).toContain('data-raw-html');
    expect(htmlToMarkdown(html)).toBe(md);
  });
});
