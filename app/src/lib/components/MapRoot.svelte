<!-- Wspólna mapa pod wszystkimi ekranami (patrz map-host.svelte.ts). -->
<script lang="ts">
  import 'maplibre-gl/dist/maplibre-gl.css';
  import '$lib/map-markers.css';
  import { onMount } from 'svelte';
  import { mapHost } from '$lib/map-host.svelte';

  let container: HTMLDivElement;
  onMount(() => {
    mapHost.init(container);
  });
</script>

<div class="map-root" bind:this={container}></div>

<style>
  .map-root {
    position: fixed;
    inset: 0;
    background: #f3f1ea;
  }
</style>
