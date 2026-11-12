import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': `http://127.0.0.1:${process.env.PORT || 3000}`,
      '/ws': { target: `ws://127.0.0.1:${process.env.PORT || 3000}`, ws: true },
    },
  },
});
