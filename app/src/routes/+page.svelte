<!-- Przegląd: mapa wszystkich ścieżek; po wybraniu ścieżki krótki opis i przejście do nawigacji. -->
<script lang="ts">
  import { base } from '$app/paths';
  import type { Manifest, TrailTexts } from '@sciezki/core';
  import { loadManifest, loadTexts } from '$lib/content';
  import { formatDistance, i18n, t } from '$lib/i18n.svelte';
  import Icon from '$lib/components/Icon.svelte';
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
  const trail = $derived(manifest?.trails.find((x) => x.id === selected));
  const names = $derived(
    Object.fromEntries((manifest?.trails ?? []).map((x) => [x.id, x.name[i18n.lang] ?? x.name[manifest!.defaultLanguage] ?? x.id])),
  );
  let tx = $state<TrailTexts | null>(null);
  $effect(() => {
    const id = selected;
    const lang = i18n.lang;
    tx = null;
    if (id) loadTexts(id, lang).then((v) => selected === id && i18n.lang === lang && (tx = v));
  });

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
    <OverviewMap trails={manifest.trails} {names} bind:selected {bounds} {topInset} bottomInset={sheetH} />
  {/if}

  <div class="triad top-stripe"><span></span></div>
  <header class="bar" bind:this={headerEl} bind:clientHeight={headerH}>
    <img src="{base}/brand/bdpn-poziome.svg" alt="Bieszczadzki Park Narodowy" class="logo" />
    <LangSwitch />
  </header>

  <Sheet pos="peek" label={t().trails} onheight={(h) => (sheetH = h)}>
    {#snippet header()}
      <div class="head">
        {#if trail}
          <div class="title-row">
            <div class="titles">
              <div class="kicker">{tx?.trail.subtitle ?? t().natureTrail}</div>
              <h1>{names[trail.id]}</h1>
            </div>
            <button class="close" aria-label={t().close} onclick={() => (selected = null)}>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          <p class="facts">
            <span><strong>{formatDistance(trail.length, i18n.lang)}</strong> {t().networkLength}</span>
            <span><strong>{trail.stopCount}</strong> {t().stops}</span>
          </p>
          {#if tx?.trail.summary}<p class="summary">{tx.trail.summary}</p>{/if}
          <a class="open" href="{base}/sciezka/{trail.id}">
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4l-5 2v14l5-2 6 2 5-2V4l-5 2z" /><path d="M9 4v14M15 6v14" /></svg>
            {t().openTrail}
          </a>
        {:else}
          <h1>{t().trails}</h1>
          {#if failed}
            <p class="hint">{t().loadError} <button class="link" onclick={load}>{t().retry}</button></p>
          {:else}
            <p class="hint">{t().tapTrailHint}</p>
          {/if}
          <p class="version">Wersja {__APP_VERSION__}</p>
        {/if}
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
  .title-row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }
  .titles {
    flex: 1;
    min-width: 0;
  }
  .kicker {
    font-size: 13px;
    font-weight: 700;
    color: var(--grey);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .close {
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    border: none;
    border-radius: 50%;
    background: var(--bg);
    color: var(--brown);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .facts {
    margin-top: 12px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 20px;
    font-size: 15px;
    color: var(--grey);
  }
  .facts strong {
    font-size: 17px;
    color: var(--ink);
  }
  .summary {
    margin-top: 12px;
    font-size: 16px;
    line-height: 1.5;
  }
  .open {
    margin-top: 16px;
    height: 56px;
    border-radius: 28px;
    background: var(--brown);
    color: #fff;
    text-decoration: none;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    font-size: 18px;
    font-weight: 700;
  }
</style>
