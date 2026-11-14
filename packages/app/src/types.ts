/** Supported widgets. Names follow Decap/Sveltia so existing configs keep working. */
export type Widget =
  | 'string'
  | 'text'
  | 'markdown'
  | 'richtext'
  | 'datetime'
  | 'date'
  | 'boolean'
  | 'number'
  | 'image'
  | 'file'
  | 'select'
  | 'list'
  | 'hidden';

export type SelectOption = string | { label: string; value: string };

export interface FieldConfig {
  name: string;
  label?: string;
  widget?: Widget;
  required?: boolean;
  default?: unknown;
  hint?: string;
  /** select */
  options?: SelectOption[];
  multiple?: boolean;
  /** string, text: show a counter and warn when the limit is exceeded */
  minlength?: number;
  maxlength?: number;
  /** datetime, in the Decap format. `time_format: false` saves only the date. */
  date_format?: string;
  time_format?: string | false;
  format?: string;
  /** number */
  value_type?: 'int' | 'float';
  min?: number;
  max?: number;
  step?: number;
}

export interface CollectionConfig {
  name: string;
  label: string;
  label_singular: string;
  description?: string;
  folder: string;
  create: boolean;
  delete: boolean;
  slug: string;
  extension: string;
  identifier_field: string;
  fields: FieldConfig[];
  sortable_fields?: string[];
  media_folder?: string;
  public_folder?: string;
}

export type LoginMethod = 'github' | 'google';

export interface BackendConfig {
  name: 'github' | 'local';
  repo?: string;
  /** Ways to sign in to the panel. Default: github only. "google" uses the worker and the GitHub App. */
  login_methods: LoginMethod[];
  branch: string;
  /** URL of the authentication worker. */
  base_url?: string;
  auth_endpoint?: string;
  api_root?: string;
  graphql_api_root?: string;
}

export interface CmsConfig {
  backend: BackendConfig;
  local_backend: boolean;
  media_folder: string;
  public_folder: string;
  collections: CollectionConfig[];
  locale?: string;
  site_url?: string;
  display_url?: string;
  logo_url?: string;
  site_title?: string;
  /** Text editor options. */
  editor: {
    /** Colors offered by the color button. Use the site palette. */
    colors: string[];
  };
  /** Automatic compression of uploaded images. */
  media_compression: {
    enabled: boolean;
    max_width: number;
    quality: number;
  };
}

export interface User {
  name: string;
  login: string;
  avatarUrl?: string;
}

export interface Entry {
  /** File path in the repository. */
  path: string;
  slug: string;
  data: Record<string, unknown>;
}

/** New or changed file, to be saved in a single commit. */
export interface FileChange {
  path: string;
  content: string | Uint8Array;
}
