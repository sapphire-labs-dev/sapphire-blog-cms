import { Marked, type Tokens } from 'marked';
import TurndownService from 'turndown';

/**
 * Text is saved as Markdown. What Markdown lacks (color, highlight, underline, alignment, video,
 * tables) goes in as inline HTML, which Astro, Hugo, Eleventy, Next etc. render with no extra setup.
 */

const ALLOWED_STYLES = new Set(['color', 'background-color', 'text-align']);
const SAFE_VALUE = /^[#\w\s(),.%-]+$/;

/** The browser returns colors as rgb(); in the file they stay in hex, as they were picked. */
export function toHex(value: string): string {
  const match = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);

  if (!match || (match[4] !== undefined && Number(match[4]) < 1)) {
    return value;
  }

  return `#${match
    .slice(1, 4)
    .map((n) => Number(n).toString(16).padStart(2, '0'))
    .join('')}`;
}

/** Keeps only the style properties the editor generates and drops suspicious values. */
export function cleanStyle(style: string | null | undefined): string {
  if (!style) {
    return '';
  }

  return style
    .split(';')
    .map((part) => part.split(':').map((s) => s.trim()))
    .filter(
      ([prop, value]) =>
        prop &&
        value &&
        ALLOWED_STYLES.has(prop.toLowerCase()) &&
        SAFE_VALUE.test(value) &&
        !/url|expression/i.test(value) &&
        !(prop.toLowerCase() === 'text-align' && value === 'left'),
    )
    .map(([prop, value]) => `${prop.toLowerCase()}: ${toHex(value)}`)
    .join('; ');
}

const escapeAttr = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Block HTML the editor can edit. Anything else becomes a protected block, without loss. */
const isEditableHtmlBlock = (html: string) =>
  /^<(p|h[1-6])\s+style="[^"]*text-align/i.test(html.trim()) ||
  /^<div[^>]*data-youtube-video/i.test(html.trim()) ||
  /^<table[\s>]/i.test(html.trim());

const marked = new Marked({
  gfm: true,
  renderer: {
    html(token: Tokens.HTML | Tokens.Tag) {
      if ('block' in token && token.block && !isEditableHtmlBlock(token.text)) {
        return `<div data-raw-html="${encodeURIComponent(token.text.trim())}"></div>`;
      }

      return false;
    },
  },
});

export function markdownToHtml(markdown: string): string {
  return marked.parse(markdown, { async: false });
}

const rawHtmlOf = (el: HTMLElement) => decodeURIComponent(el.getAttribute('data-raw-html') ?? '');

const block = (html: string) => `\n\n${html}\n\n`;

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
  strongDelimiter: '**',
  hr: '---',
  // Empty elements are dropped by default; the protected block has no text but must be kept.
  blankReplacement: (_content, node) => {
    const el = node as HTMLElement & { isBlock?: boolean };

    if (el.nodeName === 'DIV' && el.hasAttribute('data-raw-html')) {
      return block(rawHtmlOf(el));
    }

    return el.isBlock ? '\n\n' : '';
  },
});

// Lists in the "- item" style, without the default 3-space Turndown indent.
turndown.addRule('listItem', {
  filter: 'li',
  replacement: (content, node) => {
    const parent = node.parentNode as HTMLElement;
    let prefix = '- ';

    if (parent.nodeName === 'OL') {
      const start = Number(parent.getAttribute('start') ?? 1);

      prefix = `${start + Array.prototype.indexOf.call(parent.children, node)}. `;
    }

    // Tiptap wraps each item in <p>; without trimming trailing breaks the list would be loose.
    const text = content
      .replace(/^\n+/, '')
      .replace(/\n+$/, '')
      // Sublist right below the item text, with no blank line in between.
      .replace(/\n{2,}(?=(?:[-*+]|\d+\.) )/g, '\n')
      .replace(/\n/gm, `\n${' '.repeat(prefix.length)}`)
      .replace(/[ \t]+$/gm, '');

    return `${prefix}${text}${node.nextSibling ? '\n' : ''}`;
  },
});

/** Rebuilds the element with only the allowed attributes, so no editor junk is saved. */
function cleanOuterHtml(node: HTMLElement): string {
  const clone = node.cloneNode(true) as HTMLElement;
  const all = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))];
  const keep = ['src', 'href', 'alt', 'title', 'colspan', 'rowspan', 'allowfullscreen'];

  for (const el of all) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name === 'style') {
        const style = cleanStyle(attr.value);

        if (style) {
          el.setAttribute('style', style);
        } else {
          el.removeAttribute('style');
        }
      } else if (!keep.includes(attr.name)) {
        el.removeAttribute(attr.name);
      }
    }
  }

  return clone.outerHTML;
}

turndown.addRule('rawHtml', {
  filter: (node) => node.nodeName === 'DIV' && node.hasAttribute('data-raw-html'),
  replacement: (_content, node) => block(rawHtmlOf(node as HTMLElement)),
});

turndown.addRule('alignedBlock', {
  filter: (node) =>
    /^(P|H[1-6])$/.test(node.nodeName) &&
    /text-align/.test(cleanStyle((node as HTMLElement).getAttribute('style'))),
  replacement: (_content, node) => block(cleanOuterHtml(node as HTMLElement)),
});

turndown.addRule('youtube', {
  filter: (node) => node.nodeName === 'DIV' && node.hasAttribute('data-youtube-video'),
  replacement: (_content, node) => {
    const src = (node as HTMLElement).querySelector('iframe')?.getAttribute('src');

    return src
      ? block(
          `<div data-youtube-video><iframe src="${escapeAttr(src)}" width="640" height="360" allowfullscreen></iframe></div>`,
        )
      : '';
  },
});

turndown.addRule('table', {
  filter: ['table'],
  replacement: (_content, node) => block(cleanOuterHtml(node as HTMLElement)),
});

turndown.addRule('underline', {
  filter: ['u'],
  replacement: (content) => (content.trim() ? `<u>${content}</u>` : content),
});

turndown.addRule('highlight', {
  filter: ['mark'],
  replacement: (content, node) => {
    const el = node as HTMLElement;
    const color = toHex(el.getAttribute('data-color') || el.style.backgroundColor);

    if (!content.trim()) {
      return content;
    }

    return color && SAFE_VALUE.test(color)
      ? `<mark data-color="${escapeAttr(color)}" style="background-color: ${color}">${content}</mark>`
      : `<mark>${content}</mark>`;
  },
});

turndown.addRule('styledSpan', {
  filter: (node) =>
    node.nodeName === 'SPAN' && !!cleanStyle((node as HTMLElement).getAttribute('style')),
  replacement: (content, node) => {
    const style = cleanStyle((node as HTMLElement).getAttribute('style'));

    return content.trim() ? `<span style="${escapeAttr(style)}">${content}</span>` : content;
  },
});

export function htmlToMarkdown(html: string): string {
  return turndown
    .turndown(html)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
