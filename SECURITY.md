# Security

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report them privately through
[GitHub's private vulnerability reporting](https://github.com/sapphire-labs-dev/sapphire-blog-cms/security/advisories/new).
We aim to reply within a few days and will credit you in the fix unless you prefer otherwise.

## Security model

Sapphire Blog CMS has no server or database of its own: content lives in your Git repository, the
panel runs in the browser, and a small Cloudflare Worker (`packages/auth-worker`) handles sign-in.

### GitHub sign-in

- Editors use their own GitHub account and need write access to the repository.
- The worker only exchanges the OAuth code for a token. It hands the token to the panel through a
  popup, and only to a window on the same domain that started the sign-in.
- **The token uses the `repo` scope**, which GitHub grants for every repository the editor can access,
  and it is kept in the browser's `localStorage` on the site's domain. This is how Decap and Sveltia
  work too. Prefer Google sign-in for people who should only edit content.

### Google sign-in

- Editors do not need a GitHub account. The worker checks the e-mail against the site's list (KV),
  issues its own session (HMAC-signed, 30 days) and commits through a GitHub App limited to
  **Contents: read & write** on the repositories where you installed it.
- The list is checked on every request: removing an editor takes effect immediately. Rotating
  `SESSION_SECRET` signs everyone out.
- What editors can do is limited on the server, not just in the panel:
  - they can only read and write inside the site's `paths`, and only commit to its `branch` (if set);
  - they can only save content and media files, never code, build or deploy configuration, SVG,
    HTML or anything in a hidden folder (`.github`, `.env`…);
  - posts with scripts, event handlers, `javascript:` / `data:` links or non-YouTube iframes are rejected.
- Each commit is authored by the App, with the editor as `Co-authored-by`.

### Rendering posts

- The panel never runs HTML from posts: unknown HTML is shown as plain text.
- `SapphireContent` (`@sapphirelabs/blog-cms-next`) sanitizes HTML by default, keeping only what the
  editor produces. `allowUnsafeHtml` turns that off; use it only if every editor is fully trusted.
- Astro, Hugo and Eleventy render HTML inside Markdown as is. The worker's content checks protect
  sites that only use Google sign-in; editors who sign in with GitHub can already change any file.

## Checklist for site owners

- [ ] `ALLOWED_DOMAINS` lists only your sites (a bare `*` is ignored on purpose). Remove `localhost` in production.
- [ ] `SESSION_SECRET` is random and at least 32 characters long.
- [ ] Every site in KV has `paths` set to its content and media folders.
- [ ] The GitHub App has only **Contents: read & write** and is installed only on the sites' repositories.
- [ ] The GitHub App private key and the OAuth secrets are stored only as Worker secrets, never in the repository.
- [ ] Pin the panel version when loading it from a CDN (e.g. `@sapphirelabs/blog-cms@1.0.0`), so a
      new release cannot change your admin page without you noticing.
- [ ] Protect your production branch and review what editors publish if your site is high-profile.
