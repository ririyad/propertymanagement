import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import en from './src/i18n/en.json' with { type: 'json' }

const THEME_COLOR = '#0f766e'

/**
 * The Content Security Policy from public/_headers. `vite preview`, and so the e2e tests,
 * serve it too, so a policy that breaks the app fails before it reaches Cloudflare Pages.
 */
function productionCsp(): string {
  const headers = readFileSync(new URL('./public/_headers', import.meta.url), 'utf8')
  const policy = /^\s*Content-Security-Policy:\s*(.+)$/m.exec(headers)?.[1]
  if (!policy) throw new Error('public/_headers has no Content-Security-Policy')
  return policy.trim()
}

const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string }

export default defineConfig({
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(version) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/sw',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
      },
      manifest: {
        id: '/',
        name: en.app.name,
        short_name: en.app.shortName,
        description: en.app.description,
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: THEME_COLOR,
        background_color: '#ffffff',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  preview: {
    headers: { 'Content-Security-Policy': productionCsp() },
  },
})
