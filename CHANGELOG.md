# Changelog

All notable changes to the Sapphire Blog CMS packages (`@sapphirelabs/blog-cms`, `@sapphirelabs/blog-cms-astro`, `@sapphirelabs/blog-cms-next`). They are released together with the same version. The format follows [Keep a Changelog](https://keepachangelog.com/) and the packages use [semantic versioning](https://semver.org/).

## 1.0.0

First stable release.

### Changed

- New look for the panel, in the Sapphire Labs style: neutral background, one accent colour and thin borders, a text wordmark "Sapphire Blog CMS" and a new sapphire icon. The banner image is gone, so the panel script is smaller.
- Themes: dark, light and kawaii pink, picked from a theme menu in the header. Until an editor picks one, the panel follows the system (light or dark). The previous automatic / light / dark toggle is replaced.
- `@sapphirelabs/blog-cms-next`: the default `scriptUrl` is now pinned to the panel version this package ships with (`@sapphirelabs/blog-cms@1.0.0`) instead of the latest version on unpkg, so a new panel release never changes a site that did not upgrade.
- The example Astro blog has a new design.

## 0.1.0

First public version: Git-based panel compatible with the Decap/Sveltia configuration, rich text editor, WebP image compression, GitHub and Google sign-in through the worker, and the Astro and Next.js integrations.
