<script lang="ts">
  import { t } from '$lib/i18n.svelte';
  import Icon from './Icon.svelte';

  let { src, title, artwork }: { src: string; title: string; artwork?: string } = $props();

  const SPEEDS = [1, 1.25, 1.5, 0.75];
  let audio: HTMLAudioElement | undefined = $state();
  let paused = $state(true);
  let current = $state(0);
  let duration = $state(0);
  let speed = $state(1);

  const fmt = (s: number) => {
    if (!Number.isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };

  function toggle() {
    if (!audio) return;
    if (audio.paused) audio.play();
    else audio.pause();
  }
  function rewind() {
    if (audio) audio.currentTime = Math.max(0, audio.currentTime - 15);
  }
  function cycleSpeed() {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!;
    if (audio) audio.playbackRate = speed;
  }

  // Sterowanie z ekranu blokady w przeglądarce. W aplikacji natywnej zastąpi to wtyczka audio.
  $effect(() => {
    if (!('mediaSession' in navigator) || paused) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist: 'Bieszczadzki Park Narodowy',
      artwork: artwork ? [{ src: artwork }] : [],
    });
    navigator.mediaSession.setActionHandler('play', () => audio?.play());
    navigator.mediaSession.setActionHandler('pause', () => audio?.pause());
    navigator.mediaSession.setActionHandler('seekbackward', rewind);
  });

  // Zmiana nagrania (inny przystanek): zatrzymaj i wróć na początek.
  $effect(() => {
    void src;
    paused = true;
    current = 0;
  });
</script>

<div class="player">
  <audio
    bind:this={audio}
    {src}
    preload="metadata"
    bind:paused
    bind:currentTime={current}
    bind:duration
  ></audio>
  <div class="row">
    <button class="icon" aria-label={t().rewind} onclick={rewind}><Icon name="rewind" /></button>
    <button class="play" aria-label={paused ? t().play : t().pause} onclick={toggle}>
      {#if paused}
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>
      {:else}
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24"
          ><rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" /><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" /></svg
        >
      {/if}
    </button>
    <div class="meta">
      <div class="title">{t().narration}</div>
      <div class="time">{fmt(current)} / {fmt(duration)}</div>
    </div>
    <button class="speed" aria-label={t().speed} onclick={cycleSpeed}>{String(speed).replace('.', ',')}×</button>
  </div>
  <input
    type="range"
    aria-label={t().position}
    min="0"
    max={duration || 0}
    step="0.1"
    bind:value={current}
    style:--progress="{duration ? (current / duration) * 100 : 0}%"
  />
</div>

<style>
  .player {
    background: var(--panel);
    color: #fff;
    padding: 14px var(--gutter) calc(18px + var(--safe-bottom));
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  button {
    border: none;
    background: transparent;
    cursor: pointer;
  }
  .icon {
    width: var(--tap);
    height: var(--tap);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
  }
  .play {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: var(--sand);
    color: var(--brown);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .meta {
    flex: 1;
    min-width: 0;
  }
  .title {
    font-weight: 700;
    font-size: 15px;
  }
  .time {
    font-size: 14px;
    color: #e6e2da;
    font-variant-numeric: tabular-nums;
  }
  .speed {
    min-width: 56px;
    height: 44px;
    border: 1px solid rgba(255, 255, 255, 0.45);
    border-radius: 22px;
    color: #fff;
    font-weight: 700;
    font-size: 15px;
  }
  input[type='range'] {
    appearance: none;
    width: 100%;
    height: 24px;
    margin: 0;
    background: transparent;
    cursor: pointer;
  }
  input[type='range']::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 2px;
    background: linear-gradient(to right, var(--sand) var(--progress), rgba(255, 255, 255, 0.25) var(--progress));
  }
  input[type='range']::-moz-range-track {
    height: 4px;
    border-radius: 2px;
    background: linear-gradient(to right, var(--sand) var(--progress), rgba(255, 255, 255, 0.25) var(--progress));
  }
  input[type='range']::-webkit-slider-thumb {
    appearance: none;
    width: 16px;
    height: 16px;
    margin-top: -6px;
    border-radius: 50%;
    background: #fff;
  }
  input[type='range']::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border: none;
    border-radius: 50%;
    background: #fff;
  }
</style>
