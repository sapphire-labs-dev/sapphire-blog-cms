import { createReadStream, copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AstroIntegration } from 'astro';

import type { CollectionOptions } from './schema.js';

export type { CollectionOptions } from './schema.js';

export interface SapphireCmsOptions {
  /** Panel route. Default: /admin */
  route?: string;
  /**
   * Configuration in the Decap/Sveltia format (backend, media_folder, site_title, editor…).
   * Astro collections are added automatically.
   */
  config: Record<string, unknown> & { backend: Record<string, unknown> };
  /**
   * Which Astro collections show up in the panel, with overrides. If omitted, all of them show up
   * with the fields read from the schema.
   */
  collections?: Record<string, CollectionOptions>;
  /** Loads the panel from a CDN instead of the local copy. */
  scriptUrl?: string;
}

const VIRTUAL_ID = 'virtual:sapphire-cms/options';
const SCRIPT_NAME = 'sapphire-cms.js';

export default function sapphireCms(options: SapphireCmsOptions): AstroIntegration {
  const route = `/${(options.route ?? '/admin').replace(/^\/+|\/+$/g, '')}`;
  const require = createRequire(import.meta.url);
  const bundlePath = join(dirname(require.resolve('@sapphirelabs/blog-cms/package.json')), 'dist', SCRIPT_NAME);
  const pagePath = fileURLToPath(new URL('../pages/admin.astro', import.meta.url));
  const scriptUrl = options.scriptUrl ?? `${route}/${SCRIPT_NAME}`;

  return {
    name: '@sapphirelabs/blog-cms-astro',
    hooks: {
      'astro:config:setup': ({ config, injectRoute, updateConfig }) => {
        const data = {
          root: fileURLToPath(config.root),
          site: config.site,
          scriptUrl,
          collections: options.collections,
          config: options.config,
        };

        injectRoute({ pattern: route, entrypoint: pagePath, prerender: true });
        updateConfig({
          vite: {
            plugins: [
              {
                name: 'sapphire-cms-options',
                resolveId: (id: string) => (id === VIRTUAL_ID ? `\0${VIRTUAL_ID}` : undefined),
                load: (id: string) => (id === `\0${VIRTUAL_ID}` ? `export default ${JSON.stringify(data)};` : undefined),
              },
            ],
          },
        });
      },

      // In development, serves the panel script straight from the package.
      'astro:server:setup': ({ server }) => {
        if (options.scriptUrl) {
          return;
        }

        server.middlewares.use(`${route}/${SCRIPT_NAME}`, (_req, res) => {
          res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
          createReadStream(bundlePath).pipe(res);
        });
      },

      // On build, copies the script into the published site.
      'astro:build:done': ({ dir, logger }) => {
        if (options.scriptUrl) {
          return;
        }

        const target = join(fileURLToPath(dir), route, SCRIPT_NAME);

        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(bundlePath, target);
        logger.info(`CMS panel available at ${route}`);
      },
    },
  };
}
