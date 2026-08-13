import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Relative asset URLs make the same build portable between a custom domain,
// a user page and /REPOSITORY/ GitHub project pages.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const siteUrl = env.VITE_SITE_URL?.replace(/\/$/, '')
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
