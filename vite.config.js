import { defineConfig, loadEnv } from 'vite';

function httpToWsTarget(httpUrl) {
  try {
    const u = new URL(httpUrl);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return u.toString();
  } catch {
    return 'ws://localhost:3001';
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  /** If only `npm run dev` runs without backend → ECONNREFUSED on /api/join */
  const apiTarget = env.VITE_PROXY_API_TARGET || 'http://localhost:3001';

  return {
  server: {
    port: 5173,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
      /* Protoo: in dev the client uses :3001/ws directly (see mediasoupClient getProtooUrl). Proxy as fallback. */
      '/ws': { target: httpToWsTarget(apiTarget), ws: true, changeOrigin: true },
    },
  },
  optimizeDeps: {
    include: ['protoo-client'],
  },
};
});
