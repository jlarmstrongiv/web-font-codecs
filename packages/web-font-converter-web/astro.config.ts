import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
export default defineConfig({ base: process.env.ASTRO_BASE_PATH ?? '/', integrations: [react(), {
  name: 'separate-command-caches',
  hooks: {
    'astro:config:setup': ({ command, updateConfig }) => {
      // A build's SSR optimizer must not replace the running dev server's
      // dependency cache: that invalidates its URLs with HTTP 504 responses.
      updateConfig({ vite: { cacheDir: fileURLToPath(new URL(`./node_modules/.vite/${command}/`, import.meta.url)) } });
    },
  },
}], vite: {
  resolve: { conditions: ['web-font-codecs:source', 'browser', 'module', 'import'] },
  worker: { format: 'es' },
} });
