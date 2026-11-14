import { ExternalLink, LogOut } from 'lucide-react';
import { useEffect } from 'react';

import { t } from '../i18n';
import { navigate, useCms, useHashRoute } from './context';
import { EntryEditor } from './EntryEditor';
import { EntryList } from './EntryList';
import { BRAND, Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';

export function Shell() {
  const { config, user, logout } = useCms();
  const route = useHashRoute();
  const [, section, name, action, slug] = route.split('/');
  const collection = config.collections.find((c) => c.name === name);
  const siteUrl = config.display_url ?? config.site_url;

  useEffect(() => {
    if (section !== 'c' || !collection) {
      navigate(`/c/${config.collections[0].name}`);
    }
  }, [section, collection, config]);

  let main = null;

  if (collection && section === 'c') {
    if (action === 'new') {
      main = <EntryEditor key={`${collection.name}:new`} collection={collection} slug={null} />;
    } else if (action === 'e' && slug) {
      main = <EntryEditor key={`${collection.name}:${slug}`} collection={collection} slug={decodeURIComponent(slug)} />;
    } else {
      main = <EntryList key={collection.name} collection={collection} />;
    }
  }

  return (
    <div className="scms-app">
      <header className="scms-header">
        <a className="scms-header__brand" href="#/" onClick={(e) => (e.preventDefault(), navigate('/'))}>
          {config.logo_url ? <img src={config.logo_url} alt="" /> : <Logo size={32} />}
          <span className="scms-header__divider" aria-hidden="true" />
          <span className="scms-header__title">
            <span>{config.site_title ?? 'Sapphire'}</span>
            <small>{config.site_title ? BRAND : 'Blog CMS'}</small>
          </span>
        </a>
        {config.collections.length > 1 && (
          <nav className="scms-header__nav" aria-label={t('collections')}>
            {config.collections.map((c) => (
              <a
                key={c.name}
                href={`#/c/${c.name}`}
                aria-current={c.name === collection?.name ? 'page' : undefined}
                onClick={(e) => (e.preventDefault(), navigate(`/c/${c.name}`))}
              >
                {c.label}
              </a>
            ))}
          </nav>
        )}
        <div className="scms-header__end">
          {siteUrl && (
            <a className="scms-btn scms-btn--ghost" href={siteUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={16} /> <span className="scms-hide-sm">{t('view_site')}</span>
            </a>
          )}
          <ThemeToggle />
          <span className="scms-user" title={user.login}>
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" />
            ) : (
              <span className="scms-avatar" aria-hidden="true">
                {(user.name || user.login).charAt(0).toUpperCase()}
              </span>
            )}
            <span className="scms-hide-sm">{user.name}</span>
          </span>
          <button className="scms-btn scms-btn--ghost scms-icon-btn" onClick={logout} title={t('logout')}>
            <LogOut size={16} />
          </button>
        </div>
      </header>
      <main className="scms-main">{main}</main>
    </div>
  );
}
