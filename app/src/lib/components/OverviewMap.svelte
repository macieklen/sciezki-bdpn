<!--
  Mapa przeglądu: linie wszystkich ścieżek z etykietami nazw; bez przystanków i pozycji.
  Rysuje na wspólnej mapie (map-host); przy wejściu na ekran kamera płynnie oddala się do parku.
-->
<script lang="ts">
  import maplibregl from 'maplibre-gl';
  import { onDestroy, onMount } from 'svelte';
  import type { Manifest } from '@sciezki/core';
  import { mapHost } from '$lib/map-host.svelte';

  type Trail = Manifest['trails'][number];

  let {
    trails,
    names,
    selected = $bindable<string | null>(null),
    bounds,
    topInset = 100,
    bottomInset = 140,
    onopen,
  }: {
    trails: Trail[];
    names: Record<string, string>;
    selected?: string | null;
    bounds: [number, number, number, number];
    topInset?: number;
    bottomInset?: number;
    /** Wybór ścieżki — przejście do jej nawigacji (kamerę przejmuje ekran ścieżki). */
    onopen?: (id: string) => void;
  } = $props();

  let map = $state.raw<maplibregl.Map | undefined>();
  const pills = new Map<string, HTMLButtonElement>();
  const markers: maplibregl.Marker[] = [];
  let destroyed = false;
  const LAYERS = ['trasy-obrys', 'trasy', 'trasy-dotyk'];

  const geojson = (): GeoJSON.FeatureCollection => ({
    type: 'FeatureCollection',
    features: trails.flatMap((tr) =>
      tr.overview.lines.map((coords) => ({ type: 'Feature' as const, properties: { id: tr.id }, geometry: { type: 'LineString' as const, coordinates: coords } })),
    ),
  });

  function onLineClick(e: maplibregl.MapLayerMouseEvent) {
    const id = e.features?.[0]?.properties?.id as string | undefined;
    if (id) select(id);
  }

  const view = () =>
    mapHost.frame(bounds, { top: topInset, bottom: bottomInset, left: 0, right: 0 }, { x: 24, y: 24 }, 15);

  onMount(async () => {
    const m = await mapHost.ready();
    if (destroyed) return;
    // Powrót ze ścieżki: płynne oddalenie do całego parku.
    mapHost.move(view(), 900, true);
    m.addSource('trasy', { type: 'geojson', data: geojson() });
    m.addLayer({ id: 'trasy-obrys', type: 'line', source: 'trasy', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': 8 } });
    m.addLayer({ id: 'trasy', type: 'line', source: 'trasy', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#443425', 'line-width': 4 } });
    // Szerszy, niewidoczny pas ułatwia trafienie palcem w linię.
    m.addLayer({ id: 'trasy-dotyk', type: 'line', source: 'trasy', paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 28 } });
    m.on('click', 'trasy-dotyk', onLineClick);
    for (const tr of trails) {
      const b = document.createElement('button');
      b.className = 'trail-pill';
      b.type = 'button';
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        select(tr.id);
      });
      pills.set(tr.id, b);
      markers.push(new maplibregl.Marker({ element: b }).setLngLat(tr.overview.label).addTo(m));
    }
    map = m;
  });

  onDestroy(() => {
    destroyed = true;
    if (!map) return;
    map.off('click', 'trasy-dotyk', onLineClick);
    for (const mk of markers) mk.remove();
    for (const id of LAYERS) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource('trasy')) map.removeSource('trasy');
  });

  /** Wybór ścieżki: od razu jej ekran — lot kamery do ścieżki prowadzi już ekran ścieżki. */
  function select(id: string) {
    selected = id;
    onopen?.(id);
  }

  // Wysokość arkusza i nagłówka znana dopiero po pierwszym rysowaniu — poprawka kadru.
  $effect(() => {
    void topInset;
    void bottomInset;
    if (map) mapHost.move(view(), 400);
  });

  $effect(() => {
    if (!map) return;
    for (const tr of trails) {
      const b = pills.get(tr.id);
      if (!b) continue;
      b.textContent = names[tr.id] ?? tr.id;
      b.classList.toggle('selected', tr.id === selected);
      b.setAttribute('aria-pressed', String(tr.id === selected));
    }
  });

  $effect(() => {
    const sel = selected ?? '';
    if (!map?.getLayer('trasy')) return;
    map.setPaintProperty('trasy', 'line-width', ['case', ['==', ['get', 'id'], sel], 6, 4]);
    map.setPaintProperty('trasy-obrys', 'line-width', ['case', ['==', ['get', 'id'], sel], 11, 8]);
  });
</script>
