# @sapphirelabs/blog-cms

The panel of [Sapphire Blog CMS](https://github.com/sapphire-labs-dev/sapphire-blog-cms): a Git-based CMS
and an alternative to Sveltia/Decap, compatible with their `config.yml`.

This package ships two ready-to-use files:

- `dist/sapphire-cms.js`: the whole panel in one script, with no dependencies
- `dist/prose.css`: a reading theme for your posts (`<article class="sapphire-prose">`)

## Use it on any site

Create `admin/index.html` in your site's public folder and put a `config.yml` next to it:

```html
<!doctype html>
<html>
  <head><meta charset="utf-8"><meta name="robots" content="noindex"><title>CMS</title></head>
  <body><script src="https://unpkg.com/@sapphirelabs/blog-cms@1.0.0/dist/sapphire-cms.js"></script></body>
</html>
```

Using Next.js or Astro? Install [`@sapphirelabs/blog-cms-next`](https://www.npmjs.com/package/@sapphirelabs/blog-cms-next)
or [`@sapphirelabs/blog-cms-astro`](https://www.npmjs.com/package/@sapphirelabs/blog-cms-astro) instead.

Full setup, sign-in (GitHub or Google) and the `config.yml` reference:
[getting started](https://github.com/sapphire-labs-dev/sapphire-blog-cms/blob/main/docs/getting-started.md).

## License

MIT
