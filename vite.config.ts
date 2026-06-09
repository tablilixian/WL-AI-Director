import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { imageProxyPlugin } from './vite-plugin-image-proxy';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3001,
        host: '0.0.0.0',
        proxy: {
          // Drama Backend 代理 (解决 CORS)
          '/drama-api': {
            target: 'http://117.50.108.73:8082',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/drama-api/, ''),
          },
          // BigModel 文件下载代理 (aigc-files.bigmodel.cn) — 必须放在 /bigmodel 前面，避免前缀冲突
          '/bigmodel-files': {
            target: 'https://aigc-files.bigmodel.cn',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/bigmodel-files\//, ''),
          },
          // BigModel API 代理
          '/bigmodel': {
            target: 'https://open.bigmodel.cn',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/bigmodel/, ''),
          },
          // 本地 Edge-TTS 代理 (解决 CORS)
          '/edge-tts': {
            target: 'http://localhost:5050',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/edge-tts/, ''),
          },
          // UCloud 视频下载代理 (解决 CORS)
          '/video-proxy': {
            target: 'https://maas-watermark-prod-new.cn-wlcb.ufileos.com',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/video-proxy\//, ''),
          },
        },
      },
      plugins: [react(), imageProxyPlugin()],
      define: {},
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
