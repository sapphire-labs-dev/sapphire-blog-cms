/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // In library mode Vite does not replace process.env, and React needs it.
  define: command === 'build' ? { 'process.env.NODE_ENV': '"production"' } : {},
  build: {
    lib: {
      entry: 'src/main.tsx',
      name: 'SapphireCMS',
      formats: ['iife', 'es'],
      fileName: (format) => (format === 'es' ? 'sapphire-cms.mjs' : 'sapphire-cms.js'),
    },
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'happy-dom',
  },
}));
