<script lang="ts">
  import { base } from '$app/paths';
  import type { TrailTexts } from '@sciezki/core';
  import { loadTexts } from '$lib/content';
  import { formatDistance, i18n, t } from '$lib/i18n.svelte';
  import { stopsByNumber } from '$lib/route';
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

  const stops = $derived(stopsByNumber(trail));
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
      <a class="start" href="{base}/sciezka/{trail.id}/spacer">
        <Icon name="walk" size={22} strokeWidth={2} />
        {t().startWalk}
      </a>
      <a class="simulate" href="{base}/sciezka/{trail.id}/spacer?zrodlo=sym">{t().simulateWalk}</a>
    </section>

    <section>
      <h2>{t().stopsHeading}</h2>
      <ol class="stops">
        {#each stops as s (s.id)}
          <li>
            <a href="{base}/sciezka/{trail.id}/{s.id}">
              <span class="badge">{s.number}</span>
              <span class="name">{tx.stops[s.id]?.title ?? s.id}</span>
              {#if tx.stops[s.id]?.audio}
                <span class="audio" title={t().narration}><Icon name="headphones" size={20} /><span class="visually-hidden">{t().narration}</span></span>
              {/if}
            </a>
          </li>
        {/each}
      </ol>
    </section>
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
  .start {
    text-decoration: none;
  }
  .simulate {
    align-self: center;
    min-height: 44px;
    display: flex;
    align-items: center;
    font-size: 15px;
    font-weight: 700;
  }
  h2 {
    margin: 24px var(--gutter) 6px;
    font-size: 20px;
    font-weight: 700;
    color: var(--brown);
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
