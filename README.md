# Sapphire Blog CMS

A Git-based CMS and an alternative to Sveltia/Decap. Your content stays as Markdown files in your repository. The panel runs entirely in the browser and saves every change as a commit.

- **A text editor made for bloggers:** bold, italic, underline, strikethrough, color (with your site palette), highlight, alignment, headings, lists, quotes, links, images, YouTube videos, tables and dividers. Shows word count, character count and reading time.
- **Character counter** on fields with a limit (`maxlength`, or `.max()` in Zod).
- **Images compressed** to WebP (up to 1920 px) in the browser, before upload.
- **One commit per save**, with the text and its images together.
- **Compatible with the Decap/Sveltia config** (`config.yml`), so you can migrate without rework.
- **Editors don't need a GitHub account:** they can sign in with Google.
- **Astro and Next.js integrations**, plus a reading theme (`prose.css`) for your posts.
- **Interface in English and Portuguese**, picked from the browser language (or the `locale` setting).

**New here?** Follow [docs/getting-started.md](docs/getting-started.md): your own worker, sign-in and blog, from scratch.

## Repository layout

| Folder | What it is |
|---|---|
| `packages/app` | The panel (React + Vite + Tiptap). Builds `dist/sapphire-cms.js` and `dist/prose.css`. |
| `packages/auth-worker` | Sign-in with GitHub or Google (Cloudflare Worker). GitHub sign-in also works with Decap and Sveltia. |
| `packages/astro` | Astro integration: creates `/admin` and builds the config from your schemas. |
| `packages/next` | Next.js integration: `/admin` page, post loading helpers and a component that renders the text. |
| `examples/astro-blog` | Example site in Astro. |
| `examples/next-blog` | Example site in Next.js. |

## Try it locally, without signing in

```bash
pnpm install
pnpm build
pnpm --filter astro-blog-example dev
```

Open http://localhost:4321/admin in Chrome or Edge, click **Open project folder** and pick the `examples/astro-blog` folder. The panel writes straight to the files, and Astro updates the site instantly.

## Try it with GitHub

1. **Test repository:** create a repository with the contents of `examples/astro-blog`.
2. **OAuth App:** in GitHub > Settings > Developer settings > OAuth Apps > New, set the *Authorization callback URL* to `https://sapphire-cms-auth.<your-account>.workers.dev/callback`.
3. **Worker:** copy `packages/auth-worker/wrangler.jsonc` to `wrangler.local.jsonc` (ignored by git) and list in `ALLOWED_DOMAINS` the domains of the sites that will use the panel, e.g. `localhost, mysite.com, *.mysite.com`. Then:
   ```bash
   cd packages/auth-worker
   npx wrangler deploy -c wrangler.local.jsonc
   npx wrangler secret put GITHUB_CLIENT_ID
   npx wrangler secret put GITHUB_CLIENT_SECRET
   ```
4. **Site:** in `astro.config.mjs`, set `backend.repo` and `backend.base_url`.

The worker only hands the token to the window of the domain that started the sign-in, and only accepts domains listed in `ALLOWED_DOMAINS`.

## Google sign-in (editors without a GitHub account)

The worker checks that the e-mail is on the site's list and writes to the repository through a GitHub App, with the editor as the commit co-author. Step by step in [docs/google-sign-in.md](docs/google-sign-in.md). In `config.yml`:

```yaml
backend:
  name: github
  repo: owner/repo
  base_url: https://sapphire-cms-auth.<your-account>.workers.dev
  login_methods: [google, github]
```

## Using it with Astro

```js
// astro.config.mjs
import sapphireCms from '@sapphirelabs/blog-cms-astro';

export default defineConfig({
  integrations: [
    sapphireCms({
      config: {
        site_title: 'My blog',
        backend: { name: 'github', repo: 'me/site', branch: 'main', base_url: 'https://…workers.dev' },
        editor: { colors: ['#2f3e46', '#b5651d'] }, // site palette
      },
      // Optional: without this, every collection shows up.
      collections: {
        blog: { label: 'Blog', label_singular: 'post', fields: { cover: { widget: 'image' } } },
      },
    }),
  ],
});
```

Fields are read from the Zod schema in `src/content.config.ts`:

| In the schema | In the panel |
|---|---|
| `.describe('Title')` | field label |
| `.max(160)` | character counter and limit |
| `z.coerce.date()` | date picker |
| `.optional()` / `.default()` | optional field / initial value |
| `z.enum([...])` | list of options |
| a name like `cover` or `image` | image upload |

## Using it with Next.js (App Router)

```bash
npm install @sapphirelabs/blog-cms-next
```

**1. Panel at `/admin`:** create `app/admin/route.ts`:

```ts
import { createAdminRoute } from '@sapphirelabs/blog-cms-next/admin';

export const { GET } = createAdminRoute();
export const dynamic = 'force-static';
```

and put the configuration in `public/admin/config.yml` (see `examples/next-blog/public/admin/config.yml`).

**2. Post list and post page:**

```tsx
// app/blog/[slug]/page.tsx
import { notFound } from 'next/navigation';
import { getPost, getSlugs, SapphireContent } from '@sapphirelabs/blog-cms-next';

export async function generateStaticParams() {
  return (await getSlugs('content/blog')).map((slug) => ({ slug }));
}

export default async function Post({ params }: { params: Promise<{ slug: string }> }) {
  const post = await getPost('content/blog', (await params).slug);
  if (!post) notFound();

  return (
    <main>
      <h1>{post.data.title as string}</h1>
      <SapphireContent source={post.body} />
    </main>
  );
}
```

`getPosts('content/blog')` returns every post, newest first. Posts with `draft: true` show up in `next dev` and stay out of the published site. `SapphireContent` already understands the HTML the editor writes (color, underline, alignment, videos).

## Reading theme (`prose.css`)

Many sites (especially with Tailwind) reset the styles of headings, lists and tables, and posts come out unstyled. `prose.css` gives the text the same look as the editor:

```tsx
// app/layout.tsx (Next)
import '@sapphirelabs/blog-cms-next/prose.css';
```

On any other site, use the `prose.css` file that sits next to `sapphire-cms.js` and wrap the post in `<article class="sapphire-prose">`. `SapphireContent` already uses that class. To match your site:

```css
.sapphire-prose {
  --sp-accent: #b5651d;     /* links and quotes */
  --sp-font: Georgia, serif;
  --sp-measure: 70ch;       /* max text width */
}
```

Colors derive from the text color, so dark mode works on its own, and any site rule wins over the theme.

## Using it on any site (Hugo, Eleventy, Angular…)

Create `public/admin/index.html` loading `sapphire-cms.js` and put a Decap-style `config.yml` in the same folder:

```html
<!doctype html>
<html><head><meta charset="utf-8"><meta name="robots" content="noindex"></head>
<body><script src="https://unpkg.com/@sapphirelabs/blog-cms/dist/sapphire-cms.js"></script></body></html>
```

## How text is saved

Text is saved as Markdown. Whatever Markdown lacks goes in as inline HTML, which Astro, Next, Hugo and Eleventy render with no extra setup:

```md
Text with **bold**, <u>underline</u> and <span style="color: #b5651d">color</span>.

<p style="text-align: center">Centered.</p>
```

HTML the editor cannot edit, such as a custom `<div>` from an older post, shows up as a protected block and is saved exactly as it was.

## Security

Editors who sign in with Google can only change content and media inside the folders you allow, and the worker rejects posts with scripts. `SapphireContent` sanitizes HTML by default. Read [SECURITY.md](SECURITY.md) for the full model, a checklist for site owners, and how to report a vulnerability.

## Commands

```bash
pnpm test        # panel, worker and integration tests
pnpm typecheck
pnpm build
```

The panel's themes (dark, light and kawaii pink) come from [`@sapphirelabs/ui`](https://github.com/sapphire-labs-dev/sapphire-ui), shared with the Sapphire Labs sites. It is a build-time dependency only (bundled into `dist/`). Until it is published on npm, clone it next to this repository (`../sapphire-ui`) before `pnpm install`.

## Roadmap

- Single-file collections (`files`) and `object`/`list` fields with subfields
- Optional MDX
- Analog (Angular) integration
- Preview with the site CSS

## License

[MIT](LICENSE)
