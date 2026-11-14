import YAML from 'yaml';

import type { FieldConfig } from '../types';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export const BODY_FIELD = 'body';

export function isMarkdownExtension(extension: string) {
  return ['md', 'mdx', 'markdown'].includes(extension);
}

/** Reads a collection file and returns its data, with the text in `body`. */
export function parseEntry(text: string, extension: string): Record<string, unknown> {
  if (extension === 'json') {
    return JSON.parse(text) as Record<string, unknown>;
  }

  if (extension === 'yml' || extension === 'yaml') {
    return (YAML.parse(text) ?? {}) as Record<string, unknown>;
  }

  const match = text.match(FRONTMATTER);

  if (!match) {
    return { [BODY_FIELD]: text };
  }

  const data = (YAML.parse(match[1]) ?? {}) as Record<string, unknown>;

  return { ...data, [BODY_FIELD]: text.slice(match[0].length).replace(/^\r?\n/, '') };
}

const isEmpty = (value: unknown) =>
  value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length);

/**
 * Generates the file. Fields come out in configuration order, followed by any that already existed
 * in the file but the configuration does not know, so nothing is lost. Empty optional fields are omitted.
 */
export function serializeEntry(
  data: Record<string, unknown>,
  fields: FieldConfig[],
  extension: string,
): string {
  const ordered: Record<string, unknown> = {};

  for (const field of fields) {
    if (field.name === BODY_FIELD && isMarkdownExtension(extension)) {
      continue;
    }

    const value = data[field.name];

    if (!isEmpty(value) || (field.required && value !== undefined)) {
      ordered[field.name] = value;
    }
  }

  for (const [key, value] of Object.entries(data)) {
    if (!(key in ordered) && key !== BODY_FIELD && !fields.some((f) => f.name === key)) {
      ordered[key] = value;
    }
  }

  if (extension === 'json') {
    return `${JSON.stringify(ordered, null, 2)}\n`;
  }

  const yaml = YAML.stringify(ordered, { lineWidth: 0 });

  if (extension === 'yml' || extension === 'yaml') {
    return yaml;
  }

  const body = String(data[BODY_FIELD] ?? '').trim();

  return `---\n${yaml}---\n\n${body}\n`;
}
