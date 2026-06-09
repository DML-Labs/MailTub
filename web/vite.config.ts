import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

const PORT = parseInt(process.env.VITE_PORT || process.env.PORT || '3001', 10)
const GO_PORT = parseInt(process.env.GO_PORT || String(PORT - 1), 10)

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon.svg', 'favicon-96x96.png', 'apple-touch-icon.png', 'icons/*.png'],
      manifest: {
        name: 'MailTub',
        short_name: 'MailTub',
        description: 'Self-hosted disposable email service by DML Labs',
        start_url: '/',
        display: 'standalone',
        background_color: '#131a2c',
        theme_color: '#131a2c',
        orientation: 'portrait-primary',
        categories: ['productivity', 'utilities'],
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          {
            name: 'New Mailbox',
            short_name: 'New',
            description: 'Create a new disposable inbox',
            url: '/?action=new',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^\/api\/v1\/(health|mailbox)/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          motion: ['framer-motion'],
        },
      },
    },
  },
  server: {
    port: PORT,
    strictPort: true,
    host: true,
    allowedHosts: true,
    proxy: {
      '/api': `http://127.0.0.1:${GO_PORT}`,
      '/admin/api': `http://127.0.0.1:${GO_PORT}`,
      '/metrics': `http://127.0.0.1:${GO_PORT}`,
      '/ws': { target: `ws://127.0.0.1:${GO_PORT}`, ws: true },
    },
  },
})
