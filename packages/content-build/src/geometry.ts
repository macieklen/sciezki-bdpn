/**
 * Geometria ścieżki: odczyt warstw z GeoPackage, transformacja do WGS84,
 * graf odcinków, dopasowanie wejść i przystanków, trasy i walidacja.
 */
import proj4 from 'proj4';
import {
  bboxCenter,
  buildGraph,
  createLocalProjection,
  distanceAlongGraph,
  pathBetween,
  projectOnPolyline,
  type Graph,
  type LonLat,
  type TrailBundle,
  type TrailSource,
  type XY,
} from '@sciezki/core';
import { readGpkgLayers, type Coord, type Layer } from './gpkg.ts';
import type { Reporter } from './report.ts';

const KNOWN_CRS: Record<string, string> = {
  'EPSG:4326': '+proj=longlat +datum=WGS84 +no_defs',
  'EPSG:4258': '+proj=longlat +ellps=GRS80 +no_defs',
  'EPSG:2180':
    '+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 +x_0=500000 +y_0=-5300000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  'EPSG:3857':
    '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +no_defs',
};

export const LAYER_NAMES = { segments: 'segments', entrances: 'entrances', stops: 'stops' } as const;

export type TrailGeometry = Omit<TrailBundle, 'schemaVersion' | 'id' | 'version' | 'stops'> & {
  stops: Omit<TrailBundle['stops'][number], 'images'>[];
};

function toWgs84(layer: Layer, r: Reporter): ((c: Coord) => LonLat) | null {
  const key = `${layer.srs.organization}:${layer.srs.code}`;
  const def = KNOWN_CRS[key];
  if (!def) {
    r.error(`Warstwa "${layer.name}": nieobsługiwany układ współrzędnych ${key}. Użyj EPSG:2180 lub EPSG:4326.`);
    return null;
  }
  if (key === 'EPSG:4326' || key === 'EPSG:4258') return (c) => [c[0], c[1]];
  const conv = proj4(def, KNOWN_CRS['EPSG:4326']!);
  return (c) => conv.forward(c) as LonLat;
}

const str = (v: unknown): string | undefined => (v === null || v === undefined || v === '' ? undefined : String(v).trim());
const num = (v: unknown): number | undefined => (v === null || v === undefined || v === '' ? undefined : Number(v));
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const roundLL = ([lon, lat]: LonLat): LonLat => [round(lon, 7), round(lat, 7)];

export function processGeometry(gpkgPath: string, source: TrailSource, r: Reporter): TrailGeometry | null {
  let layers: Map<string, Layer>;
  try {
    layers = readGpkgLayers(gpkgPath);
  } catch (e) {
    r.error(`Nie można odczytać ${gpkgPath}: ${(e as Error).message}`);
    return null;
  }
  const get = (name: string) => {
    const l = layers.get(name);
    if (!l) r.error(`Brak warstwy "${name}" w pliku trail.gpkg (są: ${[...layers.keys()].join(', ') || 'brak'}).`);
    return l;
  };
  const segL = get(LAYER_NAMES.segments);
  const entL = get(LAYER_NAMES.entrances);
  const stopL = get(LAYER_NAMES.stops);
  if (!segL || !entL || !stopL) return null;
  const tSeg = toWgs84(segL, r);
  const tEnt = toWgs84(entL, r);
  const tStop = toWgs84(stopL, r);
  if (!tSeg || !tEnt || !tStop) return null;
  const v = source.validation;

  // ── Odcinki ──
  const segmentsLL: { id: string; coords: LonLat[] }[] = [];
  for (const f of segL.features) {
    const id = str(f.properties.id) ?? `s${f.fid}`;
    const g = f.geometry;
    if (!g) { r.error(`Odcinek "${id}": brak geometrii.`); continue; }
    let coords: Coord[];
    if (g.type === 'LineString') coords = g.coordinates;
    else if (g.type === 'MultiLineString' && g.coordinates.length === 1) coords = g.coordinates[0]!;
    else { r.error(`Odcinek "${id}": oczekiwano pojedynczej linii, jest ${g.type}${g.type === 'MultiLineString' ? ` z ${g.coordinates.length} częściami` : ''}.`); continue; }
    segmentsLL.push({ id, coords: coords.map(tSeg) });
  }
  if (segmentsLL.length === 0) { r.error('Warstwa "segments" nie zawiera żadnych odcinków.'); return null; }

  const allLL = segmentsLL.flatMap((s) => s.coords);
  const origin = roundLL(bboxCenter(allLL));
  const proj = createLocalProjection(origin);

  const { graph, issues } = buildGraph(
    segmentsLL.map((s) => ({ id: s.id, line: s.coords.map((c) => proj.forward(c)) })),
    v.snapTolerance,
  );
  for (const i of issues) r[i.level](i.message);
  if (issues.some((i) => i.level === 'error')) return null;

  // ── Wejścia ──
  const entrances: { id: string; nodeId: string }[] = [];
  const nodeEntrance = new Map<string, string>();
  for (const f of entL.features) {
    const id = str(f.properties.id);
    if (!id) { r.error(`Wejście (fid ${f.fid}): brak atrybutu "id".`); continue; }
    if (f.geometry?.type !== 'Point') { r.error(`Wejście "${id}": oczekiwano punktu.`); continue; }
    const xy = proj.forward(tEnt(f.geometry.coordinates));
    const node = nearestNode(graph, xy);
    if (!node || node.d > v.entranceTolerance) {
      r.error(`Wejście "${id}" leży ${node ? node.d.toFixed(1) : '?'} m od najbliższego węzła (limit ${v.entranceTolerance} m). Wejście musi być na końcu lub rozwidleniu ścieżki.`);
      continue;
    }
    if (nodeEntrance.has(node.id)) { r.error(`Wejścia "${nodeEntrance.get(node.id)}" i "${id}" wskazują ten sam węzeł.`); continue; }
    if (entrances.some((e) => e.id === id)) { r.error(`Zdublowane id wejścia "${id}".`); continue; }
    nodeEntrance.set(node.id, id);
    entrances.push({ id, nodeId: node.id });
    if (!source.entrances[id]) r.error(`Wejście "${id}" nie ma nazwy w trail.yaml (sekcja entrances).`);
  }
  for (const id of Object.keys(source.entrances)) {
    if (!entrances.some((e) => e.id === id)) r.warning(`trail.yaml: wejście "${id}" nie występuje w warstwie "entrances".`);
  }
  if (entrances.length === 0) r.error('Ścieżka nie ma żadnego wejścia.');
  for (const n of graph.nodes.values()) {
    if (n.edges.length === 1 && !nodeEntrance.has(n.id)) {
      r.info(`Ślepy koniec odcinka "${n.edges[0]}" (nie jest wejściem) — np. punkt widokowy.`);
    }
  }

  // ── Przystanki ──
  const stops: TrailGeometry['stops'] = [];
  for (const f of stopL.features) {
    const id = str(f.properties.id);
    if (!id) { r.error(`Przystanek (fid ${f.fid}): brak atrybutu "id".`); continue; }
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(id)) { r.error(`Przystanek "${id}": id może zawierać tylko małe litery, cyfry, "-" i "_".`); continue; }
    if (f.geometry?.type !== 'Point') { r.error(`Przystanek "${id}": oczekiwano punktu.`); continue; }
    if (stops.some((s) => s.id === id)) { r.error(`Zdublowane id przystanku "${id}".`); continue; }
    const ll = tStop(f.geometry.coordinates);
    const xy = proj.forward(ll);
    let best: { edgeId: string; along: number; offset: number } | null = null;
    for (const e of graph.edges.values()) {
      const p = projectOnPolyline(xy, e.line);
      if (!best || p.offset < best.offset) best = { edgeId: e.id, along: p.along, offset: p.offset };
    }
    if (!best) continue;
    if (best.offset > v.maxStopOffset) {
      r.error(`Przystanek "${id}" leży ${best.offset.toFixed(1)} m od ścieżki (limit ${v.maxStopOffset} m).`);
      continue;
    }
    const edge = graph.edges.get(best.edgeId)!;
    for (const [nodeId, d] of [[edge.from, best.along], [edge.to, edge.length - best.along]] as const) {
      if (graph.nodes.get(nodeId)!.edges.length >= 3 && d < v.nearNodeWarning) {
        r.warning(`Przystanek "${id}" leży ${d.toFixed(0)} m od rozwidlenia — powiadomienie poczeka, aż gałąź zostanie rozpoznana.`);
      }
    }
    stops.push({
      id,
      number: str(f.properties.number) ?? id,
      segmentId: best.edgeId,
      along: round(best.along),
      offset: round(best.offset),
      coord: roundLL(ll),
      radius: num(f.properties.radius) ?? source.defaultRadius,
      group: str(f.properties.group),
    });
  }
  const numbers = new Map<string, string>();
  for (const s of stops) {
    if (numbers.has(s.number)) r.warning(`Przystanki "${numbers.get(s.number)}" i "${s.id}" mają ten sam numer "${s.number}".`);
    numbers.set(s.number, s.id);
  }
  for (let i = 0; i < stops.length; i++) {
    for (let j = i + 1; j < stops.length; j++) {
      const a = stops[i]!, b = stops[j]!;
      if (a.group && a.group === b.group) continue;
      const d = distanceAlongGraph(graph, { edgeId: a.segmentId, along: a.along }, { edgeId: b.segmentId, along: b.along });
      if (d < v.closeStopsWarning) {
        r.warning(`Przystanki "${a.id}" i "${b.id}" są ${d.toFixed(0)} m od siebie po ścieżce. Rozważ wspólną grupę (atrybut "group").`);
      }
    }
  }

  // ── Trasy między wejściami ──
  const routes: TrailGeometry['routes'] = [];
  const onRoute = new Set<string>();
  for (const a of entrances) {
    for (const b of entrances) {
      if (a.id === b.id) continue;
      const path = pathBetween(graph, a.nodeId, b.nodeId);
      if (!path) continue;
      const routeStops: string[] = [];
      for (const step of path) {
        const here = stops.filter((s) => s.segmentId === step.edgeId).sort((x, y) => x.along - y.along);
        if (step.reversed) here.reverse();
        for (const s of here) { routeStops.push(s.id); onRoute.add(s.id); }
      }
      routes.push({
        from: a.id,
        to: b.id,
        length: round(path.reduce((sum, s) => sum + graph.edges.get(s.edgeId)!.length, 0), 0),
        segments: path.map((s) => ({ id: s.edgeId, reversed: s.reversed })),
        stops: routeStops,
      });
    }
  }
  for (const s of stops) {
    if (entrances.length > 1 && !onRoute.has(s.id)) r.info(`Przystanek "${s.id}" leży na odnodze poza trasami między wejściami.`);
  }

  if (source.guideDirection) {
    for (const k of ['from', 'to'] as const) {
      const id = source.guideDirection[k];
      if (!entrances.some((e) => e.id === id)) r.error(`trail.yaml: guideDirection.${k} = "${id}" nie jest znanym wejściem.`);
    }
  }

  // ── Wynik w WGS84 ──
  const nodes = [...graph.nodes.values()].map((n) => ({
    id: n.id,
    coord: roundLL(proj.inverse(n.xy)),
    degree: n.edges.length,
    entranceId: nodeEntrance.get(n.id),
  }));
  const segments = [...graph.edges.values()].map((e) => ({
    id: e.id,
    from: e.from,
    to: e.to,
    length: round(e.length),
    coords: e.line.map((p) => roundLL(proj.inverse(p))),
  }));
  const lons = allLL.map((c) => c[0]);
  const lats = allLL.map((c) => c[1]);
  return {
    origin,
    bbox: [round(Math.min(...lons), 6), round(Math.min(...lats), 6), round(Math.max(...lons), 6), round(Math.max(...lats), 6)],
    length: round(segments.reduce((s, e) => s + e.length, 0), 0),
    nodes,
    segments,
    entrances,
    stops,
    routes,
    guideDirection: source.guideDirection,
  };
}

function nearestNode(graph: Graph, xy: XY): { id: string; d: number } | null {
  let best: { id: string; d: number } | null = null;
  for (const n of graph.nodes.values()) {
    const d = Math.hypot(n.xy[0] - xy[0], n.xy[1] - xy[1]);
    if (!best || d < best.d) best = { id: n.id, d };
  }
  return best;
}
