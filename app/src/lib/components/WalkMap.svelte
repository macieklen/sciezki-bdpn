<script lang="ts">
  import 'maplibre-gl/dist/maplibre-gl.css';
  import maplibregl from 'maplibre-gl';
  import { basemapUrl } from '$lib/basemap';
  import { basemapStyle } from '$lib/map-style';
  import { t } from '$lib/i18n.svelte';
  import { onDestroy, onMount } from 'svelte';
  import type { TrailBundle } from '@sciezki/core';

  let {
    trail,
    visited,
    nextStopId,
    selectedStopId = null,
    position,
    onTrail = true,
    rawFix,
    entranceNames,
    stopHref,
    stopTitle,
    follow = $bindable(true),
    topInset = 100,
    bottomInset = 200,
  }: {
    trail: TrailBundle;
    visited: string[];
    nextStopId: string | null;
    /** Przystanek otwarty w arkuszu — wyróżniony na mapie. */
    selectedStopId?: string | null;
    position: [number, number] | null;
    /** Poza ścieżką mapa nie podąża za pozycją (żeby nie uciec od ścieżki); środkuje dopiero przycisk. */
    onTrail?: boolean;
    rawFix: [number, number] | null;
    entranceNames: Record<string, string>;
    stopHref: (id: string) => string;
    stopTitle: (id: string) => string;
    /** Wysokość elementów zasłaniających mapę u góry i u dołu [px] — dla znacznika na krawędzi. */
    topInset?: number;
    bottomInset?: number;
    follow?: boolean;
  } = $props();

  let container: HTMLDivElement;
  // $state.raw: efekty poniżej uruchamiają się ponownie, gdy mapa powstanie (asynchronicznie).
  let map = $state.raw<maplibregl.Map | undefined>();
  const stopMarkers = new Map<string, HTMLAnchorElement>();
  const entranceLabels = new Map<string, HTMLElement>();
  let me: maplibregl.Marker | undefined;
  let raw: maplibregl.Marker | undefined;

  function segmentsGeoJSON(): GeoJSON.FeatureCollection {
    // Bez narzuconej trasy wszystkie odcinki są „trasą”; pole zostaje do ewentualnego wyróżniania.
    const onRoute = new Set(trail.segments.map((s) => s.id));
    return {
      type: 'FeatureCollection',
      features: trail.segments.map((s) => ({
        type: 'Feature',
        properties: { id: s.id, onRoute: onRoute.has(s.id) },
        geometry: { type: 'LineString', coordinates: s.coords },
      })),
    };
  }

  function el(tag: string, className: string, text?: string) {
    const e = document.createElement(tag);
    e.className = className;
    if (text) e.textContent = text;
    return e;
  }

  let destroyed = false;
  onMount(async () => {
    const bm = await basemapUrl().catch(() => null);
    if (destroyed) return;
    const [w, s, e, n] = trail.bbox;
    map = new maplibregl.Map({
      container,
      style: basemapStyle(bm?.url ?? null, '© OpenStreetMap contributors'),
      bounds: [w, s, e, n],
      // Kadr ścieżki omija górną kartę, dolny panel i przyciski po prawej (+ zapas na etykiety).
      fitBoundsOptions: { padding: { top: topInset + 36, bottom: bottomInset + 24, left: 32, right: 84 } },
      minZoom: 9,
      maxZoom: 18,
      attributionControl: bm ? { compact: true } : false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    map.on('dragstart', () => (follow = false));
    map.on('move', updateEdge);
    map.on('zoom', () => (far = map!.getZoom() < FAR_ZOOM));
    // Stojący telefon nie przysyła nowych odczytów — przelicz znacznik zaraz po załadowaniu mapy.
    map.on('load', updateEdge);
    map.on('resize', updateEdge);

    map.on('load', () => {
      // Otwarty przystanek (np. z powiadomienia): od razu na środku widocznej części mapy.
      if (selectedStopId) focusStop(selectedStopId, 0, true);
      map!.addSource('odcinki', { type: 'geojson', data: segmentsGeoJSON() });
      map!.addLayer({
        id: 'odcinki-obrys',
        type: 'line',
        source: 'odcinki',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 9 },
      });
      map!.addLayer({
        id: 'odcinki-inne',
        type: 'line',
        source: 'odcinki',
        filter: ['==', ['get', 'onRoute'], false],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#84725a', 'line-width': 3, 'line-dasharray': [1.5, 2] },
      });
      map!.addLayer({
        id: 'odcinki-trasa',
        type: 'line',
        source: 'odcinki',
        filter: ['==', ['get', 'onRoute'], true],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#443425', 'line-width': 5 },
      });
    });

    for (const ent of trail.entrances) {
      const node = trail.nodes.find((x) => x.id === ent.nodeId);
      if (!node) continue;
      const label = el('div', 'entrance', entranceNames[ent.id] ?? ent.id);
      entranceLabels.set(ent.id, label);
      // Etykieta przy samej prawej krawędzi ścieżki idzie na lewo od punktu (inaczej wchodzi pod przyciski).
      const onRight = node.coord[0] > trail.bbox[0] + 0.85 * (trail.bbox[2] - trail.bbox[0]);
      new maplibregl.Marker({ element: label, anchor: onRight ? 'right' : 'left', offset: [onRight ? -10 : 10, 0] })
        .setLngLat(node.coord)
        .addTo(map);
    }

    for (const stop of trail.stops) {
      const a = el('a', 'stop', stop.number) as HTMLAnchorElement;
      a.href = stopHref(stop.id);
      a.setAttribute('aria-label', `${stop.number}. ${stopTitle(stop.id)}`);
      stopMarkers.set(stop.id, a);
      new maplibregl.Marker({ element: a }).setLngLat(stop.coord).addTo(map);
    }

    raw = new maplibregl.Marker({ element: el('div', 'raw') });
    me = new maplibregl.Marker({ element: el('div', 'me') });
  });

  onDestroy(() => {
    destroyed = true;
    map?.remove();
  });

  // Nazwy wejść i opisy przystanków docierają po wczytaniu tekstów (i zmieniają się z językiem).
  $effect(() => {
    if (!map) return;
    for (const [id, label] of entranceLabels) label.textContent = entranceNames[id] ?? id;
    for (const stop of trail.stops) stopMarkers.get(stop.id)?.setAttribute('aria-label', `${stop.number}. ${stopTitle(stop.id)}`);
  });

  // Stan przystanków: odwiedzone / następny / pozostałe.
  $effect(() => {
    if (!map) return;
    void selectedStopId;
    const done = new Set(visited);
    for (const [id, a] of stopMarkers) {
      a.classList.toggle('visited', done.has(id));
      a.classList.toggle('next', id === nextStopId);
      a.classList.toggle('selected', id === selectedStopId);
      a.style.zIndex = id === selectedStopId ? '3' : id === nextStopId ? '2' : '1';
    }
  });

  $effect(() => {
    if (!map || !me) return;
    if (position) {
      me.setLngLat(position).addTo(map);
      if (follow && onTrail) map.easeTo({ center: position, duration: 400 });
    } else me.remove();
  });

  $effect(() => {
    if (!map || !raw) return;
    if (rawFix) raw.setLngLat(rawFix).addTo(map);
    else raw.remove();
  });

  $effect(() => {
    const data = segmentsGeoJSON();
    (map?.getSource('odcinki') as maplibregl.GeoJSONSource | undefined)?.setData(data);
  });

  // Przy dużym oddaleniu przystanki i etykiety zlewają się — chowamy je, zostaje linia ścieżki.
  const FAR_ZOOM = 12.5;
  let far = $state(false);

  // ── Znacznik pozycji na krawędzi mapy, gdy pozycja jest poza widokiem ──
  // Tylko kierunek: odległość od ścieżki pokazuje dolny panel (odległość od środka widoku myliła).
  let edge = $state<{ x: number; y: number; angle: number } | null>(null);
  const EDGE_MARGIN = 38;

  function updateEdge() {
    if (!map || !position || !container) {
      edge = null;
      return;
    }
    const p = map.project(position);
    const w = container.clientWidth;
    const h = container.clientHeight;
    const r = { l: EDGE_MARGIN, t: topInset + EDGE_MARGIN, r: w - EDGE_MARGIN, b: h - bottomInset - EDGE_MARGIN };
    if (r.b <= r.t || (p.x >= r.l && p.x <= r.r && p.y >= r.t && p.y <= r.b)) {
      edge = null;
      return;
    }
    // Punkt przecięcia odcinka „środek widoku → pozycja” z krawędzią bezpiecznego prostokąta.
    const cx = (r.l + r.r) / 2;
    const cy = (r.t + r.b) / 2;
    const dx = p.x - cx;
    const dy = p.y - cy;
    const sx = dx ? ((dx > 0 ? r.r : r.l) - cx) / dx : Infinity;
    const sy = dy ? ((dy > 0 ? r.b : r.t) - cy) / dy : Infinity;
    const k = Math.min(sx, sy);
    edge = {
      x: cx + dx * k,
      y: cy + dy * k,
      angle: (Math.atan2(dy, dx) * 180) / Math.PI,
    };
  }

  $effect(() => {
    void position;
    void topInset;
    void bottomInset;
    updateEdge();
  });

  /**
   * Pokaż przystanek na środku widocznej części mapy (nad arkuszem).
   * `duration` 0 — natychmiast (w trakcie przeciągania arkusza, w każdej klatce).
   */
  export function focusStop(id: string, duration = 300, zoomIn = false) {
    const stop = trail.stops.find((x) => x.id === id);
    if (!map || !stop) return;
    follow = false;
    const padding = { top: topInset, bottom: bottomInset, left: 0, right: 0 };
    const zoom = zoomIn ? Math.max(map.getZoom(), 16) : map.getZoom();
    if (duration === 0) map.jumpTo({ center: stop.coord, zoom, padding });
    else map.easeTo({ center: stop.coord, zoom, padding, duration });
  }

  /** Cała ścieżka w widocznej części mapy. */
  export function fitTrail() {
    if (!map) return;
    const [w, s, e, n] = trail.bbox;
    map.fitBounds([w, s, e, n], { padding: { top: topInset + 36, bottom: bottomInset + 24, left: 32, right: 84 }, duration: 500 });
  }

  export function centerOnMe() {
    follow = true;
    if (map && position) map.easeTo({ center: position, zoom: Math.max(map.getZoom(), 16), duration: 500 });
  }
</script>

<div class="map" class:far bind:this={container}></div>
{#if edge}
  <button
    class="edge-marker"
    style:left="{edge.x}px"
    style:top="{edge.y}px"
    aria-label={t().centerOnMe}
    onclick={centerOnMe}
  >
    <span class="pointer" style:transform="rotate({edge.angle}deg)"><span class="beak"></span></span>
    <span class="edge-dot"></span>
  </button>
{/if}

<style>
  .map {
    position: absolute;
    inset: 0;
  }
  .map :global(.stop) {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: #fff;
    border: 2.5px solid var(--brown);
    color: var(--brown);
    font: 900 13px/1 Lato, sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  }
  .map :global(.stop.visited) {
    background: var(--green);
    border-color: #fff;
    color: #fff;
  }
  .map :global(.stop.next) {
    width: 38px;
    height: 38px;
    font-size: 16px;
    background: var(--sand);
    border-color: var(--brown);
  }
  .map :global(.stop.selected) {
    width: 42px;
    height: 42px;
    font-size: 17px;
    background: var(--sand);
    border: 3px solid var(--brown);
    color: var(--brown);
    box-shadow: 0 0 0 6px rgba(214, 178, 105, 0.35), 0 1px 3px rgba(0, 0, 0, 0.25);
  }
  .map :global(.entrance) {
    padding: 3px 8px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.92);
    color: var(--brown);
    font: 700 12px/1.2 Lato, sans-serif;
    white-space: nowrap;
    pointer-events: none;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  }
  .map :global(.me) {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #2f6fb0;
    border: 3px solid #fff;
    box-shadow: 0 0 0 10px rgba(47, 111, 176, 0.18), 0 1px 3px rgba(0, 0, 0, 0.3);
  }
  .map.far :global(.stop),
  .map.far :global(.entrance) {
    visibility: hidden;
  }
  .edge-marker {
    position: absolute;
    z-index: 2;
    width: 44px;
    height: 44px;
    margin: -22px 0 0 -22px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
  }
  .pointer {
    position: absolute;
    inset: 0;
  }
  /* Dziubek po prawej stronie kółka; obrót kontenera kieruje go w stronę pozycji. */
  .beak {
    position: absolute;
    right: -10px;
    top: 50%;
    width: 0;
    height: 0;
    margin-top: -9px;
    border-left: 15px solid #2f6fb0;
    border-top: 9px solid transparent;
    border-bottom: 9px solid transparent;
    filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.3));
  }
  .edge-dot {
    position: absolute;
    inset: 8px;
    border-radius: 50%;
    background: #2f6fb0;
    border: 3px solid #fff;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  }
  .map :global(.raw) {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(46, 43, 40, 0.45);
  }
</style>
