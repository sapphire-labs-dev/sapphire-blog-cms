/**
 * What editors who sign in with Google may read and write. They are trusted with the site's content,
 * not with its code: a change to package.json, a build script or a page template would run on the
 * next deploy, and a <script> inside a post would run on the site (the same origin as /admin, where
 * other editors keep their sessions). GitHub sign-in does not go through these rules, because those
 * editors already have direct write access to the repository.
 */

/** Per-site settings stored in KV under "owner/repo". */
export interface SiteConfig {
  /** E-mails allowed to edit, or "*@domain.com". */
  editors: unknown[];
  /** Folders editors may read and write, e.g. ["src/content/", "public/uploads/"]. Strongly recommended. */
  paths?: string[];
  /** If set, commits may only go to this branch. */
  branch?: string;
}

/** Text files with content: posts and data collections. */
const CONTENT_EXTENSIONS = ['md', 'mdx', 'markdown', 'json', 'yml', 'yaml'];
/** Uploads. SVG and HTML are left out on purpose: both can carry scripts. */
const MEDIA_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'pdf', 'mp3', 'mp4', 'webm'];

/** Files that configure the build, the deploy or the CMS itself, even if their extension is allowed. */
const BLOCKED_FILES = new Set([
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'yarn.lock',
  'bun.lockb',
  'deno.json',
  'jsconfig.json',
  'vercel.json',
  'now.json',
  'netlify.toml',
  'wrangler.json',
  'wrangler.jsonc',
  'firebase.json',
  'turbo.json',
  'nx.json',
  'lerna.json',
  'renovate.json',
  'composer.json',
  'docker-compose.yml',
  'docker-compose.yaml',
  'config.yml',
  'config.yaml',
]);

const extensionOf = (path: string) => path.slice(path.lastIndexOf('.') + 1).toLowerCase();
const basenameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1).toLowerCase();

/** Rejects absolute paths, "..", empty segments and hidden files or folders (.github, .env…). */
function isCleanPath(path: string): boolean {
  if (!path || path.length > 512 || path.startsWith('/') || path.includes('\\') || /[\u0000-\u001f]/.test(path)) {
    return false;
  }

  return path.split('/').every((segment) => segment !== '' && !segment.startsWith('.'));
}

function insideAllowedFolders(path: string, site: SiteConfig): boolean {
  const folders = (site.paths ?? []).map((folder) => folder.replace(/^\/+/, '').replace(/\/*$/, '/'));

  return folders.length === 0 || folders.some((folder) => path.startsWith(folder));
}

export function canRead(path: string, site: SiteConfig): boolean {
  return isCleanPath(path) && insideAllowedFolders(path, site);
}

/** Returns why the path may not be written, or null if it may. */
export function writeError(path: string, site: SiteConfig): string | null {
  if (!isCleanPath(path)) {
    return `Invalid path: ${path}`;
  }

  if (!insideAllowedFolders(path, site)) {
    return `Editors cannot change files outside ${site.paths?.join(', ')}: ${path}`;
  }

  const name = basenameOf(path);
  const extension = extensionOf(path);

  if (BLOCKED_FILES.has(name) || /^tsconfig.*\.json$/.test(name)) {
    return `Editors cannot change site configuration files: ${path}`;
  }

  if (!CONTENT_EXTENSIONS.includes(extension) && !MEDIA_EXTENSIONS.includes(extension)) {
    return `Editors cannot save .${extension} files: ${path}`;
  }

  return null;
}

export const isTextFile = (path: string) => CONTENT_EXTENSIONS.includes(extensionOf(path));

/* Dangerous HTML in content */

const DANGEROUS_TAG = /<\s*\/?\s*(script|style|object|embed|applet|base|meta|link|form|frame|frameset|svg|math|template|noscript)\b/i;
const EVENT_HANDLER = /<[^>]*[\s/"'](on[a-z]+)\s*=/i;
const IFRAME = /<\s*iframe\b[^>]*>/gi;
const YOUTUBE_EMBED = /\ssrc\s*=\s*["']?https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com)\/embed\//i;
const URL_ATTRIBUTE = /\b(href|src|action|formaction|xlink:href|poster|background|cite|data)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const MARKDOWN_LINK = /\]\(\s*<?([^)\s>]+)/g;
const REFERENCE_LINK = /^\s{0,3}\[[^\]]+\]:\s*<?(\S+?)>?(\s|$)/gm;

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&colon;/gi, ':')
    .replace(/&tab;/gi, '\t')
    .replace(/&newline;/gi, '\n');
}

/** True for javascript:, vbscript: and data: URLs, including the usual obfuscations. */
function isScriptUrl(raw: string): boolean {
  // Browsers ignore tabs, line breaks and leading control characters inside a URL scheme.
  const url = decodeEntities(raw).replace(/[\u0000- ]+/g, '').toLowerCase();

  return /^(javascript|vbscript|data):/.test(url);
}

/** Returns why the text was rejected, or null if it is safe to publish. */
export function dangerousContent(text: string): string | null {
  const tag = text.match(DANGEROUS_TAG);

  if (tag) {
    return `<${tag[1].toLowerCase()}> tags are not allowed`;
  }

  const handler = text.match(EVENT_HANDLER);

  if (handler) {
    return `${handler[1].toLowerCase()} attributes are not allowed`;
  }

  for (const iframe of text.match(IFRAME) ?? []) {
    if (!YOUTUBE_EMBED.test(iframe) || /\ssrcdoc\s*=/i.test(iframe)) {
      return 'Only YouTube embeds are allowed';
    }
  }

  for (const match of text.matchAll(URL_ATTRIBUTE)) {
    if (isScriptUrl(match[3] ?? match[4] ?? match[5] ?? '')) {
      return 'Script links are not allowed';
    }
  }

  for (const match of [...text.matchAll(MARKDOWN_LINK), ...text.matchAll(REFERENCE_LINK)]) {
    if (isScriptUrl(match[1])) {
      return 'Script links are not allowed';
    }
  }

  return null;
}

/** Base64 (as sent by the panel) to UTF-8 text. */
export function decodeBase64Text(contents: string): string {
  const binary = atob(contents);

  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}
