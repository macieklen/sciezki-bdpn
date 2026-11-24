<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/state';
  import type { TrailTexts } from '@sciezki/core';
  import { loadTexts, trailFileUrl } from '$lib/content';
  import { i18n, t } from '$lib/i18n.svelte';
  import { defaultEnd, defaultStart, findRoute, isOppositeToGuide } from '$lib/route';
  import AudioPlayer from '$lib/components/AudioPlayer.svelte';
  import Icon from '$lib/components/Icon.svelte';

  let { data } = $props();
  const trail = $derived(data.trail);
  const stop = $derived(data.stop);
  let tx = $state<TrailTexts | null>(null);
  $effect(() => {
    const lang = i18n.lang;
    loadTexts(trail.id, lang).then((v) => {
      if (i18n.lang === lang) tx = v;
    });
  });

  const from = $derived(page.url.searchParams.get('od') ?? defaultStart(trail) ?? '');
  const to = $derived(page.url.searchParams.get('do') ?? defaultEnd(trail, from) ?? '');
  const route = $derived(findRoute(trail, from, to));
  const index = $derived(route?.stops.indexOf(stop.id) ?? -1);
  const prevId = $derived(index > 0 ? route!.stops[index - 1] : undefined);
  const nextId = $derived(index >= 0 ? route!.stops[index + 1] : undefined);
  const opposite = $derived(isOppositeToGuide(trail, route, stop.id));
  const query = $derived(page.url.search);
  const trailHref = $derived(`${base}/sciezka/${trail.id}${query}`);
  const stopHref = (id: string) => `${base}/sciezka/${trail.id}/${id}${query}`;

  // Galeria: przewijanie poziome z przyciąganiem; kropki pokazują bieżące zdjęcie.
  let gallery: HTMLElement | undefined = $state();
  let photo = $state(0);
  function onScroll() {
    if (gallery) photo = Math.round(gallery.scrollLeft / gallery.clientWidth);
  }
  $effect(() => {
    void stop.id;
    photo = 0;
    gallery?.scrollTo({ left: 0 });
  });

  const srcset = (variants: Record<string, string>) =>
    Object.entries(variants)
      .map(([w, rel]) => `${trailFileUrl(trail.id, rel)} ${w}w`)
      .join(', ');
  const smallest = (variants: Record<string, string>) =>
    trailFileUrl(trail.id, variants[Object.keys(variants).sort((a, b) => +a - +b)[0]!]!);
</script>

<svelte:head><title>{tx ? `${tx.stops[stop.id]?.title ?? stop.id} · ${tx.trail.name}` : 'BdPN'}</title></svelte:head>

{#if tx}
  {@const text = tx.stops[stop.id]}

  <div class="screen">
    <div class="media">
      <div class="triad"><span></span></div>
      {#if stop.images.length}
        <div class="gallery" bind:this={gallery} onscroll={onScroll} tabindex="-1">
          {#each stop.images as img, i (img.source)}
            <figure>
              <img
                srcset={srcset(img.variants)}
                sizes="(min-width: 640px) 640px, 100vw"
                src={smallest(img.variants)}
                width={img.width}
                height={img.height}
                alt={text?.captions[img.source] ?? t().photo(i + 1, stop.images.length)}
                loading={i === 0 ? 'eager' : 'lazy'}
              />
              {#if text?.captions[img.source]}
                <figcaption>{text.captions[img.source]}</figcaption>
              {/if}
            </figure>
          {/each}
        </div>
        {#if stop.images.length > 1}
          <div class="dots" aria-hidden="true">
            {#each stop.images as img, i (img.source)}
              <span class:active={i === photo}></span>
            {/each}
          </div>
        {/if}
      {:else}
        <div class="no-photo"><Icon name="image" size={48} strokeWidth={1.2} /></div>
      {/if}
      <a class="back" href={trailHref} aria-label={t().back}><Icon name="back" strokeWidth={2} /></a>
    </div>

    <main class="page content">
      <div class="kicker">
        <span class="badge big">{stop.number}</span>
        <span>{index >= 0 ? t().stopOf(index + 1, route!.stops.length) : t().stopOnSpur}</span>
      </div>
      <h1>{text?.title ?? stop.id}</h1>

      {#if opposite && text?.oppositeNote}
        <div class="note direction"><Icon name="arrow" size={20} strokeWidth={2} /><p>{text.oppositeNote}</p></div>
      {/if}
      {#if text?.fallback}
        <div class="note"><Icon name="globe" size={20} /><p>{t().translationMissing}</p></div>
      {/if}

      <div class="prose">{@html text?.html ?? ''}</div>

      <nav class="pager" aria-label="{t().previous} / {t().next}">
        {#if prevId}
          <a href={stopHref(prevId)} class="prev">
            <Icon name="back" size={20} strokeWidth={2} />
            <span><small>{t().previous}</small>{tx.stops[prevId]?.title}</span>
          </a>
        {:else}<span></span>{/if}
        {#if nextId}
          <a href={stopHref(nextId)} class="next">
            <span><small>{t().next}</small>{tx.stops[nextId]?.title}</span>
            <Icon name="chevron" size={20} strokeWidth={2} />
          </a>
        {/if}
      </nav>
    </main>

    {#if text?.audio}
      <div class="dock">
        <div class="page">
          <AudioPlayer
            src={trailFileUrl(trail.id, text.audio.file)}
            title={`${stop.number}. ${text.title}`}
            artwork={stop.images[0] ? smallest(stop.images[0].variants) : undefined}
          />
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .screen {
    min-height: 100dvh;
    background: var(--surface);
    display: flex;
    flex-direction: column;
  }
  .media {
    position: relative;
    background: #6e8f5e;
  }
  .media > .triad {
    position: absolute;
    inset: 0 0 auto;
    z-index: 1;
    height: 6px;
  }
  .gallery {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
    max-width: 640px;
    margin: 0 auto;
  }
  .gallery::-webkit-scrollbar {
    display: none;
  }
  figure {
    margin: 0;
    flex: 0 0 100%;
    scroll-snap-align: start;
    position: relative;
  }
  figure img {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 3 / 2;
    object-fit: cover;
  }
  figcaption {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 24px 16px 26px;
    font-size: 14px;
    color: #fff;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.55));
  }
  .dots {
    position: absolute;
    bottom: 10px;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    gap: 6px;
    pointer-events: none;
  }
  .dots span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.5);
  }
  .dots span.active {
    background: #fff;
  }
  .no-photo {
    aspect-ratio: 3 / 2;
    max-height: 260px;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.7);
  }
  .back {
    position: absolute;
    left: 12px;
    top: calc(14px + var(--safe-top));
    z-index: 2;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--surface);
    color: var(--brown);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  }
  .content {
    width: 100%;
    flex: 1;
    padding: 20px var(--gutter) 32px;
  }
  .kicker {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 14px;
    font-weight: 700;
    color: var(--grey);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .badge.big {
    width: 44px;
    height: 44px;
    font-size: 20px;
  }
  h1 {
    margin-top: 14px;
    font-size: 32px;
    font-weight: 300;
    line-height: 1.15;
    color: var(--brown);
  }
  .note {
    margin-top: 14px;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--bg);
    display: flex;
    gap: 10px;
    align-items: flex-start;
    font-size: 15px;
    line-height: 1.4;
    color: var(--brown);
  }
  .note.direction {
    background: var(--sand-soft);
  }
  .note :global(svg) {
    flex-shrink: 0;
    margin-top: 1px;
  }
  .prose {
    margin-top: 16px;
  }
  .pager {
    margin-top: 32px;
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  .pager a {
    min-height: var(--tap);
    max-width: 48%;
    display: flex;
    align-items: center;
    gap: 6px;
    text-decoration: none;
    color: var(--green-text);
    font-weight: 700;
    font-size: 15px;
  }
  .pager .next {
    margin-left: auto;
    text-align: right;
  }
  .pager small {
    display: block;
    font-weight: 400;
    font-size: 13px;
    color: var(--grey);
  }
  .dock {
    position: sticky;
    bottom: 0;
    background: var(--panel);
  }
</style>
