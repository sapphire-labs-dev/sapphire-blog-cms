import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Toolbar button that opens a small panel right below it. */
export function Popover({
  label,
  icon,
  active,
  children,
}: {
  label: string;
  icon: ReactNode;
  active?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as globalThis.Node)) {
        setOpen(false);
      }
    };

    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);

    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="scms-popover" ref={root}>
      <button
        type="button"
        className={`scms-tool ${active ? 'scms-tool--active' : ''}`}
        title={label}
        aria-label={label}
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen(!open)}
      >
        {icon}
      </button>
      {open && <div className="scms-popover__panel">{children(() => setOpen(false))}</div>}
    </div>
  );
}

/** One-line form used in the link, video and alt text panels. */
export function InlineForm({
  label,
  initial = '',
  submitLabel,
  type = 'text',
  onSubmit,
  extra,
}: {
  label: string;
  initial?: string;
  submitLabel: string;
  type?: string;
  onSubmit: (value: string) => void;
  extra?: ReactNode;
}) {
  const [value, setValue] = useState(initial);

  return (
    <form
      className="scms-inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value.trim());
      }}
    >
      <label>
        <span>{label}</span>
        <input className="scms-input" type={type} value={value} autoFocus onChange={(e) => setValue(e.target.value)} />
      </label>
      <div className="scms-inline-form__actions">
        {extra}
        <button type="submit" className="scms-btn scms-btn--primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
