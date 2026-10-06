import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const apiPort = process.env.API_PORT || '4318';
export default defineConfig({
  plugins: [react()],
  build: { sourcemap: true },
  server: {
    proxy: {
      '/api': `http://127.0.0.1:${apiPort}`,
    },
  },
});
