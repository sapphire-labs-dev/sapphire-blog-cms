import type { FileChange, User } from '../types';

export interface RepoFile {
  path: string;
  /** File version identifier, when the backend provides one. */
  sha?: string;
}

export interface CommitResult {
  url?: string;
}

/** Everything the panel needs from the place where the content lives. */
export interface Backend {
  readonly name: 'github' | 'gateway' | 'local';
  /** Tries to resume the saved session. */
  restore(): Promise<User | null>;
  /** Opens the interactive sign-in. */
  login(): Promise<User>;
  logout(): Promise<void>;
  /** Files directly inside the folder. */
  listFiles(folder: string): Promise<RepoFile[]>;
  readTextFiles(paths: string[]): Promise<Map<string, string>>;
  readBinary(path: string): Promise<Blob>;
  /** Saves every change at once. On GitHub it becomes a single commit. */
  commit(input: { message: string; changes: FileChange[]; deletions: string[] }): Promise<CommitResult>;
}

export class BackendError extends Error {
  override name = 'BackendError';

  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}
