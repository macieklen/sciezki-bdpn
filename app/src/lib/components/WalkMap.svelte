<!--
  Ścieżka na wspólnej mapie (map-host): odcinki, wejścia, przystanki, pozycja. Kamera — przez
  mapHost.move, więc wejście z przeglądu jest jednym płynnym przelotem.
-->
<script lang="ts">
  import maplibregl from 'maplibre-gl';
  import { mapHost } from '$lib/map-host.svelte';
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

  // Mapa z warstwami tej ścieżki ($state.raw: efekty poniżej ruszają po jej przygotowaniu).
  let map = $state.raw<maplibregl.Map | undefined>();
  const stopMarkers = new Map<string, HTMLAnchorElement>();
  const entranceLabels = new Map<string, HTMLElement>();
  const markers: maplibregl.Marker[] = [];
  let me: maplibregl.Marker | undefined;
  let raw: maplibregl.Marker | undefined;
  const LAYERS = ['odcinki-obrys', 'odcinki-inne', 'odcinki-trasa'];

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

  const onDragStart = () => (follow = false);
  const onZoom = () => mapHost.map?.getContainer().classList.toggle('map-far', mapHost.map.getZoom() < FAR_ZOOM);

  let destroyed = false;
  onMount(async () => {
    const m = await mapHost.ready();
    if (destroyed) return;
    m.on('dragstart', onDragStart);
    m.on('move', updateEdge);
    m.on('zoom', onZoom);
    m.on('resize', updateEdge);
    onZoom();

    m.addSource('odcinki', { type: 'geojson', data: segmentsGeoJSON() });
    m.addLayer({
      id: 'odcinki-obrys',
      type: 'line',
      source: 'odcinki',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': 9 },
    });
    m.addLayer({
      id: 'odcinki-inne',
      type: 'line',
      source: 'odcinki',
      filter: ['==', ['get', 'onRoute'], false],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#84725a', 'line-width': 3, 'line-dasharray': [1.5, 2] },
    });
    m.addLayer({
      id: 'odcinki-trasa',
      type: 'line',
      source: 'odcinki',
      filter: ['==', ['get', 'onRoute'], true],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#443425', 'line-width': 5 },
    });

    for (const ent of trail.entrances) {
      const node = trail.nodes.find((x) => x.id === ent.nodeId);
      if (!node) continue;
      const label = el('div', 'entrance', entranceNames[ent.id] ?? ent.id);
      entranceLabels.set(ent.id, label);
      // Etykieta przy samej prawej krawędzi ścieżki idzie na lewo od punktu (inaczej wchodzi pod przyciski).
      const onRight = node.coord[0] > trail.bbox[0] + 0.85 * (trail.bbox[2] - trail.bbox[0]);
      markers.push(
        new maplibregl.Marker({ element: label, anchor: onRight ? 'right' : 'left', offset: [onRight ? -10 : 10, 0] }).setLngLat(node.coord).addTo(m),
      );
    }

    for (const stop of trail.stops) {
      const a = el('a', 'stop', stop.number) as HTMLAnchorElement;
      a.href = stopHref(stop.id);
      a.setAttribute('aria-label', `${stop.number}. ${stopTitle(stop.id)}`);
      stopMarkers.set(stop.id, a);
      markers.push(new maplibregl.Marker({ element: a }).setLngLat(stop.coord).addTo(m));
    }

    raw = new maplibregl.Marker({ element: el('div', 'raw') });
    me = new maplibregl.Marker({ element: el('div', 'me') });
    map = m;
    // Stojący telefon nie przysyła nowych odczytów — przelicz znacznik od razu.
    updateEdge();
  });

  onDestroy(() => {
    destroyed = true;
    if (!map) return;
    map.off('dragstart', onDragStart);
    map.off('move', updateEdge);
    map.off('zoom', onZoom);
    map.off('resize', updateEdge);
    map.getContainer().classList.remove('map-far');
    for (const mk of markers) mk.remove();
    me?.remove();
    raw?.remove();
    for (const id of LAYERS) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource('odcinki')) map.removeSource('odcinki');
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
  const FAR_ZOOM = 11;

  // ── Znacznik pozycji na krawędzi mapy, gdy pozycja jest poza widokiem ──
  // Tylko kierunek: odległość od ścieżki pokazuje dolny panel (odległość od środka widoku myliła).
  let edge = $state<{ x: number; y: number; angle: number } | null>(null);
  const EDGE_MARGIN = 38;

  function updateEdge() {
    if (!map || !position) {
      edge = null;
      return;
    }
    const p = map.project(position);
    const w = map.getContainer().clientWidth;
    const h = map.getContainer().clientHeight;
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
   * Działa od razu po utworzeniu wspólnej mapy (kamera nie czeka na warstwy).
   */
  export function focusStop(id: string, duration = 300, zoomIn = false) {
    const m = mapHost.map;
    const stop = trail.stops.find((x) => x.id === id);
    if (!m || !stop) return;
    follow = false;
    const padding = { top: topInset, bottom: bottomInset, left: 0, right: 0 };
    // Docelowe przybliżenie z otwarcia przystanku obowiązuje, dopóki trwa animacja —
    // kolejne wywołania (zmiana wysokości arkusza) nie mogą jej przerwać w pół drogi.
    if (zoomIn) stopZoom = Math.max(m.getZoom(), 16);
    const zoom = zoomIn || m.isMoving() ? (stopZoom ?? m.getZoom()) : m.getZoom();
    mapHost.move({ center: stop.coord, zoom, padding }, duration);
  }

  let stopZoom: number | null = null;

  /** Cała ścieżka w widocznej części mapy; `flight` — przelot z innego ekranu. */
  export function fitTrail(duration = 500, flight = false) {
    if (!mapHost.map) return;
    const insets = { top: topInset, bottom: bottomInset, left: 0, right: 0 };
    mapHost.move(mapHost.frame(trail.bbox, insets, { x: 24, y: 16 }), duration, flight);
  }

  export function centerOnMe() {
    const m = mapHost.map;
    follow = true;
    if (m && position) m.easeTo({ center: position, zoom: Math.max(m.getZoom(), 16), duration: 500 });
  }
</script>

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
  .edge-marker {
    position: absolute;
    pointer-events: auto;
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
</style>
