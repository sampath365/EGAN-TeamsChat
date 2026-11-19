import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_API_PROXY_TARGET || 'http://localhost:4100';

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: {
      target: ['chrome90', 'es2020'],
      chunkSizeWarningLimit: 900,
    },
    server: {
      port: Number(env.PORT || 12000),
      host: true,
      proxy: {
        '/api': { target, changeOrigin: true },
        '/uploads': { target, changeOrigin: true },
        '/ws': { target: target.replace('http', 'ws'), ws: true },
      },
    },
    preview: {
      port: Number(env.PORT || 12000),
      host: true,
      proxy: {
        '/api': { target, changeOrigin: true },
        '/uploads': { target, changeOrigin: true },
        '/ws': { target: target.replace('http', 'ws'), ws: true },
      },
    },
  };
});
