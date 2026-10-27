// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  // Pages are prerendered by default; the ones that set `prerender = false`
  // (country-aware pricing) render on demand in the Cloudflare Worker.
  // No astro:assets images or sessions on this site, so skip the Images and
  // KV bindings the adapter would otherwise provision on deploy.
  adapter: cloudflare({ imageService: 'compile' }),
  session: false,
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
