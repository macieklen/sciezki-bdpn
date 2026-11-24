import { describe, expect, it } from 'vitest';
import {
  buildGraph,
  createLocalProjection,
  distanceAlongGraph,
  pathBetween,
  pointAlong,
  polylineLength,
  projectOnPolyline,
  type XY,
} from '../src/index.ts';

describe('geo', () => {
  it('lokalny rzut jest odwracalny i metryczny', () => {
    const p = createLocalProjection([22.7, 49.07]);
    const back = p.inverse(p.forward([22.71, 49.08]));
    expect(back[0]).toBeCloseTo(22.71, 9);
    expect(back[1]).toBeCloseTo(49.08, 9);
    // 0,01° szerokości ≈ 1112 m
    expect(p.forward([22.7, 49.08])[1]).toBeCloseTo(1111.95, 0);
  });

  it('rzut punktu na łamaną', () => {
    const line: XY[] = [[0, 0], [100, 0], [100, 100]];
    expect(polylineLength(line)).toBe(200);
    const r = projectOnPolyline([110, 50], line);
    expect(r.along).toBeCloseTo(150);
    expect(r.offset).toBeCloseTo(10);
    expect(pointAlong(line, 150)).toEqual([100, 50]);
  });
});

// Drzewo:  A ── J ── B
//               │
//               C
const tree = [
  { id: 'aj', line: [[0, 0], [100, 0]] as XY[] },
  { id: 'jb', line: [[100.5, 0.5], [200, 0]] as XY[] }, // koniec 0,7 m od J — ma zostać sklejony
  { id: 'jc', line: [[100, 0], [100, -80]] as XY[] },
];

describe('graf', () => {
  it('skleja końce i rozpoznaje drzewo', () => {
    const { graph, issues } = buildGraph(tree, 2);
    expect(issues.filter((i) => i.level !== 'info')).toEqual([]);
    expect(graph.nodes.size).toBe(4);
    const j = [...graph.nodes.values()].find((n) => n.edges.length === 3);
    expect(j?.xy).toEqual([100, 0]);
  });

  it('wykrywa pętlę', () => {
    const { issues } = buildGraph([...tree, { id: 'bc', line: [[200, 0], [100, -80]] }], 2);
    expect(issues.some((i) => i.level === 'error' && i.message.includes('pętlę'))).toBe(true);
  });

  it('wykrywa brak połączenia i niedociągnięty koniec', () => {
    const { issues } = buildGraph(
      [
        { id: 'a', line: [[0, 0], [100, 0]] },
        { id: 'b', line: [[105, 0], [200, 0]] },
      ],
      2,
    );
    expect(issues.some((i) => i.level === 'error' && i.message.includes('nie jest spójna'))).toBe(true);
    expect(issues.some((i) => i.level === 'warning' && i.message.includes('nie jest z nim połączony'))).toBe(true);
  });

  it('wykrywa przecięcie odcinków poza węzłem', () => {
    const { issues } = buildGraph(
      [
        { id: 'a', line: [[0, 0], [100, 0]] },
        { id: 'b', line: [[50, -50], [50, 50]] },
      ],
      2,
    );
    expect(issues.some((i) => i.message.includes('przecinają się'))).toBe(true);
  });

  it('wyznacza drogę i odległość po ścieżce', () => {
    const { graph } = buildGraph(tree, 2);
    const nodeAt = (x: number, y: number) => [...graph.nodes.values()].find((n) => n.xy[0] === x && n.xy[1] === y)!.id;
    const path = pathBetween(graph, nodeAt(200, 0), nodeAt(100, -80))!;
    expect(path.map((s) => s.edgeId)).toEqual(['jb', 'jc']);
    expect(path[0]!.reversed).toBe(true);
    // 30 m przed J na "aj" i 20 m za J na "jc"
    expect(distanceAlongGraph(graph, { edgeId: 'aj', along: 70 }, { edgeId: 'jc', along: 20 })).toBeCloseTo(50);
    expect(distanceAlongGraph(graph, { edgeId: 'aj', along: 10 }, { edgeId: 'aj', along: 70 })).toBe(60);
  });
});
