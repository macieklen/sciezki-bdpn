<!-- Mapa przeglądu: linie wszystkich ścieżek z etykietami nazw; bez przystanków i pozycji. -->
<script lang="ts">
  import 'maplibre-gl/dist/maplibre-gl.css';
  import maplibregl from 'maplibre-gl';
  import { onDestroy, onMount } from 'svelte';
  import type { Manifest } from '@sciezki/core';
  import { basemapUrl } from '$lib/basemap';
  import { basemapStyle } from '$lib/map-style';

  type Trail = Manifest['trails'][number];

  let {
    trails,
    names,
    selected = $bindable<string | null>(null),
    bounds,
    topInset = 100,
    bottomInset = 140,
  }: {
    trails: Trail[];
    names: Record<string, string>;
    selected?: string | null;
    bounds: [number, number, number, number];
    topInset?: number;
    bottomInset?: number;
  } = $props();

  let container: HTMLDivElement;
  let map = $state.raw<maplibregl.Map | undefined>();
  const pills = new Map<string, HTMLButtonElement>();
  let destroyed = false;

  const geojson = (): GeoJSON.FeatureCollection => ({
    type: 'FeatureCollection',
    features: trails.flatMap((tr) =>
      tr.overview.lines.map((coords) => ({ type: 'Feature' as const, properties: { id: tr.id }, geometry: { type: 'LineString' as const, coordinates: coords } })),
    ),
  });

  onMount(async () => {
    const bm = await basemapUrl().catch(() => null);
    if (destroyed) return;
    map = new maplibregl.Map({
      container,
      style: basemapStyle(bm?.url ?? null, '© OpenStreetMap contributors'),
      bounds,
      fitBoundsOptions: { padding: { top: topInset + 24, bottom: bottomInset + 24, left: 24, right: 24 } },
      minZoom: 8,
      maxZoom: 17,
      attributionControl: bm ? { compact: true } : false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    map.on('load', () => {
      map!.addSource('trasy', { type: 'geojson', data: geojson() });
      map!.addLayer({ id: 'trasy-obrys', type: 'line', source: 'trasy', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': ['case', ['==', ['get', 'id'], selected ?? ''], 11, 8] } });
      map!.addLayer({
        id: 'trasy',
        type: 'line',
        source: 'trasy',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#443425', 'line-width': ['case', ['==', ['get', 'id'], selected ?? ''], 6, 4] },
      });
      // Szerszy, niewidoczny pas ułatwia trafienie palcem w linię.
      map!.addLayer({ id: 'trasy-dotyk', type: 'line', source: 'trasy', paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 28 } });
      map!.on('click', 'trasy-dotyk', (e) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (id) select(id);
      });
      map!.on('click', (e) => {
        if (!map!.queryRenderedFeatures(e.point, { layers: ['trasy-dotyk'] }).length) selected = null;
      });
    });
    for (const tr of trails) {
      const b = document.createElement('button');
      b.className = 'trail-pill';
      b.type = 'button';
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        select(tr.id);
      });
      pills.set(tr.id, b);
      new maplibregl.Marker({ element: b }).setLngLat(tr.overview.label).addTo(map);
    }
  });
  onDestroy(() => {
    destroyed = true;
    map?.remove();
  });

  function select(id: string) {
    selected = id;
    const tr = trails.find((x) => x.id === id);
    if (tr && map) {
      const [w, s, e, n] = tr.bbox;
      map.fitBounds([w, s, e, n], { padding: { top: topInset + 40, bottom: bottomInset + 40, left: 40, right: 40 }, maxZoom: 15, duration: 600 });
    }
  }

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

<div class="map" bind:this={container}></div>

<style>
  .map {
    position: absolute;
    inset: 0;
  }
  .map :global(.trail-pill) {
    padding: 6px 12px;
    min-height: 32px;
    border: none;
    border-radius: 16px;
    background: #fff;
    box-shadow: 0 1px 4px rgba(46, 43, 40, 0.25);
    font: 700 14px/1.2 Lato, sans-serif;
    color: var(--brown);
    white-space: nowrap;
    cursor: pointer;
  }
  .map :global(.trail-pill.selected) {
    background: var(--brown);
    color: #fff;
  }
</style>
