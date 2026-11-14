import type { BackendConfig, FileChange, User } from '../types';
import { authorizeWithPopup } from './auth-popup';
import { bytesToBase64 } from './github';
import { BackendError, type Backend, type CommitResult, type RepoFile } from './types';

const STORAGE_KEY = 'sapphire-cms.session';

/**
 * Google sign-in: editors do not need a GitHub account. The panel only talks to the worker,
 * which checks the e-mail and reads/writes the repository through the GitHub App.
 */
export class GatewayBackend implements Backend {
  readonly name = 'gateway';
  private token: string | null = null;
  private readonly root: string;

  constructor(private readonly config: BackendConfig) {
    this.root = (config.base_url ?? '').replace(/\/$/, '');
  }

  static hasSession() {
    try {
      return Boolean(localStorage.getItem(STORAGE_KEY));
    } catch {
      return false;
    }
  }

  private async request(path: string, init: RequestInit = {}) {
    const response = await fetch(`${this.root}${path}`, {
      ...init,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });

    if (!response.ok) {
      let message = `The server responded ${response.status}`;

      try {
        message = ((await response.json()) as { error?: string }).error ?? message;
      } catch {
        //
      }

      throw new BackendError(message, response.status);
    }

    return response;
  }

  private query(extra: Record<string, string> = {}) {
    return new URLSearchParams({ branch: this.config.branch, ...extra }).toString();
  }

  private async loadUser(): Promise<User> {
    const me = (await (await this.request('/api/me')).json()) as User & { repo: string };

    if (me.repo !== this.config.repo?.toLowerCase()) {
      throw new BackendError('The saved session belongs to another site.', 401);
    }

    return { login: me.login, name: me.name, avatarUrl: me.avatarUrl };
  }

  async restore() {
    this.token = localStorage.getItem(STORAGE_KEY);

    if (!this.token) {
      return null;
    }

    try {
      return await this.loadUser();
    } catch (error) {
      if (error instanceof BackendError && (error.status === 401 || error.status === 403)) {
        await this.logout();

        return null;
      }

      throw error;
    }
  }

  async login() {
    if (!this.root) {
      throw new Error('Set "backend.base_url" to the URL of the authentication worker.');
    }

    const params = new URLSearchParams({ provider: 'google', site_id: window.location.hostname, repo: this.config.repo ?? '' });
    const { token } = await authorizeWithPopup({ provider: 'google', authUrl: `${this.root}/auth?${params}` });

    this.token = token;
    const user = await this.loadUser();

    localStorage.setItem(STORAGE_KEY, token);

    return user;
  }

  async logout() {
    this.token = null;
    localStorage.removeItem(STORAGE_KEY);
  }

  async listFiles(folder: string): Promise<RepoFile[]> {
    const { files } = (await (await this.request(`/api/tree?${this.query()}`)).json()) as { files: RepoFile[] };
    const prefix = folder ? `${folder}/` : '';


    return files.filter((file) => file.path.startsWith(prefix) && !file.path.slice(prefix.length).includes('/'));
  }

  async readTextFiles(paths: string[]) {
    const { files } = (await (
      await this.request('/api/read', { method: 'POST', body: JSON.stringify({ branch: this.config.branch, paths }) })
    ).json()) as { files: Record<string, string> };

    return new Map(Object.entries(files));
  }

  async readBinary(path: string) {
    return (await this.request(`/api/blob?${this.query({ path })}`)).blob();
  }

  async commit({ message, changes, deletions }: { message: string; changes: FileChange[]; deletions: string[] }) {
    const encoder = new TextEncoder();
    const additions = changes.map(({ path, content }) => ({
      path,
      contents: bytesToBase64(typeof content === 'string' ? encoder.encode(content) : content),
    }));
    const result = (await (
      await this.request('/api/commit', {
        method: 'POST',
        body: JSON.stringify({ branch: this.config.branch, message, additions, deletions }),
      })
    ).json()) as CommitResult;


    return result;
  }
}
