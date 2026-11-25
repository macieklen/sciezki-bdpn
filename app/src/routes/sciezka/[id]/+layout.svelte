<!--
  Tryb nawigacji ścieżki: mapa przez cały czas (wspólna dla arkusza spaceru i arkuszy przystanków),
  pasek z nazwą ścieżki, przycisk pozycji. Strony podrzędne renderują arkusze nad mapą.
-->
<script lang="ts">
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onDestroy, onMount } from 'svelte';
  import type { TrailTexts } from '@sciezki/core';
  import { loadTexts } from '$lib/content';
  import { i18n, t } from '$lib/i18n.svelte';
  import { nav } from '$lib/nav.svelte';
  import { notifyArrival } from '$lib/notify';
  import { branchLabel } from '$lib/route';
  import { walk } from '$lib/walk.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import WalkMap from '$lib/components/WalkMap.svelte';

  let { data, children } = $props();
  const trail = $derived(data.trail);

  let tx = $state<TrailTexts | null>(null);
  $effect(() => {
    const lang = i18n.lang;
    loadTexts(trail.id, lang).then((v) => {
      if (i18n.lang === lang) tx = v;
    });
  });
  const title = (id: string) => tx?.stops[id]?.title ?? id;
  const query = $derived(page.url.searchParams.get('zrodlo') === 'sym' ? '?zrodlo=sym' : '');
  const stopHref = (id: string) => `${base}/sciezka/${trail.id}/${id}${query}`;

  // Pozycja: w trakcie spaceru z sesji (dopasowana do ścieżki), wcześniej z podglądu.
  const walking = $derived(walk.active && walk.isFor(trail.id));
  const rawWalk = $derived(walk.rawFix ? ([walk.rawFix.lon, walk.rawFix.lat] as [number, number]) : null);
  const position = $derived(
    walking ? (walk.status === 'on-trail' ? walk.position : rawWalk) : nav.preview ? ([nav.preview.lon, nav.preview.lat] as [number, number]) : null,
  );
  const onTrail = $derived(walking && walk.status === 'on-trail');
  const nextStopId = $derived(walking && walk.outlook.kind === 'ahead' ? (walk.outlook.stops[0]?.stopId ?? null) : null);
  const selectedStopId = $derived(page.params.stop ?? null);

  // Podgląd pozycji (bez pracy w tle) tylko poza spacerem i poza symulatorem.
  $effect(() => {
    if (walking || query) nav.stopPreview();
    else nav.startPreview();
  });
  onDestroy(() => nav.stopPreview());

  // Dotarcie do przystanku: powiadomienie i arkusz przystanku w położeniu „nisko”.
  let offEvent: (() => void) | undefined;
  onMount(() => {
    offEvent = walk.onEvent((e) => {
      if (!walk.isFor(trail.id)) return;
      if (e.type === 'arrived') {
        const s = trail.stops.find((x) => x.id === e.stopIds[0]);
        if (!s) return;
        notifyArrival(`${t().arrivedAt} ${s.number}`, e.stopIds.map(title).join(' · '), stopHref(s.id));
        nav.requestStopState('peek');
        goto(stopHref(s.id));
      } else if (e.type === 'junction' && e.options.some((o) => o.stopIds.length > 0)) {
        const names = tx?.entrances ?? {};
        const body = e.options
          .map((o) => `${branchLabel(o, names)} (${t().branchStops(o.stopIds.length)}${o.deadEnd ? `, ${t().deadEnd}` : ''})`)
          .join(' · ');
        notifyArrival(t().junctionTitle, body, `${base}/sciezka/${trail.id}${query}`);
      }
    });
  });
  onDestroy(() => offEvent?.());

  // Wybrany przystanek pokazujemy nad arkuszem.
  let mapRef: WalkMap | undefined = $state();
  let follow = $state(false);
  // …także po zmianie wysokości arkusza (nisko → pół ekranu), z opóźnieniem na animację.
  let focusTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const id = selectedStopId;
    void nav.sheetHeight;
    clearTimeout(focusTimer);
    if (id && mapRef) focusTimer = setTimeout(() => mapRef?.focusStop(id), 320);
  });

  let headerEl: HTMLElement | undefined = $state();
  let headerH = $state(60);
  const topInset = $derived(headerEl ? headerEl.offsetTop + headerH : 100);
</script>

<svelte:head><title>{tx ? `${tx.trail.name} · BdPN` : 'BdPN'}</title></svelte:head>

<div class="screen">
  <WalkMap
    bind:this={mapRef}
    bind:follow
    {trail}
    visited={walking ? walk.visited : []}
    {nextStopId}
    {selectedStopId}
    {position}
    {onTrail}
    rawFix={query && walk.rawFix ? [walk.rawFix.lon, walk.rawFix.lat] : null}
    entranceNames={tx?.entrances ?? {}}
    {stopHref}
    stopTitle={title}
    {topInset}
    bottomInset={nav.sheetHeight}
  />

  <div class="triad top-stripe"><span></span></div>
  <header class="bar" bind:this={headerEl} bind:clientHeight={headerH}>
    <a class="icon-btn" href="{base}/" aria-label={t().backToOverview}><Icon name="back" strokeWidth={2} /></a>
    <div class="name">{tx?.trail.name ?? ''}</div>
  </header>

  <div class="fabs" style:top="{topInset + 12}px">
    <button class="fab" aria-label={t().centerOnMe} aria-pressed={follow} disabled={!position} onclick={() => mapRef?.centerOnMe()}>
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
        ><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg
      >
    </button>
  </div>

  {@render children()}
</div>

<style>
  .screen {
    position: fixed;
    inset: 0;
    overflow: hidden;
    background: #e9eddf;
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
    padding: 6px 14px 6px 6px;
    display: flex;
    align-items: center;
    gap: 6px;
    box-shadow: 0 2px 8px rgba(46, 43, 40, 0.15);
  }
  .icon-btn {
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--brown);
  }
  .name {
    flex: 1;
    min-width: 0;
    font-size: 17px;
    font-weight: 700;
    color: var(--brown);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .fabs {
    position: absolute;
    right: 12px;
    z-index: 3;
  }
  .fab {
    width: 48px;
    height: 48px;
    border: none;
    border-radius: 50%;
    background: var(--surface);
    color: var(--brown);
    box-shadow: 0 2px 8px rgba(46, 43, 40, 0.15);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .fab[aria-pressed='true'] {
    color: #2f6fb0;
  }
  .fab:disabled {
    opacity: 0.5;
  }
</style>
