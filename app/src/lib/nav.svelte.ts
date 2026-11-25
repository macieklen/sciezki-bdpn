/**
 * Stan trybu nawigacji współdzielony między mapą (układ ścieżki) a arkuszami (strony).
 * Przed „Rozpocznij spacer” pozycja pochodzi z lekkiego podglądu (bez pracy w tle);
 * po starcie — z sesji spaceru (walk.svelte.ts).
 */
import type { Fix } from '@sciezki/core';
import type { SheetState } from './components/Sheet.svelte';
import { NativeLocation, WebLocation, isNative, type LocationSource } from './location.svelte';

class NavState {
  /** Wysokość widocznego arkusza [px] — mapa omija ją przy kadrowaniu. */
  sheetHeight = $state(200);
  /** Czy użytkownik właśnie przeciąga arkusz (mapa podąża wtedy bez animacji). */
  sheetDragging = $state(false);
  /** Wysokość otwartego arkusza przystanku wybrana przez użytkownika — wspólna dla kolejnych przystanków. */
  stopOpenHeight = $state<number | null>(null);
  /** Położenie, w jakim ma się otworzyć następny arkusz przystanku (np. „peek” po dotarciu). */
  private requested: SheetState | null = null;
  /** Pozycja z podglądu (bez śledzenia spaceru). */
  preview = $state<Fix | null>(null);
  previewError = $state<string | null>(null);
  private source: LocationSource | null = null;

  requestStopState(s: SheetState) {
    this.requested = s;
  }
  takeStopState(fallback: SheetState): SheetState {
    const s = this.requested ?? fallback;
    this.requested = null;
    return s;
  }

  /** Pozycja tylko przy otwartej aplikacji (bez powiadomienia o pracy w tle). */
  startPreview() {
    if (this.source) return;
    this.source = isNative() ? new NativeLocation(null, '') : new WebLocation();
    this.source.start(
      (fix) => {
        this.preview = fix;
        this.previewError = null;
      },
      (m) => (this.previewError = m),
    );
  }

  stopPreview() {
    this.source?.stop();
    this.source = null;
  }
}

export const nav = new NavState();
