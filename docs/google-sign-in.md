# Google sign-in (no GitHub account needed)

Editors sign in with Google. The worker checks that the e-mail is on the site's list and writes to the
repository through the **GitHub App**. Commits are made by the App, with the editor as `Co-authored-by`.

## 1. Google OAuth client
1. At https://console.cloud.google.com create a project and set up the **OAuth consent screen** (External; scopes `openid`, `email`, `profile`). While the app is in "Testing", only the test users you add can sign in; publish it to open it up (these basic scopes need no verification).
2. **Credentials → Create credentials → OAuth client ID → Web application**.
3. Under "Authorized redirect URIs", add `https://YOUR-WORKER.workers.dev/callback`.
4. Keep the **Client ID** and **Client secret**.

## 2. GitHub App
1. https://github.com/settings/apps/new (or your organization's settings)
2. Homepage: your site. Uncheck **Webhook → Active**.
3. Repository permissions: **Contents: Read and write** (Metadata: read comes with it).
4. Under "Where can this GitHub App be installed?", pick **Any account** if other people's sites will use your worker.
5. Create it, note the **App ID** and generate a **private key** (downloads a `.pem`).
6. **Install App** → choose only the sites' repositories.

## 3. Who can edit (KV)
```
cd packages/auth-worker
npx wrangler kv namespace create SITES
```
All commands run in `packages/auth-worker`. Copy the id into your `wrangler.local.jsonc` (the `kv_namespaces` block, commented out in the `wrangler.jsonc` template). Then create an `editors.json` file (ignored by git):
```json
{
  "editors": ["ana@example.com", "*@example.org"],
  "paths": ["src/content/", "public/uploads/"],
  "branch": "main"
}
```
and register each site:
```
npx wrangler kv key put "owner/repo" --binding SITES --remote --path editors.json -c wrangler.local.jsonc
```

| Key | What it does |
|---|---|
| `editors` | Who can sign in. `*@example.org` allows the whole domain. |
| `paths` | **Strongly recommended.** The only folders editors can read and write: your collection folders and `media_folder`. |
| `branch` | If set, editors can only commit to this branch. |

Changes take effect immediately, even for people already signed in.

Whatever `paths` says, editors who sign in with Google can never change code or configuration: they can only save content files (`.md`, `.mdx`, `.json`, `.yml`) and media (images, PDF, audio, video; not SVG or HTML), never `package.json`, lock files, `vercel.json`, `config.yml`, `tsconfig*.json` or anything in a hidden folder such as `.github`. The worker also rejects posts containing scripts, event handlers (`onclick=`…), `javascript:` links or iframes other than YouTube. See [SECURITY.md](../SECURITY.md).

## 4. Worker secrets
```
npx wrangler secret put GOOGLE_CLIENT_ID -c wrangler.local.jsonc
npx wrangler secret put GOOGLE_CLIENT_SECRET -c wrangler.local.jsonc
npx wrangler secret put SESSION_SECRET -c wrangler.local.jsonc   # random text, at least 32 characters
npx wrangler secret put GITHUB_APP_ID -c wrangler.local.jsonc
npx wrangler deploy -c wrangler.local.jsonc
```
Send the private key from the file, so its line breaks are kept:
```
# bash
npx wrangler secret put GITHUB_APP_PRIVATE_KEY -c wrangler.local.jsonc < path/to/key.pem
# PowerShell
Get-Content path\to\key.pem -Raw | npx wrangler secret put GITHUB_APP_PRIVATE_KEY -c wrangler.local.jsonc
```

## 5. The site's config.yml
```yaml
backend:
  name: github
  repo: owner/repo
  branch: main
  base_url: https://YOUR-WORKER.workers.dev
  login_methods: [google, github]   # remove "github" to show only Google
```
