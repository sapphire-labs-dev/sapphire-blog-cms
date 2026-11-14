# @sapphirelabs/blog-cms-next

[Sapphire Blog CMS](https://github.com/sapphire-labs-dev/sapphire-blog-cms) for Next.js (App Router):
a CMS panel at `/admin`, helpers to load your Markdown posts, and a component that renders them safely.

```bash
npm install @sapphirelabs/blog-cms-next
```

```ts
// app/admin/route.ts
import { createAdminRoute } from '@sapphirelabs/blog-cms-next/admin';

export const { GET } = createAdminRoute({
  scriptUrl: 'https://unpkg.com/@sapphirelabs/blog-cms@1.0.0/dist/sapphire-cms.js',
});
export const dynamic = 'force-static';
```

```tsx
// app/blog/[slug]/page.tsx
import { notFound } from 'next/navigation';
import { getPost, getSlugs, SapphireContent } from '@sapphirelabs/blog-cms-next';

export async function generateStaticParams() {
  return (await getSlugs('content/blog')).map((slug) => ({ slug }));
}

export default async function Post({ params }: { params: Promise<{ slug: string }> }) {
  const post = await getPost('content/blog', (await params).slug);
  if (!post) notFound();

  return <SapphireContent source={post.body} />;
}
```

```tsx
// app/layout.tsx
import '@sapphirelabs/blog-cms-next/prose.css';
```

- `getPosts(folder)`: every post, newest first; `draft: true` posts are hidden in production.
- `getPost(folder, slug)`: one post, or `null`.
- `<SapphireContent source>`: renders Markdown plus the HTML the editor writes (color, underline,
  alignment, tables, YouTube) and strips anything that could run code. `allowUnsafeHtml` turns that off.

Full setup and the `config.yml` reference:
[getting started](https://github.com/sapphire-labs-dev/sapphire-blog-cms/blob/main/docs/getting-started.md).

## License

MIT
