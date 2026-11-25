<!--
  Arkusz wysuwany od dołu nad mapą, z położeniami: peek (sam nagłówek), half (pół ekranu),
  full (cały ekran, tryb czytania).
  - Przeciąganie za uchwyt i nagłówek; dotknięcie uchwytu przełącza położenia (dostępność).
  - W położeniu „half” ruch w górę w treści (kółko, przeciągnięcie) rozwija arkusz na cały ekran;
    gradient i przycisk „Czytaj dalej” podpowiadają ciąg dalszy.
  - W położeniu „full” przeciągnięcie w dół przy treści przewiniętej na początek zwija do „half”.
  - Jeśli treść mieści się w „half”, położenia „full” nie ma.
-->
<script lang="ts" module>
  export type SheetState = 'peek' | 'half' | 'full';
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '$lib/i18n.svelte';

  let {
    pos = $bindable<SheetState>('half'),
    dark = false,
    header,
    children,
    above,
    onheight,
    label,
    halfRatio = 0.55,
  }: {
    pos?: SheetState;
    dark?: boolean;
    header: Snippet;
    children?: Snippet;
    /** Pasek nad arkuszem (np. zwinięta linia spaceru). */
    above?: Snippet;
    /** Wysokość widocznej części arkusza [px] — mapa omija ją przy kadrowaniu. */
    onheight?: (h: number) => void;
    label: string;
    /** Wysokość położenia „half” jako ułamek okna. */
    halfRatio?: number;
  } = $props();

  let viewport = $state(800);
  let headerH = $state(0);
  let aboveH = $state(0);
  let contentEl: HTMLElement | undefined = $state();
  let contentH = $state(0);
  let dragOffset = $state<number | null>(null);

  const HANDLE = 24;
  const peekH = $derived(HANDLE + headerH);
  const halfH = $derived(Math.max(peekH, Math.min(viewport * halfRatio, peekH + contentH)));
  const canFull = $derived(!!children && peekH + contentH > halfH + 8);
  const fullH = $derived(viewport - 34);
  const target = $derived(pos === 'full' && canFull ? fullH : pos === 'peek' || !children ? peekH : halfH);
  const height = $derived(dragOffset === null ? target : Math.min(fullH, Math.max(peekH, target - dragOffset)));
  const truncated = $derived(pos === 'half' && canFull);

  $effect(() => {
    onheight?.(Math.round(height + aboveH));
  });

  // ── Przeciąganie ──
  let startY = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;
  let moved = false;

  function onDown(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('button, a, input, select')) return;
    startY = lastY = e.clientY;
    lastT = e.timeStamp;
    velocity = 0;
    moved = false;
    dragOffset = 0;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onMove(e: PointerEvent) {
    if (dragOffset === null) return;
    const dy = e.clientY - startY;
    if (Math.abs(dy) > 4) moved = true;
    velocity = (e.clientY - lastY) / Math.max(1, e.timeStamp - lastT);
    lastY = e.clientY;
    lastT = e.timeStamp;
    dragOffset = dy;
  }
  function onUp() {
    if (dragOffset === null) return;
    const h = height;
    dragOffset = null;
    if (!moved) return;
    const stops: [SheetState, number][] = [['peek', peekH], ...(children ? ([['half', halfH]] as [SheetState, number][]) : []), ...(canFull ? ([['full', fullH]] as [SheetState, number][]) : [])];
    // Szybki ruch: do następnego położenia w tę stronę; wolny: do najbliższego.
    const order = stops.map((s) => s[0]);
    const i = order.indexOf(pos === 'full' && !canFull ? 'half' : pos);
    if (velocity < -0.5 && i < order.length - 1) pos = order[i + 1]!;
    else if (velocity > 0.5 && i > 0) pos = order[i - 1]!;
    else pos = stops.reduce((a, b) => (Math.abs(b[1] - h) < Math.abs(a[1] - h) ? b : a))[0];
  }

  /** Dotknięcie uchwytu: peek → half → full → half. */
  function cycle() {
    if (!children) return;
    if (pos === 'peek') pos = 'half';
    else if (pos === 'half') pos = canFull ? 'full' : 'peek';
    else pos = 'half';
  }

  // ── Ruch w treści ──
  let touchY: number | null = null;
  function onWheel(e: WheelEvent) {
    if (pos === 'half' && canFull && e.deltaY > 0) {
      e.preventDefault();
      pos = 'full';
    } else if (pos === 'full' && e.deltaY < 0 && contentEl && contentEl.scrollTop <= 0) {
      pos = 'half';
    }
  }
  function onTouchStart(e: TouchEvent) {
    touchY = e.touches[0]?.clientY ?? null;
  }
  function onTouchMove(e: TouchEvent) {
    if (touchY === null) return;
    const dy = (e.touches[0]?.clientY ?? touchY) - touchY;
    if (pos === 'half' && canFull && dy < -12) {
      pos = 'full';
      touchY = null;
    } else if (pos === 'full' && dy > 40 && contentEl && contentEl.scrollTop <= 0) {
      pos = 'half';
      touchY = null;
    }
  }
</script>

<svelte:window bind:innerHeight={viewport} />

<div class="sheet-wrap" style:height="{height + aboveH}px" class:dragging={dragOffset !== null}>
  {#if above}
    <div class="above" bind:clientHeight={aboveH}>{@render above()}</div>
  {/if}
  <section class="sheet" class:dark class:full={pos === 'full' && canFull} aria-label={label} style:height="{height}px">
    <div
      class="grab"
      role="presentation"
      onpointerdown={onDown}
      onpointermove={onMove}
      onpointerup={onUp}
      onpointercancel={onUp}
    >
      <button class="handle" aria-label={pos === 'full' ? t().collapse : t().expand} onclick={cycle}><span></span></button>
      <div bind:clientHeight={headerH}>{@render header()}</div>
    </div>
    {#if children}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="content"
        class:scroll={pos === 'full' && canFull}
        bind:this={contentEl}
        onwheel={onWheel}
        ontouchstart={onTouchStart}
        ontouchmove={onTouchMove}
      >
        <div bind:clientHeight={contentH}>{@render children()}</div>
      </div>
      {#if truncated}
        <div class="fade">
          <button class="more" onclick={() => (pos = 'full')}>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6" /></svg>
            {t().readMore}
          </button>
        </div>
      {/if}
    {/if}
  </section>
</div>

<style>
  .sheet-wrap {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 4;
    display: flex;
    flex-direction: column;
    transition: height 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
    pointer-events: none;
  }
  .sheet-wrap.dragging,
  .sheet-wrap.dragging .sheet {
    transition: none;
  }
  .above {
    pointer-events: auto;
  }
  .sheet {
    position: relative;
    pointer-events: auto;
    background: var(--surface);
    color: var(--ink);
    border-radius: 20px 20px 0 0;
    box-shadow: 0 -2px 12px rgba(46, 43, 40, 0.2);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition:
      height 0.28s cubic-bezier(0.2, 0.8, 0.2, 1),
      border-radius 0.2s;
    padding-bottom: var(--safe-bottom);
  }
  .sheet.full {
    border-radius: 0;
  }
  .sheet.dark {
    background: var(--panel);
    color: #fff;
  }
  .grab {
    touch-action: none;
    cursor: grab;
    flex-shrink: 0;
  }
  .handle {
    display: block;
    width: 100%;
    height: 24px;
    border: none;
    background: transparent;
    padding: 10px 0;
    cursor: pointer;
  }
  .handle span {
    display: block;
    width: 40px;
    height: 4px;
    margin: 0 auto;
    border-radius: 2px;
    background: var(--grey-light);
  }
  .dark .handle span {
    background: rgba(255, 255, 255, 0.35);
  }
  .content {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    overscroll-behavior: contain;
  }
  .content.scroll {
    overflow-y: auto;
  }
  .fade {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 130px;
    padding-bottom: calc(20px + var(--safe-bottom));
    display: flex;
    align-items: flex-end;
    justify-content: center;
    background: linear-gradient(rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.85) 45%, #fff 75%);
    pointer-events: none;
  }
  .more {
    pointer-events: auto;
    min-height: 44px;
    padding: 0 18px 0 14px;
    border-radius: 22px;
    background: #fff;
    border: 1px solid #c9c6c0;
    box-shadow: 0 1px 4px rgba(46, 43, 40, 0.12);
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--brown);
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
  }
</style>
