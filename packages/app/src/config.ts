import YAML from 'yaml';

import type { BackendConfig, LoginMethod, CmsConfig, CollectionConfig, FieldConfig, Widget } from './types';

const WIDGETS: Widget[] = [
  'string',
  'text',
  'markdown',
  'richtext',
  'datetime',
  'date',
  'boolean',
  'number',
  'image',
  'file',
  'select',
  'list',
  'hidden',
];

const DEFAULT_COLORS = ['#1f2937', '#b91c1c', '#c2410c', '#a16207', '#15803d', '#1d4ed8', '#7e22ce'];

export class ConfigError extends Error {
  override name = 'ConfigError';
}

type Raw = Record<string, unknown>;

const isObject = (value: unknown): value is Raw =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const trimSlashes = (path: string) => path.replace(/^\/+|\/+$/g, '');

function normalizeField(raw: unknown, where: string): FieldConfig {
  if (!isObject(raw) || typeof raw.name !== 'string' || !raw.name) {
    throw new ConfigError(`${where}: every field needs a "name".`);
  }

  const widget = (raw.widget ?? 'string') as Widget;

  if (!WIDGETS.includes(widget)) {
    throw new ConfigError(`${where}: the "${String(raw.widget)}" widget is not supported yet.`);
  }

  return { ...(raw as unknown as FieldConfig), widget, required: raw.required !== false };
}

function normalizeCollection(raw: unknown, index: number): CollectionConfig {
  const where = `collections[${index}]`;

  if (!isObject(raw) || typeof raw.name !== 'string') {
    throw new ConfigError(`${where}: every collection needs a "name".`);
  }

  if (typeof raw.folder !== 'string') {
    throw new ConfigError(
      `Collection "${raw.name}": only folder collections ("folder") are supported for now.`,
    );
  }

  if (!Array.isArray(raw.fields) || raw.fields.length === 0) {
    throw new ConfigError(`Collection "${raw.name}": define the "fields" list.`);
  }

  const fields = raw.fields.map((field, i) => normalizeField(field, `${raw.name}.fields[${i}]`));
  const label = typeof raw.label === 'string' ? raw.label : raw.name;
  const identifier =
    typeof raw.identifier_field === 'string'
      ? raw.identifier_field
      : (fields.find((f) => f.name === 'title')?.name ?? fields[0].name);

  return {
    name: raw.name,
    label,
    label_singular: typeof raw.label_singular === 'string' ? raw.label_singular : label,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    folder: trimSlashes(raw.folder),
    create: raw.create === true,
    delete: raw.delete !== false,
    slug: typeof raw.slug === 'string' ? raw.slug : '{{slug}}',
    extension: typeof raw.extension === 'string' ? raw.extension.replace(/^\./, '') : 'md',
    identifier_field: identifier,
    fields,
    sortable_fields: Array.isArray(raw.sortable_fields)
      ? raw.sortable_fields.map((f) => (isObject(f) ? String(f.field) : String(f)))
      : undefined,
    media_folder: typeof raw.media_folder === 'string' ? raw.media_folder : undefined,
    public_folder: typeof raw.public_folder === 'string' ? raw.public_folder : undefined,
  };
}

function normalizeBackend(raw: unknown): BackendConfig {
  if (!isObject(raw) || typeof raw.name !== 'string') {
    throw new ConfigError('Set "backend.name" (github or local).');
  }

  if (raw.name !== 'github' && raw.name !== 'local') {
    throw new ConfigError(`The "${raw.name}" backend is not supported yet. Use github or local.`);
  }

  if (raw.name === 'github' && (typeof raw.repo !== 'string' || !raw.repo.includes('/'))) {
    throw new ConfigError('Set "backend.repo" in the owner/repository format.');
  }

  const methods = Array.isArray(raw.login_methods)
    ? raw.login_methods.filter((m): m is LoginMethod => m === 'github' || m === 'google')
    : ['github' as const];

  if (raw.name === 'github' && methods.length === 0) {
    throw new ConfigError('"backend.login_methods" accepts github and google.');
  }

  return {
    ...(raw as unknown as BackendConfig),
    name: raw.name,
    login_methods: methods,
    branch: typeof raw.branch === 'string' ? raw.branch : 'main',
  };
}

/** Validates and completes the configuration, accepting the Decap/Sveltia format. */
export function normalizeConfig(raw: unknown): CmsConfig {
  if (!isObject(raw)) {
    throw new ConfigError('The configuration is empty or is not an object.');
  }

  if (typeof raw.media_folder !== 'string') {
    throw new ConfigError('Set "media_folder", the folder where images are saved.');
  }

  if (!Array.isArray(raw.collections) || raw.collections.length === 0) {
    throw new ConfigError('Define at least one collection in "collections".');
  }

  const mediaFolder = trimSlashes(raw.media_folder);
  const editor = isObject(raw.editor) ? raw.editor : {};
  const compression = isObject(raw.media_compression) ? raw.media_compression : {};

  return {
    backend: normalizeBackend(raw.backend),
    local_backend: raw.local_backend === true || isObject(raw.local_backend),
    media_folder: mediaFolder,
    public_folder:
      typeof raw.public_folder === 'string' ? raw.public_folder : `/${mediaFolder}`,
    collections: raw.collections.map(normalizeCollection),
    locale: typeof raw.locale === 'string' ? raw.locale : undefined,
    site_url: typeof raw.site_url === 'string' ? raw.site_url : undefined,
    display_url: typeof raw.display_url === 'string' ? raw.display_url : undefined,
    logo_url: typeof raw.logo_url === 'string' ? raw.logo_url : undefined,
    site_title: typeof raw.site_title === 'string' ? raw.site_title : undefined,
    editor: {
      colors: Array.isArray(editor.colors) ? editor.colors.map(String) : DEFAULT_COLORS,
    },
    media_compression: {
      enabled: compression.enabled !== false,
      max_width: typeof compression.max_width === 'number' ? compression.max_width : 1920,
      quality: typeof compression.quality === 'number' ? compression.quality : 0.82,
    },
  };
}

/** Default config.yml URL: in the same folder as the panel page, like Decap. */
export function defaultConfigUrl(location: Location = window.location): string {
  const { origin, pathname } = location;
  const dir = pathname.endsWith('/') || /\.html?$/.test(pathname) ? pathname : `${pathname}/`;

  return new URL('config.yml', origin + dir).href;
}

export async function loadConfig(options: { config?: unknown; configUrl?: string }) {
  let raw = options.config ?? window.SAPPHIRE_CMS_CONFIG;

  if (!raw) {
    const link = document.querySelector<HTMLLinkElement>('link[rel="cms-config-url"]');
    const url = options.configUrl ?? link?.href ?? defaultConfigUrl();
    const response = await fetch(url, { cache: 'no-cache' });

    if (!response.ok) {
      throw new ConfigError(`Could not load the configuration from ${url}.`);
    }

    raw = YAML.parse(await response.text());
  }

  return normalizeConfig(raw);
}
