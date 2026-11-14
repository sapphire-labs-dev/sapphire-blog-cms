import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import YAML from 'yaml';

/** A collection file: the front matter fields in `data` and the text in `body`. */
export interface Post<T = Record<string, unknown>> {
  slug: string;
  data: T;
  body: string;
}

export interface ReadOptions {
  /**
   * Include posts with `draft: true`. Default: only outside production, so drafts show up in
   * `next dev` and never on the published site.
   */
  drafts?: boolean;
  /** File extensions to read. Default: md and markdown. */
  extensions?: string[];
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const DATE_FIELDS = ['pubDate', 'date', 'publishDate', 'published_at'];
const SAFE_SLUG = /^[\w][\w.-]*$/;

/** Splits the front matter (YAML between `---`) from the text. */
export function parseMarkdown<T = Record<string, unknown>>(text: string): { data: T; body: string } {
  const match = text.match(FRONTMATTER);

  if (!match) {
    return { data: {} as T, body: text };
  }

  return {
    data: (YAML.parse(match[1]) ?? {}) as T,
    body: text.slice(match[0].length).replace(/^\r?\n/, ''),
  };
}

const showDrafts = (options: ReadOptions) => options.drafts ?? process.env.NODE_ENV !== 'production';
const extensionsOf = (options: ReadOptions) => options.extensions ?? ['md', 'markdown'];
const resolve = (folder: string) => path.resolve(process.cwd(), folder);
const isDraft = (data: unknown) => (data as Record<string, unknown>)?.draft === true;

function dateOf(data: unknown): number {
  for (const field of DATE_FIELDS) {
    const value = (data as Record<string, unknown>)?.[field];
    const time = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : NaN;

    if (!Number.isNaN(time)) {
      return time;
    }
  }

  return 0;
}

/**
 * Reads every post in a folder, newest first (by the `pubDate`, `date` or `publishDate` field).
 * The folder is relative to the project root, e.g. `content/blog`.
 */
export async function getPosts<T = Record<string, unknown>>(folder: string, options: ReadOptions = {}): Promise<Post<T>[]> {
  const extensions = extensionsOf(options);
  const names = (await readdir(resolve(folder))).filter((name) => extensions.includes(path.extname(name).slice(1)));
  const posts = await Promise.all(
    names.map(async (name) => {
      const { data, body } = parseMarkdown<T>(await readFile(path.join(resolve(folder), name), 'utf8'));

      return { slug: name.slice(0, -path.extname(name).length), data, body };
    }),
  );

  return posts
    .filter((post) => showDrafts(options) || !isDraft(post.data))
    .sort((a, b) => dateOf(b.data) - dateOf(a.data) || a.slug.localeCompare(b.slug));
}

/** Post slugs (the file name without extension). Handy for `generateStaticParams`. */
export async function getSlugs(folder: string, options: ReadOptions = {}): Promise<string[]> {
  return (await getPosts(folder, options)).map((post) => post.slug);
}

/** Reads one post by slug. Returns `null` if it does not exist (or is a draft in production). */
export async function getPost<T = Record<string, unknown>>(
  folder: string,
  slug: string,
  options: ReadOptions = {},
): Promise<Post<T> | null> {
  if (!SAFE_SLUG.test(slug)) {
    return null;
  }

  for (const extension of extensionsOf(options)) {
    let text: string;

    try {
      text = await readFile(path.join(resolve(folder), `${slug}.${extension}`), 'utf8');
    } catch {
      continue;
    }

    const { data, body } = parseMarkdown<T>(text);

    return !showDrafts(options) && isDraft(data) ? null : { slug, data, body };
  }

  return null;
}
