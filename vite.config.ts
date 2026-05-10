import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-512.png'],
      manifest: {
        name: 'TeleNest Cloud',
        short_name: 'TeleNest',
        description: 'Next-gen secure cloud storage and communication',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'icon-512.png',
            sizes: '192x192',
            type: 'image/png'
          }
        ]
      }
    })
  ],
})

