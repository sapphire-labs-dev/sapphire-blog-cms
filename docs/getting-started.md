# Getting started: your own CMS, from scratch

This guide sets up everything on your own accounts: your worker, your sign-in, your blog. Follow the
steps in order. It takes about 30 minutes the first time.

## What you need

| Account | What for | Cost |
|---|---|---|
| GitHub | Your site's repository (the CMS saves posts there as commits) | Free |
| Cloudflare | The sign-in worker | Free plan is enough |
| Google Cloud | Only if editors will sign in with Google | Free |

Tools: Node.js 20+ and git. You do not need to build anything: the panel is published on npm and served
from a CDN, and the worker is deployed straight from its source.

| Package | What it is |
|---|---|
| [`@sapphirelabs/blog-cms`](https://www.npmjs.com/package/@sapphirelabs/blog-cms) | The panel (`sapphire-cms.js`) and the reading theme (`prose.css`), also on the CDN: `https://unpkg.com/@sapphirelabs/blog-cms@1.0.0/dist/sapphire-cms.js` |
| [`@sapphirelabs/blog-cms-next`](https://www.npmjs.com/package/@sapphirelabs/blog-cms-next) | Next.js integration |
| [`@sapphirelabs/blog-cms-astro`](https://www.npmjs.com/package/@sapphirelabs/blog-cms-astro) | Astro integration |

Always pin the version you tested (`@1.0.0` above) and check
[the latest release on npm](https://www.npmjs.com/package/@sapphirelabs/blog-cms?activeTab=versions) when you set things up.

## How it fits together

```
your site (Next, Astro, …)          your worker (Cloudflare)          GitHub
  /admin  ── sign-in popup ──────▶  /auth, /callback  ───────────▶  OAuth / GitHub App
  /admin  ── read & save posts ───────────────────────────────────▶  your repository
                (GitHub sign-in: straight to GitHub; Google sign-in: through the worker)
```

- **GitHub sign-in:** editors use their own GitHub account (they need write access to the repository).
- **Google sign-in:** editors only need a Google account; the worker checks the e-mail and commits through a GitHub App.

You can enable either one or both.

---

## 1. Deploy your worker

The worker is the only part you take from this repository. It has no dependencies and no build step:
Wrangler deploys its TypeScript source directly.

```bash
git clone https://github.com/sapphire-labs-dev/sapphire-blog-cms.git
cd sapphire-blog-cms/packages/auth-worker
cp wrangler.jsonc wrangler.local.jsonc   # ignored by git: your personal settings go here
npx wrangler login
```

To get updates later, `git pull` and deploy again.

Edit `wrangler.local.jsonc`:

- `"name"`: any name, e.g. `my-blog-auth`. The worker will live at `https://my-blog-auth.<your-subdomain>.workers.dev`.
- `"ALLOWED_DOMAINS"`: the domains of the sites that will use the CMS, comma-separated, e.g.
  `"localhost, myblog.com, *.myblog.com"`. Keep `localhost` while testing; remove it in production.

Deploy and note the URL it prints:

```bash
npx wrangler deploy -c wrangler.local.jsonc
```

Opening that URL should show `Sapphire Blog CMS auth: ok`. Below, `WORKER_URL` means this address.

## 2. Set up sign-in

### Option A: GitHub sign-in

1. GitHub → Settings → Developer settings → **OAuth Apps** → New OAuth App.
   - Homepage URL: your site.
   - Authorization callback URL: `WORKER_URL/callback`
2. Copy the **Client ID**, generate a **Client secret**, and store both in the worker:
   ```bash
   npx wrangler secret put GITHUB_CLIENT_ID -c wrangler.local.jsonc
   npx wrangler secret put GITHUB_CLIENT_SECRET -c wrangler.local.jsonc
   ```

### Option B: Google sign-in

Follow [google-sign-in.md](google-sign-in.md). In short: a Google OAuth client, a GitHub App installed on
your repository, a KV namespace listing who can edit (and which folders), and five worker secrets.

## 3. Add the CMS to your site

Nothing to build: install the integration from npm, and the panel loads from the CDN.

### Next.js (App Router)

A complete working example lives in [`examples/next-blog`](../examples/next-blog).

```bash
npm install @sapphirelabs/blog-cms-next
```

1. **The panel at `/admin`**: create `app/admin/route.ts`:
   ```ts
   import { createAdminRoute } from '@sapphirelabs/blog-cms-next/admin';

   // The panel comes from the CDN. Pin the version you tested; without scriptUrl, the latest one loads.
   export const { GET } = createAdminRoute({
     scriptUrl: 'https://unpkg.com/@sapphirelabs/blog-cms@1.0.0/dist/sapphire-cms.js',
   });
   export const dynamic = 'force-static';
   ```
2. **The configuration**: create `public/admin/config.yml` (see [the reference below](#4-configyml-reference)).
3. **Your posts**: Markdown files in `content/blog/`, e.g. `content/blog/hello.md`:
   ```md
   ---
   title: Hello
   pubDate: 2026-01-01
   ---

   My first post.
   ```
4. **The pages**: copy `app/blog/[slug]/page.tsx` and `app/page.tsx` from the example, or use the helpers directly:
   ```tsx
   import { getPost, getPosts, getSlugs, SapphireContent } from '@sapphirelabs/blog-cms-next';

   const posts = await getPosts('content/blog');          // newest first, drafts hidden in production
   const post = await getPost('content/blog', 'hello');   // null if missing
   <SapphireContent source={post.body} />                  // sanitized HTML, wrapped in .sapphire-prose
   ```
5. **The reading theme**: in `app/layout.tsx`, `import '@sapphirelabs/blog-cms-next/prose.css';`

### Astro

A complete working example lives in [`examples/astro-blog`](../examples/astro-blog).

```bash
npm install @sapphirelabs/blog-cms-astro
```

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import sapphireCms from '@sapphirelabs/blog-cms-astro';

export default defineConfig({
  integrations: [
    sapphireCms({
      config: {
        site_title: 'My blog',
        backend: { name: 'github', repo: 'me/my-blog', branch: 'main', base_url: 'WORKER_URL', login_methods: ['google', 'github'] },
        local_backend: true,
        media_folder: 'public/uploads',
      },
    }),
  ],
});
```

The integration creates `/admin` (serving the panel from the installed package, no CDN needed) and reads
the fields from your content collections
(`src/content.config.ts`): `.describe()` becomes the label and `.max()` turns on the character counter.

### Any other site (Hugo, Eleventy, plain HTML…)

Create `admin/index.html` in the folder your site publishes as is (`public/`, `static/`…):

```html
<!doctype html>
<html>
  <head><meta charset="utf-8"><meta name="robots" content="noindex"><title>CMS</title></head>
  <body><script src="https://unpkg.com/@sapphirelabs/blog-cms@1.0.0/dist/sapphire-cms.js"></script></body>
</html>
```

and put `config.yml` next to it. That is all: the panel loads from the CDN. Render posts with any Markdown
library that allows inline HTML, and add the reading theme from the CDN too:

```html
<link rel="stylesheet" href="https://unpkg.com/@sapphirelabs/blog-cms@1.0.0/dist/prose.css">
```

## 4. `config.yml` reference

The format is compatible with Decap/Sveltia. A complete example:

```yaml
site_title: My blog
locale: en                      # en or pt-BR; default: the browser language

backend:
  name: github
  repo: me/my-blog              # owner/repository
  branch: main
  base_url: WORKER_URL
  login_methods: [google, github]   # default: [github]

local_backend: true             # on localhost, offers "Open project folder" (Chrome/Edge, no sign-in)

media_folder: public/uploads    # where uploaded images are saved in the repository
public_folder: /uploads         # how the site links to them

editor:
  colors: ['#2f3e46', '#b5651d']   # your palette for the color button

media_compression:
  enabled: true                 # images are converted to WebP in the browser
  max_width: 1920
  quality: 0.82

collections:
  - name: blog
    label: Blog
    label_singular: post
    folder: content/blog        # where the posts live in the repository
    create: true                # allow new posts
    slug: '{{slug}}'            # or '{{year}}-{{month}}-{{day}}-{{slug}}'
    fields:
      - { name: title, label: Title, widget: string }
      - { name: description, label: Summary, widget: text, maxlength: 160 }
      - { name: pubDate, label: Publish date, widget: datetime, time_format: false, date_format: YYYY-MM-DD }
      - { name: cover, label: Cover image, widget: image, required: false }
      - { name: tags, label: Tags, widget: list, required: false }
      - { name: draft, label: Draft, widget: boolean, default: false }
      - { name: body, label: Body, widget: markdown }
```

### Widgets

| Widget | Saves | Options |
|---|---|---|
| `string` | One line of text | `maxlength`, `minlength` (shows a counter) |
| `text` | Several lines of text | `maxlength`, `minlength` |
| `markdown` / `richtext` | The post body (rich text editor) | Name it `body` to save it below the front matter |
| `datetime` / `date` | A date, optionally with time | `date_format` (e.g. `YYYY-MM-DD`), `time_format: false` |
| `boolean` | `true` / `false` | A field named `draft` marks drafts in the list |
| `number` | A number | `value_type: int` or `float`, `min`, `max`, `step` |
| `select` | One value from a list (or several) | `options: [a, b]` or `[{ label, value }]`, `multiple` |
| `image` / `file` | A path to an uploaded file | Uses `media_folder` / `public_folder` |
| `list` | A list of short texts, such as tags | |
| `hidden` | A fixed value the editor does not see | `default` |

Every field also accepts `label`, `hint`, `default` and `required` (default `true`).

## 5. Try it

1. **Locally, without sign-in:** run your site (`npm run dev`), open `http://localhost:<port>/admin` in
   Chrome or Edge, click **Open project folder** and pick your project folder. Saving writes straight to
   your files.
2. **With sign-in:** deploy your site, make sure its domain is in `ALLOWED_DOMAINS` (redeploy the worker
   after changing it), open `https://yoursite.com/admin` and sign in. Each save creates a commit, and
   your host (Vercel, Netlify, Cloudflare…) rebuilds the site.

## Troubleshooting

| Message | Fix |
|---|---|
| `The domain … is not allowed on this authenticator` | Add the site's domain to `ALLOWED_DOMAINS` and redeploy the worker. |
| `redirect_uri_mismatch` (Google) or a GitHub callback error | The callback URL must be exactly `WORKER_URL/callback`. |
| `The repository … is not registered` | Add the `owner/repo` key to the `SITES` KV namespace (Google sign-in). |
| `… does not have access to this site` | Add the e-mail to `editors` in KV. |
| `The GitHub App is not installed on …` | Install your GitHub App on the repository. |
| `Google sign-in is not configured …` | A Google secret is missing, `SESSION_SECRET` is shorter than 32 characters, or KV is not bound. |
| `Editors cannot change files outside …` | The collection `folder` or `media_folder` is not inside the KV `paths`. |
| `… was not saved: <script> tags are not allowed` | The post contains HTML that could run code; remove it. |
| `Your account … does not have write access` | GitHub sign-in needs write access to the repository. |
| The browser blocked the sign-in window | Allow pop-ups for your site. |

Before going live, read [SECURITY.md](../SECURITY.md) and go through the checklist for site owners.
