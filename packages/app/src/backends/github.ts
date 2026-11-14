import type { BackendConfig, FileChange, User } from '../types';
import { authorizeWithPopup } from './auth-popup';
import { BackendError, type Backend, type CommitResult, type RepoFile } from './types';

const STORAGE_KEY = 'sapphire-cms.github';
const READ_BATCH = 50;

interface TreeItem {
  path: string;
  type: 'blob' | 'tree' | 'commit';
  sha: string;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';

  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }

  return btoa(binary);
}

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

export class GitHubBackend implements Backend {
  readonly name = 'github';
  private token: string | null = null;
  private readonly owner: string;
  private readonly repo: string;
  private readonly branch: string;
  private readonly apiRoot: string;
  private readonly graphqlRoot: string;
  private tree: TreeItem[] | null = null;

  constructor(private readonly config: BackendConfig) {
    [this.owner, this.repo] = (config.repo ?? '').split('/');
    this.branch = config.branch;
    this.apiRoot = (config.api_root ?? 'https://api.github.com').replace(/\/$/, '');
    this.graphqlRoot = config.graphql_api_root ?? `${this.apiRoot}/graphql`;
  }

  private async request<T>(path: string, init: RequestInit = {}, accept = 'application/vnd.github+json') {
    const response = await fetch(path.startsWith('http') ? path : `${this.apiRoot}${path}`, {
      ...init,
      cache: 'no-store',
      headers: {
        Accept: accept,
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...init.headers,
      },
    });

    if (!response.ok) {
      let message = `GitHub responded ${response.status}`;

      try {
        message = ((await response.json()) as { message?: string }).message ?? message;
      } catch {
        //
      }

      throw new BackendError(message, response.status);
    }

    return response as Response & { json(): Promise<T> };
  }

  private async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const response = await this.request<{ data?: T; errors?: { message: string }[] }>(this.graphqlRoot, {
      method: 'POST',
      body: JSON.stringify({ query, variables }),
      headers: { 'Content-Type': 'application/json' },
    });
    const result = await response.json();

    if (result.errors?.length) {
      throw new BackendError(result.errors.map((e: { message: string }) => e.message).join('; '));
    }

    return result.data as T;
  }

  private async loadUser(): Promise<User> {
    const user = await (await this.request<{ login: string; name: string | null; avatar_url: string }>('/user')).json();
    const repo = await (
      await this.request<{ permissions?: { push?: boolean } }>(`/repos/${this.owner}/${this.repo}`)
    ).json();

    if (!repo.permissions?.push) {
      throw new BackendError(`Your account ${user.login} does not have write access to ${this.owner}/${this.repo}.`);
    }

    return { login: user.login, name: user.name ?? user.login, avatarUrl: user.avatar_url };
  }

  async restore() {
    this.token = localStorage.getItem(STORAGE_KEY);

    if (!this.token) {
      return null;
    }

    try {
      return await this.loadUser();
    } catch (error) {
      if (error instanceof BackendError && error.status === 401) {
        await this.logout();

        return null;
      }

      throw error;
    }
  }

  async login() {
    if (!this.config.base_url) {
      throw new Error('Set "backend.base_url" to the URL of the authentication worker.');
    }

    const params = new URLSearchParams({ provider: 'github', site_id: window.location.hostname, scope: 'repo' });
    const authUrl = `${this.config.base_url.replace(/\/$/, '')}/${(this.config.auth_endpoint ?? 'auth').replace(/^\//, '')}?${params}`;
    const { token } = await authorizeWithPopup({ provider: 'github', authUrl });

    this.token = token;
    const user = await this.loadUser();

    localStorage.setItem(STORAGE_KEY, token);

    return user;
  }

  async logout() {
    this.token = null;
    this.tree = null;
    localStorage.removeItem(STORAGE_KEY);
  }

  private async loadTree(force = false): Promise<TreeItem[]> {
    if (!this.tree || force) {
      const result = await (
        await this.request<{ tree: TreeItem[]; truncated: boolean }>(
          `/repos/${this.owner}/${this.repo}/git/trees/${encodeURIComponent(this.branch)}?recursive=1`,
        )
      ).json();

      this.tree = result.tree;
    }

    return this.tree ?? [];
  }

  async listFiles(folder: string): Promise<RepoFile[]> {
    const tree = await this.loadTree(true);
    const prefix = folder ? `${folder}/` : '';

    return tree
      .filter(
        (item) => item.type === 'blob' && item.path.startsWith(prefix) && !item.path.slice(prefix.length).includes('/'),
      )
      .map(({ path, sha }) => ({ path, sha }));
  }

  /** Reads many files per request using GraphQL aliases. */
  async readTextFiles(paths: string[]) {
    const result = new Map<string, string>();

    for (let i = 0; i < paths.length; i += READ_BATCH) {
      const chunk = paths.slice(i, i + READ_BATCH);
      const fields = chunk
        .map((path, j) => `f${j}: object(expression: ${JSON.stringify(`${this.branch}:${path}`)}) { ... on Blob { text } }`)
        .join('\n');
      const data = await this.graphql<{ repository: Record<string, { text: string | null } | null> }>(
        `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields} } }`,
        { owner: this.owner, name: this.repo },
      );

      chunk.forEach((path, j) => {
        const text = data.repository[`f${j}`]?.text;

        if (typeof text === 'string') {
          result.set(path, text);
        }
      });
    }

    return result;
  }

  async readBinary(path: string) {
    const response = await this.request(
      `/repos/${this.owner}/${this.repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(this.branch)}`,
      {},
      'application/vnd.github.raw+json',
    );

    return response.blob();
  }

  async commit({ message, changes, deletions }: { message: string; changes: FileChange[]; deletions: string[] }) {
    const ref = await (
      await this.request<{ object: { sha: string } }>(
        `/repos/${this.owner}/${this.repo}/git/ref/heads/${encodeURIComponent(this.branch)}`,
      )
    ).json();
    const encoder = new TextEncoder();
    const additions = changes.map(({ path, content }) => ({
      path,
      contents: bytesToBase64(typeof content === 'string' ? encoder.encode(content) : content),
    }));
    const data = await this.graphql<{ createCommitOnBranch: { commit: { url: string } } }>(
      `mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { url } } }`,
      {
        input: {
          branch: { repositoryNameWithOwner: `${this.owner}/${this.repo}`, branchName: this.branch },
          message: { headline: message },
          expectedHeadOid: ref.object.sha,
          fileChanges: { additions, deletions: deletions.map((path) => ({ path })) },
        },
      },
    );

    this.tree = null;

    return { url: data.createCommitOnBranch.commit.url } satisfies CommitResult;
  }
}
