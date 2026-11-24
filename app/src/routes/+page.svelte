<script lang="ts">
  import { base } from '$app/paths';
  import { contentBase, loadManifest } from '$lib/content';
  import { formatDistance, i18n, t } from '$lib/i18n.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import LangSwitch from '$lib/components/LangSwitch.svelte';

  let manifest = $state(loadManifest());
</script>

<svelte:head><title>{t().trails} · BdPN</title></svelte:head>

<header class="top">
  <img src="{base}/brand/bdpn-poziome.svg" alt="Bieszczadzki Park Narodowy" class="logo" />
  <LangSwitch />
</header>
<div class="triad"><span></span></div>

<main class="page">
  <div class="intro">
    <h1>{t().trails}</h1>
    <p>{t().trailsIntro}</p>
  </div>

  {#await manifest}
    <p class="status" aria-live="polite">…</p>
  {:then m}
    <ul class="list">
      {#each m.trails as trail (trail.id)}
        <li>
          <a class="card" href="{base}/sciezka/{trail.id}">
            <div class="thumb">
              {#if trail.cover}
                <img src="{contentBase}/{trail.cover}" alt="" loading="lazy" />
              {:else}
                <Icon name="image" size={36} />
              {/if}
            </div>
            <div class="body">
              <h2>{trail.name[i18n.lang] ?? trail.name[m.defaultLanguage]}</h2>
              <p class="facts">
                <span>{formatDistance(trail.length, i18n.lang)}</span>
                <span>{t().stopsCount(trail.stopCount)}</span>
              </p>
            </div>
            <span class="go"><Icon name="chevron" size={22} /></span>
          </a>
        </li>
      {/each}
    </ul>
  {:catch}
    <div class="status" role="alert">
      <p>{t().loadError}</p>
      <button onclick={() => (manifest = loadManifest())}>{t().retry}</button>
    </div>
  {/await}
</main>

<style>
  .top {
    background: var(--surface);
    padding: calc(16px + var(--safe-top)) var(--gutter) 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .logo {
    height: 44px;
    width: auto;
    display: block;
  }
  .intro {
    padding: 28px var(--gutter) 16px;
  }
  h1 {
    font-size: 34px;
    font-weight: 300;
    line-height: 1.1;
    color: var(--brown);
  }
  .intro p {
    margin-top: 8px;
    font-size: 16px;
    line-height: 1.45;
    color: var(--grey);
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 4px 16px 32px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .card {
    display: flex;
    align-items: stretch;
    min-height: 104px;
    background: var(--surface);
    border-radius: var(--radius);
    overflow: hidden;
    text-decoration: none;
    color: inherit;
    box-shadow: 0 1px 2px rgba(68, 52, 37, 0.08);
  }
  .thumb {
    width: 104px;
    flex-shrink: 0;
    background: var(--green);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .body {
    flex: 1;
    min-width: 0;
    padding: 14px 8px 14px 16px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 6px;
  }
  h2 {
    font-size: 18px;
    font-weight: 700;
    line-height: 1.25;
    color: var(--brown);
  }
  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    font-size: 14px;
    color: var(--grey);
  }
  .go {
    display: flex;
    align-items: center;
    padding-right: 12px;
    color: var(--taupe);
  }
  .status {
    padding: 24px var(--gutter);
    color: var(--grey);
  }
  .status button {
    margin-top: 12px;
    min-height: var(--tap);
    padding: 0 20px;
    border-radius: 24px;
    border: 1px solid var(--grey-light);
    background: var(--surface);
    font-weight: 700;
  }
</style>
