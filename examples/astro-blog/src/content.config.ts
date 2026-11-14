import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  // .describe() becomes the field label in the panel, and .max() turns on the character counter.
  schema: z.object({
    title: z.string().describe('Title'),
    description: z.string().max(160).describe('Summary for Google and the blog list'),
    pubDate: z.coerce.date().describe('Publish date'),
    cover: z.string().optional().describe('Cover image'),
    coverAlt: z.string().optional(),
    draft: z.boolean().default(false).describe('Draft (do not publish yet)'),
  }),
});

export const collections = { blog };
