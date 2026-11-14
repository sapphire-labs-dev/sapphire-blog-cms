import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

export interface SapphireContentProps {
  /** The post text (the `body` from `getPost`). */
  source: string;
  /** Class of the wrapping element. Default: `sapphire-prose`, the theme in `@sapphirelabs/blog-cms-next/prose.css`. */
  className?: string;
  as?: 'article' | 'div' | 'section';
  /**
   * Skips HTML sanitizing. Only turn this on if every editor is fully trusted and your posts need
   * HTML beyond what the editor produces (scripts, forms, custom embeds).
   */
  allowUnsafeHtml?: boolean;
}

/** The HTML the editor writes, on top of the standard safe Markdown subset. */
const schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'u', 'mark', 'iframe', 'figure', 'figcaption'],
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'style', 'className'],
    mark: ['dataColor'],
    div: ['dataYoutubeVideo'],
    iframe: ['src', 'width', 'height', 'title', 'allowFullScreen', 'allow', 'loading'],
  },
};

const ALLOWED_STYLES = new Set(['color', 'background-color', 'text-align']);
const YOUTUBE_EMBED = /^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com)\/embed\//;

interface HastNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

/** Keeps only the style properties the editor uses (no url(), no layout tricks). */
function cleanStyle(style: string): string {
  return style
    .split(';')
    .map((part) => part.split(':').map((s) => s.trim()))
    .filter(
      ([prop, value]) =>
        prop && value && ALLOWED_STYLES.has(prop.toLowerCase()) && /^[#\w\s(),.%-]+$/.test(value) && !/url|expression/i.test(value),
    )
    .map(([prop, value]) => `${prop.toLowerCase()}: ${value}`)
    .join('; ');
}

/** Drops iframes that are not YouTube embeds and trims inline styles. */
function rehypeSapphireEmbeds() {
  const walk = (node: HastNode) => {
    if (!node.children) {
      return;
    }

    node.children = node.children.filter((child) => {
      if (child.type !== 'element') {
        return true;
      }

      if (child.tagName === 'iframe' && !YOUTUBE_EMBED.test(String(child.properties?.src ?? ''))) {
        return false;
      }

      if (typeof child.properties?.style === 'string') {
        const style = cleanStyle(child.properties.style);

        if (style) {
          child.properties.style = style;
        } else {
          delete child.properties.style;
        }
      }

      walk(child);

      return true;
    });
  };

  return (tree: HastNode) => walk(tree);
}

/**
 * Renders text saved by Sapphire Blog CMS. Besides Markdown, it accepts the HTML the editor writes
 * for color, underline, highlight, alignment, tables and YouTube videos. Anything else that could run
 * code (scripts, event handlers, other iframes) is removed, unless `allowUnsafeHtml` is set.
 */
export function SapphireContent({ source, className = 'sapphire-prose', as: Tag = 'article', allowUnsafeHtml = false }: SapphireContentProps) {
  return (
    <Tag className={className}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={allowUnsafeHtml ? [rehypeRaw] : [rehypeRaw, [rehypeSanitize, schema], rehypeSapphireEmbeds]}
      >
        {source}
      </Markdown>
    </Tag>
  );
}
