<!--
  Arkusz wysuwany od dołu nad mapą, z dwoma położeniami:
  - peek: sam nagłówek (np. tytuł i nagranie),
  - open: pełna treść przewijana w arkuszu; wysokość ustawia użytkownik, przeciągając uchwyt
    (bez przeskakiwania do stałych pozycji) — zapamiętywana w `openHeight`.
  Przeciągnięcie mocno w dół zwija do „peek”; dotknięcie uchwytu przełącza położenia (dostępność).
  Przy krótkiej treści arkusz nie jest wyższy niż treść.
-->
<script lang="ts" module>
  export type SheetState = 'peek' | 'open';
  /** Zapamiętane miejsca czytania (klucz treści → przewinięcie). */
  const readingPositions = new Map<string, number>();
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '$lib/i18n.svelte';

  let {
    pos = $bindable<SheetState>('open'),
    openHeight = $bindable<number | null>(null),
    dark = false,
    header,
    children,
    above,
    onheight,
    label,
    scrollKey,
  }: {
    pos?: SheetState;
    /** Wysokość otwartego arkusza [px]; null = domyślnie ok. 55% okna. */
    openHeight?: number | null;
    dark?: boolean;
    header: Snippet;
    children?: Snippet;
    /** Pasek nad arkuszem (np. zwinięta linia spaceru). */
    above?: Snippet;
    /** Wysokość widocznej części arkusza [px] i czy trwa przeciąganie — mapa omija arkusz przy kadrowaniu. */
    onheight?: (h: number, dragging: boolean) => void;
    label: string;
    /** Klucz treści (np. id przystanku): nowa treść otwiera się od początku, powrót przywraca miejsce czytania. */
    scrollKey?: string;
  } = $props();

  let viewport = $state(800);
  let headerH = $state(0);
  let aboveH = $state(0);
  let contentH = $state(0);
  let dragOffset = $state<number | null>(null);

  const HANDLE = 24;
  const peekH = $derived(HANDLE + headerH);
  // Nad otwartym arkuszem zawsze zostaje pas mapy z przystankiem (pod górnym paskiem aplikacji).
  const MAP_MIN = 190;
  const maxH = $derived(viewport - aboveH - MAP_MIN);
  const minOpen = $derived(Math.min(maxH, peekH + 80));
  // Otwarty arkusz: wybrana wysokość, ale nie wyższy niż treść i nie wyższy niż ekran.
  const contentFull = $derived(peekH + contentH);
  const openH = $derived(Math.max(minOpen, Math.min(maxH, contentFull, openHeight ?? viewport * 0.55)));
  const target = $derived(pos === 'open' && children ? openH : peekH);
  const height = $derived(dragOffset === null ? target : Math.max(peekH, Math.min(Math.min(maxH, contentFull), target - dragOffset)));

  $effect(() => {
    onheight?.(Math.round(height + aboveH), dragOffset !== null);
  });

  // ── Miejsce czytania: osobno dla każdej treści (do zamknięcia aplikacji) ──
  let contentEl: HTMLElement | undefined = $state();
  let restoredKey: string | undefined;
  $effect(() => {
    const key = scrollKey;
    if (!contentEl || key === restoredKey || contentH === 0) return;
    restoredKey = key;
    contentEl.scrollTop = key ? (readingPositions.get(key) ?? 0) : 0;
  });
  function onScroll() {
    if (scrollKey && restoredKey === scrollKey && contentEl) readingPositions.set(scrollKey, contentEl.scrollTop);
  }

  // ── Przeciąganie uchwytu / nagłówka ──
  let startY = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;
  let moved = false;

  function onDown(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('button:not(.handle), a, input, select')) return;
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
    if (!moved || !children) return;
    // Szybki ruch w dół albo prawie do samego nagłówka: zwiń. Inaczej zostaw tam, gdzie puszczono.
    if (velocity > 0.8 || h < peekH + 60) {
      pos = 'peek';
    } else {
      pos = 'open';
      openHeight = Math.round(h);
    }
  }

  function toggle() {
    if (moved || !children) return;
    pos = pos === 'peek' ? 'open' : 'peek';
  }
</script>

<svelte:window bind:innerHeight={viewport} />

<div class="sheet-wrap" style:height="{height + aboveH}px" class:dragging={dragOffset !== null}>
  {#if above}
    <div class="above" bind:clientHeight={aboveH}>{@render above()}</div>
  {/if}
  <section class="sheet" class:dark aria-label={label} style:height="{height}px">
    <div class="grab" role="presentation" onpointerdown={onDown} onpointermove={onMove} onpointerup={onUp} onpointercancel={onUp}>
      <button class="handle" aria-label={pos === 'open' ? t().collapse : t().expand} aria-expanded={pos === 'open'} onclick={toggle}><span></span></button>
      <div bind:clientHeight={headerH}>{@render header()}</div>
    </div>
    {#if children}
      <div class="content" bind:this={contentEl} onscroll={onScroll}>
        <div bind:clientHeight={contentH}>{@render children()}</div>
      </div>
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
    transition: height 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
    padding-bottom: var(--safe-bottom);
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
    overflow-y: auto;
    overscroll-behavior: contain;
  }
</style>
