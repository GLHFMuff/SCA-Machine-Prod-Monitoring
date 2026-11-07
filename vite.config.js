import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Production Folding Monitoring',
        short_name: 'ProdMon',
        description: 'Production Folding Monitoring',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'fullscreen', // Otomatis fullscreen tanpa bar browser
        start_url: '/',
        icons: [
          {
            src: '/192ico.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/512ico.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})

