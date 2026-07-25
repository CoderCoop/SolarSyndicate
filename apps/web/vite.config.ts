import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  /**
   * Relative asset paths, so the same build runs from the domain root, from a
   * GitHub Pages project subpath (/SolarSyndicate/), or straight off disk.
   * A hard-coded base would tie the artifact to one deployment; this game is a
   * single page with no client-side routing, so there is nothing to gain by
   * pinning it.
   */
  base: './',
  resolve: {
    // Build straight from workspace source: one build step, and the sim's
    // types stay live while iterating.
    alias: {
      '@solsyn/sim': src('../../packages/sim/src/index.ts'),
      '@solsyn/data': src('../../packages/data/src/index.ts'),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      workbox: {
        // The game is fully offline-capable by construction (§8.3): the sim
        // runs client-side and the save lives in IndexedDB, so precaching the
        // shell is all that installability requires.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
      manifest: {
        name: 'Solar Syndicate',
        short_name: 'Syndicate',
        description:
          'A spaceship management simulation. You are the Guild; the crew are the people who fly for it.',
        theme_color: '#0b1015',
        background_color: '#0b1015',
        display: 'standalone',
        orientation: 'portrait',
        // Relative to the manifest, for the same reason as `base` above: an
        // absolute '/' would send installed copies to the domain root, which
        // on a project Pages site is somebody else's page.
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  build: {
    target: 'es2022',
    // §8.5: keep the shell small enough to cold-load in under 3s on mid-range
    // Android. Shout if a dependency pushes us past it.
    chunkSizeWarningLimit: 500,
  },
})
