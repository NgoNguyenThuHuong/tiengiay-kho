import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Tiền Giấy Kho',
        short_name: 'Tiền Giấy Kho',
        description: 'Hệ thống quản lý kho tiền giấy cổ',
        theme_color: '#ff9900',
        background_color: '#f4dc71',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [
          /^\/rest\//,
          /^\/auth\//,
          /^\/storage\//,
        ],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/.*\.r2\.dev\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/.*\.workers\.dev\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
});
