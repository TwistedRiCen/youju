import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '有据 YouJu',
        short_name: '有据',
        description: '本地优先的事实与材料整理工具',
        lang: 'zh-CN',
        start_url: '/',
        display: 'standalone',
        background_color: '#f4f1ea',
        theme_color: '#173f35',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    proxy: {
      '/ai': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: false,
        secure: false,
      },
    },
  },
})
