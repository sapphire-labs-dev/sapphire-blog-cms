import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** A field in the Decap/Sveltia format, which the panel understands. */
export type CmsField = Record<string, unknown> & { name: string; widget: string };

export interface CollectionOptions {
  label?: string;
  label_singular?: string;
  description?: string;
  /** Folder of the files. Default: src/content/<name> */
  folder?: string;
  extension?: string;
  slug?: string;
  create?: boolean;
  /** Per-field overrides, merged into what was read from the schema. E.g. { cover: { widget: 'image' } } */
  fields?: Record<string, Partial<CmsField>>;
  /** Label of the main text field. Use false if the collection has no body (JSON/YAML data). */
  body?: string | false;
}

interface JsonSchema {
  type?: string | string[];
  format?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  anyOf?: JsonSchema[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  maxLength?: number;
  minLength?: number;
  minimum?: number;
  maximum?: number;
}

const IMAGE_NAME = /(image|img|cover|thumb|thumbnail|banner|hero|photo|foto|imagem|capa|avatar|logo)/i;
const LONG_TEXT_NAME = /(description|summary|excerpt|resumo|descricao|legenda|caption|bio|abstract)/i;

/** Turns "pubDate" into "Pub date", for when the schema has no .describe(). */
export function humanize(name: string) {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();

  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The main type, ignoring the null of .nullable() fields. */
function mainSchema(schema: JsonSchema): JsonSchema {
  if (schema.anyOf) {
    const nonNull = schema.anyOf.filter((s) => s.type !== 'null');

    if (nonNull.length === 1) {
      return { ...nonNull[0], description: schema.description ?? nonNull[0].description, default: schema.default };
    }
  }

  if (Array.isArray(schema.type)) {
    return { ...schema, type: schema.type.find((t) => t !== 'null') };
  }

  return schema;
}

/** Converts a property of Astro's JSON Schema into a panel field. */
export function fieldFromSchema(name: string, raw: JsonSchema, required: boolean): CmsField | null {
  const schema = mainSchema(raw);
  const field: CmsField = { name, label: schema.description ?? humanize(name), widget: 'string', required };

  if (schema.default !== undefined) {
    field.default = schema.default;
  }

  switch (schema.type) {
    case 'string':
      if (schema.format === 'date-time' || schema.format === 'date' || schema.format === 'unix-time') {
        // Blog posts usually only use the date. For a time, set time_format in "fields".
        Object.assign(field, { widget: 'datetime', time_format: false, date_format: 'YYYY-MM-DD' });
      } else if (schema.enum) {
        Object.assign(field, { widget: 'select', options: schema.enum.map(String) });
      } else if (IMAGE_NAME.test(name) && !/alt$/i.test(name)) {
        field.widget = 'image';
      } else if (LONG_TEXT_NAME.test(name) || (schema.maxLength ?? 0) > 120) {
        field.widget = 'text';
      }

      if (schema.maxLength !== undefined) {
        field.maxlength = schema.maxLength;
      }

      if (schema.minLength !== undefined) {
        field.minlength = schema.minLength;
      }

      return field;

    case 'boolean':
      return { ...field, widget: 'boolean', required: false };

    case 'number':
    case 'integer':
      return {
        ...field,
        widget: 'number',
        value_type: schema.type === 'integer' ? 'int' : 'float',
        ...(schema.minimum !== undefined && { min: schema.minimum }),
        ...(schema.maximum !== undefined && { max: schema.maximum }),
      };

    case 'array': {
      const items = schema.items ? mainSchema(schema.items) : {};

      if (items.enum) {
        return { ...field, widget: 'select', multiple: true, options: items.enum.map(String) };
      }

      return items.type === 'string' ? { ...field, widget: 'list' } : null;
    }

    default:
      // Objects and compound types have no field of their own yet; their values are kept in the file.
      return null;
  }
}

export function fieldsFromSchema(schema: JsonSchema, options: CollectionOptions = {}, bodyLabel = 'Body'): CmsField[] {
  const required = new Set(schema.required ?? []);
  const fields: CmsField[] = [];

  for (const [name, property] of Object.entries(schema.properties ?? {})) {
    if (name === '$schema') {
      continue;
    }

    const field = fieldFromSchema(name, property, required.has(name));
    const override = options.fields?.[name];

    if (field || override) {
      fields.push({ ...(field ?? { name, widget: 'string', label: humanize(name) }), ...override } as CmsField);
    }
  }

  if (options.body !== false && !fields.some((f) => f.name === 'body')) {
    fields.push({ name: 'body', label: options.body ?? bodyLabel, widget: 'markdown', ...options.fields?.body } as CmsField);
  }

  return fields;
}

/** Reads the JSON Schemas that Astro writes to .astro/collections when syncing collections. */
export function readCollectionSchemas(root: string): Map<string, JsonSchema> {
  const dir = join(root, '.astro', 'collections');
  const result = new Map<string, JsonSchema>();

  if (!existsSync(dir)) {
    return result;
  }

  for (const file of readdirSync(dir)) {
    if (file.endsWith('.schema.json')) {
      result.set(file.replace(/\.schema\.json$/, ''), JSON.parse(readFileSync(join(dir, file), 'utf8')) as JsonSchema);
    }
  }

  return result;
}

export interface BuildConfigInput {
  root: string;
  site?: string;
  locale?: string;
  collections?: Record<string, CollectionOptions>;
  config: Record<string, unknown>;
}

/** Builds the full panel configuration from the Astro collections and the options. */
export function buildCmsConfig({ root, site, collections, config }: BuildConfigInput): Record<string, unknown> {
  const schemas = readCollectionSchemas(root);
  const names = collections ? Object.keys(collections) : [...schemas.keys()];
  const portuguese = typeof config.locale === 'string' && config.locale.startsWith('pt');
  const generated = names.flatMap((name) => {
    const options = collections?.[name] ?? {};
    const schema = schemas.get(name);

    if (!schema && !options.fields) {
      console.warn(`[sapphire-cms] Could not find the schema for the "${name}" collection. Run "astro sync".`);

      return [];
    }

    const label = options.label ?? humanize(name);

    return [
      {
        name,
        label,
        label_singular: options.label_singular ?? label,
        description: options.description,
        folder: options.folder ?? `src/content/${name}`,
        extension: options.extension ?? 'md',
        slug: options.slug ?? '{{slug}}',
        create: options.create ?? true,
        fields: fieldsFromSchema(schema ?? {}, options, portuguese ? 'Texto' : 'Body'),
      },
    ];
  });

  return {
    media_folder: 'public/uploads',
    public_folder: '/uploads',
    ...(site && { site_url: site }),
    ...config,
    collections: [...generated, ...((config.collections as unknown[]) ?? [])],
  };
}
