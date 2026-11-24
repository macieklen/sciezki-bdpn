/**
 * Rozglądanie się po grafie ścieżki z danego miejsca: co jest przed nami w kierunku
 * marszu, dokąd prowadzą gałęzie rozwidlenia, którzy są sąsiedzi przystanku.
 * Czysta topologia — bez heurystyk czasu i bez generowania tekstów.
 */
import type { TrailGraph } from './trail-graph.ts';

/** Kierunek wzdłuż odcinka: +1 = w stronę węzła `to`, −1 = w stronę `from`. */
export type Dir = 1 | -1;

export interface StopAhead {
  stopId: string;
  /** Odległość po ścieżce [m]. */
  distance: number;
}

export interface BranchOption {
  /** Pierwszy odcinek gałęzi (za węzłem). */
  edgeId: string;
  /** Końce ścieżki (wejścia i nazwane ślepe końce) osiągalne tą gałęzią, od najbliższego. */
  endpoints: { id: string; kind: 'entrance' | 'end'; distance: number }[];
  /** Przystanki w gałęzi (nieodwiedzone, jeśli podano zbiór odwiedzonych). */
  stopIds: string[];
  /** Gałąź prowadzi wyłącznie do ślepych końców (powrót tą samą drogą). */
  deadEnd: boolean;
}

export interface Ahead {
  /** Przystanki przed nami do najbliższego rozwidlenia lub końca, w kolejności. */
  stops: StopAhead[];
  /** Rozwidlenie przed nami (węzeł o stopniu ≥ 3) i odległość do niego. */
  junction: { nodeId: string; distance: number } | null;
}

function otherEnd(tg: TrailGraph, edgeId: string, nodeId: string) {
  const e = tg.graph.edges.get(edgeId)!;
  return e.from === nodeId ? e.to : e.from;
}

function stopsOnEdge(tg: TrailGraph, edgeId: string) {
  return tg.bundle.stops.filter((s) => s.segmentId === edgeId);
}

/**
 * Idzie od pozycji (odcinek, along) w kierunku `dir` aż do rozwidlenia albo końca ścieżki
 * (przechodząc przez węzły o stopniu 2) i zbiera przystanki po drodze.
 */
export function lookAhead(tg: TrailGraph, edgeId: string, along: number, dir: Dir, skip: Set<string> = new Set()): Ahead {
  const stops: StopAhead[] = [];
  let edge = tg.graph.edges.get(edgeId)!;
  let pos = along;
  let d = dir;
  let walked = 0;
  for (let guard = 0; guard < 1000; guard++) {
    const here = stopsOnEdge(tg, edge.id)
      .filter((s) => !skip.has(s.id) && (d === 1 ? s.along > pos : s.along < pos))
      .map((s) => ({ stopId: s.id, distance: walked + Math.abs(s.along - pos) }))
      .sort((a, b) => a.distance - b.distance);
    stops.push(...here);
    walked += d === 1 ? edge.length - pos : pos;
    const nodeId = d === 1 ? edge.to : edge.from;
    const node = tg.graph.nodes.get(nodeId)!;
    if (node.edges.length >= 3) return { stops, junction: { nodeId, distance: walked } };
    if (node.edges.length === 1) return { stops, junction: null };
    // Węzeł o stopniu 2: idziemy dalej kolejnym odcinkiem.
    const nextId = node.edges.find((id) => id !== edge.id)!;
    edge = tg.graph.edges.get(nextId)!;
    d = edge.from === nodeId ? 1 : -1;
    pos = d === 1 ? 0 : edge.length;
  }
  return { stops, junction: null };
}

/** Opcje gałęzi za węzłem `nodeId`, z pominięciem odcinka, którym przyszliśmy. */
export function branchOptions(tg: TrailGraph, nodeId: string, fromEdgeId: string | null, visited: Set<string> = new Set()): BranchOption[] {
  const kinds = new Map(tg.bundle.entrances.map((e) => [e.nodeId, e]));
  const node = tg.graph.nodes.get(nodeId)!;
  const options: BranchOption[] = [];
  for (const first of node.edges) {
    if (first === fromEdgeId) continue;
    const endpoints: BranchOption['endpoints'] = [];
    const stopIds: string[] = [];
    // Przeszukanie poddrzewa za węzłem (w drzewie bez cykli wystarczy pamiętać rodzica).
    const stack: { edgeId: string; from: string; dist: number }[] = [{ edgeId: first, from: nodeId, dist: 0 }];
    while (stack.length) {
      const { edgeId, from, dist } = stack.pop()!;
      const edge = tg.graph.edges.get(edgeId)!;
      for (const s of stopsOnEdge(tg, edgeId)) if (!visited.has(s.id)) stopIds.push(s.id);
      const to = otherEnd(tg, edgeId, from);
      const total = dist + edge.length;
      const ep = kinds.get(to);
      if (ep) endpoints.push({ id: ep.id, kind: ep.kind, distance: total });
      for (const next of tg.graph.nodes.get(to)!.edges) if (next !== edgeId) stack.push({ edgeId: next, from: to, dist: total });
    }
    endpoints.sort((a, b) => a.distance - b.distance);
    const order = new Map(tg.bundle.stops.map((s, i) => [s.id, i]));
    stopIds.sort((a, b) => order.get(a)! - order.get(b)!);
    options.push({ edgeId: first, endpoints, stopIds, deadEnd: endpoints.length > 0 && endpoints.every((e) => e.kind === 'end') });
  }
  return options;
}

export interface Neighbour {
  stopId: string;
  distance: number;
  /** Końce ścieżki w tym kierunku (do opisu „w stronę: …”). */
  towards: string[];
}

/** Najbliższe przystanki po ścieżce w każdym kierunku od przystanku (przez rozwidlenia — po jednym na gałąź). */
export function stopNeighbours(tg: TrailGraph, stopId: string): Neighbour[] {
  const stop = tg.bundle.stops.find((s) => s.id === stopId);
  if (!stop) return [];
  // Przystanki z tej samej grupy (np. dwie tablice przy źródle) traktujemy jak jeden.
  const same = new Set(stop.group ? tg.bundle.stops.filter((s) => s.group === stop.group).map((s) => s.id) : [stop.id]);
  const result: Neighbour[] = [];
  for (const dir of [1, -1] as Dir[]) {
    const ahead = lookAhead(tg, stop.segmentId, stop.along, dir, same);
    const towardsOf = (edgeId: string, nodeId: string) =>
      branchOptions(tg, nodeId, null).find((o) => o.edgeId === edgeId)?.endpoints.map((e) => e.id) ?? [];
    const first = ahead.stops[0];
    if (first) {
      // Kierunek opisujemy końcami osiągalnymi w tę stronę od przystanku.
      result.push({ stopId: first.stopId, distance: first.distance, towards: endpointsInDirection(tg, stop.segmentId, dir) });
    } else if (ahead.junction) {
      const node = tg.graph.nodes.get(ahead.junction.nodeId)!;
      const cameFrom = lastEdgeBefore(tg, stop.segmentId, dir, ahead.junction.nodeId);
      for (const edgeId of node.edges) {
        if (edgeId === cameFrom) continue;
        const e = tg.graph.edges.get(edgeId)!;
        const d: Dir = e.from === node.id ? 1 : -1;
        const next = lookAhead(tg, edgeId, d === 1 ? 0 : e.length, d, same).stops[0];
        if (next) result.push({ stopId: next.stopId, distance: ahead.junction.distance + next.distance, towards: towardsOf(edgeId, node.id) });
      }
    }
  }
  return result;
}

/** Końce ścieżki osiągalne z odcinka w danym kierunku. */
export function endpointsInDirection(tg: TrailGraph, edgeId: string, dir: Dir): string[] {
  const edge = tg.graph.edges.get(edgeId)!;
  const nodeId = dir === 1 ? edge.to : edge.from;
  const kinds = new Map(tg.bundle.entrances.map((e) => [e.nodeId, e.id]));
  if (kinds.has(nodeId)) return [kinds.get(nodeId)!];
  return branchOptions(tg, nodeId, edgeId)
    .flatMap((o) => o.endpoints)
    .sort((a, b) => a.distance - b.distance)
    .map((e) => e.id);
}

/** Ostatni odcinek przed węzłem przy marszu z `edgeId` w kierunku `dir` (przez węzły stopnia 2). */
function lastEdgeBefore(tg: TrailGraph, edgeId: string, dir: Dir, nodeId: string): string {
  let edge = tg.graph.edges.get(edgeId)!;
  let d = dir;
  for (let guard = 0; guard < 1000; guard++) {
    const end = d === 1 ? edge.to : edge.from;
    if (end === nodeId) return edge.id;
    const node = tg.graph.nodes.get(end)!;
    const nextId = node.edges.find((id) => id !== edge.id);
    if (!nextId) break;
    edge = tg.graph.edges.get(nextId)!;
    d = edge.from === end ? 1 : -1;
  }
  return edgeId;
}
