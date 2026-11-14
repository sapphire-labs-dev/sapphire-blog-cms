import { FolderOpen, LogIn } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { GatewayBackend } from '../backends/gateway';
import { GitHubBackend } from '../backends/github';
import { LocalBackend } from '../backends/local';
import type { Backend } from '../backends/types';
import { loadConfig } from '../config';
import { setLocale, t } from '../i18n';
import { MediaLibrary } from '../media/library';
import type { CmsConfig, Entry, User } from '../types';
import { CmsContext, ToastProvider } from './context';
import { Logo, Wordmark } from './Logo';
import { Shell } from './Shell';

export interface AppProps {
  options: { config?: unknown; configUrl?: string };
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'login'; config: CmsConfig; error?: string; busy?: Backend['name'] }
  | { status: 'ready'; config: CmsConfig; backend: Backend; user: User };

const isLocalhost = () => ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

export function App({ options }: AppProps) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [github, setGithub] = useState<GitHubBackend | null>(null);
  const [google, setGoogle] = useState<GatewayBackend | null>(null);

  useEffect(() => {
    (async () => {
      let config: CmsConfig;

      try {
        config = await loadConfig(options);
        setLocale(config.locale);
      } catch (error) {
        setLocale();
        setState({ status: 'error', message: (error as Error).message });

        return;
      }

      if (config.backend.name === 'github') {
        const methods = config.backend.login_methods;
        const gateway = methods.includes('google') ? new GatewayBackend(config.backend) : null;
        const gh = methods.includes('github') ? new GitHubBackend(config.backend) : null;

        setGoogle(gateway);
        setGithub(gh);

        try {
          // Resumes whichever session exists: Google first, then GitHub.
          for (const backend of [gateway, gh]) {
            const user = backend ? await backend.restore() : null;

            if (backend && user) {
              setState({ status: 'ready', config, backend, user });

              return;
            }
          }
        } catch (error) {
          setState({ status: 'login', config, error: (error as Error).message });

          return;
        }
      }

      setState({ status: 'login', config });
    })();
  }, [options]);

  const signIn = async (backend: Backend) => {
    if (state.status !== 'login') {
      return;
    }

    const { config } = state;

    setState({ status: 'login', config, busy: backend.name });

    try {
      const user = await backend.login();

      setState({ status: 'ready', config, backend, user });
    } catch (error) {
      const aborted = (error as Error).name === 'AbortError';

      setState({ status: 'login', config, error: aborted ? undefined : (error as Error).message });
    }
  };

  if (state.status === 'loading') {
    return (
      <div className="scms-login-page">
        <div className="scms-loading" role="status" aria-label={t('loading')}>
          <Logo size={72} />
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="scms-login-page">
        <div className="scms-login">
          <div className="scms-login__brand">
            <Wordmark />
          </div>
          <div className="scms-login__body">
            <h1>{t('config_error')}</h1>
            <p className="scms-login__error">{state.message}</p>
          </div>
        </div>
      </div>
    );
  }

  if (state.status === 'login') {
    const { config } = state;
    const showLocal =
      LocalBackend.isSupported() && (config.backend.name === 'local' || (config.local_backend && isLocalhost()));

    return (
      <div className="scms-login-page">
        <div className="scms-login">
          <div className="scms-login__brand">
            <Wordmark />
          </div>
          <div className="scms-login__body">
            {config.logo_url && <img className="scms-login__logo" src={config.logo_url} alt="" />}
            <h1>{config.site_title ?? t('login_welcome')}</h1>
            <p className="scms-muted">{t('login_title')}</p>
            {state.error && (
              <p className="scms-login__error" role="alert">
                {state.error}
              </p>
            )}
            <div className="scms-login__actions">
              {google && (
                <button className="scms-btn scms-btn--primary scms-btn--block scms-btn--lg" disabled={Boolean(state.busy)} onClick={() => signIn(google)}>
                  {state.busy === 'gateway' ? <span className="scms-spinner" /> : <GoogleIcon />}
                  {state.busy === 'gateway' ? t('signing_in') : t('login_google')}
                </button>
              )}
              {github && (
                <button
                  className={`scms-btn scms-btn--block scms-btn--lg ${google ? '' : 'scms-btn--primary'}`}
                  disabled={Boolean(state.busy)}
                  onClick={() => signIn(github)}
                >
                  {state.busy === 'github' ? <span className="scms-spinner" /> : <LogIn size={18} />}
                  {state.busy === 'github' ? t('signing_in') : t('login_github')}
                </button>
              )}
              {(github || google) && showLocal && <div className="scms-login__divider">{t('login_or')}</div>}
              {showLocal && (
                <>
                  <button
                    className={`scms-btn scms-btn--block scms-btn--lg ${github || google ? '' : 'scms-btn--primary'}`}
                    disabled={Boolean(state.busy)}
                    onClick={() => signIn(new LocalBackend())}
                  >
                    <FolderOpen size={18} /> {t('login_local')}
                  </button>
                  <p className="scms-hint">{t('login_local_hint')}</p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <Ready config={state.config} backend={state.backend} user={state.user} onLogout={() => setState({ status: 'login', config: state.config })} />;
}

function Ready({ config, backend, user, onLogout }: { config: CmsConfig; backend: Backend; user: User; onLogout: () => void }) {
  const value = useMemo(
    () => ({
      config,
      backend,
      user,
      media: new MediaLibrary(config, backend),
      entries: new Map<string, Entry[]>(),
      logout: () => {
        void backend.logout();
        onLogout();
      },
    }),
    [config, backend, user, onLogout],
  );

  return (
    <CmsContext.Provider value={value}>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </CmsContext.Provider>
  );
}

function GoogleIcon() {
  return (
    <svg className="scms-google-icon" width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
