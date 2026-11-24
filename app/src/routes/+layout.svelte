<script lang="ts">
  import '@fontsource/lato/300.css';
  import '@fontsource/lato/400.css';
  import '@fontsource/lato/700.css';
  import '@fontsource/lato/900.css';
  import '../app.css';
  import { i18n } from '$lib/i18n.svelte';

  let { children } = $props();

  $effect(() => {
    document.documentElement.lang = i18n.lang;
  });
</script>

{@render children()}
