import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/JingYueTuanOnWeb/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: '劲乐团 2026',
        short_name: '劲乐团',
        description: '浏览器端 O2Jam 风格节奏游戏，拖入 MP3 即可游玩',
        theme_color: '#0a0010',
        background_color: '#0a0010',
        display: 'fullscreen',
        orientation: 'portrait',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // 游戏资源全部预缓存
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
        runtimeCaching: [
          {
            // MP3 等用户音频不缓存，避免存储膨胀
            urlPattern: /\.(mp3|ogg|wav)$/i,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
});
