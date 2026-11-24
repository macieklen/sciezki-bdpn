<script lang="ts">
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import type { TrailTexts } from '@sciezki/core';
  import { loadTexts } from '$lib/content';
  import { formatDistance, i18n, t } from '$lib/i18n.svelte';
  import { defaultEnd, defaultStart, findRoute, spurStops, walkMinutes } from '$lib/route';
  import Icon from '$lib/components/Icon.svelte';

  let { data } = $props();
  const trail = $derived(data.trail);
  let tx = $state<TrailTexts | null>(null);
  $effect(() => {
    const lang = i18n.lang;
    loadTexts(trail.id, lang).then((v) => {
      if (i18n.lang === lang) tx = v;
    });
  });

  // Wybór trasy trzymamy w adresie (?od=…&do=…), żeby przetrwał powrót z przystanku.
  const from = $derived(page.url.searchParams.get('od') ?? defaultStart(trail) ?? '');
  const to = $derived.by(() => {
    const q = page.url.searchParams.get('do');
    return q && q !== from ? q : (defaultEnd(trail, from) ?? '');
  });
  const route = $derived(findRoute(trail, from, to));
  const spurs = $derived(spurStops(trail, route));
  const stopsById = $derived(new Map(trail.stops.map((s) => [s.id, s])));
  const routeQuery = $derived(`?od=${from}&do=${to}`);

  function choose(key: 'od' | 'do', value: string) {
    const params = new URLSearchParams(page.url.searchParams);
    params.set(key, value);
    if (key === 'od') {
      params.set('od', value);
      if (params.get('do') === value) params.delete('do');
    }
    goto(`?${params}`, { replaceState: true, noScroll: true, keepFocus: true });
  }

  let showSoon = $state(false);
</script>

<svelte:head><title>{tx ? `${tx.trail.name} · BdPN` : 'BdPN'}</title></svelte:head>

{#if tx}

  <div class="triad"><span></span></div>
  <header class="hero">
    <a class="back" href="{base}/" aria-label={t().back}><Icon name="back" strokeWidth={2} /></a>
    <h1>{tx.trail.name}</h1>
    <p class="subtitle">{tx.trail.subtitle ?? t().natureTrail}</p>
    <dl class="facts">
      <div><dt>{t().length}</dt><dd>{formatDistance(trail.length, i18n.lang)}</dd></div>
      <div><dt>{t().stops}</dt><dd>{trail.stops.length}</dd></div>
    </dl>
  </header>

  <main class="page">
    {#if tx.trail.descriptionHtml}
      <div class="description prose">{@html tx.trail.descriptionHtml}</div>
    {/if}

    <section class="planner" aria-label={t().startWalk}>
      <div class="field">
        <label for="od">{t().startFrom}</label>
        <div class="select">
          <select id="od" value={from} onchange={(e) => choose('od', e.currentTarget.value)}>
            {#each trail.entrances as e (e.id)}
              <option value={e.id}>{tx.entrances[e.id] ?? e.id}</option>
            {/each}
          </select>
          <Icon name="down" size={20} strokeWidth={2} />
        </div>
      </div>
      {#if trail.entrances.length > 2}
        <div class="field">
          <label for="do">{t().endAt}</label>
          <div class="select">
            <select id="do" value={to} onchange={(e) => choose('do', e.currentTarget.value)}>
              {#each trail.entrances.filter((e) => e.id !== from) as e (e.id)}
                <option value={e.id}>{tx.entrances[e.id] ?? e.id}</option>
              {/each}
            </select>
            <Icon name="down" size={20} strokeWidth={2} />
          </div>
        </div>
      {:else if trail.entrances.length === 2}
        <p class="route-end">{t().endAt}: <strong>{tx.entrances[to] ?? to}</strong></p>
      {/if}
      {#if route}
        <p class="route-facts">
          {t().routeLength}: {formatDistance(route.length, i18n.lang)} · {t().walkTime(walkMinutes(route.length))}
        </p>
      {/if}
      <button class="start" onclick={() => (showSoon = true)}>
        <Icon name="walk" size={22} strokeWidth={2} />
        {t().startWalk}
      </button>
      {#if showSoon}
        <p class="soon" role="status">{t().startWalkSoon}</p>
      {/if}
    </section>

    <section>
      <h2>{t().stopsHeading}</h2>
      <ol class="stops">
        {#each route?.stops ?? [] as id (id)}
          {@const s = stopsById.get(id)!}
          <li>
            <a href="{base}/sciezka/{trail.id}/{id}{routeQuery}">
              <span class="badge">{s.number}</span>
              <span class="name">{tx.stops[id]?.title ?? id}</span>
              {#if tx.stops[id]?.audio}
                <span class="audio" title={t().narration}><Icon name="headphones" size={20} /><span class="visually-hidden">{t().narration}</span></span>
              {/if}
            </a>
          </li>
        {/each}
      </ol>
    </section>

    {#if spurs.length}
      <section>
        <h2>{t().onSpurs}</h2>
        <p class="hint">{t().onSpursHint}</p>
        <ul class="stops">
          {#each spurs as s (s.id)}
            <li>
              <a href="{base}/sciezka/{trail.id}/{s.id}{routeQuery}">
                <span class="badge">{s.number}</span>
                <span class="name">{tx.stops[s.id]?.title ?? s.id}</span>
                <span class="audio"><Icon name="branch" size={20} /></span>
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </main>
{/if}

<style>
  .hero {
    background: var(--green);
    color: #fff;
    padding: calc(12px + var(--safe-top)) var(--gutter) 24px;
  }
  .back {
    width: 44px;
    height: 44px;
    margin-left: -10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
  }
  h1 {
    margin-top: 6px;
    font-size: 36px;
    font-weight: 300;
    line-height: 1.1;
  }
  .subtitle {
    margin-top: 8px;
    font-size: 17px;
  }
  .facts {
    margin: 18px 0 0;
    display: flex;
    gap: 28px;
  }
  .facts div {
    display: flex;
    flex-direction: column-reverse;
  }
  dt {
    font-size: 15px;
  }
  dd {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
  }
  main {
    background: var(--surface);
    min-height: 60vh;
    padding-bottom: calc(32px + var(--safe-bottom));
  }
  .description {
    padding: 20px var(--gutter) 0;
    font-size: 17px;
  }
  .planner {
    padding: 20px var(--gutter) 4px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  label {
    font-size: 14px;
    font-weight: 700;
    color: var(--grey);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .select {
    position: relative;
    color: var(--brown);
  }
  .select :global(svg) {
    position: absolute;
    right: 14px;
    top: 16px;
    pointer-events: none;
  }
  select {
    width: 100%;
    height: 52px;
    padding: 0 44px 0 14px;
    border: 1px solid #c9c6c0;
    border-radius: 10px;
    background: var(--surface);
    font: inherit;
    font-size: 17px;
    color: var(--ink);
    appearance: none;
  }
  .route-end,
  .route-facts {
    font-size: 15px;
    color: var(--grey);
  }
  .route-end strong {
    color: var(--ink);
  }
  .start {
    height: 56px;
    border: none;
    border-radius: 28px;
    background: var(--brown);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    font-size: 18px;
    font-weight: 700;
    cursor: pointer;
  }
  .soon {
    font-size: 14px;
    color: var(--grey);
  }
  h2 {
    margin: 24px var(--gutter) 6px;
    font-size: 20px;
    font-weight: 700;
    color: var(--brown);
  }
  .hint {
    margin: 0 var(--gutter) 4px;
    font-size: 14px;
    color: var(--grey);
  }
  .stops {
    list-style: none;
    margin: 0;
    padding: 0 var(--gutter);
  }
  .stops a {
    min-height: 56px;
    display: flex;
    align-items: center;
    gap: 14px;
    border-bottom: 1px solid var(--line);
    text-decoration: none;
    color: var(--ink);
  }
  .name {
    flex: 1;
    font-size: 17px;
  }
  .audio {
    color: var(--taupe);
    display: flex;
  }
</style>
