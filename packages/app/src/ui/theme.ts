import { useEffect, useState } from 'react';
import { THEMES, type Theme } from '@sapphirelabs/ui/theme';

// The Sapphire Labs themes (dark, light, kawaii pink), shared with the
// Sapphire Labs sites through @sapphirelabs/ui. The panel root gets class
// "sapphire-theme" and data-theme; until the editor picks a theme it follows
// the system (light or dark).

export { THEMES, type Theme };

const KEY = 'sapphire-cms.theme';
const lightQuery = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null);
let root: HTMLElement | null = null;
const listeners = new Set<() => void>();

/** The theme the editor picked, or null to follow the system. */
function readChoice(): Theme | null {
  try {
    const value = localStorage.getItem(KEY);

    return (THEMES as readonly string[]).includes(value ?? '') ? (value as Theme) : null;
  } catch {
    return null;
  }
}

/** The theme in use: the editor's choice, else light or dark from the system. */
export function currentTheme(): Theme {
  return readChoice() ?? (lightQuery()?.matches ? 'light' : 'dark');
}

function apply() {
  const theme = currentTheme();

  if (theme === 'dark') {
    root?.removeAttribute('data-theme');
  } else {
    root?.setAttribute('data-theme', theme);
  }

  listeners.forEach((fn) => fn());
}

/** Called once, with the element the panel is mounted in. */
export function initTheme(element: HTMLElement) {
  root = element;
  element.classList.add('sapphire-theme');
  apply();
  // Follow the system while the editor has not picked a theme.
  lightQuery()?.addEventListener('change', () => {
    if (!readChoice()) {
      apply();
    }
  });
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // No storage available: the theme only lasts until reload.
  }

  apply();
}

/** Current theme and a setter; re-renders when the theme changes. */
export function useTheme() {
  const [theme, setState] = useState(currentTheme);

  useEffect(() => {
    const update = () => setState(currentTheme());

    listeners.add(update);

    return () => {
      listeners.delete(update);
    };
  }, []);

  return { theme, setTheme };
}
