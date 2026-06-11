import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // Served from https://yotsuki-taylor.github.io/Labyrinth/ — assets must be
  // referenced relative to this sub-path, not the domain root.
  base: '/Labyrinth/',
  plugins: [react()],
  resolve: {
    alias: {
      '@labyrinth/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL ?? 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
});
