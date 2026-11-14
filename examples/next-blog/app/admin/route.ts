import { createAdminRoute } from '@sapphirelabs/blog-cms-next/admin';

// The CMS panel at /admin. The configuration lives in public/admin/config.yml.
// On a real site, remove scriptUrl to use the version published on the CDN.
export const { GET } = createAdminRoute({ scriptUrl: '/admin/sapphire-cms.js' });
export const dynamic = 'force-static';
