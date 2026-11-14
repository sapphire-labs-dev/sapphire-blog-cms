/** Turns a title into a URL slug: "Déjà vu is normal?" becomes "deja-vu-is-normal". */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Applies the collection slug template, like Decap: `{{slug}}`, `{{year}}-{{month}}-{{day}}-{{slug}}`,
 * `{{fields.title}}` or the name of any field.
 */
export function renderSlug(
  template: string,
  data: Record<string, unknown>,
  identifierField: string,
  now = new Date(),
): string {
  const values: Record<string, string> = {
    year: String(now.getFullYear()),
    month: pad(now.getMonth() + 1),
    day: pad(now.getDate()),
    hour: pad(now.getHours()),
    minute: pad(now.getMinutes()),
    second: pad(now.getSeconds()),
    slug: slugify(String(data[identifierField] ?? '')),
  };

  const result = template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    if (key in values) {
      return values[key];
    }

    const field = key.replace(/^fields\./, '');

    return slugify(String(data[field] ?? ''));
  });

  return result.replace(/-+/g, '-').replace(/^-|-$/g, '') || `entrada-${Date.now().toString(36)}`;
}
