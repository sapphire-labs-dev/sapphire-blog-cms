import type { FileChange } from '../types';
import { BackendError, type Backend, type RepoFile } from './types';

/**
 * Works directly on a folder on the computer (Chrome and Edge), with no sign-in or server.
 * Useful for testing the panel while the site runs with `npm run dev`.
 */
export class LocalBackend implements Backend {
  readonly name = 'local';
  private root: FileSystemDirectoryHandle | null = null;

  static isSupported() {
    return typeof window.showDirectoryPicker === 'function';
  }

  async restore() {
    return null;
  }

  async login() {
    if (!window.showDirectoryPicker) {
      throw new Error('This browser cannot open folders. Use Chrome or Edge.');
    }

    this.root = await window.showDirectoryPicker({ mode: 'readwrite' });

    return { login: 'local', name: this.root.name };
  }

  async logout() {
    this.root = null;
  }

  private async dir(path: string, create = false) {
    if (!this.root) {
      throw new BackendError('No folder is open.');
    }

    let handle = this.root;

    for (const part of path.split('/').filter(Boolean)) {
      handle = await handle.getDirectoryHandle(part, { create });
    }

    return handle;
  }

  private async file(path: string, create = false) {
    const parts = path.split('/');
    const name = parts.pop() as string;

    return (await this.dir(parts.join('/'), create)).getFileHandle(name, { create });
  }

  async listFiles(folder: string): Promise<RepoFile[]> {
    let handle: FileSystemDirectoryHandle;

    try {
      handle = await this.dir(folder);
    } catch {
      return [];
    }

    const files: RepoFile[] = [];

    for await (const entry of handle.values()) {
      if (entry.kind === 'file') {
        files.push({ path: folder ? `${folder}/${entry.name}` : entry.name });
      }
    }

    return files;
  }

  async readTextFiles(paths: string[]) {
    const result = new Map<string, string>();

    await Promise.all(
      paths.map(async (path) => {
        result.set(path, await (await (await this.file(path)).getFile()).text());
      }),
    );

    return result;
  }

  async readBinary(path: string) {
    return (await this.file(path)).getFile();
  }

  async commit({ changes, deletions }: { message: string; changes: FileChange[]; deletions: string[] }) {
    for (const { path, content } of changes) {
      const writable = await (await this.file(path, true)).createWritable();

      await writable.write(typeof content === 'string' ? content : new Blob([content as BlobPart]));
      await writable.close();
    }

    for (const path of deletions) {
      const parts = path.split('/');
      const name = parts.pop() as string;

      await (await this.dir(parts.join('/'))).removeEntry(name);
    }

    return {};
  }
}
