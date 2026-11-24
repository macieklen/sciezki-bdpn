/**
 * Styl podkładu mapy w barwach BdPN (kafelki z map/schema.yml).
 * Spokojne, jasne tło, żeby trasa i przystanki (rysowane osobno) były najważniejsze.
 */
import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl';
import { base } from '$app/paths';

const FONT = ['Lato Regular'];
const FONT_BOLD = ['Lato Bold'];

const C = {
  paper: '#f3f1ea',
  forest: '#cddcbc',
  forestDark: '#bfd2ad',
  meadow: '#e9e4c6', // połoniny i łąki
  scrub: '#d8e1c2',
  rock: '#e3dfd8',
  settlement: '#ebe6df',
  farmland: '#efecdc',
  wetland: '#d9e5d8',
  water: '#b9d4e3',
  waterLine: '#86b2cc',
  road: '#ffffff',
  roadCasing: '#c9c1b3',
  track: '#9c8b6e',
  path: '#7d6b54',
  building: '#d6cec3',
  park: '#508246',
  label: '#443425',
  labelSoft: '#6b5d4b',
  halo: 'rgba(255,255,255,0.9)',
};

const z = (stops: [number, number][]): ExpressionSpecification =>
  ['interpolate', ['linear'], ['zoom'], ...stops.flat()] as ExpressionSpecification;

/** Adres bezwzględny (MapLibre wymaga go dla czcionek); bez kodowania nawiasów {…}. */
const abs = (path: string) => `${location.origin}${path.startsWith('/') ? '' : '/'}${path}`;

export function basemapStyle(pmtilesUrl: string | null, attribution: string): StyleSpecification {
  const style: StyleSpecification = {
    version: 8,
    glyphs: abs(`${base}/glyphs/{fontstack}/{range}.pbf`),
    sources: {},
    layers: [{ id: 'tlo', type: 'background', paint: { 'background-color': C.paper } }],
  };
  if (!pmtilesUrl) return style;

  style.sources.osm = { type: 'vector', url: pmtilesUrl, attribution };
  const src = { source: 'osm' } as const;
  style.layers.push(
    // ── Pokrycie terenu ──
    {
      id: 'teren',
      type: 'fill',
      ...src,
      'source-layer': 'landcover',
      paint: {
        'fill-antialias': false, // bez jasnych szwów na krawędziach kafelków
        'fill-color': [
          'match',
          ['get', 'class'],
          ['wood', 'forest'], C.forest,
          ['grassland', 'heath', 'meadow', 'grass'], C.meadow,
          'scrub', C.scrub,
          ['bare_rock', 'scree'], C.rock,
          ['residential', 'farmyard'], C.settlement,
          ['farmland', 'orchard'], C.farmland,
          'wetland', C.wetland,
          C.paper,
        ],
      },
    },
    {
      id: 'granica-parku-tlo',
      type: 'fill',
      ...src,
      'source-layer': 'park',
      paint: { 'fill-color': C.park, 'fill-opacity': 0.06 },
    },
    // ── Wody ──
    { id: 'woda', type: 'fill', ...src, 'source-layer': 'water', paint: { 'fill-color': C.water } },
    {
      id: 'cieki',
      type: 'line',
      ...src,
      'source-layer': 'waterway',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': C.waterLine,
        // Zoom musi być najbardziej zewnętrznym wyrażeniem; rodzaj cieku wewnątrz.
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          10, ['match', ['get', 'class'], 'river', 1.2, 0.4],
          14, ['match', ['get', 'class'], 'river', 3, 1.2],
          16, ['match', ['get', 'class'], 'river', 5, 2],
        ],
      },
    },
    // ── Budynki ──
    { id: 'budynki', type: 'fill', ...src, 'source-layer': 'building', minzoom: 14, paint: { 'fill-color': C.building } },
    // ── Drogi i ścieżki ──
    {
      id: 'drogi-obrys',
      type: 'line',
      ...src,
      'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['primary', 'secondary', 'tertiary', 'unclassified', 'residential']]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': C.roadCasing, 'line-width': z([[9, 1.5], [13, 4], [16, 9]]) },
    },
    {
      id: 'drogi',
      type: 'line',
      ...src,
      'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['primary', 'secondary', 'tertiary', 'unclassified', 'residential']]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': C.road, 'line-width': z([[9, 0.8], [13, 2.6], [16, 7]]) },
    },
    {
      id: 'drogi-gruntowe',
      type: 'line',
      ...src,
      'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['track', 'service']]],
      paint: { 'line-color': C.track, 'line-width': z([[12, 0.8], [16, 2]]), 'line-dasharray': [3, 1.5] },
    },
    {
      id: 'sciezki',
      type: 'line',
      ...src,
      'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['path', 'footway', 'bridleway', 'steps', 'cycleway']]],
      paint: { 'line-color': C.path, 'line-width': z([[13, 0.7], [16, 1.6]]), 'line-dasharray': [1.5, 1.5] },
    },
    // ── Granica parku ──
    {
      id: 'granica-parku-pas',
      type: 'line',
      ...src,
      'source-layer': 'park',
      paint: { 'line-color': C.park, 'line-opacity': 0.18, 'line-width': z([[8, 3], [14, 10]]), 'line-offset': z([[8, 1.5], [14, 5]]) },
    },
    {
      id: 'granica-parku',
      type: 'line',
      ...src,
      'source-layer': 'park',
      paint: { 'line-color': C.park, 'line-width': z([[8, 1], [14, 2]]), 'line-dasharray': [4, 2] },
    },
    // ── Napisy ──
    {
      id: 'nazwy-ciekow',
      type: 'symbol',
      ...src,
      'source-layer': 'waterway',
      minzoom: 13,
      layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': FONT, 'text-size': 12 },
      paint: { 'text-color': '#4f7d99', 'text-halo-color': C.halo, 'text-halo-width': 1.2 },
    },
    {
      id: 'szczyty-punkt',
      type: 'circle',
      ...src,
      'source-layer': 'poi',
      filter: ['==', ['get', 'class'], 'peak'],
      paint: { 'circle-radius': 3, 'circle-color': C.label, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 },
    },
    {
      id: 'szczyty',
      type: 'symbol',
      ...src,
      'source-layer': 'poi',
      filter: ['all', ['==', ['get', 'class'], 'peak'], ['has', 'name']],
      layout: {
        'text-field': ['format', ['get', 'name'], {}, ['case', ['has', 'ele'], ['concat', '\n', ['to-string', ['round', ['to-number', ['get', 'ele'], 0]]], ' m'], ''], { 'font-scale': 0.85 }],
        'text-font': FONT_BOLD,
        'text-size': z([[11, 11], [15, 14]]),
        'text-anchor': 'top',
        'text-offset': [0, 0.5],
      },
      paint: { 'text-color': C.label, 'text-halo-color': C.halo, 'text-halo-width': 1.5 },
    },
    {
      id: 'punkty',
      type: 'symbol',
      ...src,
      'source-layer': 'poi',
      minzoom: 14,
      filter: ['all', ['!=', ['get', 'class'], 'peak'], ['has', 'name']],
      layout: { 'text-field': ['get', 'name'], 'text-font': FONT, 'text-size': 12, 'text-anchor': 'top', 'text-offset': [0, 0.4] },
      paint: { 'text-color': C.labelSoft, 'text-halo-color': C.halo, 'text-halo-width': 1.2 },
    },
    {
      // Uroczyska i przysiółki: drobno, kursywą-podobnym kolorem, bez wersalików.
      id: 'uroczyska',
      type: 'symbol',
      ...src,
      'source-layer': 'place',
      minzoom: 12,
      filter: ['in', ['get', 'class'], ['literal', ['locality', 'hamlet']]],
      layout: { 'text-field': ['get', 'name'], 'text-font': FONT, 'text-size': 12 },
      paint: { 'text-color': C.labelSoft, 'text-halo-color': C.halo, 'text-halo-width': 1.2 },
    },
    {
      id: 'miejscowosci',
      type: 'symbol',
      ...src,
      'source-layer': 'place',
      filter: ['in', ['get', 'class'], ['literal', ['town', 'village']]],
      layout: {
        'text-field': ['get', 'name'],
        'text-font': FONT_BOLD,
        'text-size': ['match', ['get', 'class'], 'town', 16, 14],
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.06,
      },
      paint: { 'text-color': C.label, 'text-halo-color': C.halo, 'text-halo-width': 1.5 },
    },
  );
  return style;
}
