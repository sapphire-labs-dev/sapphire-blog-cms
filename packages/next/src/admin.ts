/**
 * CMS panel page for the App Router. In `app/admin/route.ts`:
 *
 *   import { createAdminRoute } from '@sapphirelabs/blog-cms-next/admin';
 *   export const { GET } = createAdminRoute();
 *   export const dynamic = 'force-static';
 *
 * Without `config`, the panel reads `public/admin/config.yml`.
 */

/** Panel version this package is tested with; kept equal to @sapphirelabs/blog-cms by a test. */
export const PANEL_VERSION = '1.0.0';

/**
 * Pinned, so publishing a new panel never changes a site that did not upgrade
 * this package (see SECURITY.md).
 */
export const DEFAULT_SCRIPT_URL = `https://unpkg.com/@sapphirelabs/blog-cms@${PANEL_VERSION}/dist/sapphire-cms.js`;

export interface AdminOptions {
  /** URL of `sapphire-cms.js`. Default: the matching panel version on unpkg. */
  scriptUrl?: string;
  /** Configuration instead of `config.yml`, in the same format. */
  config?: Record<string, unknown>;
  /** Browser tab title. */
  title?: string;
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function adminHtml({ scriptUrl = DEFAULT_SCRIPT_URL, config, title }: AdminOptions = {}): string {
  const pageTitle = title ?? (typeof config?.site_title === 'string' ? config.site_title : 'Content Manager');
  const inline = config
    ? `<script>window.SAPPHIRE_CMS_CONFIG = ${JSON.stringify(config).replace(/</g, '\\u003c')};</script>`
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>${escapeHtml(pageTitle)}</title>
    <style>body { margin: 0; }</style>
    ${inline}
    <script src="${escapeHtml(scriptUrl)}"></script>
  </head>
  <body></body>
</html>
`;
}

export function createAdminRoute(options: AdminOptions = {}) {
  const html = adminHtml(options);

  return {
    GET: () =>
      new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex' },
      }),
  };
}
