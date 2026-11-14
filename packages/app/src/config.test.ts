import { describe, expect, it } from 'vitest';

import { ConfigError, normalizeConfig } from './config';

const base = (backend: object) => ({
  backend: { name: 'github', repo: 'dono/blog', ...backend },
  media_folder: 'public/uploads',
  collections: [{ name: 'blog', folder: 'src/content/blog', fields: [{ name: 'title' }] }],
});

describe('login_methods', () => {
  it('defaults to GitHub only', () => {
    expect(normalizeConfig(base({})).backend.login_methods).toEqual(['github']);
  });

  it('accepts Google and ignores unknown values', () => {
    expect(normalizeConfig(base({ login_methods: ['google', 'github', 'x'] })).backend.login_methods).toEqual(['google', 'github']);
  });

  it('rejects a list without any valid method', () => {
    expect(() => normalizeConfig(base({ login_methods: ['x'] }))).toThrow(ConfigError);
  });
});
