<!-- Arkusz przystanku nad mapą: nisko (tytuł i nagranie) → pół ekranu → cały ekran (czytanie). -->
<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/state';
  import { stopNeighbours, trailGraph, type Neighbour, type TrailTexts } from '@sciezki/core';
  import { loadTexts, trailFileUrl } from '$lib/content';
  import { formatDistance, i18n, t } from '$lib/i18n.svelte';
  import { resolveMedia } from '$lib/media';
  import { nav } from '$lib/nav.svelte';
  import { isOppositeToGuide } from '$lib/route';
  import { walk } from '$lib/walk.svelte';
  import AudioBar from '$lib/components/AudioBar.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Sheet, { type SheetState } from '$lib/components/Sheet.svelte';

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
  const text = $derived(tx?.stops[stop.id]);

  // Położenie arkusza: „nisko” po automatycznym otwarciu (dotarcie), inaczej pół ekranu.
  let sheet = $state<SheetState>('half');
  $effect.pre(() => {
    void stop.id;
    sheet = nav.takeStopState('half');
  });

  const query = $derived(page.url.search);
  const closeHref = $derived(`${base}/sciezka/${trail.id}${query}`);
  const stopHref = (id: string) => `${base}/sciezka/${trail.id}/${id}${query}`;
  const walking = $derived(walk.active && walk.isFor(trail.id));
  const arrivedHere = $derived(walking && walk.arrival?.stopIds.includes(stop.id));
  const opposite = $derived(walking && isOppositeToGuide(trail, stop.id, walk.arrivalDirection[stop.id]));

  const tg = $derived(trailGraph(trail));
  const neighbours = $derived(stopNeighbours(tg, stop.id));
  const neighbourMeta = (n: Neighbour, texts: TrailTexts) => {
    const title = texts.stops[n.stopId]?.title;
    const towards = n.towards.map((id) => texts.entrances[id] ?? id).filter((name) => name !== title);
    return [formatDistance(n.distance, i18n.lang), towards.length ? `${t().towards}: ${towards.join(' · ')}` : null].filter(Boolean).join(' · ');
  };

  // Zdjęcia niewstawione w tekst — na końcu opisu.
  const extraImages = $derived(stop.images.filter((img) => !(text?.inlineImages ?? []).includes(img.source)));
  const srcset = (variants: Record<string, string>) =>
    Object.entries(variants)
      .map(([w, rel]) => `${trailFileUrl(trail.id, rel)} ${w}w`)
      .join(', ');
  const smallest = (variants: Record<string, string>) => trailFileUrl(trail.id, variants[Object.keys(variants).sort((a, b) => +a - +b)[0]!]!);

  // Zwinięta linia spaceru nad arkuszem.
  const ahead = $derived(walking && walk.outlook.kind === 'ahead' ? walk.outlook.stops[0] : undefined);
</script>

<svelte:head><title>{text ? `${text.title} · ${tx?.trail.name}` : 'BdPN'}</title></svelte:head>

<Sheet bind:pos={sheet} label={text?.title ?? stop.id} onheight={(h) => (nav.sheetHeight = h)}>
  {#snippet above()}
    {#if walking}
      <a class="walk-line" href={closeHref}>
        <span class="dot" class:off={walk.status !== 'on-trail'}></span>
        <span class="walk-text">
          {walk.visited.length} z {trail.stops.length}{#if ahead}{' · '}{t().aheadOfYou}: <strong>{trail.stops.find((s) => s.id === ahead.stopId)?.number} {tx?.stops[ahead.stopId]?.title}</strong> · {formatDistance(ahead.distance, i18n.lang)}{/if}
        </span>
      </a>
    {/if}
  {/snippet}

  {#snippet header()}
    <div class="head">
      <div class="title-row">
        <span class="badge big">{stop.number}</span>
        <div class="titles">
          <div class="kicker" class:here={arrivedHere}>{arrivedHere ? t().arrivedAt : t().stopNo(stop.number)}</div>
          <h1>{text?.title ?? ''}</h1>
        </div>
        <a class="close" href={closeHref} aria-label={t().closeStop}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </a>
      </div>
      {#if text?.audio}
        <div class="audio">
          <div class="audio-label">{t().narration}</div>
          <AudioBar
            src={trailFileUrl(trail.id, text.audio.file)}
            title={`${stop.number}. ${text.title}`}
            artwork={stop.images[0] ? smallest(stop.images[0].variants) : undefined}
          />
        </div>
      {/if}
    </div>
  {/snippet}

  {#if text}
    <article class="body">
      {#if opposite && text.oppositeNote}
        <div class="note direction"><Icon name="arrow" size={20} strokeWidth={2} /><p>{text.oppositeNote}</p></div>
      {/if}
      {#if text.fallback}
        <div class="note"><Icon name="globe" size={20} /><p>{t().translationMissing}</p></div>
      {/if}
      <div class="prose" use:resolveMedia={trail.id}>{@html text.html}</div>
      {#each extraImages as img (img.source)}
        <figure>
          <img srcset={srcset(img.variants)} sizes="(min-width: 640px) 640px, 100vw" src={smallest(img.variants)} width={img.width} height={img.height} alt={text.captions[img.source] ?? ''} loading="lazy" />
          {#if text.captions[img.source]}<figcaption>{text.captions[img.source]}</figcaption>{/if}
        </figure>
      {/each}

      {#if neighbours.length && tx}
        <nav class="neighbours" aria-label={t().neighbours}>
          <h2>{t().neighbours}</h2>
          <ul>
            {#each neighbours as n (n.stopId)}
              {@const ns = trail.stops.find((x) => x.id === n.stopId)!}
              <li>
                <a href={stopHref(n.stopId)}>
                  <span class="badge">{ns.number}</span>
                  <span class="n-text">
                    <span class="n-title">{tx.stops[n.stopId]?.title ?? n.stopId}</span>
                    <small>{neighbourMeta(n, tx)}</small>
                  </span>
                  <Icon name="chevron" size={20} strokeWidth={2} />
                </a>
              </li>
            {/each}
          </ul>
        </nav>
      {/if}
    </article>
  {/if}
</Sheet>

<style>
  .walk-line {
    margin: 0 12px;
    padding: 10px 14px;
    border-radius: 14px 14px 0 0;
    background: var(--panel);
    color: #e6e2da;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    text-decoration: none;
  }
  .walk-line strong {
    color: #fff;
  }
  .walk-text {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dot {
    width: 8px;
    height: 8px;
    flex-shrink: 0;
    border-radius: 50%;
    background: #8fc07f;
  }
  .dot.off {
    background: var(--sand);
  }
  .head {
    padding: 0 var(--gutter) 12px;
  }
  .title-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .badge.big {
    width: 44px;
    height: 44px;
    font-size: 20px;
  }
  .titles {
    flex: 1;
    min-width: 0;
  }
  .kicker {
    font-size: 12px;
    font-weight: 700;
    color: var(--grey);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .kicker.here {
    color: var(--green-text);
  }
  h1 {
    font-size: 24px;
    font-weight: 300;
    line-height: 1.15;
    color: var(--brown);
  }
  .close {
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    border-radius: 50%;
    background: var(--bg);
    color: var(--brown);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .audio {
    margin-top: 12px;
  }
  .audio-label {
    font-size: 14px;
    font-weight: 700;
    color: var(--brown);
    margin-bottom: 4px;
  }
  .body {
    padding: 4px var(--gutter) 32px;
  }
  .note {
    margin-bottom: 14px;
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
  .note p {
    margin: 0;
  }
  .note.direction {
    background: var(--sand-soft);
  }
  .note :global(svg) {
    flex-shrink: 0;
    margin-top: 1px;
  }
  .prose :global(figure),
  figure {
    margin: 16px calc(-1 * var(--gutter)) 0;
  }
  .prose :global(figure img),
  figure img {
    display: block;
    width: 100%;
    height: auto;
  }
  .prose :global(figcaption),
  figcaption {
    padding: 8px var(--gutter) 0;
    font-size: 14px;
    line-height: 1.4;
    color: var(--grey);
  }
  .prose :global(figure + p) {
    margin-top: 16px;
  }
  .neighbours {
    margin-top: 32px;
  }
  .neighbours h2 {
    font-size: 14px;
    font-weight: 700;
    color: var(--grey);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .neighbours ul {
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
  }
  .neighbours a {
    min-height: 60px;
    display: flex;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid var(--line);
    text-decoration: none;
    color: var(--ink);
  }
  .n-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .n-title {
    font-size: 16px;
    font-weight: 700;
  }
  .neighbours small {
    font-size: 13px;
    color: var(--grey);
  }
</style>
