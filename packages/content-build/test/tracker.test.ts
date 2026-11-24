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
  stopNeighbours,
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
  const n = tg.bundle.nodes.find((x) => x.entranceId === entranceOrLeaf);
  if (!n) throw new Error(entranceOrLeaf);
  return n.id;
};
function walk(legs: WalkLeg[], _label: [string, string], seed = 1, noise = 8) {
  const tracker = new Tracker(tg);
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
    // Na końcu (przy przełęczy) przed nami nie ma już przystanków.
    const o = tracker.outlook();
    expect(o.kind === 'ahead' ? o.stops : []).toEqual([]);
  });

  it('w przeciwną stronę kolejność jest odwrócona', () => {
    const { arrivals } = walk(walkThroughNodes(tg, [node('przelecz'), node('parking')]), ['przelecz', 'parking']);
    expect(arrivals.flat()).toEqual(['09', '07', '08', '06', '04', '03', '02', '01']);
  });

  it('wejście w ślepą odnogę i powrót: przystanek na odnodze raz, bez powtórzeń', () => {
    const legs = walkThroughNodes(tg, [node('parking'), node('punkt-widokowy'), node('przelecz')]);
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

  it('zapowiada rozwidlenia z opcjami gałęzi', () => {
    const { events } = walk(walkThroughNodes(tg, [node('parking'), node('przelecz')]), ['parking', 'przelecz']);
    const junctions = events.filter((e) => e.type === 'junction');
    expect(junctions).toHaveLength(2);
    const first = junctions[0]!;
    if (first.type !== 'junction') throw new Error();
    const spur = first.options.find((o) => o.deadEnd)!;
    expect(spur.endpoints.map((e) => e.id)).toEqual(['punkt-widokowy']);
    expect(spur.stopIds).toEqual(['05']);
    const main = first.options.find((o) => !o.deadEnd)!;
    expect(main.endpoints.map((e) => e.id).sort()).toEqual(['przelecz', 'wies']);
    expect(main.stopIds).toEqual(['06', '07', '08', '09', '10']);
  });

  it('ignoruje odczyty o słabej dokładności', () => {
    const tracker = new Tracker(tg);
    const fixes = simulateWalk(tg, walkThroughNodes(tg, [node('parking'), node('przelecz')])).map((f) => ({ ...f, accuracy: 120 }));
    expect(fixes.flatMap((f) => tracker.update(f))).toEqual([]);
    expect(tracker.ignoredFixes).toBe(fixes.length);
  });

  it('przed ustaleniem kierunku pokazuje najbliższe, potem przystanki przed nami', () => {
    const tracker = new Tracker(tg);
    const fixes = simulateWalk(tg, walkThroughNodes(tg, [node('parking'), node('przelecz')]), { noise: 0 });
    tracker.update(fixes[0]!);
    expect(tracker.outlook().kind).toBe('nearest');
    for (const f of fixes.slice(1, 16)) tracker.update(f);
    const o = tracker.outlook();
    expect(o.kind).toBe('ahead');
    if (o.kind !== 'ahead') throw new Error();
    expect(o.stops[0]!.stopId).toBe('01');
    expect(o.stops[0]!.distance).toBeLessThan(tg.bundle.stops.find((s) => s.id === '01')!.along);
  });

  it('podaje kierunek marszu przy dotarciu do przystanku', () => {
    const there = walk(walkThroughNodes(tg, [node('parking'), node('przelecz')]), ['parking', 'przelecz']);
    const back = walk(walkThroughNodes(tg, [node('przelecz'), node('parking')]), ['przelecz', 'parking']);
    const dir = (r: typeof there, id: string) =>
      r.events.find((e) => e.type === 'arrived' && e.stopIds.includes(id))!.type === 'arrived'
        ? (r.events.find((e) => e.type === 'arrived' && e.stopIds.includes(id)) as { direction: number }).direction
        : 0;
    expect(dir(there, '03')).toBe(1);
    expect(dir(back, '03')).toBe(-1);
  });

  it('sąsiedzi przystanku po ścieżce, przez rozwidlenie po jednym na gałąź', () => {
    const n = stopNeighbours(tg, '04').map((x) => x.stopId).sort();
    expect(n).toEqual(['03', '05', '06']);
    const n6 = stopNeighbours(tg, '06');
    expect(n6.map((x) => x.stopId).sort()).toEqual(['04', '05', '07']);
    expect(n6.find((x) => x.stopId === '07')!.towards.sort()).toEqual(['przelecz', 'wies']);
  });

  it('daleko od ścieżki: status „poza ścieżką” z odległością od razu, bez czekania', () => {
    const tracker = new Tracker(tg);
    const events = tracker.update({ lon: 21.0, lat: 52.23, accuracy: 10, time: 0 }); // Warszawa
    expect(events).toEqual([{ type: 'offTrail' }]);
    expect(tracker.status).toBe('off-trail');
    expect(tracker.trailDistance).toBeGreaterThan(250_000);
    expect(tracker.position).toBeNull();
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
