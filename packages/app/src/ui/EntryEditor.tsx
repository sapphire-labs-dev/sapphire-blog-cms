import { ArrowLeft, Check, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { defaultData, entryPath, entryTitle, loadEntries, uniqueSlug, validate } from '../content/entries';
import { serializeEntry } from '../content/frontmatter';
import { renderSlug } from '../content/slug';
import { t } from '../i18n';
import type { CollectionConfig, Entry } from '../types';
import { navigate, setNavigationGuard, useCms, useToast } from './context';
import { Field, isBodyWidget } from './fields/Field';

export function EntryEditor({ collection, slug }: { collection: CollectionConfig; slug: string | null }) {
  const { backend, media, entries: cache } = useCms();
  const toast = useToast();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [data, setData] = useState<Record<string, unknown> | null>(slug ? null : defaultData(collection));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [missing, setMissing] = useState(false);
  const saved = useRef<string>(slug ? '' : JSON.stringify(defaultData(collection)));

  const dirty = data !== null && JSON.stringify(data) !== saved.current;

  const listEntries = useCallback(async () => {
    const list = cache.get(collection.name) ?? (await loadEntries(backend, collection));

    cache.set(collection.name, list);

    return list;
  }, [backend, collection, cache]);

  useEffect(() => {
    if (!slug) {
      return;
    }

    listEntries()
      .then((list) => {
        const found = list.find((e) => e.slug === slug);

        if (!found) {
          setMissing(true);

          return;
        }

        setEntry(found);
        setData(found.data);
        saved.current = JSON.stringify(found.data);
      })
      .catch((e: Error) => toast(e.message, 'error'));
  }, [slug, listEntries, toast]);

  // Warns before losing changes, both when navigating in the panel and when closing the tab.
  useEffect(() => {
    if (!dirty) {
      setNavigationGuard(null);

      return undefined;
    }

    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();

    setNavigationGuard(() => window.confirm(t('discard_confirm')));
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      setNavigationGuard(null);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [dirty]);

  const { mainFields, sideFields } = useMemo(() => {
    const main = collection.fields.filter((f) => f.name === collection.identifier_field || isBodyWidget(f));

    return { mainFields: main, sideFields: collection.fields.filter((f) => !main.includes(f)) };
  }, [collection]);

  const update = (name: string, value: unknown) => {
    setData((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      const { [name]: _removed, ...rest } = current;

      return rest;
    });
  };

  const save = async () => {
    if (!data || saving) {
      return;
    }

    const found = validate(data, collection.fields, t);

    setErrors(found);

    if (Object.keys(found).length) {
      toast(t('fix_errors'), 'error');

      return;
    }

    setSaving(true);

    try {
      const list = await listEntries();
      const newSlug = entry
        ? entry.slug
        : uniqueSlug(renderSlug(collection.slug, data, collection.identifier_field), new Set(list.map((e) => e.slug)));
      const path = entry?.path ?? entryPath(collection, newSlug);
      const content = serializeEntry(data, collection.fields, collection.extension);
      const mediaChanges = await media.changesFor([content]);
      const changes = [{ path, content }, ...mediaChanges];
      const verb = entry ? 'Update' : 'Create';

      await backend.commit({ message: `${verb} ${collection.label_singular} “${newSlug}”`, changes, deletions: [] });
      media.markSaved(mediaChanges);

      const savedEntry: Entry = { path, slug: newSlug, data };

      cache.set(collection.name, [...list.filter((e) => e.path !== path), savedEntry]);
      saved.current = JSON.stringify(data);
      setEntry(savedEntry);
      setNavigationGuard(null);
      toast(backend.name !== 'local' ? t('saved_github') : t('saved'));

      if (!entry) {
        navigate(`/c/${collection.name}/e/${encodeURIComponent(newSlug)}`);
      }
    } catch (error) {
      toast(`${t('error')}: ${(error as Error).message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!entry || !window.confirm(t('delete_confirm', { title: entryTitle(entry, collection) }))) {
      return;
    }

    setSaving(true);

    try {
      await backend.commit({ message: `Delete ${collection.label_singular} “${entry.slug}”`, changes: [], deletions: [entry.path] });
      cache.set(collection.name, (cache.get(collection.name) ?? []).filter((e) => e.path !== entry.path));
      setNavigationGuard(null);
      toast(t('deleted'));
      navigate(`/c/${collection.name}`);
    } catch (error) {
      toast(`${t('error')}: ${(error as Error).message}`, 'error');
      setSaving(false);
    }
  };

  // Ctrl+S / Cmd+S saves.
  const saveRef = useRef(save);

  saveRef.current = save;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveRef.current();
      }
    };

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (missing) {
    return (
      <section className="scms-page">
        <p className="scms-empty">{t('not_found')}</p>
      </section>
    );
  }

  if (!data) {
    return <p className="scms-center scms-muted">{t('loading')}</p>;
  }

  const renderField = (field: (typeof collection.fields)[number]) => (
    <Field
      key={field.name}
      field={field}
      value={data[field.name]}
      error={errors[field.name]}
      prominent={field.name === collection.identifier_field}
      onChange={(value) => update(field.name, value)}
    />
  );

  return (
    <div className="scms-editor-page">
      <div className="scms-editor-bar">
        <button className="scms-btn scms-btn--ghost" onClick={() => navigate(`/c/${collection.name}`)}>
          <ArrowLeft size={16} /> {collection.label}
        </button>
        <span className={`scms-status ${dirty ? 'scms-status--dirty' : ''}`}>
          {dirty ? t('unsaved') : entry ? (
            <>
              <Check size={14} /> {t('all_saved')}
            </>
          ) : null}
        </span>
        <div className="scms-editor-bar__end">
          {entry && collection.delete && (
            <button className="scms-btn scms-btn--ghost scms-btn--danger" disabled={saving} onClick={remove}>
              <Trash2 size={16} /> <span className="scms-hide-sm">{t('delete')}</span>
            </button>
          )}
          <button className="scms-btn scms-btn--primary" disabled={saving || (!dirty && !!entry)} onClick={save}>
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      </div>
      <div className="scms-editor-layout">
        <div className="scms-editor-layout__main">{mainFields.map(renderField)}</div>
        {sideFields.length > 0 && <aside className="scms-editor-layout__side scms-card">{sideFields.map(renderField)}</aside>}
      </div>
    </div>
  );
}
