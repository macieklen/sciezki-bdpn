/**
 * Jedna mapa dla całej aplikacji (przegląd, ścieżka, przystanki). Ekrany dodają na nią swoje
 * warstwy i znaczniki oraz sterują kamerą — dzięki temu przejścia między ekranami są jednym
 * płynnym ruchem kamery zamiast podmiany map.
 *
 * Kamera: zasłonięte brzegi (arkusz, przyciski) idą zawsze jako `padding` mapy, więc kolejne
 * ruchy płynnie przechodzą między kadrami różnych ekranów.
 */
import maplibregl from 'maplibre-gl';
import { basemapUrl } from './basemap';
import { basemapStyle } from './map-style';

export type Insets = { top: number; bottom: number; left: number; right: number };
type Bounds = [number, number, number, number];

const mercX = (lon: number) => (lon + 180) / 360;
const mercY = (lat: number) => {
  const r = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
};
const lonOf = (x: number) => x * 360 - 180;
const latOf = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

class MapHost {
  map = $state.raw<maplibregl.Map | null>(null);
  /** Czy kamera była już ustawiona przez jakiś ekran (pierwszy widok — bez animacji). */
  private placed = false;
  /** Koniec trwającego „przelotu” między ekranami — poprawki kadru w trakcie go nie skracają. */
  private flightEnd = 0;
  private resolve!: (m: maplibregl.Map) => void;
  private readyPromise = new Promise<maplibregl.Map>((r) => (this.resolve = r));

  async init(container: HTMLElement) {
    if (this.map) return;
    const bm = await basemapUrl().catch(() => null);
    const map = new maplibregl.Map({
      container,
      style: basemapStyle(bm?.url ?? null, '© OpenStreetMap contributors'),
      center: [22.7, 49.1],
      zoom: 10,
      minZoom: 8,
      maxZoom: 18,
      attributionControl: bm ? { compact: true } : false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    this.map = map;
    if (import.meta.env.DEV) (window as unknown as { __map: unknown }).__map = map;
    map.once('load', () => this.resolve(map));
  }

  /** Mapa po załadowaniu stylu (można dodawać warstwy). */
  ready(): Promise<maplibregl.Map> {
    return this.readyPromise;
  }

  /**
   * Przesuń kamerę. Pierwsze ustawienie — natychmiast; `flight` oznacza przejście między
   * ekranami: późniejsze poprawki (np. arkusz zmienił wysokość) dolatują w pozostałym czasie.
   */
  move(target: { center: [number, number]; zoom: number; padding: Insets }, duration: number, flight = false) {
    const map = this.map;
    if (!map) return;
    const now = performance.now();
    if (!this.placed || duration === 0) {
      this.placed = true;
      map.jumpTo(target);
      return;
    }
    if (flight) this.flightEnd = now + duration;
    else if (this.flightEnd > now) duration = Math.max(duration, this.flightEnd - now);
    map.easeTo({ ...target, duration, essential: true });
  }

  /** Kadr obejmujący zasięg w części mapy niezasłoniętej przez `insets`, z marginesem. */
  frame(bounds: Bounds, insets: Insets, margin: { x: number; y: number }, maxZoom = 18) {
    const map = this.map!;
    const el = map.getContainer();
    const [w, s, e, n] = bounds;
    const x0 = mercX(w), x1 = mercX(e), y0 = mercY(n), y1 = mercY(s);
    const availW = Math.max(40, el.clientWidth - insets.left - insets.right - 2 * margin.x);
    const availH = Math.max(40, el.clientHeight - insets.top - insets.bottom - 2 * margin.y);
    const zoom = Math.log2(Math.min(availW / (512 * Math.max(1e-9, x1 - x0)), availH / (512 * Math.max(1e-9, y1 - y0))));
    return {
      center: [lonOf((x0 + x1) / 2), latOf((y0 + y1) / 2)] as [number, number],
      zoom: Math.max(map.getMinZoom(), Math.min(maxZoom, zoom)),
      padding: insets,
    };
  }
}

export const mapHost = new MapHost();
