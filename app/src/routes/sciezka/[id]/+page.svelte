<!-- Arkusz spaceru (gdy nie jest otwarty żaden przystanek). -->
<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/state';
  import { onMount, untrack } from 'svelte';
  import { parseGpx, simulateWalk, trailGraph, walkThroughNodes, type BranchOption, type Fix, type TrailTexts } from '@sciezki/core';
  import { loadTexts } from '$lib/content';
  import { formatDistance, i18n, t } from '$lib/i18n.svelte';
  import { NativeLocation, SimulatedLocation, WebLocation, isNative } from '$lib/location.svelte';
  import { nav } from '$lib/nav.svelte';
  import { prepareNotifications } from '$lib/notify';
  import { branchLabel, stopsByNumber } from '$lib/route';
  import { walk } from '$lib/walk.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Sheet, { type SheetState } from '$lib/components/Sheet.svelte';

  let { data } = $props();
  const trail = $derived(data.trail);
  let tx = $state<TrailTexts | null>(null);
  $effect(() => {
    const lang = i18n.lang;
    loadTexts(trail.id, lang).then((v) => {
      if (i18n.lang === lang) tx = v;
    });
  });
  const names = $derived(tx?.entrances ?? {});
  const title = (id: string) => tx?.stops[id]?.title ?? id;
  const simulated = $derived(page.url.searchParams.get('zrodlo') === 'sym');
  const query = $derived(simulated ? '?zrodlo=sym' : '');
  const stopHref = (id: string) => `${base}/sciezka/${trail.id}/${id}${query}`;
  const walking = $derived(walk.active && walk.isFor(trail.id));
  const stopsById = $derived(new Map(trail.stops.map((s) => [s.id, s])));

  let sheet = $state<SheetState>('open');

  function startWalk() {
    if (simulated) return startSim();
    prepareNotifications(t().notificationChannel);
    nav.stopPreview();
    walk.start(trail, isNative() ? new NativeLocation(t().backgroundMessage, t().walking) : new WebLocation());
  }
  function endWalk() {
    walk.end();
    sheet = 'peek';
  }

  // ── Symulator (?zrodlo=sym) ──
  const entranceIds = $derived(trail.entrances.filter((e) => e.kind === 'entrance').map((e) => e.id));
  let scenario = $state<'trasa' | 'odnogi' | 'gpx'>('trasa');
  let simFrom = $state(untrack(() => data.trail.guideDirection?.from ?? data.trail.entrances[0]?.id ?? ''));
  let simTo = $state(untrack(() => data.trail.guideDirection?.to ?? data.trail.entrances[1]?.id ?? ''));
  let noise = $state(8);
  let gpxFixes = $state<Fix[] | null>(null);
  let sim = $state<SimulatedLocation | null>(null);

  function scenarioFixes(): Fix[] {
    if (scenario === 'gpx' && gpxFixes) return gpxFixes;
    const tg = trailGraph(trail);
    const nodeOf = (id: string) => trail.entrances.find((e) => e.id === id)!.nodeId;
    const path = [nodeOf(simFrom)];
    if (scenario === 'odnogi') {
      const start = tg.graph.nodes.get(nodeOf(simFrom))!.xy;
      path.push(
        ...trail.nodes
          .filter((n) => n.degree === 1 && !entranceIds.includes(n.entranceId ?? ''))
          .map((n) => ({ id: n.id, d: Math.hypot(...(tg.proj.forward(n.coord).map((v, i) => v - start[i]!) as [number, number])) }))
          .sort((a, b) => a.d - b.d)
          .map((l) => l.id),
      );
    }
    path.push(nodeOf(simTo === simFrom ? entranceIds.find((e) => e !== simFrom)! : simTo));
    return simulateWalk(tg, walkThroughNodes(tg, path), { noise, seed: Date.now() % 100000 });
  }
  function startSim() {
    const s = new SimulatedLocation(scenarioFixes());
    if (sim) s.speed = sim.speed;
    sim = s;
    walk.start(trail, s);
  }
  async function loadGpx(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    gpxFixes = parseGpx(await file.text());
    scenario = 'gpx';
    startSim();
  }
  onMount(() => {
    if (walking && walk.source?.kind === 'sym') sim = walk.source as SimulatedLocation;
  });

  // ── Panel ──
  const outlookStops = $derived(walk.outlook.kind === 'none' ? [] : walk.outlook.stops);
  const junctionDistance = $derived(walk.outlook.kind === 'ahead' ? walk.outlook.junction?.distance : undefined);
  const branchMeta = (o: BranchOption) =>
    [o.endpoints.length === 1 ? formatDistance(o.endpoints[0]!.distance, i18n.lang) : null, t().branchStops(o.stopIds.length), o.deadEnd ? t().deadEnd : null]
      .filter(Boolean)
      .join(' · ');
</script>

<Sheet bind:pos={sheet} dark defaultRatio={2 / 3} label={tx?.trail.name ?? t().walking} onheight={(h, d) => ((nav.sheetHeight = h), (nav.sheetDragging = d))}>
  {#snippet header()}
    <div class="head">
      <h1>{tx?.trail.name ?? ''}</h1>
      {#if !walking}
        <button class="start" onclick={startWalk}>
          <Icon name="walk" size={22} strokeWidth={2} />
          {simulated ? t().simulateWalk : t().startWalk}
        </button>
        <p class="hint">{t().walkHint}</p>
      {:else}
        <div class="status">
          <span class="dot" class:off={walk.status !== 'on-trail'}></span>
          <span class="count">{t().walking} · {t().visitedOf(walk.visited.length, trail.stops.length)}</span>
          <button class="pill" onclick={endWalk}>{t().endWalk}</button>
        </div>
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
            <div class="small">{junctionDistance != null ? t().junctionIn(formatDistance(junctionDistance, i18n.lang)) : t().junctionTitle}</div>
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
                <span class="small">{walk.outlook.kind === 'ahead' ? t().aheadOfYou : t().nearest} · {formatDistance(outlookStops[0]!.distance, i18n.lang)}</span>
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
    </div>
  {/snippet}

  <div class="body">
    {#if tx?.trail.summary && !walking}<p class="summary">{tx.trail.summary}</p>{/if}
    <h2 class="list-title">{t().stopsHeading}</h2>
    {#if simulated}
      <section class="sim" aria-label={t().simulator}>
        <div class="sim-row">
          <label class="grow">{t().simStart}
            <select bind:value={simFrom} onchange={startSim}>{#each entranceIds as id (id)}<option value={id}>{names[id] ?? id}</option>{/each}</select>
          </label>
          <label class="grow">{t().simEnd}
            <select bind:value={simTo} onchange={startSim}>{#each entranceIds.filter((id) => id !== simFrom) as id (id)}<option value={id}>{names[id] ?? id}</option>{/each}</select>
          </label>
        </div>
        <label>{t().scenario}
          <select bind:value={scenario} onchange={startSim}>
            <option value="trasa">{t().scenarioRoute}</option>
            <option value="odnogi">{t().scenarioSpurs}</option>
            {#if gpxFixes}<option value="gpx">{t().gpxFile}</option>{/if}
          </select>
        </label>
        <label>{t().noise}: {noise} m <input type="range" min="0" max="30" bind:value={noise} onchange={startSim} /></label>
        {#if sim}
          <div class="sim-row">
            <div class="seg" role="group" aria-label={t().simSpeed}>
              {#each [1, 10, 30] as v (v)}<button aria-pressed={sim.speed === v} onclick={() => (sim!.speed = v)}>×{v}</button>{/each}
            </div>
            <button class="pill" onclick={() => (sim!.playing ? sim!.pause() : sim!.play())}>{sim.playing ? t().simPause : t().simPlay}</button>
            <span class="small">{Math.round(sim.progress * 100)}%</span>
          </div>
        {/if}
        <label>{t().gpxFile} <input type="file" accept=".gpx,application/gpx+xml" onchange={loadGpx} /></label>
      </section>
    {/if}
    <ul class="stops">
      {#each stopsByNumber(trail) as s (s.id)}
        <li class:done={walk.visited.includes(s.id) && walking}>
          <a href={stopHref(s.id)}>
            <span class="badge">{s.number}</span>
            <span class="stop-name">{title(s.id)}</span>
          </a>
          {#if walking && !walk.visited.includes(s.id)}
            <button class="pill small-pill" onclick={() => walk.markVisited(s.id)}>{t().imHere}</button>
          {/if}
        </li>
      {/each}
    </ul>
  </div>
</Sheet>

<style>
  .head {
    padding: 0 var(--gutter) 4px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .start {
    height: 56px;
    border: none;
    border-radius: 28px;
    background: var(--sand);
    color: var(--brown);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    font-size: 18px;
    font-weight: 700;
    cursor: pointer;
  }
  .hint,
  .note {
    margin: 0;
    font-size: 14px;
    color: #e6e2da;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .note.warn {
    color: var(--sand);
    font-weight: 700;
  }
  .status {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #8fc07f;
  }
  .dot.off {
    background: var(--sand);
  }
  .count {
    flex: 1;
    font-size: 14px;
    color: #e6e2da;
  }
  .pill {
    min-height: 40px;
    padding: 0 14px;
    border: 1px solid rgba(255, 255, 255, 0.45);
    border-radius: 20px;
    background: transparent;
    color: #fff;
    font-weight: 700;
    font-size: 14px;
    cursor: pointer;
  }
  .small {
    font-size: 13px;
    color: #e6e2da;
    text-transform: uppercase;
    letter-spacing: 0.04em;
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
  .next-title {
    font-size: 20px;
    font-weight: 700;
  }
  .badge.big {
    width: 48px;
    height: 48px;
    font-size: 20px;
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
  h1 {
    font-size: 24px;
    font-weight: 300;
    line-height: 1.15;
    color: #fff;
  }
  .summary {
    margin: 0 0 8px;
    font-size: 16px;
    line-height: 1.5;
    color: #e6e2da;
  }
  .list-title {
    margin: 12px 0 0;
    font-size: 13px;
    font-weight: 700;
    color: #e6e2da;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .body {
    padding: 0 var(--gutter) 24px;
  }
  .stops {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .stops li {
    min-height: 56px;
    display: flex;
    align-items: center;
    gap: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.14);
  }
  .stops a {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    color: #fff;
    text-decoration: none;
    min-height: 56px;
  }
  .stops li.done .badge {
    background: var(--green);
    color: #fff;
  }
  .stop-name {
    font-size: 16px;
  }
  .small-pill {
    font-size: 13px;
    padding: 0 10px;
  }
  .sim {
    margin-bottom: 12px;
    padding: 12px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.08);
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 14px;
    color: #e6e2da;
  }
  .sim label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .sim select {
    height: 40px;
    border-radius: 8px;
    border: none;
    font: inherit;
    padding: 0 8px;
  }
  .sim-row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .seg {
    display: flex;
    border: 1px solid rgba(255, 255, 255, 0.45);
    border-radius: 20px;
    overflow: hidden;
  }
  .seg button {
    min-width: 48px;
    min-height: 40px;
    border: none;
    background: transparent;
    color: #fff;
    font-weight: 700;
    cursor: pointer;
  }
  .seg button[aria-pressed='true'] {
    background: #fff;
    color: var(--brown);
  }
</style>
