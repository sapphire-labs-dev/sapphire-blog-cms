/**
 * Repository access through the GitHub App. Editors who sign in with Google have no GitHub account,
 * so the worker reads and writes on behalf of the App, which must be installed on the repository
 * with "Contents: read & write".
 */

import { signRs256 } from './crypto';

export interface AppEnv {
  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  GITHUB_API_ROOT?: string;
}

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

const tokens = new Map<string, { token: string; expires: number }>();
const READ_BATCH = 50;

const apiRoot = (env: AppEnv) => (env.GITHUB_API_ROOT ?? 'https://api.github.com').replace(/\/$/, '');

async function call(env: AppEnv, path: string, auth: string, init: RequestInit = {}, accept = 'application/vnd.github+json') {
  const response = await fetch(`${apiRoot(env)}${path}`, {
    ...init,
    headers: {
      Accept: accept,
      Authorization: `Bearer ${auth}`,
      'User-Agent': 'sapphire-cms-auth',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });

  if (!response.ok) {
    let message = `GitHub responded ${response.status}`;

    try {
      message = ((await response.json()) as { message?: string }).message ?? message;
    } catch {
      //
    }

    throw new GitHubError(message, response.status === 404 ? 404 : 502);
  }

  return response;
}

/** App installation token for a repository, cached until shortly before it expires. */
export async function installationToken(env: AppEnv, repo: string): Promise<string> {
  const cached = tokens.get(repo);

  if (cached && cached.expires > Date.now() + 5 * 60_000) {
    return cached.token;
  }

  if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY) {
    throw new GitHubError('The GitHub App is not configured on the worker (GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY are missing).', 500);
  }

  const now = Math.floor(Date.now() / 1000);
  const appJwt = await signRs256({ iat: now - 60, exp: now + 540, iss: env.GITHUB_APP_ID }, env.GITHUB_APP_PRIVATE_KEY);

  let installation: { id: number };

  try {
    installation = await (await call(env, `/repos/${repo}/installation`, appJwt)).json();
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) {
      throw new GitHubError(`The GitHub App is not installed on ${repo}.`, 403);
    }

    throw error;
  }

  const result: { token: string; expires_at: string } = await (
    await call(env, `/app/installations/${installation.id}/access_tokens`, appJwt, {
      method: 'POST',
      body: JSON.stringify({ repositories: [repo.split('/')[1]], permissions: { contents: 'write' } }),
    })
  ).json();

  tokens.set(repo, { token: result.token, expires: Date.parse(result.expires_at) });

  return result.token;
}

async function graphql<T>(env: AppEnv, token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await call(env, '/graphql', token, { method: 'POST', body: JSON.stringify({ query, variables }) });
  const result: { data?: T; errors?: { message: string }[] } = await response.json();

  if (result.errors?.length) {
    throw new GitHubError(result.errors.map((e) => e.message).join('; '));
  }

  return result.data as T;
}

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

export class RepoClient {
  constructor(
    private readonly env: AppEnv,
    private readonly token: string,
    readonly repo: string,
  ) {}

  async tree(branch: string) {
    const result: { tree: { path: string; type: string; sha: string }[] } = await (
      await call(this.env, `/repos/${this.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, this.token)
    ).json();

    return result.tree.filter((item) => item.type === 'blob').map(({ path, sha }) => ({ path, sha }));
  }

  async read(branch: string, paths: string[]) {
    const [owner, name] = this.repo.split('/');
    const files: Record<string, string> = {};

    for (let i = 0; i < paths.length; i += READ_BATCH) {
      const chunk = paths.slice(i, i + READ_BATCH);
      const fields = chunk
        .map((path, j) => `f${j}: object(expression: ${JSON.stringify(`${branch}:${path}`)}) { ... on Blob { text } }`)
        .join('\n');
      const data = await graphql<{ repository: Record<string, { text: string | null } | null> }>(
        this.env,
        this.token,
        `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields} } }`,
        { owner, name },
      );

      chunk.forEach((path, j) => {
        const text = data.repository[`f${j}`]?.text;

        if (typeof text === 'string') {
          files[path] = text;
        }
      });
    }

    return files;
  }

  blob(branch: string, path: string) {
    return call(
      this.env,
      `/repos/${this.repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`,
      this.token,
      {},
      'application/vnd.github.raw+json',
    );
  }

  /** A single commit, signed by the App, with the editor as co-author. */
  async commit(input: {
    branch: string;
    message: string;
    additions: { path: string; contents: string }[];
    deletions: string[];
    author: { name: string; email: string };
  }) {
    const ref: { object: { sha: string } } = await (
      await call(this.env, `/repos/${this.repo}/git/ref/heads/${encodeURIComponent(input.branch)}`, this.token)
    ).json();
    const data = await graphql<{ createCommitOnBranch: { commit: { url: string } } }>(
      this.env,
      this.token,
      `mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { url } } }`,
      {
        input: {
          branch: { repositoryNameWithOwner: this.repo, branchName: input.branch },
          message: { headline: input.message, body: coAuthor(input.author) },
          expectedHeadOid: ref.object.sha,
          fileChanges: { additions: input.additions, deletions: input.deletions.map((path) => ({ path })) },
        },
      },
    );

    return { url: data.createCommitOnBranch.commit.url };
  }
}

export function coAuthor({ name, email }: { name: string; email: string }) {
  return `Co-authored-by: ${name.replace(/[<>\n]/g, '')} <${email}>`;
}
