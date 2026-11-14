import type { Backend } from '../backends/types';
import type { CollectionConfig, Entry, FieldConfig } from '../types';
import { parseEntry } from './frontmatter';

const pad = (n: number) => String(n).padStart(2, '0');

/** Formats a date with the most common Decap tokens (YYYY MM DD HH mm ss). */
export function formatDate(date: Date, pattern: string) {
  const tokens: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    MM: pad(date.getMonth() + 1),
    DD: pad(date.getDate()),
    HH: pad(date.getHours()),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds()),
  };

  return pattern.replace(/YYYY|MM|DD|HH|mm|ss/g, (token) => tokens[token]);
}

export const isDateOnly = (field: FieldConfig) => field.widget === 'date' || field.time_format === false;

/** Value written to the file for a date picked in the panel. */
export function dateToValue(date: Date, field: FieldConfig): string {
  if (field.format) {
    return formatDate(date, field.format);
  }

  if (isDateOnly(field)) {
    return formatDate(date, field.date_format ?? 'YYYY-MM-DD');
  }

  return date.toISOString();
}

/** Converts the saved value back into a date, accepting the common formats. */
export function valueToDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value !== 'string' || !value) {
    return null;
  }

  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateOnly ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])) : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function defaultData(collection: CollectionConfig): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  for (const field of collection.fields) {
    if (field.default !== undefined) {
      data[field.name] = field.default === '{{now}}' ? dateToValue(new Date(), field) : field.default;
    } else if (field.widget === 'boolean') {
      data[field.name] = false;
    } else if (field.widget === 'datetime' || field.widget === 'date') {
      data[field.name] = dateToValue(new Date(), field);
    }
  }

  return data;
}

const basename = (path: string, extension: string) =>
  path.slice(path.lastIndexOf('/') + 1).replace(new RegExp(`\\.${extension}$`), '');

export function entryPath(collection: CollectionConfig, slug: string) {
  return `${collection.folder}/${slug}.${collection.extension}`;
}

export async function loadEntries(backend: Backend, collection: CollectionConfig): Promise<Entry[]> {
  const files = (await backend.listFiles(collection.folder)).filter((file) =>
    file.path.endsWith(`.${collection.extension}`),
  );
  const texts = await backend.readTextFiles(files.map((file) => file.path));

  return files.flatMap(({ path }) => {
    const text = texts.get(path);

    if (text === undefined) {
      return [];
    }

    try {
      return [{ path, slug: basename(path, collection.extension), data: parseEntry(text, collection.extension) }];
    } catch {
      return [];
    }
  });
}

export function entryTitle(entry: Entry, collection: CollectionConfig) {
  const value = entry.data[collection.identifier_field];

  return typeof value === 'string' && value.trim() ? value : entry.slug;
}

/** The collection's first date field, used for sorting and display. */
export const dateField = (collection: CollectionConfig) =>
  collection.fields.find((f) => f.widget === 'datetime' || f.widget === 'date');

export type SortOrder = 'newest' | 'oldest' | 'title';

export function sortEntries(entries: Entry[], collection: CollectionConfig, order: SortOrder = 'newest') {
  const field = order === 'title' ? undefined : dateField(collection);
  const direction = order === 'oldest' ? -1 : 1;

  return [...entries].sort((a, b) => {
    if (field) {
      const diff =
        (valueToDate(b.data[field.name])?.getTime() ?? 0) - (valueToDate(a.data[field.name])?.getTime() ?? 0);

      if (diff) {
        return diff * direction;
      }
    }

    return entryTitle(a, collection).localeCompare(entryTitle(b, collection));
  });
}

/** Boolean field that marks a draft (`draft`, like in Astro and Hugo). */
export const draftField = (collection: CollectionConfig) =>
  collection.fields.find((f) => f.widget === 'boolean' && /^(draft|rascunho)$/i.test(f.name));

export function uniqueSlug(base: string, taken: Set<string>) {
  let slug = base;

  for (let i = 2; taken.has(slug); i += 1) {
    slug = `${base}-${i}`;
  }

  return slug;
}

/** Validates the fields and returns the messages per field. */
export function validate(
  data: Record<string, unknown>,
  fields: FieldConfig[],
  t: (key: 'required_error' | 'too_long' | 'too_short', vars?: Record<string, number>) => string,
) {
  const errors: Record<string, string> = {};

  for (const field of fields) {
    const value = data[field.name];
    const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length);

    if (field.required && field.widget !== 'boolean' && field.widget !== 'hidden' && empty) {
      errors[field.name] = t('required_error');
    } else if (typeof value === 'string' && field.maxlength && value.length > field.maxlength) {
      errors[field.name] = t('too_long', { max: field.maxlength });
    } else if (typeof value === 'string' && value && field.minlength && value.length < field.minlength) {
      errors[field.name] = t('too_short', { min: field.minlength });
    }
  }

  return errors;
}
