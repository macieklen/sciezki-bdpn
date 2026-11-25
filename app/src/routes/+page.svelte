<!-- Przegląd: mapa wszystkich ścieżek; po wybraniu ścieżki krótki opis i przejście do nawigacji. -->
<script lang="ts">
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import type { Manifest } from '@sciezki/core';
  import { loadManifest } from '$lib/content';
  import { i18n, t } from '$lib/i18n.svelte';
  import LangSwitch from '$lib/components/LangSwitch.svelte';
  import OverviewMap from '$lib/components/OverviewMap.svelte';
  import Sheet from '$lib/components/Sheet.svelte';

  let manifest = $state<Manifest | null>(null);
  let failed = $state(false);
  function load() {
    failed = false;
    loadManifest().then((m) => (manifest = m), () => (failed = true));
  }
  load();

  let selected = $state<string | null>(null);
  const names = $derived(
    Object.fromEntries((manifest?.trails ?? []).map((x) => [x.id, x.name[i18n.lang] ?? x.name[manifest!.defaultLanguage] ?? x.id])),
  );

  // Zasięg: podkład mapy parku, a bez niego — wszystkie ścieżki.
  const bounds = $derived.by((): [number, number, number, number] | null => {
    if (!manifest) return null;
    if (manifest.maps[0]) return manifest.maps[0].bounds;
    const b = manifest.trails.map((x) => x.bbox);
    if (!b.length) return null;
    return [Math.min(...b.map((x) => x[0])), Math.min(...b.map((x) => x[1])), Math.max(...b.map((x) => x[2])), Math.max(...b.map((x) => x[3]))];
  });

  let headerEl: HTMLElement | undefined = $state();
  let headerH = $state(60);
  let sheetH = $state(140);
  const topInset = $derived(headerEl ? headerEl.offsetTop + headerH : 100);
</script>

<svelte:head><title>{t().trails} · BdPN</title></svelte:head>

<div class="screen">
  {#if manifest && bounds}
    <OverviewMap trails={manifest.trails} {names} bind:selected {bounds} {topInset} bottomInset={sheetH} onopen={(id) => goto(`${base}/sciezka/${id}`)} />
  {/if}

  <div class="triad top-stripe"><span></span></div>
  <header class="bar" bind:this={headerEl} bind:clientHeight={headerH}>
    <img src="{base}/brand/bdpn-poziome.svg" alt="Bieszczadzki Park Narodowy" class="logo" />
    <LangSwitch />
  </header>

  <Sheet pos="peek" label={t().trails} onheight={(h) => (sheetH = h)}>
    {#snippet header()}
      <div class="head">
        <h1>{t().trails}</h1>
        {#if failed}
          <p class="hint">{t().loadError} <button class="link" onclick={load}>{t().retry}</button></p>
        {:else}
          <p class="hint">{t().tapTrailHint}</p>
        {/if}
        <p class="version">Wersja {__APP_VERSION__}</p>
      </div>
    {/snippet}
  </Sheet>
</div>

<style>
  .screen {
    position: fixed;
    inset: 0;
    overflow: hidden;
    background: #f3f1ea;
  }
  .top-stripe {
    position: absolute;
    inset: 0 0 auto;
    height: 6px;
    z-index: 3;
  }
  .bar {
    position: absolute;
    top: calc(14px + var(--safe-top));
    left: 12px;
    right: 12px;
    z-index: 3;
    background: var(--surface);
    border-radius: var(--radius);
    padding: 8px 8px 8px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-shadow: 0 2px 8px rgba(46, 43, 40, 0.15);
  }
  .logo {
    height: 36px;
    width: auto;
    display: block;
  }
  .head {
    padding: 0 var(--gutter) 20px;
  }
  h1 {
    font-size: 26px;
    font-weight: 300;
    line-height: 1.15;
    color: var(--brown);
  }
  .hint {
    margin-top: 6px;
    font-size: 15px;
    line-height: 1.4;
    color: var(--grey);
  }
  .link {
    border: none;
    background: none;
    padding: 0;
    color: var(--green-text);
    font-weight: 700;
    text-decoration: underline;
    cursor: pointer;
  }
  .version {
    margin-top: 10px;
    font-size: 12px;
    color: var(--grey);
  }
</style>
