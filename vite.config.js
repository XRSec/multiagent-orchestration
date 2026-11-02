import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { viteMultiagentApiPlugin } from './apps/desktop/src/main/vite-api-plugin.js';

export default defineConfig({
  plugins: [react(), viteMultiagentApiPlugin()],
  root: path.resolve(__dirname, 'apps/desktop'),
  server: {
    port: 3000,
    open: false,
    host: '0.0.0.0',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'apps/desktop/src'),
    },
  },
});
