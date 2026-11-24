/**
 * Scenariusze spaceru na ścieżce przykładowej: symulowane odczyty GPS z szumem
 * przechodzą przez Tracker; sprawdzamy, kiedy i ile razy wykrywa przystanki.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  Tracker,
  parseGpx,
  simulateWalk,
  trailBundleSchema,
  trailGraph,
  walkThroughNodes,
  type TrackerEvent,
  type TrailGraph,
  type WalkLeg,
} from '@sciezki/core';
import { buildContent } from '../src/build.ts';

let tg: TrailGraph;
const node = (entranceOrLeaf: string) => {
  const n = tg.bundle.nodes.find((x) => x.entranceId === entranceOrLeaf || (entranceOrLeaf === 'odnoga' && x.degree === 1 && !x.entranceId));
  if (!n) throw new Error(entranceOrLeaf);
  return n.id;
};
const route = (from: string, to: string) => tg.bundle.routes.find((r) => r.from === from && r.to === to)!;

function walk(legs: WalkLeg[], routeFromTo: [string, string], seed = 1, noise = 8) {
  const tracker = new Tracker(tg, route(...routeFromTo));
  const events: TrackerEvent[] = [];
  for (const fix of simulateWalk(tg, legs, { seed, noise })) events.push(...tracker.update(fix));
  const arrivals = events.filter((e) => e.type === 'arrived').map((e) => (e as { stopIds: string[] }).stopIds);
  return { tracker, events, arrivals };
}

beforeAll(async () => {
  const out = mkdtempSync(join(tmpdir(), 'sciezki-tracker-'));
  const res = await buildContent({ contentDir: join(import.meta.dirname, '../../../content'), outDir: out });
  expect(res.ok).toBe(true);
  tg = trailGraph(trailBundleSchema.parse(JSON.parse(readFileSync(join(out, 'trails/przyklad/trail.json'), 'utf8'))));
}, 60_000);

describe('Tracker na ścieżce przykładowej', () => {
  it.each([1, 2, 3, 4, 5])('parking → przełęcz (szum 8 m, ziarno %i): przystanki po kolei, każdy raz', (seed) => {
    const { arrivals, tracker } = walk(walkThroughNodes(tg, [node('parking'), node('przelecz')]), ['parking', 'przelecz'], seed);
    // 07 i 08 są w jednej grupie → jedno zdarzenie.
    expect(arrivals).toEqual([['01'], ['02'], ['03'], ['04'], ['06'], ['07', '08'], ['09']]);
    expect(tracker.nextStop()).toBeNull();
  });

  it('w przeciwną stronę kolejność jest odwrócona', () => {
    const { arrivals } = walk(walkThroughNodes(tg, [node('przelecz'), node('parking')]), ['przelecz', 'parking']);
    expect(arrivals.flat()).toEqual(['09', '07', '08', '06', '04', '03', '02', '01']);
  });

  it('wejście w ślepą odnogę i powrót: przystanek na odnodze raz, bez powtórzeń', () => {
    const legs = walkThroughNodes(tg, [node('parking'), node('odnoga'), node('przelecz')]);
    const { arrivals } = walk(legs, ['parking', 'przelecz'], 7);
    expect(arrivals.flat()).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09']);
  });

  it('wieś → przełęcz: mija rozwidlenie, nie zalicza przystanków z innej gałęzi', () => {
    const { arrivals } = walk(walkThroughNodes(tg, [node('wies'), node('przelecz')]), ['wies', 'przelecz'], 3);
    expect(arrivals.flat()).toEqual(['10', '09']);
  });

  it('zawrócenie w połowie odcinka nie powtarza powiadomień', () => {
    const first = tg.bundle.segments.find((s) => s.id === 'parking-rozwidlenie')!;
    const legs: WalkLeg[] = [
      { edgeId: first.id, fromAlong: 0, toAlong: 700 },
      { edgeId: first.id, fromAlong: 700, toAlong: 150 },
      { edgeId: first.id, fromAlong: 150, toAlong: first.length },
    ];
    const { arrivals } = walk(legs, ['parking', 'przelecz'], 5);
    expect(arrivals.flat()).toEqual(['01', '02', '03', '04']);
  });

  it('zapowiada rozwidlenie', () => {
    const { events } = walk(walkThroughNodes(tg, [node('parking'), node('przelecz')]), ['parking', 'przelecz']);
    expect(events.filter((e) => e.type === 'junction')).toHaveLength(2);
  });

  it('ignoruje odczyty o słabej dokładności', () => {
    const tracker = new Tracker(tg, route('parking', 'przelecz'));
    const fixes = simulateWalk(tg, walkThroughNodes(tg, [node('parking'), node('przelecz')])).map((f) => ({ ...f, accuracy: 120 }));
    expect(fixes.flatMap((f) => tracker.update(f))).toEqual([]);
    expect(tracker.ignoredFixes).toBe(fixes.length);
  });

  it('podaje następny przystanek i odległość po ścieżce', () => {
    const tracker = new Tracker(tg, route('parking', 'przelecz'));
    const fixes = simulateWalk(tg, walkThroughNodes(tg, [node('parking'), node('przelecz')]), { noise: 0 });
    tracker.update(fixes[0]!);
    const next = tracker.nextStop()!;
    expect(next.stopId).toBe('01');
    expect(next.distance).toBeCloseTo(tg.bundle.stops.find((s) => s.id === '01')!.along, 0);
  });

  it('czyta ślad GPX', () => {
    const gpx = `<gpx><trk><trkseg>
      <trkpt lat="49.07" lon="22.70"><time>2026-05-01T10:00:00Z</time><hdop>2</hdop></trkpt>
      <trkpt lat="49.0701" lon="22.7001"/>
    </trkseg></trk></gpx>`;
    const fixes = parseGpx(gpx);
    expect(fixes).toHaveLength(2);
    expect(fixes[0]).toMatchObject({ lat: 49.07, lon: 22.7, accuracy: 10, time: Date.parse('2026-05-01T10:00:00Z') });
  });
});
