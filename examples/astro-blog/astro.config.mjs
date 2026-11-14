import { defineConfig } from 'astro/config';
import sapphireCms from '@sapphirelabs/blog-cms-astro';

export default defineConfig({
  site: 'https://example.com',
  integrations: [
    sapphireCms({
      config: {
        site_title: 'Example blog',
        backend: {
          name: 'github',
          // Replace with your test repository and your worker URL.
          repo: 'your-user/your-repo',
          branch: 'main',
          base_url: 'https://sapphire-cms-auth.your-account.workers.dev',
        },
        // On localhost, also offers "Open project folder", with no sign-in.
        local_backend: true,
        // Site palette for the editor color button.
        editor: { colors: ['#2f3e46', '#b5651d', '#6b8f71', '#8e6c88'] },
      },
      collections: {
        blog: {
          label: 'Blog',
          label_singular: 'post',
          fields: {
            coverAlt: { label: 'Image description' },
          },
        },
      },
    }),
  ],
});
