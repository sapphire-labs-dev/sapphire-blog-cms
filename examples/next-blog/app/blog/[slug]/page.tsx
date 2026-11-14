import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getPost, getSlugs, SapphireContent } from '@sapphirelabs/blog-cms-next';

import { BLOG_FOLDER, type PostData } from '../posts';

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return (await getSlugs(BLOG_FOLDER)).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props) {
  const post = await getPost<PostData>(BLOG_FOLDER, (await params).slug);

  return { title: post?.data.title, description: post?.data.description };
}

export default async function PostPage({ params }: Props) {
  const post = await getPost<PostData>(BLOG_FOLDER, (await params).slug);

  if (!post) {
    notFound();
  }

  const { data, body } = post;

  return (
    <main>
      <p>
        <Link href="/">← Back</Link>
      </p>
      {data.cover && <img className="cover" src={data.cover} alt={data.coverAlt ?? ''} />}
      <h1>{data.title}</h1>
      <SapphireContent source={body} />
    </main>
  );
}
