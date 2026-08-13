import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Relative asset URLs make the same build portable between a custom domain,
// a user page and /REPOSITORY/ GitHub project pages.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // `actions/configure-pages` reports an http:// base_url whenever the Pages
  // site has "Enforce HTTPS" switched off, which would publish http:// canonical
  // and og:url metadata for a site that is perfectly reachable over TLS. Every
  // Pages host supports HTTPS, so the scheme is normalised here rather than
  // depending on a repository setting being remembered.
  const siteUrl = env.VITE_SITE_URL?.trim()
    .replace(/\/+$/, '')
    .replace(/^http:\/\//i, 'https://')
  return {
    base: env.VITE_BASE_PATH || './',
    assetsInclude: ['**/*.glb'],
    plugins: [
      react(),
      {
        name: 'can-form-seo-url',
        transformIndexHtml(html) {
          if (!siteUrl) return html
          return html
            // Both og:image and twitter:image carry the same relative URL, so
            // this has to replace every occurrence, not just the first.
            .replaceAll('content="./og-card.jpg"', `content="${siteUrl}/og-card.jpg"`)
            .replace('</head>', [
              `    <link rel="canonical" href="${siteUrl}/" />`,
              `    <meta property="og:url" content="${siteUrl}/" />`,
              '  </head>',
            ].join('\n'))
        },
      },
    ],
    build: {
      target: 'es2022',
      assetsInlineLimit: 0,
      cssCodeSplit: true,
      // Production source maps added ~4.4 MB to the Pages artifact for a site
      // whose whole point is media budget. Dev builds keep full maps.
      sourcemap: false,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/three')) return 'three'
            if (id.includes('node_modules/react')) return 'react'
          },
        },
      },
    },
  }
})
