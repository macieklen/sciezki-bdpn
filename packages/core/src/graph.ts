/**
 * Graf ścieżki: węzły (rozwidlenia, końce) i odcinki między nimi.
 * Działa na współrzędnych w lokalnym układzie metrycznym (patrz geo.ts).
 */
import { dist, polylineLength, projectOnPolyline, type XY } from './geo.ts';

export interface GraphNode {
  id: string;
  xy: XY;
  /** Id odcinków stykających się z węzłem. */
  edges: string[];
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  line: XY[];
  length: number;
}

export interface Graph {
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
}

export interface SegmentInput {
  id: string;
  line: XY[];
}

export type IssueLevel = 'error' | 'warning' | 'info';
export interface Issue {
  level: IssueLevel;
  message: string;
}

/**
 * Buduje graf z odcinków. Końce odcinków bliższe niż `snapTolerance` są sklejane
 * w jeden węzeł, a końce linii dosuwane do położenia węzła.
 */
export function buildGraph(segments: SegmentInput[], snapTolerance: number): { graph: Graph; issues: Issue[] } {
  const issues: Issue[] = [];
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();

  const nodeFor = (p: XY): GraphNode => {
    let best: GraphNode | undefined;
    let bestD = Infinity;
    for (const n of nodes.values()) {
      const d = dist(n.xy, p);
      if (d <= snapTolerance && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    if (best) return best;
    const n: GraphNode = { id: `n${nodes.size + 1}`, xy: p, edges: [] };
    nodes.set(n.id, n);
    return n;
  };

  for (const seg of segments) {
    if (edges.has(seg.id)) {
      issues.push({ level: 'error', message: `Odcinek "${seg.id}": zdublowany identyfikator.` });
      continue;
    }
    if (seg.line.length < 2) {
      issues.push({ level: 'error', message: `Odcinek "${seg.id}": linia ma mniej niż 2 punkty.` });
      continue;
    }
    const a = nodeFor(seg.line[0]!);
    const b = nodeFor(seg.line[seg.line.length - 1]!);
    if (a === b) {
      issues.push({ level: 'error', message: `Odcinek "${seg.id}": zaczyna się i kończy w tym samym miejscu (pętla).` });
      continue;
    }
    const line = seg.line.slice();
    line[0] = a.xy;
    line[line.length - 1] = b.xy;
    const edge: GraphEdge = { id: seg.id, from: a.id, to: b.id, line, length: polylineLength(line) };
    edges.set(edge.id, edge);
    a.edges.push(edge.id);
    b.edges.push(edge.id);
  }

  const graph = { nodes, edges };
  issues.push(...checkTopology(graph, snapTolerance));
  return { graph, issues };
}

function otherEnd(edge: GraphEdge, nodeId: string): string {
  return edge.from === nodeId ? edge.to : edge.from;
}

/** Spójność, brak cykli, podejrzane końce i przecięcia bez węzła. */
function checkTopology(graph: Graph, snapTolerance: number): Issue[] {
  const issues: Issue[] = [];
  const { nodes, edges } = graph;
  if (nodes.size === 0) {
    issues.push({ level: 'error', message: 'Brak odcinków ścieżki.' });
    return issues;
  }

  // Składowe spójności.
  const seen = new Set<string>();
  const components: string[][] = [];
  for (const start of nodes.keys()) {
    if (seen.has(start)) continue;
    const comp: string[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const id = stack.pop()!;
      comp.push(id);
      for (const eid of nodes.get(id)!.edges) {
        const next = otherEnd(edges.get(eid)!, id);
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    components.push(comp);
  }
  if (components.length > 1) {
    const desc = components
      .map((c) => {
        const segs = new Set(c.flatMap((n) => nodes.get(n)!.edges));
        return `[${[...segs].join(', ')}]`;
      })
      .join(' | ');
    issues.push({
      level: 'error',
      message: `Ścieżka nie jest spójna: ${components.length} rozłączne części ${desc}. Sprawdź przyciąganie końców odcinków w QGIS.`,
    });
  }

  // W drzewie: liczba odcinków = liczba węzłów − liczba składowych.
  if (edges.size !== nodes.size - components.length) {
    issues.push({
      level: 'error',
      message: 'Odcinki tworzą zamkniętą pętlę. Model zakłada strukturę drzewa (bez pętli).',
    });
  }

  // Ślepe końce bardzo blisko innego odcinka: prawdopodobnie niedociągnięte połączenie.
  const nearMiss = Math.max(15, snapTolerance * 5);
  for (const n of nodes.values()) {
    if (n.edges.length !== 1) continue;
    const own = n.edges[0]!;
    for (const e of edges.values()) {
      if (e.id === own) continue;
      const { offset } = projectOnPolyline(n.xy, e.line);
      if (offset < nearMiss) {
        issues.push({
          level: 'warning',
          message: `Koniec odcinka "${own}" leży ${offset.toFixed(1)} m od odcinka "${e.id}", ale nie jest z nim połączony.`,
        });
      }
    }
  }

  // Przecięcia odcinków poza węzłami.
  const list = [...edges.values()];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const x = firstCrossing(list[i]!, list[j]!);
      if (x) {
        issues.push({
          level: 'warning',
          message: `Odcinki "${list[i]!.id}" i "${list[j]!.id}" przecinają się poza węzłem.`,
        });
      }
    }
  }
  return issues;
}

function firstCrossing(a: GraphEdge, b: GraphEdge): XY | null {
  const shared = [a.from, a.to].filter((n) => n === b.from || n === b.to);
  for (let i = 1; i < a.line.length; i++) {
    for (let j = 1; j < b.line.length; j++) {
      const p = segIntersection(a.line[i - 1]!, a.line[i]!, b.line[j - 1]!, b.line[j]!);
      if (!p) continue;
      // Styk w ich wspólnym węźle jest w porządku.
      const atSharedNode = shared.length > 0 && [a.line[0]!, a.line[a.line.length - 1]!].some((q) => dist(q, p) < 0.01);
      if (!atSharedNode) return p;
    }
  }
  return null;
}

function segIntersection(p1: XY, p2: XY, p3: XY, p4: XY): XY | null {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (d === 0) return null;
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
}

export interface PathStep {
  edgeId: string;
  /** true, gdy odcinek przechodzimy od `to` do `from`. */
  reversed: boolean;
}

/** Droga między dwoma węzłami (w drzewie jedyna). null, gdy brak połączenia. */
export function pathBetween(graph: Graph, fromNode: string, toNode: string): PathStep[] | null {
  if (fromNode === toNode) return [];
  const prev = new Map<string, { node: string; edge: string }>();
  const queue = [fromNode];
  const seen = new Set([fromNode]);
  while (queue.length) {
    const id = queue.shift()!;
    if (id === toNode) break;
    for (const eid of graph.nodes.get(id)?.edges ?? []) {
      const next = otherEnd(graph.edges.get(eid)!, id);
      if (seen.has(next)) continue;
      seen.add(next);
      prev.set(next, { node: id, edge: eid });
      queue.push(next);
    }
  }
  if (!seen.has(toNode)) return null;
  const steps: PathStep[] = [];
  let cur = toNode;
  while (cur !== fromNode) {
    const p = prev.get(cur)!;
    const edge = graph.edges.get(p.edge)!;
    steps.push({ edgeId: p.edge, reversed: edge.from !== p.node });
    cur = p.node;
  }
  return steps.reverse();
}

/** Pozycja na grafie: odcinek i odległość od jego węzła `from`. */
export interface GraphPosition {
  edgeId: string;
  along: number;
}

/** Odległość między dwiema pozycjami mierzona po ścieżce [m]. */
export function distanceAlongGraph(graph: Graph, a: GraphPosition, b: GraphPosition): number {
  const ea = graph.edges.get(a.edgeId);
  const eb = graph.edges.get(b.edgeId);
  if (!ea || !eb) throw new Error('distanceAlongGraph: nieznany odcinek');
  if (ea.id === eb.id) return Math.abs(a.along - b.along);
  let best = Infinity;
  const endsA: [string, number][] = [[ea.from, a.along], [ea.to, ea.length - a.along]];
  const endsB: [string, number][] = [[eb.from, b.along], [eb.to, eb.length - b.along]];
  for (const [na, da] of endsA) {
    for (const [nb, db] of endsB) {
      const path = pathBetween(graph, na, nb);
      if (!path) continue;
      // Droga nie może prowadzić przez sam odcinek startowy lub końcowy.
      if (path.some((s) => s.edgeId === ea.id || s.edgeId === eb.id)) continue;
      const mid = path.reduce((sum, s) => sum + graph.edges.get(s.edgeId)!.length, 0);
      best = Math.min(best, da + mid + db);
    }
  }
  return best;
}
