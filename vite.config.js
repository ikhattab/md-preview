import { defineConfig } from 'vite';
import { cpSync, existsSync } from 'fs';
import { join } from 'path';

const STATIC_FILES = [
  '_headers',
  'robots.txt',
  'sitemap.xml',
  'site.webmanifest',
  'favicon.ico',
  'favicon.svg',
  'favicon-96x96.png',
  'apple-touch-icon.png',
  'og-image.png',
  'web-app-manifest-192x192.png',
  'web-app-manifest-512x512.png',
];

export default defineConfig({
  build: {
    outDir: 'dist',
    // Mermaid's shared parser chunk is ~660 KB but lazy-loaded only for diagram blocks
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        entryFileNames: 'app.[hash].js',
        chunkFileNames: 'chunks/[name].[hash].js',
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name ?? '';
          if (name.endsWith('.css')) {
            return 'styles.[hash][extname]';
          }
          return 'assets/[name].[hash][extname]';
        },
      },
    },
  },
  plugins: [
    {
      name: 'copy-static-files',
      closeBundle() {
        for (const file of STATIC_FILES) {
          if (existsSync(file)) {
            cpSync(file, join('dist', file));
          }
        }
      },
    },
  ],
});
