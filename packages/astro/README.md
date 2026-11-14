# @sapphirelabs/blog-cms-astro

[Sapphire Blog CMS](https://github.com/sapphire-labs-dev/sapphire-blog-cms) for Astro: adds a CMS panel at
`/admin` whose fields are read from your content collections, so there is no field configuration to write.

```bash
npm install @sapphirelabs/blog-cms-astro
```

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import sapphireCms from '@sapphirelabs/blog-cms-astro';

export default defineConfig({
  integrations: [
    sapphireCms({
      config: {
        site_title: 'My blog',
        backend: { name: 'github', repo: 'me/my-blog', branch: 'main', base_url: 'https://my-auth.example.workers.dev' },
      },
    }),
  ],
});
```

In your Zod schema, `.describe('Title')` becomes the field label and `.max(160)` turns on the character
counter. Fields named `cover` or `image` get an image upload.

Full setup, sign-in (GitHub or Google) and the `config.yml` reference:
[getting started](https://github.com/sapphire-labs-dev/sapphire-blog-cms/blob/main/docs/getting-started.md).

## License

MIT
