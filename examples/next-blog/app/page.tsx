import Link from 'next/link';

import { getPosts } from '@sapphirelabs/blog-cms-next';

import { BLOG_FOLDER, type PostData } from './blog/posts';

export default async function Home() {
  const posts = await getPosts<PostData>(BLOG_FOLDER);

  return (
    <main>
      <h1>Blog</h1>
      <ul className="post-list">
        {posts.map(({ slug, data }) => (
          <li key={slug}>
            <Link href={`/blog/${slug}`}>{data.title}</Link>
            <br />
            <time>{data.pubDate}</time>
            {data.description && <p>{data.description}</p>}
          </li>
        ))}
      </ul>
      <p>
        <a href="/admin">Open the CMS</a>
      </p>
    </main>
  );
}
