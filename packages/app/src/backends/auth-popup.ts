/**
 * Popup sign-in using the same protocol as Netlify/Decap/Sveltia:
 * 1. the popup sends "authorizing:github" to this window;
 * 2. this window answers with the same message, revealing its origin;
 * 3. the popup sends "authorization:github:success:{...}" or "...:error:{...}".
 *
 * Thanks to this, our worker works with Decap and Sveltia, and the panel works with their
 * authenticators.
 */
export function authorizeWithPopup(options: {
  provider: string;
  authUrl: string;
}): Promise<{ token: string }> {
  const { provider, authUrl } = options;
  const width = 600;
  const height = 760;
  const left = window.screenX + (window.outerWidth - width) / 2;
  const top = window.screenY + (window.outerHeight - height) / 2;
  const popup = window.open(authUrl, 'sapphire-cms-auth', `width=${width},height=${height},left=${left},top=${top}`);

  if (!popup) {
    return Promise.reject(new Error('The browser blocked the sign-in window. Allow pop-ups for this site.'));
  }

  const authOrigin = new URL(authUrl).origin;

  return new Promise((resolve, reject) => {
    const controller = new AbortController();

    const finish = () => {
      controller.abort();
      clearInterval(timer);
      popup.close();
    };

    const timer = setInterval(() => {
      if (popup.closed) {
        controller.abort();
        clearInterval(timer);
        reject(new Error('Sign-in cancelled.'));
      }
    }, 800);

    window.addEventListener(
      'message',
      ({ data, origin, source }) => {
        if (source !== popup || origin !== authOrigin || typeof data !== 'string') {
          return;
        }

        if (data === `authorizing:${provider}`) {
          popup.postMessage(data, origin);

          return;
        }

        const match = data.match(new RegExp(`^authorization:${provider}:(success|error):(.+)$`, 's'));

        if (!match) {
          return;
        }

        finish();

        try {
          const result = JSON.parse(match[2]) as { token?: string; error?: string };

          if (match[1] === 'success' && result.token) {
            resolve({ token: result.token });
          } else {
            reject(new Error(result.error ?? 'Sign-in failed.'));
          }
        } catch {
          reject(new Error('Invalid response from the sign-in server.'));
        }
      },
      { signal: controller.signal },
    );
  });
}
