<script lang="ts">
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onDestroy, onMount, untrack } from 'svelte';
  import { simulateWalk, trailGraph, walkThroughNodes, parseGpx, type BranchOption, type Fix, type TrailTexts } from '@sciezki/core';
  import { loadTexts } from '$lib/content';
  import { formatDistance, i18n, t } from '$lib/i18n.svelte';
  import { NativeLocation, SimulatedLocation, WebLocation, isNative } from '$lib/location.svelte';
  import { notifyArrival, prepareNotifications } from '$lib/notify';
  import { branchLabel, stopsByNumber } from '$lib/route';
  import { walk } from '$lib/walk.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import WalkMap from '$lib/components/WalkMap.svelte';

  let { data } = $props();
  const trail = $derived(data.trail);

  let tx = $state<TrailTexts | null>(null);
  $effect(() => {
    const lang = i18n.lang;
    loadTexts(trail.id, lang).then((v) => {
      if (i18n.lang === lang) tx = v;
    });
  });

  const simulated = $derived(page.url.searchParams.get('zrodlo') === 'sym');
  const query = $derived(simulated ? '?zrodlo=sym' : '');
  const stopsById = $derived(new Map(trail.stops.map((s) => [s.id, s])));
  const title = (id: string) => tx?.stops[id]?.title ?? id;
  const stopHref = (id: string) => `${base}/sciezka/${trail.id}/${id}${query}`;

  // ── Symulator ──
  const entranceIds = $derived(trail.entrances.filter((e) => e.kind === 'entrance').map((e) => e.id));
  let scenario = $state<'trasa' | 'odnogi' | 'gpx'>('trasa');
  // Wartości początkowe symulatora (później zmienia je użytkownik).
  let simFrom = $state(untrack(() => data.trail.guideDirection?.from ?? data.trail.entrances[0]?.id ?? ''));
  let simTo = $state(untrack(() => data.trail.guideDirection?.to ?? data.trail.entrances[1]?.id ?? ''));
  let noise = $state(8);
  let gpxFixes = $state<Fix[] | null>(null);
  let sim = $state<SimulatedLocation | null>(null);

  function scenarioFixes(): Fix[] {
    if (scenario === 'gpx' && gpxFixes) return gpxFixes;
    const tg = trailGraph(trail);
    const nodeOf = (entranceId: string) => trail.entrances.find((e) => e.id === entranceId)!.nodeId;
    const stops = [nodeOf(simFrom)];
    if (scenario === 'odnogi') {
      // Wejdź po drodze w każdą ślepą odnogę.
      const start = tg.graph.nodes.get(nodeOf(simFrom))!.xy;
      const leaves = trail.nodes
        .filter((n) => n.degree === 1 && !entranceIds.includes(n.entranceId ?? ''))
        .map((n) => ({ id: n.id, d: Math.hypot(...(tg.proj.forward(n.coord).map((v, i) => v - start[i]!) as [number, number])) }))
        .sort((a, b) => a.d - b.d);
      stops.push(...leaves.map((l) => l.id));
    }
    stops.push(nodeOf(simTo === simFrom ? entranceIds.find((e) => e !== simFrom)! : simTo));
    return simulateWalk(tg, walkThroughNodes(tg, stops), { noise, seed: Date.now() % 100000 });
  }

  function startWalk() {
    if (simulated) {
      const s = new SimulatedLocation(scenarioFixes());
      if (sim) s.speed = sim.speed;
      sim = s;
      walk.start(trail, s);
    } else if (isNative()) {
      prepareNotifications(t().notificationChannel);
      walk.start(trail, new NativeLocation(t().backgroundMessage, t().walking));
    } else {
      prepareNotifications(t().notificationChannel);
      walk.start(trail, new WebLocation());
    }
  }

  async function loadGpx(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    gpxFixes = parseGpx(await file.text());
    scenario = 'gpx';
    startWalk();
  }

  // ── Powiadomienia ──
  let offEvent: (() => void) | undefined;
  onMount(() => {
    if (!walk.active || !walk.isFor(trail.id)) startWalk();
    else if (walk.source?.kind === 'sym') sim = walk.source as SimulatedLocation;
    offEvent = walk.onEvent((e) => {
      if (e.type === 'arrived') {
        const s = stopsById.get(e.stopIds[0]!)!;
        notifyArrival(`${t().arrivedAt} ${s.number}`, e.stopIds.map(title).join(' · '), stopHref(s.id));
      } else if (e.type === 'junction' && e.options.some((o) => o.stopIds.length > 0)) {
        // Powiadamiamy tylko, gdy któraś gałąź ma nieodwiedzone przystanki.
        const body = e.options.map((o) => `${branchLabel(o, names)} (${t().branchStops(o.stopIds.length)}${o.deadEnd ? `, ${t().deadEnd}` : ''})`).join(' · ');
        notifyArrival(t().junctionTitle, body, `${base}/sciezka/${trail.id}/spacer${query}`);
      }
    });
  });
  onDestroy(() => offEvent?.());

  function finish() {
    walk.end();
    goto(`${base}/sciezka/${trail.id}`);
  }

  // ── Widok ──
  let follow = $state(true);
  let mapRef: WalkMap | undefined = $state();
  let showList = $state(false);
  let showSim = $state(true);
  const names = $derived(tx?.entrances ?? {});
  const branchMeta = (o: BranchOption) =>
    [
      o.endpoints.length === 1 ? formatDistance(o.endpoints[0]!.distance, i18n.lang) : null,
      t().branchStops(o.stopIds.length),
      o.deadEnd ? t().deadEnd : null,
    ]
      .filter(Boolean)
      .join(' · ');
  const arrivalStops = $derived(walk.arrival?.stopIds.map((id) => stopsById.get(id)!).filter(Boolean) ?? []);
  const outlookStops = $derived(walk.outlook.kind === 'none' ? [] : walk.outlook.stops);
  const nextStopId = $derived(walk.outlook.kind === 'ahead' ? (walk.outlook.stops[0]?.stopId ?? null) : null);
  const junctionDistance = $derived(walk.outlook.kind === 'ahead' ? walk.outlook.junction?.distance : undefined);
</script>

<svelte:head><title>{t().walking} · {tx?.trail.name ?? ''}</title></svelte:head>

<div class="screen">
  <WalkMap
    bind:this={mapRef}
    bind:follow
    {trail}
    visited={walk.visited}
    {nextStopId}
    position={walk.status === 'on-trail' ? walk.position : walk.rawFix ? [walk.rawFix.lon, walk.rawFix.lat] : null}
    onTrail={walk.status === 'on-trail'}
    rawFix={simulated && walk.rawFix ? [walk.rawFix.lon, walk.rawFix.lat] : null}
    entranceNames={tx?.entrances ?? {}}
    {stopHref}
    stopTitle={title}
  />

  <div class="triad top-stripe"><span></span></div>

  <header class="status-card">
    <span class="dot" class:off={walk.status !== 'on-trail'}></span>
    <div class="status-text">
      <div class="small">{t().walking} · {t().visitedOf(walk.visited.length, trail.stops.length)}</div>
      <div class="name">{tx?.trail.name ?? ''}</div>
    </div>
    <button class="pill" onclick={finish}>{t().endWalk}</button>
  </header>

  <div class="fabs">
    <button class="fab" aria-label={t().centerOnMe} aria-pressed={follow} onclick={() => mapRef?.centerOnMe()}>
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
        ><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg
      >
    </button>
    <button class="fab" aria-label={t().stopsList} onclick={() => (showList = !showList)}>
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
        ><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></svg
      >
    </button>
  </div>

  <div class="bottom">
    {#if simulated && sim}
      <section class="sim" aria-label={t().simulator}>
        <button class="sim-toggle" onclick={() => (showSim = !showSim)} aria-expanded={showSim}>
          {t().simulator} · {Math.round(sim.progress * 100)}%
          <Icon name="down" size={18} strokeWidth={2} />
        </button>
        {#if showSim}
          <div class="sim-body">
            <div class="sim-row">
              <label class="grow">
                {t().simStart}
                <select bind:value={simFrom} onchange={startWalk}>
                  {#each entranceIds as id (id)}<option value={id}>{names[id] ?? id}</option>{/each}
                </select>
              </label>
              <label class="grow">
                {t().simEnd}
                <select bind:value={simTo} onchange={startWalk}>
                  {#each entranceIds.filter((id) => id !== simFrom) as id (id)}<option value={id}>{names[id] ?? id}</option>{/each}
                </select>
              </label>
            </div>
            <label>
              {t().scenario}
              <select bind:value={scenario} onchange={startWalk}>
                <option value="trasa">{t().scenarioRoute}</option>
                <option value="odnogi">{t().scenarioSpurs}</option>
                {#if gpxFixes}<option value="gpx">{t().gpxFile}</option>{/if}
              </select>
            </label>
            <label>
              {t().noise}: {noise} m
              <input type="range" min="0" max="30" step="1" bind:value={noise} onchange={startWalk} />
            </label>
            <div class="sim-row">
              <div class="seg" role="group" aria-label={t().simSpeed}>
                {#each [1, 10, 30] as v (v)}
                  <button aria-pressed={sim.speed === v} onclick={() => (sim!.speed = v)}>×{v}</button>
                {/each}
              </div>
              <button class="pill" onclick={() => (sim!.playing ? sim!.pause() : sim!.play())}>{sim.playing ? t().simPause : t().simPlay}</button>
              <button class="pill" onclick={startWalk}>{t().restart}</button>
            </div>
            <label class="file">
              {t().gpxFile}
              <input type="file" accept=".gpx,application/gpx+xml" onchange={loadGpx} />
            </label>
          </div>
        {/if}
      </section>
    {/if}

    <section class="panel" aria-live="polite">
      {#if walk.arrival && arrivalStops.length && walk.junction}
        <a class="arrival-compact" href={stopHref(arrivalStops[0]!.id)}>
          <span class="badge">{arrivalStops[0]!.number}</span>
          <span class="next-text"><span class="small">{t().arrivedAt}</span>{arrivalStops.map((s) => title(s.id)).join(' · ')}</span>
          <Icon name="chevron" size={20} strokeWidth={2} />
        </a>
      {/if}
      {#if walk.arrival && arrivalStops.length && !walk.junction}
        <div class="arrival">
          <div class="small">{t().arrivedAt}</div>
          <div class="arrival-row">
            <span class="badge big">{arrivalStops[0]!.number}</span>
            <div class="arrival-title">{arrivalStops.map((s) => title(s.id)).join(' · ')}</div>
          </div>
          <div class="arrival-actions">
            <a class="primary" href={stopHref(arrivalStops[0]!.id)}>{t().open}</a>
            <button class="pill light" onclick={() => walk.dismissArrival()}>{t().close}</button>
          </div>
        </div>
      {:else}
        {#if walk.error}
          <p class="note">{walk.error}</p>
        {:else if walk.status === 'waiting'}
          <p class="note">{t().waitingGps}</p>
        {:else if walk.status === 'off-trail'}
          <p class="note warn">
            {t().offTrail}{walk.trailDistance != null ? ` · ${t().fromTrail(formatDistance(walk.trailDistance, i18n.lang))}` : ''}
          </p>
        {/if}
        {#if walk.junction}
          <div class="junction">
            <div class="small">
              {junctionDistance != null ? t().junctionIn(formatDistance(junctionDistance, i18n.lang)) : t().junctionTitle}
            </div>
            <ul>
              {#each walk.junction.options as o (o.edgeId)}
                <li>
                  <Icon name="branch" size={18} />
                  <span class="branch-name">{branchLabel(o, names)}</span>
                  <span class="branch-meta">{branchMeta(o)}</span>
                </li>
              {/each}
            </ul>
          </div>
        {:else if walk.outlook.kind !== 'none'}
          {#if outlookStops.length}
            {@const first = stopsById.get(outlookStops[0]!.stopId)!}
            <a class="next" href={stopHref(first.id)}>
              <span class="badge big">{first.number}</span>
              <span class="next-text">
                <span class="small">
                  {walk.outlook.kind === 'ahead' ? t().aheadOfYou : t().nearest} · {formatDistance(outlookStops[0]!.distance, i18n.lang)}
                </span>
                <span class="next-title">{title(first.id)}</span>
              </span>
              <Icon name="chevron" size={22} strokeWidth={2} />
            </a>
          {:else if walk.visited.length === trail.stops.length}
            <p class="next-title">{t().allVisited}</p>
          {:else if junctionDistance != null}
            <p class="note"><Icon name="branch" size={18} /> {t().junctionIn(formatDistance(junctionDistance, i18n.lang))}</p>
          {:else}
            <p class="note">{t().nothingAhead}</p>
          {/if}
        {/if}
      {/if}
    </section>
  </div>

  {#if showList}
    <div class="sheet" role="dialog" aria-label={t().stopsList}>
      <div class="sheet-head">
        <h2>{t().stopsList}</h2>
        <button class="pill" onclick={() => (showList = false)}>{t().close}</button>
      </div>
      <ul>
        {#each stopsByNumber(trail) as s (s.id)}
          <li class:done={walk.visited.includes(s.id)}>
            <span class="badge">{s.number}</span>
            <a href={stopHref(s.id)}>{title(s.id)}</a>
            {#if !walk.visited.includes(s.id)}
              <button class="pill small-pill" onclick={() => { walk.markVisited(s.id); showList = false; goto(stopHref(s.id)); }}>
                {t().imHere}
              </button>
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  {/if}
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
  .status-card {
    position: absolute;
    top: calc(14px + var(--safe-top));
    left: 12px;
    right: 12px;
    z-index: 3;
    background: var(--surface);
    border-radius: var(--radius);
    padding: 8px 8px 8px 16px;
    display: flex;
    align-items: center;
    gap: 10px;
    box-shadow: 0 2px 8px rgba(46, 43, 40, 0.15);
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--green);
    flex-shrink: 0;
  }
  .dot.off {
    background: var(--sand);
  }
  .status-text {
    flex: 1;
    min-width: 0;
  }
  .small {
    font-size: 13px;
    color: var(--grey);
  }
  .name {
    font-size: 16px;
    font-weight: 700;
    color: var(--brown);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pill {
    min-height: 44px;
    padding: 0 14px;
    border: 1px solid #c9c6c0;
    border-radius: 22px;
    background: var(--surface);
    font-weight: 700;
    font-size: 15px;
    color: var(--brown);
    cursor: pointer;
  }
  .fabs {
    position: absolute;
    right: 12px;
    top: calc(96px + var(--safe-top));
    z-index: 3;
    display: flex;
    flex-direction: column;
    gap: 10px;
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
  .bottom {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 3;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .panel {
    background: var(--panel);
    color: #fff;
    border-radius: 20px 20px 0 0;
    padding: 16px var(--gutter) calc(22px + var(--safe-bottom));
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .panel .small {
    color: #e6e2da;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .note {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 15px;
    color: #e6e2da;
  }
  .note.warn {
    color: var(--sand);
    font-weight: 700;
  }
  .next {
    display: flex;
    align-items: center;
    gap: 14px;
    color: #fff;
    text-decoration: none;
  }
  .next-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .next-title,
  .arrival-title {
    font-size: 20px;
    font-weight: 700;
  }
  .badge.big {
    width: 48px;
    height: 48px;
    font-size: 20px;
  }
  .arrival-row {
    margin-top: 6px;
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .arrival-actions {
    margin-top: 12px;
    display: flex;
    gap: 10px;
  }
  .primary {
    flex: 1;
    min-height: 48px;
    border-radius: 24px;
    background: var(--sand);
    color: var(--brown);
    font-weight: 700;
    font-size: 17px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
  }
  .pill.light {
    background: transparent;
    color: #fff;
    border-color: rgba(255, 255, 255, 0.45);
  }
  .arrival-compact {
    display: flex;
    align-items: center;
    gap: 12px;
    color: #fff;
    text-decoration: none;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.18);
  }
  .sim {
    margin: 0 12px;
    background: rgba(255, 255, 255, 0.96);
    border-radius: var(--radius);
    box-shadow: 0 2px 8px rgba(46, 43, 40, 0.15);
    font-size: 14px;
  }
  .sim-toggle {
    width: 100%;
    min-height: 44px;
    border: none;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 14px;
    font-weight: 700;
    color: var(--brown);
    cursor: pointer;
  }
  .sim-body {
    padding: 0 14px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sim-body label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    color: var(--grey);
  }
  .sim-body select {
    height: 40px;
    border: 1px solid #c9c6c0;
    border-radius: 8px;
    background: #fff;
    font: inherit;
    color: var(--ink);
    padding: 0 8px;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .junction ul {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .junction li {
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 10px;
    align-items: center;
  }
  .branch-name {
    font-size: 18px;
    font-weight: 700;
  }
  .branch-meta {
    grid-column: 2;
    font-size: 14px;
    color: #e6e2da;
  }
  .sim-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .seg {
    display: flex;
    border: 1px solid #c9c6c0;
    border-radius: 22px;
    overflow: hidden;
  }
  .seg button {
    min-width: 48px;
    min-height: 44px;
    border: none;
    background: #fff;
    font-weight: 700;
    color: var(--brown);
    cursor: pointer;
  }
  .seg button[aria-pressed='true'] {
    background: var(--brown);
    color: #fff;
  }
  .sheet {
    position: absolute;
    inset: auto 0 0;
    max-height: 75%;
    z-index: 5;
    background: var(--surface);
    border-radius: 20px 20px 0 0;
    box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.2);
    display: flex;
    flex-direction: column;
    padding-bottom: var(--safe-bottom);
  }
  .sheet-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px var(--gutter);
  }
  .sheet h2 {
    font-size: 20px;
    color: var(--brown);
  }
  .sheet ul {
    list-style: none;
    margin: 0;
    padding: 0 var(--gutter) 16px;
    overflow-y: auto;
  }
  .sheet li {
    min-height: 56px;
    display: flex;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid var(--line);
  }
  .sheet li a {
    flex: 1;
    color: var(--ink);
    text-decoration: none;
    font-size: 16px;
  }
  .sheet li.done .badge {
    background: var(--green);
    color: #fff;
  }
  .small-pill {
    font-size: 13px;
    padding: 0 10px;
  }
</style>
