import type { Backend } from '../backends/types';
import { slugify } from '../content/slug';
import type { CmsConfig, FileChange } from '../types';

const COMPRESSIBLE = /^image\/(jpeg|png|webp|bmp)$/;

/** Shrinks the image to the max width and converts it to WebP. Keeps the original if that is not smaller. */
export async function compressImage(
  file: File,
  options: CmsConfig['media_compression'],
): Promise<{ blob: Blob; extension: string }> {
  const original = { blob: file as Blob, extension: (file.name.split('.').pop() ?? 'bin').toLowerCase() };

  if (!options.enabled || !COMPRESSIBLE.test(file.type)) {
    return original;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, options.max_width / bitmap.width);
    const canvas = document.createElement('canvas');

    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', options.quality));

    if (!blob || blob.type !== 'image/webp' || (scale === 1 && blob.size >= file.size)) {
      return original;
    }

    return { blob, extension: 'webp' };
  } catch {
    return original;
  }
}

interface Pending {
  repoPath: string;
  blob: Blob;
  url: string;
}

/**
 * Site images. Uploaded ones stay pending until the next save and go into the same commit as the
 * text that uses them.
 */
export class MediaLibrary {
  private pending = new Map<string, Pending>();
  private cache = new Map<string, Promise<string>>();
  private existing: Promise<Set<string>> | null = null;

  constructor(
    private readonly config: CmsConfig,
    private readonly backend: Backend,
  ) {}

  private get publicFolder() {
    return this.config.public_folder.replace(/\/$/, '');
  }

  toRepoPath(publicPath: string): string | null {
    const prefix = `${this.publicFolder}/`;

    return publicPath.startsWith(prefix) ? `${this.config.media_folder}/${publicPath.slice(prefix.length)}` : null;
  }

  private async existingNames() {
    this.existing ??= this.backend
      .listFiles(this.config.media_folder)
      .then((files) => new Set(files.map((f) => f.path.slice(f.path.lastIndexOf('/') + 1))))
      .catch(() => new Set<string>());

    return this.existing;
  }

  /** Prepares the image and returns the public path to write into the content. */
  async add(file: File): Promise<string> {
    const { blob, extension } = await compressImage(file, this.config.media_compression);
    const base = slugify(file.name.replace(/\.[^.]+$/, '')) || 'image';
    const taken = await this.existingNames();
    const pendingNames = new Set([...this.pending.values()].map((p) => p.repoPath.slice(p.repoPath.lastIndexOf('/') + 1)));
    let name = `${base}.${extension}`;

    for (let i = 2; taken.has(name) || pendingNames.has(name); i += 1) {
      name = `${base}-${i}.${extension}`;
    }

    const publicPath = `${this.publicFolder}/${name}`;

    this.pending.set(publicPath, { repoPath: `${this.config.media_folder}/${name}`, blob, url: URL.createObjectURL(blob) });

    return publicPath;
  }

  /** URL to display the image in the panel, even before the site is published. */
  resolve(src: string): Promise<string> {
    if (!src || /^(https?:|data:|blob:)/.test(src)) {
      return Promise.resolve(src);
    }

    const pending = this.pending.get(src);

    if (pending) {
      return Promise.resolve(pending.url);
    }

    const repoPath = this.toRepoPath(src);

    if (!repoPath) {
      return Promise.resolve(src);
    }

    if (!this.cache.has(src)) {
      this.cache.set(
        src,
        this.backend
          .readBinary(repoPath)
          .then((blob) => URL.createObjectURL(blob))
          .catch(() => src),
      );
    }

    return this.cache.get(src) as Promise<string>;
  }

  /** Pending files referenced by the content about to be saved. */
  async changesFor(contents: string[]): Promise<FileChange[]> {
    const text = contents.join('\n');
    const used = [...this.pending.entries()].filter(([publicPath]) => text.includes(publicPath));

    return Promise.all(
      used.map(async ([, { repoPath, blob }]) => ({ path: repoPath, content: new Uint8Array(await blob.arrayBuffer()) })),
    );
  }

  /** After saving, the uploaded images exist in the repository. */
  markSaved(changes: FileChange[]) {
    for (const [publicPath, item] of this.pending) {
      if (changes.some((c) => c.path === item.repoPath)) {
        this.cache.set(publicPath, Promise.resolve(item.url));
        this.pending.delete(publicPath);
        void this.existingNames().then((names) => names.add(item.repoPath.slice(item.repoPath.lastIndexOf('/') + 1)));
      }
    }
  }
}
