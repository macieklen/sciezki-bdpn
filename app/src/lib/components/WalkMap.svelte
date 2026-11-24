<script lang="ts">
  import 'maplibre-gl/dist/maplibre-gl.css';
  import maplibregl from 'maplibre-gl';
  import { basemapUrl } from '$lib/basemap';
  import { basemapStyle } from '$lib/map-style';
  import { onDestroy, onMount } from 'svelte';
  import type { TrailBundle } from '@sciezki/core';

  let {
    trail,
    visited,
    nextStopId,
    position,
    rawFix,
    entranceNames,
    stopHref,
    stopTitle,
    follow = $bindable(true),
  }: {
    trail: TrailBundle;
    visited: string[];
    nextStopId: string | null;
    position: [number, number] | null;
    rawFix: [number, number] | null;
    entranceNames: Record<string, string>;
    stopHref: (id: string) => string;
    stopTitle: (id: string) => string;
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
      fitBoundsOptions: { padding: { top: 120, bottom: 220, left: 40, right: 40 } },
      minZoom: 9,
      maxZoom: 18,
      attributionControl: bm ? { compact: true } : false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    map.on('dragstart', () => (follow = false));

    map.on('load', () => {
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
      new maplibregl.Marker({ element: label, anchor: 'left', offset: [10, 0] })
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
    const done = new Set(visited);
    for (const [id, a] of stopMarkers) {
      a.classList.toggle('visited', done.has(id));
      a.classList.toggle('next', id === nextStopId);
      a.style.zIndex = id === nextStopId ? '2' : '1';
    }
  });

  $effect(() => {
    if (!map || !me) return;
    if (position) {
      me.setLngLat(position).addTo(map);
      if (follow) map.easeTo({ center: position, duration: 400 });
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

  export function centerOnMe() {
    follow = true;
    if (map && position) map.easeTo({ center: position, zoom: Math.max(map.getZoom(), 16), duration: 500 });
  }
</script>

<div class="map" bind:this={container}></div>

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
  .map :global(.raw) {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(46, 43, 40, 0.45);
  }
</style>
