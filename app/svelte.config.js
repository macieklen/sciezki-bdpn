import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    // Aplikacja jednostronicowa: Capacitor serwuje index.html, routing po stronie klienta.
    adapter: adapter({ fallback: 'index.html' }),
  },
};
