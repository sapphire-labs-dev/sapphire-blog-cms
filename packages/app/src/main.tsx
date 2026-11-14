import { createRoot } from 'react-dom/client';

// Sapphire Labs theme tokens (dark / light / kawaii) and the kawaii font
// (Nunito, woff2 only, inlined in the bundle), then the panel's own styles.
import nunito500 from '@fontsource/nunito/files/nunito-latin-500-normal.woff2?inline';
import nunito700 from '@fontsource/nunito/files/nunito-latin-700-normal.woff2?inline';
import themeTokens from '@sapphirelabs/ui/styles/tokens.css?inline';
import css from './styles.css?inline';

const fontFace = (weight: number, url: string) =>
  `@font-face{font-family:'Nunito';font-style:normal;font-display:swap;font-weight:${weight};src:url(${url}) format('woff2')}`;
import { App, type AppProps } from './ui/App';
import { ICON_URL } from './ui/Logo';
import { initTheme } from './ui/theme';

export type InitOptions = AppProps['options'] & {
  /** Element the panel is mounted in. Default: a new <div> at the end of <body>. */
  target?: HTMLElement;
};

let mounted = false;

/** Opens the panel. Called automatically on load, unless SAPPHIRE_CMS_MANUAL_INIT is true. */
export function init(options: InitOptions = {}) {
  if (mounted) {
    return;
  }

  mounted = true;

  const style = document.createElement('style');

  style.textContent = fontFace(500, nunito500) + fontFace(700, nunito700) + themeTokens + css;
  document.head.append(style);

  // Uses the sapphire as the tab icon if the page has none.
  if (!document.querySelector('link[rel~="icon"]')) {
    const link = document.createElement('link');

    link.rel = 'icon';
    link.href = ICON_URL;
    document.head.append(link);
  }

  let target = options.target ?? document.getElementById('sapphire-cms');

  if (!target) {
    target = document.createElement('div');
    target.id = 'sapphire-cms';
    document.body.append(target);
  }

  target.classList.add('scms');
  initTheme(target);
  createRoot(target).render(<App options={options} />);
}

if (typeof window !== 'undefined' && !window.SAPPHIRE_CMS_MANUAL_INIT && !window.CMS_MANUAL_INIT) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init());
  } else {
    // Gives whoever imported the module a chance to call init() with options in the same tick.
    setTimeout(() => init());
  }
}
