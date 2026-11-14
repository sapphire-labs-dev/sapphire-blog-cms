import { FileText, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { dateField, draftField, entryTitle, loadEntries, sortEntries, valueToDate, type SortOrder } from '../content/entries';
import { getLocale, t } from '../i18n';
import type { CollectionConfig, Entry } from '../types';
import { navigate, useCms } from './context';
import { MediaImage } from './MediaImage';

type Filter = 'all' | 'published' | 'drafts';

function EmptyIllustration() {
  return (
    <svg width="160" height="120" viewBox="0 0 160 120" aria-hidden="true">
      <ellipse cx="80" cy="108" rx="56" ry="6" fill="var(--scms-bg-accent)" />
      <rect x="38" y="18" width="70" height="86" rx="8" fill="var(--scms-surface)" stroke="var(--scms-border-strong)" />
      <rect x="52" y="8" width="70" height="86" rx="8" fill="var(--scms-surface)" stroke="var(--scms-border-strong)" />
      <rect x="62" y="22" width="40" height="6" rx="3" fill="var(--scms-primary)" opacity="0.8" />
      <rect x="62" y="36" width="50" height="4" rx="2" fill="var(--scms-border-strong)" />
      <rect x="62" y="46" width="44" height="4" rx="2" fill="var(--scms-border-strong)" />
      <rect x="62" y="56" width="48" height="4" rx="2" fill="var(--scms-border-strong)" />
      <rect x="62" y="66" width="30" height="4" rx="2" fill="var(--scms-border-strong)" />
      <circle cx="122" cy="84" r="14" fill="var(--scms-primary)" />
      <path d="M122 77v14M115 84h14" stroke="var(--scms-primary-text)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function Skeleton({ thumb }: { thumb: boolean }) {
  return (
    <ul className="scms-entries" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <li key={i} className="scms-entry scms-entry--skeleton">
          {thumb && <div className="scms-entry__thumb scms-shimmer" />}
          <div className="scms-entry__body">
            <span className="scms-shimmer" style={{ width: '45%', height: 16 }} />
            <span className="scms-shimmer" style={{ width: '75%', height: 12 }} />
            <span className="scms-shimmer" style={{ width: '25%', height: 12 }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function EntryList({ collection }: { collection: CollectionConfig }) {
  const { backend, entries: cache } = useCms();
  const [entries, setEntries] = useState<Entry[] | null>(cache.get(collection.name) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [order, setOrder] = useState<SortOrder>('newest');

  useEffect(() => {
    let active = true;

    loadEntries(backend, collection)
      .then((list) => {
        cache.set(collection.name, list);

        if (active) {
          setEntries(list);
        }
      })
      .catch((e: Error) => active && setError(e.message));

    return () => {
      active = false;
    };
  }, [backend, collection, cache]);

  const imageField = collection.fields.find((f) => f.widget === 'image');
  const date = dateField(collection);
  const draft = draftField(collection);
  const descriptionField = collection.fields.find((f) => f.widget === 'text');
  const isDraft = (entry: Entry) => !!draft && entry.data[draft.name] === true;

  const counts = useMemo(() => {
    const drafts = (entries ?? []).filter(isDraft).length;

    return { all: entries?.length ?? 0, drafts, published: (entries?.length ?? 0) - drafts };
  }, [entries, draft]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();

    return sortEntries(entries ?? [], collection, order).filter(
      (e) =>
        (filter === 'all' || (filter === 'drafts') === isDraft(e)) &&
        (!q || JSON.stringify(e.data).toLowerCase().includes(q)),
    );
  }, [entries, query, collection, order, filter, draft]);

  const dateFormat = new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium' });
  const createNew = () => navigate(`/c/${collection.name}/new`);

  const head = (
    <div className="scms-page__head">
      <div>
        <h1>{collection.label}</h1>
        {collection.description && <p className="scms-muted">{collection.description}</p>}
      </div>
      {collection.create && (
        <button className="scms-btn scms-btn--primary" onClick={createNew}>
          <Plus size={18} /> {t('new_entry', { label: collection.label_singular })}
        </button>
      )}
    </div>
  );

  if (error) {
    return (
      <section className="scms-page">
        {head}
        <p className="scms-login__error">{error}</p>
      </section>
    );
  }

  if (!entries) {
    return (
      <section className="scms-page">
        {head}
        <Skeleton thumb={!!imageField} />
      </section>
    );
  }

  if (!entries.length) {
    return (
      <section className="scms-page">
        {head}
        <div className="scms-empty">
          <EmptyIllustration />
          <h2>{t('empty_title')}</h2>
          <p>{t('empty_text')}</p>
          {collection.create && (
            <button className="scms-btn scms-btn--primary" onClick={createNew}>
              <Plus size={18} /> {t('new_entry', { label: collection.label_singular })}
            </button>
          )}
        </div>
      </section>
    );
  }

  const filters: [Filter, string, number][] = [
    ['all', t('filter_all'), counts.all],
    ['published', t('filter_published'), counts.published],
    ['drafts', t('filter_drafts'), counts.drafts],
  ];

  return (
    <section className="scms-page">
      {head}

      <div className="scms-list-tools">
        {draft && (
          <div className="scms-segmented" role="tablist" aria-label={t('filter_label')}>
            {filters.map(([value, label, count]) => (
              <button key={value} role="tab" aria-selected={filter === value} onClick={() => setFilter(value)}>
                {label} <span className="scms-segmented__count">{count}</span>
              </button>
            ))}
          </div>
        )}
        <label className="scms-search">
          <Search size={16} />
          <input type="search" placeholder={t('search')} aria-label={t('search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <select className="scms-select" value={order} aria-label={t('sort_label')} onChange={(e) => setOrder(e.target.value as SortOrder)}>
          {date && <option value="newest">{t('sort_newest')}</option>}
          {date && <option value="oldest">{t('sort_oldest')}</option>}
          <option value="title">{t('sort_title')}</option>
        </select>
      </div>

      {!visible.length && <p className="scms-empty scms-empty--small">{query ? t('no_results') : t('no_entries')}</p>}

      <ul className="scms-entries">
        {visible.map((entry) => {
          const when = date ? valueToDate(entry.data[date.name]) : null;
          const image = imageField ? (entry.data[imageField.name] as string | undefined) : undefined;
          const summary = descriptionField ? (entry.data[descriptionField.name] as string | undefined) : undefined;
          const href = `/c/${collection.name}/e/${encodeURIComponent(entry.slug)}`;

          return (
            <li key={entry.path}>
              <a className="scms-entry" href={`#${href}`} onClick={(e) => (e.preventDefault(), navigate(href))}>
                {imageField && (
                  <div className="scms-entry__thumb">{image ? <MediaImage src={image} alt="" /> : <FileText size={22} />}</div>
                )}
                <div className="scms-entry__body">
                  <strong className="scms-entry__title">{entryTitle(entry, collection)}</strong>
                  {summary && <span className="scms-entry__summary">{summary}</span>}
                  <span className="scms-entry__meta">
                    {when && <time dateTime={when.toISOString()}>{dateFormat.format(when)}</time>}
                    {isDraft(entry) && <span className="scms-badge">{t('draft')}</span>}
                  </span>
                </div>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
