/** Posts folder, the same as `folder` in public/admin/config.yml. */
export const BLOG_FOLDER = 'content/blog';

export interface PostData {
  title: string;
  description?: string;
  pubDate?: string;
  cover?: string;
  coverAlt?: string;
  draft?: boolean;
}
