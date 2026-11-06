import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { viteRoomApiPlugin } from './server/vite-room-api-plugin.ts';

export default defineConfig(({ mode }) => {
  // 从开发环境配置或进程环境变量中解析 Desktop API 服务端点 (默认 http://localhost:3000)
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_TARGET || env.DESKTOP_API_URL || 'http://localhost:3000';

  return {
    plugins: [react(), viteRoomApiPlugin()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      host: true,
      proxy: {
        '/gateway': {
          target: 'ws://127.0.0.1:38080',
          ws: true,
          changeOrigin: true,
          rewriteWsOrigin: true,
          configure: (proxy) => {
            proxy.on('error', (err) => {
              console.warn('[ViteProxy] Gateway WebSocket Proxy Error:', err.message);
            });
          },
        },
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
          ws: true,
          // 针对 LLM 编排、长文本蒸馏与长轮询任务，设置 120,000ms 超时防御断连
          timeout: 120000,
          proxyTimeout: 120000,
          configure: (proxy, _options) => {
            // 异常捕获与防御性容错，防止断连导致开发服务器挂起
            proxy.on('error', (err, _req, res) => {
              console.warn('[ViteProxy] Desktop API Proxy Warning/Error:', err.message);
              if (!res.headersSent && typeof res.writeHead === 'function') {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: `Proxy Gateway Error: ${err.message}` }));
              }
            });

            // 针对 /api/distill/diff 等 SSE/流式传输与长文本响应，防止代理层缓冲阻断
            proxy.on('proxyRes', (proxyRes, _req, res) => {
              const contentType = proxyRes.headers['content-type'] || '';
              if (contentType.includes('text/event-stream')) {
                res.setHeader('Cache-Control', 'no-cache, no-transform');
                res.setHeader('X-Accel-Buffering', 'no');
              }
            });
          },
        },
      },
    },
  };
});
