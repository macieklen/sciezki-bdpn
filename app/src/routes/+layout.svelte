<script lang="ts">
  import '@fontsource/lato/300.css';
  import '@fontsource/lato/400.css';
  import '@fontsource/lato/700.css';
  import '@fontsource/lato/900.css';
  import '../app.css';
  import { goto } from '$app/navigation';
  import { i18n } from '$lib/i18n.svelte';
  import { onNotificationTap } from '$lib/notify';
  import { registerBackButton } from '$lib/back';
  import MapRoot from '$lib/components/MapRoot.svelte';

  let { children } = $props();

  $effect(() => {
    document.documentElement.lang = i18n.lang;
  });

  // Dotknięcie powiadomienia o przystanku otwiera jego ekran.
  onNotificationTap((url) => goto(url));
  // Systemowy „wstecz” w Androidzie: przystanek → ścieżka → przegląd.
  registerBackButton();
</script>

<!-- Jedna mapa pod wszystkimi ekranami: przejścia między nimi to ruch kamery, nie nowa mapa. -->
<MapRoot />
{@render children()}
