import { Check, Palette } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { t } from '../i18n';
import { THEMES, useTheme, type Theme } from './theme';

const LABELS: Record<Theme, 'theme_dark' | 'theme_light' | 'theme_kawaii'> = {
  dark: 'theme_dark',
  light: 'theme_light',
  kawaii: 'theme_kawaii',
};

/** Theme button with a small menu: dark, light or kawaii pink. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    // Start on the current theme so arrow keys move from there.
    items.current[THEMES.indexOf(currentThemeOf(items.current))]?.focus();

    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as globalThis.Node)) {
        setOpen(false);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>('.scms-theme__toggle')?.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const i = items.current.indexOf(document.activeElement as HTMLButtonElement);
        const next = (i + (e.key === 'ArrowDown' ? 1 : -1) + THEMES.length) % THEMES.length;

        items.current[next]?.focus();
      }
    };

    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={`scms-theme ${className}`} ref={root}>
      <button
        type="button"
        className="scms-btn scms-btn--ghost scms-icon-btn scms-theme__toggle"
        onClick={() => setOpen(!open)}
        title={t('theme_label')}
        aria-label={t('theme_label')}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Palette size={17} />
      </button>
      {open && (
        <div className="scms-theme__menu" role="menu">
          {THEMES.map((name, i) => (
            <button
              key={name}
              ref={(el) => {
                items.current[i] = el;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={theme === name}
              data-theme-name={name}
              className="scms-theme__item"
              onClick={() => {
                setTheme(name);
                setOpen(false);
              }}
            >
              <i className={`scms-theme__swatch scms-theme__swatch--${name}`} aria-hidden="true" />
              <span>{t(LABELS[name])}</span>
              {theme === name && <Check size={15} className="scms-theme__check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The theme whose menu item is checked (read from the rendered items). */
function currentThemeOf(buttons: (HTMLButtonElement | null)[]): Theme {
  const checked = buttons.find((b) => b?.getAttribute('aria-checked') === 'true');

  return (checked?.dataset.themeName as Theme | undefined) ?? 'dark';
}
