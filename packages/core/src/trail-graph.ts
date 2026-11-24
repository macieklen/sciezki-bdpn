/**
 * Graf ścieżki odtworzony z paczki (trail.json) — w tym samym lokalnym układzie
 * metrycznym, którego użył build. Dzięki temu aplikacja liczy pozycje identycznie.
 */
import { createLocalProjection, pointAlong, type LocalProjection, type XY } from './geo.ts';
import type { Graph, GraphEdge, GraphNode } from './graph.ts';
import type { TrailBundle } from './schema.ts';

export interface TrailGraph {
  graph: Graph;
  proj: LocalProjection;
  bundle: TrailBundle;
}

export function trailGraph(bundle: TrailBundle): TrailGraph {
  const proj = createLocalProjection(bundle.origin);
  const nodes = new Map<string, GraphNode>();
  for (const n of bundle.nodes) nodes.set(n.id, { id: n.id, xy: proj.forward(n.coord), edges: [] });
  const edges = new Map<string, GraphEdge>();
  for (const s of bundle.segments) {
    const line = s.coords.map((c) => proj.forward(c));
    edges.set(s.id, { id: s.id, from: s.from, to: s.to, line, length: s.length });
    nodes.get(s.from)?.edges.push(s.id);
    nodes.get(s.to)?.edges.push(s.id);
  }
  return { graph: { nodes, edges }, proj, bundle };
}

/** Punkt (lokalny) na odcinku w danej odległości od jego początku. */
export function positionXY(tg: TrailGraph, edgeId: string, along: number): XY {
  const e = tg.graph.edges.get(edgeId);
  if (!e) throw new Error(`Nieznany odcinek ${edgeId}`);
  return pointAlong(e.line, along);
}
