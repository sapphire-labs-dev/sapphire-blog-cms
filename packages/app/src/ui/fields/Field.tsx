import { ImagePlus, Trash2, X } from 'lucide-react';
import { useId, useRef, useState, type ReactNode } from 'react';

import { dateToValue, formatDate, isDateOnly, valueToDate } from '../../content/entries';
import { t } from '../../i18n';
import type { FieldConfig, SelectOption } from '../../types';
import { useCms, useToast } from '../context';
import { RichEditor } from '../editor/RichEditor';
import { MediaImage } from '../MediaImage';

interface FieldProps {
  field: FieldConfig;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
  /** Title field, shown prominently. */
  prominent?: boolean;
}

export const isBodyWidget = (field: FieldConfig) => field.widget === 'markdown' || field.widget === 'richtext';

function Counter({ value, field }: { value: string; field: FieldConfig }) {
  const over = field.maxlength !== undefined && value.length > field.maxlength;
  const under = field.minlength !== undefined && value.length > 0 && value.length < field.minlength;

  return (
    <span className={`scms-counter ${over || under ? 'scms-counter--bad' : ''}`} aria-live="polite">
      {value.length}
      {field.maxlength !== undefined && ` / ${field.maxlength}`}
    </span>
  );
}

function Wrapper({ field, id, error, children, counter }: { field: FieldConfig; id: string; error?: string; children: ReactNode; counter?: ReactNode }) {
  return (
    <div className={`scms-field ${error ? 'scms-field--error' : ''}`}>
      <div className="scms-field__label">
        <label htmlFor={id}>
          {field.label ?? field.name}
          {!field.required && <span className="scms-optional">{t('optional')}</span>}
        </label>
        {counter}
      </div>
      {children}
      {field.hint && !error && <p className="scms-hint">{field.hint}</p>}
      {error && <p className="scms-error-text" id={`${id}-error`}>{error}</p>}
    </div>
  );
}

const optionValue = (option: SelectOption) => (typeof option === 'string' ? option : option.value);
const optionLabel = (option: SelectOption) => (typeof option === 'string' ? option : option.label);

function ImageInput({ id, value, onChange, accept }: { id: string; value: string; onChange: (v: string) => void; accept: string }) {
  const { media } = useCms();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const upload = async (file?: File) => {
    if (!file) {
      return;
    }

    setBusy(true);

    try {
      onChange(await media.add(file));
    } catch (error) {
      toast((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`scms-image-input ${dragging ? 'scms-image-input--drag' : ''}`}
      onDragOver={(e) => (e.preventDefault(), setDragging(true))}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void upload(e.dataTransfer.files[0]);
      }}
    >
      {value && <MediaImage src={value} alt="" className="scms-image-input__preview" />}
      <div className="scms-image-input__actions">
        <button id={id} type="button" className="scms-btn" disabled={busy} onClick={() => input.current?.click()}>
          <ImagePlus size={16} /> {busy ? t('uploading') : value ? t('replace_image') : t('choose_image')}
        </button>
        {value && (
          <button type="button" className="scms-btn scms-btn--ghost" onClick={() => onChange('')}>
            <Trash2 size={16} /> {t('remove')}
          </button>
        )}
        {!value && !busy && <span className="scms-hint">{t('drop_image')}</span>}
      </div>
      <input ref={input} type="file" accept={accept} hidden onChange={(e) => void upload(e.target.files?.[0])} />
    </div>
  );
}

function ListInput({ id, value, onChange }: { id: string; value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const items = draft.split(',').map((s) => s.trim()).filter((s) => s && !value.includes(s));

    if (items.length) {
      onChange([...value, ...items]);
    }

    setDraft('');
  };

  return (
    <div className="scms-tags">
      {value.map((item) => (
        <span key={item} className="scms-tag">
          {item}
          <button type="button" aria-label={`${t('remove')} ${item}`} onClick={() => onChange(value.filter((v) => v !== item))}>
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          } else if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
      />
    </div>
  );
}

export function Field({ field, value, error, onChange, prominent }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : undefined;
  const text = typeof value === 'string' ? value : value == null ? '' : String(value);

  switch (field.widget) {
    case 'hidden':
      return null;

    case 'string':
      return (
        <Wrapper field={field} id={id} error={error} counter={<Counter value={text} field={field} />}>
          <input
            id={id}
            className={`scms-input ${prominent ? 'scms-input--title' : ''}`}
            value={text}
            aria-invalid={!!error}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value)}
          />
        </Wrapper>
      );

    case 'text':
      return (
        <Wrapper field={field} id={id} error={error} counter={<Counter value={text} field={field} />}>
          <textarea
            id={id}
            className="scms-input scms-textarea"
            value={text}
            rows={3}
            aria-invalid={!!error}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value)}
          />
        </Wrapper>
      );

    case 'number':
      return (
        <Wrapper field={field} id={id} error={error}>
          <input
            id={id}
            type="number"
            className="scms-input"
            value={text}
            min={field.min}
            max={field.max}
            step={field.step ?? (field.value_type === 'float' ? 'any' : 1)}
            onChange={(e) =>
              onChange(e.target.value === '' ? undefined : field.value_type === 'float' ? parseFloat(e.target.value) : parseInt(e.target.value, 10))
            }
          />
        </Wrapper>
      );

    case 'boolean':
      return (
        <div className="scms-field">
          <label className="scms-switch">
            <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
            <span className="scms-switch__track" aria-hidden="true" />
            <span>{field.label ?? field.name}</span>
          </label>
          {field.hint && <p className="scms-hint">{field.hint}</p>}
        </div>
      );

    case 'date':
    case 'datetime': {
      const dateOnly = isDateOnly(field);
      const date = valueToDate(value);
      const inputValue = date ? formatDate(date, dateOnly ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH:mm') : '';

      return (
        <Wrapper field={field} id={id} error={error}>
          <input
            id={id}
            type={dateOnly ? 'date' : 'datetime-local'}
            className="scms-input"
            value={inputValue}
            onChange={(e) => {
              // datetime-local has no time zone ("2026-11-10T14:30"); new Date() reads it as local time.
              const raw = e.target.value;
              const parsed = !raw ? null : dateOnly ? valueToDate(raw) : new Date(raw);

              onChange(parsed && !Number.isNaN(parsed.getTime()) ? dateToValue(parsed, field) : '');
            }}
          />
        </Wrapper>
      );
    }

    case 'select': {
      const options = field.options ?? [];

      if (field.multiple) {
        const selected = Array.isArray(value) ? (value as string[]) : [];

        return (
          <Wrapper field={field} id={id} error={error}>
            <div className="scms-checks" id={id}>
              {options.map((option) => (
                <label key={optionValue(option)}>
                  <input
                    type="checkbox"
                    checked={selected.includes(optionValue(option))}
                    onChange={(e) =>
                      onChange(e.target.checked ? [...selected, optionValue(option)] : selected.filter((v) => v !== optionValue(option)))
                    }
                  />
                  {optionLabel(option)}
                </label>
              ))}
            </div>
          </Wrapper>
        );
      }

      return (
        <Wrapper field={field} id={id} error={error}>
          <select id={id} className="scms-input" value={text} onChange={(e) => onChange(e.target.value)}>
            {!field.required && <option value="">—</option>}
            {options.map((option) => (
              <option key={optionValue(option)} value={optionValue(option)}>
                {optionLabel(option)}
              </option>
            ))}
          </select>
        </Wrapper>
      );
    }

    case 'image':
    case 'file':
      return (
        <Wrapper field={field} id={id} error={error}>
          <ImageInput id={id} value={text} onChange={onChange} accept={field.widget === 'image' ? 'image/*' : '*/*'} />
        </Wrapper>
      );

    case 'list':
      return (
        <Wrapper field={field} id={id} error={error}>
          <ListInput id={id} value={Array.isArray(value) ? value.map(String) : []} onChange={onChange} />
        </Wrapper>
      );

    case 'markdown':
    case 'richtext':
      return (
        <Wrapper field={field} id={id} error={error}>
          <RichEditor id={id} value={text} onChange={onChange} />
        </Wrapper>
      );

    default:
      return null;
  }
}
