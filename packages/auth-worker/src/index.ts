/**
 * Sapphire Blog CMS authenticator.
 *
 * 1. GitHub login: the panel runs only in the browser and cannot hold the "client secret". This
 *    worker does the part of OAuth that needs the secret and hands the token back through the
 *    Netlify/Decap popup protocol (the same one Sveltia uses), so it also works with Decap and Sveltia.
 * 2. Google login: for editors without a GitHub account. The worker checks that the e-mail is on the
 *    site's list, issues its own session, and reads and commits through the GitHub App.
 *
 * Routes:
 *   GET  /auth?provider=github&site_id=mysite.com&scope=repo     → redirects to GitHub
 *   GET  /auth?provider=google&site_id=mysite.com&repo=owner/rep → redirects to Google
 *   GET  /callback?code=…&state=…                                → finishes the login (both)
 *   GET  /api/me · GET /api/tree · POST /api/read · GET /api/blob · POST /api/commit
 */

import { decodeJwtPayload, signHs256, verifyHs256 } from './crypto';
import { GitHubError, installationToken, RepoClient, type AppEnv } from './github-app';
import { canRead, dangerousContent, decodeBase64Text, isTextFile, writeError, type SiteConfig } from './policy';

/** The part of Cloudflare KV we use. */
export interface KV {
  get(key: string): Promise<string | null>;
}

export interface Env extends AppEnv {
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  /** Domains allowed to use the authenticator, comma-separated. Accepts "*.domain.com". */
  ALLOWED_DOMAINS?: string;
  /** For GitHub Enterprise. Default: github.com */
  GITHUB_HOSTNAME?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Long random secret (at least 32 characters) used to sign Google login sessions. */
  SESSION_SECRET?: string;
  /** Key "owner/repo" → {"editors": ["ana@example.com"], "paths": ["src/content/", "public/uploads/"]}. */
  SITES?: KV;
}

type Provider = 'github' | 'google';

export interface Session {
  email: string;
  name: string;
  picture?: string;
  repo: string;
  exp: number;
}

const COOKIE = 'scms_auth';
const SESSION_DAYS = 30;
const MIN_SECRET_LENGTH = 32;

/** The session secret, or null if it is missing or too short to be safe. */
const sessionSecret = (env: Env) => (env.SESSION_SECRET && env.SESSION_SECRET.length >= MIN_SECRET_LENGTH ? env.SESSION_SECRET : null);

/** Decap and Sveltia send this site_id when running on localhost. */
const NETLIFY_LOCAL_SITE_ID = 'cms.netlify.com';
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

export function isAllowedDomain(domain: string, allowed: string | undefined): boolean {
  if (!allowed?.trim()) {
    return false;
  }

  const host = domain.toLowerCase();

  return allowed
    .split(',')
    // Also accepts "https://mysite.com/" and "mysite.com:443", reducing them to the domain.
    .map((pattern) =>
      pattern
        .trim()
        .toLowerCase()
        .replace(/^[a-z]+:\/\//, '')
        .replace(/[/:].*$/, ''),
    )
    // A bare "*" is ignored on purpose: it would let any website receive sign-in tokens.
    .filter((pattern) => pattern && pattern !== '*')
    .some((pattern) => {
      if (pattern.startsWith('*.')) {
        return host.endsWith(pattern.slice(1)) || host === pattern.slice(2);
      }

      return host === pattern;
    });
}

/** Hostnames the panel may receive the token on, given the request's site_id. */
export function originHostsFor(siteId: string): string[] {
  return siteId === NETLIFY_LOCAL_SITE_ID || LOCAL_HOSTS.includes(siteId) ? LOCAL_HOSTS : [siteId];
}

/** Exact e-mail or "*@domain.com". */
export function isEditor(email: string, editors: unknown): boolean {
  const address = email.trim().toLowerCase();
  const domain = address.split('@')[1];

  return (
    Array.isArray(editors) &&
    editors.some((entry) => {
      const value = String(entry).trim().toLowerCase();

      return value === address || (value.startsWith('*@') && value.slice(2) === domain);
    })
  );
}

/** The site's settings from KV, or null if the repository is not registered. */
async function siteOf(env: Env, repo: string): Promise<SiteConfig | null> {
  const raw = await env.SITES?.get(repo.toLowerCase());

  if (!raw) {
    return null;
  }

  try {
    const site = JSON.parse(raw) as Partial<SiteConfig>;

    return {
      editors: Array.isArray(site.editors) ? site.editors : [],
      paths: Array.isArray(site.paths) ? site.paths.map(String) : undefined,
      branch: typeof site.branch === 'string' ? site.branch : undefined,
    };
  } catch {
    // A broken entry locks everyone out instead of opening the site up.
    return { editors: [] };
  }
}

const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
const isRepo = (value: string) => /^[\w.-]+\/[\w.-]+$/.test(value);

/**
 * Page shown in the popup. It announces itself to the panel and only hands the result to the window
 * whose origin matches the site that started the login, so no other site can capture the token.
 */
export function popupPage(
  status: 'success' | 'error',
  content: Record<string, unknown>,
  siteId: string | null,
  provider: Provider = 'github',
) {
  const message = `authorization:${provider}:${status}:${JSON.stringify(content)}`;
  const script = `
(() => {
  const message = ${json(message)};
  const hosts = ${json(siteId ? originHostsFor(siteId) : [])};
  const handshake = ${json(`authorizing:${provider}`)};

  if (!window.opener) {
    document.body.textContent = 'This window must be opened by the CMS panel. You can close it.';
    return;
  }

  window.addEventListener('message', (event) => {
    if (event.data !== handshake || event.source !== window.opener) return;
    let host = '';
    try { host = new URL(event.origin).hostname; } catch {}
    if (hosts.length && !hosts.includes(host)) return;
    window.opener.postMessage(message, event.origin);
  });

  window.opener.postMessage(handshake, '*');
})();`;

  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Sign in</title></head><body><p>Finishing sign-in…</p><script>${script}</script></body></html>`,
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'",
        'Cache-Control': 'no-store',
        'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
      },
    },
  );
}

function readCookie(request: Request, name: string) {
  const header = request.headers.get('Cookie') ?? '';

  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');

    if (key === name) {
      return decodeURIComponent(rest.join('='));
    }
  }

  return null;
}

const redirect = (location: string, cookie: string) =>
  new Response(null, {
    status: 302,
    headers: {
      Location: location,
      // Valid for 10 minutes, for this worker only.
      'Set-Cookie': `${COOKIE}=${encodeURIComponent(cookie)}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
    },
  });

async function handleAuth(request: Request, env: Env) {
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider');
  const siteId = url.searchParams.get('site_id') ?? '';

  if (provider !== 'github' && provider !== 'google') {
    return popupPage('error', { error: `Unsupported provider: ${provider}`, errorCode: 'UNSUPPORTED_BACKEND' }, null);
  }

  const fail = (error: string, errorCode: string) => popupPage('error', { error, errorCode }, null, provider);
  const checkedDomain = siteId === NETLIFY_LOCAL_SITE_ID ? 'localhost' : siteId;

  if (!siteId || !isAllowedDomain(checkedDomain, env.ALLOWED_DOMAINS)) {
    return fail(`The domain ${siteId} is not allowed on this authenticator.`, 'UNSUPPORTED_DOMAIN');
  }

  const state = crypto.randomUUID();
  const callback = `${url.origin}/callback`;

  if (provider === 'google') {
    const repo = url.searchParams.get('repo') ?? '';

    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !sessionSecret(env) || !env.SITES) {
      return fail(
        `Google sign-in is not configured on this authenticator (SESSION_SECRET must have at least ${MIN_SECRET_LENGTH} characters).`,
        'MISCONFIGURED_CLIENT',
      );
    }

    if (!isRepo(repo) || !(await siteOf(env, repo))) {
      return fail(`The repository ${repo} is not registered on this authenticator.`, 'UNKNOWN_SITE');
    }

    const authorize = new URL('https://accounts.google.com/o/oauth2/v2/auth');

    authorize.search = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: callback,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    }).toString();

    return redirect(authorize.href, `${state}|${siteId}|google|${repo}`);
  }

  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return fail('The authenticator is not configured (GitHub secrets are missing).', 'MISCONFIGURED_CLIENT');
  }

  const authorize = new URL(`https://${env.GITHUB_HOSTNAME ?? 'github.com'}/login/oauth/authorize`);

  authorize.search = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    scope: url.searchParams.get('scope') || 'repo',
    state,
    redirect_uri: callback,
  }).toString();

  return redirect(authorize.href, `${state}|${siteId}|github`);
}

async function githubCallback(code: string, siteId: string, url: URL, env: Env) {
  let result: { access_token?: string; error?: string; error_description?: string };

  try {
    const response = await fetch(`https://${env.GITHUB_HOSTNAME ?? 'github.com'}/login/oauth/access_token`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'sapphire-cms-auth' },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${url.origin}/callback`,
      }),
    });

    result = await response.json();
  } catch {
    return popupPage('error', { error: 'Could not reach GitHub.', errorCode: 'TOKEN_REQUEST_FAILED' }, siteId);
  }

  if (!result.access_token) {
    return popupPage(
      'error',
      { error: result.error_description ?? result.error ?? 'GitHub did not return a token.', errorCode: 'TOKEN_REQUEST_FAILED' },
      siteId,
    );
  }

  return popupPage('success', { provider: 'github', token: result.access_token }, siteId);
}

interface GoogleIdToken {
  iss: string;
  aud: string;
  exp: number;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

async function googleCallback(code: string, siteId: string, repo: string, url: URL, env: Env) {
  const fail = (error: string, errorCode = 'TOKEN_REQUEST_FAILED') => popupPage('error', { error, errorCode }, siteId, 'google');
  let idToken: string | undefined;

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID ?? '',
        client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
        redirect_uri: `${url.origin}/callback`,
        grant_type: 'authorization_code',
      }),
    });

    idToken = ((await response.json()) as { id_token?: string }).id_token;
  } catch {
    return fail('Could not reach Google.');
  }

  // The id_token came straight from Google over HTTPS, so its signature need not be checked (OIDC 3.1.3.7).
  const claims = idToken ? decodeJwtPayload<GoogleIdToken>(idToken) : null;

  if (
    !claims?.email ||
    claims.email_verified !== true ||
    claims.aud !== env.GOOGLE_CLIENT_ID ||
    !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss) ||
    claims.exp < Date.now() / 1000
  ) {
    return fail('Google did not confirm your e-mail address.');
  }

  if (!isEditor(claims.email, (await siteOf(env, repo))?.editors)) {
    return fail(`The e-mail ${claims.email} does not have access to this site. Ask the site owner to add it.`, 'NOT_AN_EDITOR');
  }

  const session: Session = {
    email: claims.email.toLowerCase(),
    name: claims.name || claims.email,
    picture: claims.picture,
    repo: repo.toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86_400,
  };

  const secret = sessionSecret(env);

  if (!secret) {
    return fail('Google sign-in is not configured on this authenticator.', 'MISCONFIGURED_CLIENT');
  }

  return popupPage('success', { provider: 'google', token: await signHs256(session, secret) }, siteId, 'google');
}

async function handleCallback(request: Request, env: Env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const [expectedState, siteId, provider = 'github', repo = ''] = (readCookie(request, COOKIE) ?? '').split('|');

  if (!code || !state || !expectedState || state !== expectedState || !siteId) {
    return popupPage('error', { error: 'The sign-in expired or was tampered with. Please try again.', errorCode: 'CSRF_DETECTED' }, null);
  }

  return provider === 'google' ? googleCallback(code, siteId, repo, url, env) : githubCallback(code, siteId, url, env);
}

/* API used by the panel after a Google sign-in */

function corsHeaders(request: Request, env: Env): Record<string, string> | null {
  const origin = request.headers.get('Origin');

  if (!origin) {
    return {};
  }

  let host = '';

  try {
    host = new URL(origin).hostname;
  } catch {
    return null;
  }

  const allowed = LOCAL_HOSTS.includes(host) ? isAllowedDomain('localhost', env.ALLOWED_DOMAINS) : isAllowedDomain(host, env.ALLOWED_DOMAINS);

  return allowed
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      }
    : null;
}

const reply = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

interface CommitBody {
  branch?: string;
  message?: string;
  additions?: { path: string; contents: string }[];
  deletions?: string[];
}

async function handleApi(request: Request, env: Env, pathname: string): Promise<Response> {
  const cors = corsHeaders(request, env);

  if (!cors) {
    return new Response('Origin not allowed', { status: 403 });
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  const error = (message: string, status: number) => reply({ error: message }, status, cors);
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const secret = sessionSecret(env);
  const session = secret ? await verifyHs256<Session>(token, secret) : null;

  if (!session) {
    return error('Your session has expired. Please sign in again.', 401);
  }

  // Reads the site on every request, so removing someone (or narrowing the paths) takes effect immediately.
  const site = await siteOf(env, session.repo);

  if (!site || !isEditor(session.email, site.editors)) {
    return error(`The e-mail ${session.email} no longer has access to this site.`, 403);
  }

  const url = new URL(request.url);
  const branchOf = (requested: unknown) => (typeof requested === 'string' && requested ? requested : site.branch ?? 'main');
  const wrongBranch = (branch: string) => (site.branch && branch !== site.branch ? `Editors can only use the ${site.branch} branch.` : null);

  try {
    if (pathname === '/api/me' && request.method === 'GET') {
      return reply({ login: session.email, name: session.name, avatarUrl: session.picture, repo: session.repo }, 200, cors);
    }

    // Created only after a request passes every check, so refused requests never reach GitHub.
    const repo = async () => new RepoClient(env, await installationToken(env, session.repo), session.repo);

    if (pathname === '/api/tree' && request.method === 'GET') {
      const branch = branchOf(url.searchParams.get('branch'));
      const refused = wrongBranch(branch);

      if (refused) {
        return error(refused, 403);
      }

      return reply({ files: (await (await repo()).tree(branch)).filter((file) => canRead(file.path, site)) }, 200, cors);
    }

    if (pathname === '/api/read' && request.method === 'POST') {
      const body = (await request.json()) as { branch?: string; paths?: string[] };
      const branch = branchOf(body.branch);
      const refused = wrongBranch(branch);

      if (refused) {
        return error(refused, 403);
      }

      const paths = (body.paths ?? []).map(String).filter((path) => canRead(path, site));

      return reply({ files: await (await repo()).read(branch, paths) }, 200, cors);
    }

    if (pathname === '/api/blob' && request.method === 'GET') {
      const branch = branchOf(url.searchParams.get('branch'));
      const path = url.searchParams.get('path') ?? '';
      const refused = wrongBranch(branch) ?? (canRead(path, site) ? null : `Editors cannot read ${path}.`);

      if (refused) {
        return error(refused, 403);
      }

      const response = await (await repo()).blob(branch, path);

      return new Response(response.body, {
        headers: {
          ...cors,
          'Content-Type': response.headers.get('Content-Type') ?? 'application/octet-stream',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': 'sandbox',
        },
      });
    }

    if (pathname === '/api/commit' && request.method === 'POST') {
      const body = (await request.json()) as CommitBody;
      const additions = Array.isArray(body.additions) ? body.additions : [];
      const deletions = Array.isArray(body.deletions) ? body.deletions.map(String) : [];
      const branch = branchOf(body.branch);

      if (typeof body.message !== 'string' || !body.message.trim() || (!additions.length && !deletions.length)) {
        return error('Nothing to save.', 400);
      }

      const refused =
        wrongBranch(branch) ??
        [...additions.map((file) => String(file?.path)), ...deletions].map((path) => writeError(path, site)).find(Boolean);

      if (refused) {
        return error(refused, 403);
      }

      for (const file of additions) {
        if (typeof file.contents !== 'string') {
          return error(`Invalid contents for ${file.path}.`, 400);
        }

        if (isTextFile(file.path)) {
          let problem: string | null;

          try {
            problem = dangerousContent(decodeBase64Text(file.contents));
          } catch {
            return error(`Invalid contents for ${file.path}.`, 400);
          }

          if (problem) {
            return error(`${file.path} was not saved: ${problem}.`, 422);
          }
        }
      }

      const result = await (await repo()).commit({
        branch,
        message: body.message.trim().slice(0, 200),
        additions,
        deletions,
        author: { name: session.name, email: session.email },
      });

      return reply(result, 200, cors);
    }

    return error('Route not found.', 404);
  } catch (e) {
    return error((e as Error).message, e instanceof GitHubError ? e.status : 500);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname.startsWith('/api/')) {
      return handleApi(request, env, pathname);
    }

    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    if (pathname === '/auth' || pathname === '/oauth/authorize') {
      return handleAuth(request, env);
    }

    if (pathname === '/callback' || pathname === '/oauth/redirect') {
      return handleCallback(request, env);
    }

    return new Response('Sapphire Blog CMS auth: ok', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  },
};
