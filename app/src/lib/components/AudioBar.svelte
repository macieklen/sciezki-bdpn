<!-- Kompaktowy odtwarzacz nagrania lektora: przycisk (ciemnoszary, biały znak), pasek postępu, czas. -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte';

  let { src, title, artwork }: { src: string; title: string; artwork?: string } = $props();

  let audio: HTMLAudioElement | undefined = $state();
  let paused = $state(true);
  let current = $state(0);
  let duration = $state(0);

  const fmt = (s: number) => {
    if (!Number.isFinite(s)) return '0:00';
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };

  function toggle() {
    if (!audio) return;
    if (audio.paused) audio.play();
    else audio.pause();
  }

  // Sterowanie z ekranu blokady (w aplikacji natywnej docelowo wtyczka audio).
  $effect(() => {
    if (!('mediaSession' in navigator) || paused) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title, artist: 'Bieszczadzki Park Narodowy', artwork: artwork ? [{ src: artwork }] : [] });
    navigator.mediaSession.setActionHandler('play', () => audio?.play());
    navigator.mediaSession.setActionHandler('pause', () => audio?.pause());
  });

  $effect(() => {
    void src;
    paused = true;
    current = 0;
  });
</script>

<div class="bar">
  <audio bind:this={audio} {src} preload="metadata" bind:paused bind:currentTime={current} bind:duration></audio>
  <button class="play" aria-label={paused ? t().play : t().pause} onclick={toggle}>
    {#if paused}
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" style="margin-left: 2px"><path d="M7 4.5v15l13-7.5z" fill="#fff" /></svg>
    {:else}
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24"
        ><rect x="6" y="4" width="4" height="16" rx="1" fill="#fff" /><rect x="14" y="4" width="4" height="16" rx="1" fill="#fff" /></svg
      >
    {/if}
  </button>
  <input
    type="range"
    aria-label={t().position}
    min="0"
    max={duration || 0}
    step="0.1"
    bind:value={current}
    style:--progress="{duration ? (current / duration) * 100 : 0}%"
  />
  <span class="time">{current > 0 ? `${fmt(current)} / ` : ''}{fmt(duration)}</span>
</div>

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .play {
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    border: none;
    border-radius: 50%;
    background: var(--panel);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .time {
    font-size: 13px;
    color: var(--grey);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  input[type='range'] {
    flex: 1;
    appearance: none;
    height: 24px;
    margin: 0;
    background: transparent;
    cursor: pointer;
  }
  input[type='range']::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 2px;
    background: linear-gradient(to right, var(--panel) var(--progress), #ecebe6 var(--progress));
  }
  input[type='range']::-moz-range-track {
    height: 4px;
    border-radius: 2px;
    background: linear-gradient(to right, var(--panel) var(--progress), #ecebe6 var(--progress));
  }
  input[type='range']::-webkit-slider-thumb {
    appearance: none;
    width: 14px;
    height: 14px;
    margin-top: -5px;
    border-radius: 50%;
    background: var(--panel);
  }
  input[type='range']::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border: none;
    border-radius: 50%;
    background: var(--panel);
  }
</style>
