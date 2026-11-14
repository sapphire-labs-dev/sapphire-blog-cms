import { CircleAlert, CircleCheck } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import type { Backend } from '../backends/types';
import type { MediaLibrary } from '../media/library';
import type { CmsConfig, Entry, User } from '../types';

export interface CmsContextValue {
  config: CmsConfig;
  backend: Backend;
  user: User;
  media: MediaLibrary;
  logout: () => void;
  /** Entries already loaded, per collection, to go back to the list without waiting. */
  entries: Map<string, Entry[]>;
}

export const CmsContext = createContext<CmsContextValue | null>(null);

export function useCms() {
  const value = useContext(CmsContext);

  if (!value) {
    throw new Error('useCms fora do CmsContext');
  }

  return value;
}

/* Hash routes: #/c/blog, #/c/blog/new, #/c/blog/e/my-post */

export function useHashRoute() {
  const read = () => window.location.hash.replace(/^#/, '') || '/';
  const [route, setRoute] = useState(read);

  useEffect(() => {
    const onChange = () => setRoute(read());

    window.addEventListener('hashchange', onChange);

    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}

/** Navigation guard while there are unsaved changes. */
let navigationGuard: (() => boolean) | null = null;

export function setNavigationGuard(guard: (() => boolean) | null) {
  navigationGuard = guard;
}

export function navigate(path: string) {
  if (navigationGuard && !navigationGuard()) {
    return;
  }

  navigationGuard = null;
  window.location.hash = path;
}

/* Quick notices in the corner of the screen */

interface Toast {
  id: number;
  message: string;
  kind: 'success' | 'error';
}

const ToastContext = createContext<(message: string, kind?: Toast['kind']) => void>(() => {});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, kind: Toast['kind'] = 'success') => {
    const id = Date.now() + Math.random();

    setToasts((list) => [...list, { id, message, kind }]);
    setTimeout(() => setToasts((list) => list.filter((toast) => toast.id !== id)), kind === 'error' ? 8000 : 4000);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="scms-toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`scms-toast scms-toast--${toast.kind}`}>
            {toast.kind === 'error' ? <CircleAlert size={18} /> : <CircleCheck size={18} />}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
