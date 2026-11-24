/**
 * Śledzenie spaceru: dopasowanie kolejnych odczytów GPS do grafu ścieżki
 * i wykrywanie dotarcia do przystanków. Ten sam kod działa w aplikacji
 * (na telefonie i w symulatorze) oraz w testach.
 */
import { dist, projectOnPolyline, type LonLat, type XY } from './geo.ts';
import { distanceAlongGraph } from './graph.ts';
import type { TrailBundle } from './schema.ts';
import type { TrailGraph } from './trail-graph.ts';

export interface Fix {
  lon: number;
  lat: number;
  /** Deklarowana dokładność odczytu [m] (promień 68%). */
  accuracy?: number;
  /** Czas odczytu [ms]. */
  time: number;
}

export interface TrackerOptions {
  /** Odczyty o gorszej dokładności są pomijane [m]. */
  maxAccuracy: number;
  /** Dalej od ścieżki = poza ścieżką [m]. */
  offTrail: number;
  /** Ile kolejnych zgodnych odczytów potrzeba do zmiany odcinka na sąsiedni. */
  switchConfirmations: number;
  /** O ile metrów inny odcinek musi być bliżej, żeby liczyć go jako kandydata. */
  switchMargin: number;
  /** Minimalny ruch wzdłuż odcinka, żeby ustalić kierunek [m]. */
  directionThreshold: number;
  /** Zapowiedź rozwidlenia z takiej odległości [m]; 0 = wyłączone. */
  junctionWarning: number;
}

export const DEFAULT_TRACKER_OPTIONS: TrackerOptions = {
  maxAccuracy: 50,
  offTrail: 60,
  switchConfirmations: 2,
  switchMargin: 4,
  directionThreshold: 3,
  junctionWarning: 50,
};

export type TrackerEvent =
  | { type: 'arrived'; stopIds: string[] }
  | { type: 'junction'; nodeId: string }
  | { type: 'offTrail' }
  | { type: 'backOnTrail' };

export interface TrailPosition {
  edgeId: string;
  along: number;
  /** Punkt na ścieżce (rzut odczytu). */
  point: LonLat;
  /** Odległość odczytu od ścieżki [m]. */
  offset: number;
}

export type TrackerStatus = 'waiting' | 'on-trail' | 'off-trail';

type Stop = TrailBundle['stops'][number];
type Route = TrailBundle['routes'][number];

export class Tracker {
  readonly options: TrackerOptions;
  status: TrackerStatus = 'waiting';
  position: TrailPosition | null = null;
  /** +1: w stronę węzła `to` odcinka, −1: w stronę `from`, 0: nieznany. */
  direction: 1 | -1 | 0 = 0;
  /** Surowa pozycja ostatniego przyjętego odczytu. */
  lastFix: Fix | null = null;
  readonly visited = new Set<string>();
  ignoredFixes = 0;

  private pending: { edgeId: string; count: number } | null = null;
  private movement = 0;
  /** Zapowiedziane rozwidlenia; zapominamy je dopiero po oddaleniu się. */
  private readonly announced = new Set<string>();
  private readonly stops: Stop[];

  constructor(
    private readonly tg: TrailGraph,
    readonly route: Route | null = null,
    options: Partial<TrackerOptions> = {},
  ) {
    this.options = { ...DEFAULT_TRACKER_OPTIONS, ...options };
    this.stops = tg.bundle.stops;
  }

  /** Przetwarza odczyt i zwraca zdarzenia (dotarcie do przystanku itp.). */
  update(fix: Fix): TrackerEvent[] {
    const o = this.options;
    if (fix.accuracy !== undefined && fix.accuracy > o.maxAccuracy) {
      this.ignoredFixes++;
      return [];
    }
    this.lastFix = fix;
    const xy = this.tg.proj.forward([fix.lon, fix.lat]);
    const candidates = [...this.tg.graph.edges.values()]
      .map((e) => ({ edgeId: e.id, ...projectOnPolyline(xy, e.line) }))
      .sort((a, b) => a.offset - b.offset);
    const best = candidates[0];
    if (!best) return [];

    const events: TrackerEvent[] = [];
    let chosen = best;
    const prev = this.position;

    if (prev) {
      const current = candidates.find((c) => c.edgeId === prev.edgeId)!;
      chosen = current;
      if (best.edgeId !== prev.edgeId && best.offset + o.switchMargin < current.offset) {
        const adjacent = this.sharedNode(prev.edgeId, best.edgeId) !== null;
        // Skok na odcinek, który nie styka się z bieżącym, wymaga więcej potwierdzeń.
        const needed = adjacent ? o.switchConfirmations : o.switchConfirmations * 3;
        this.pending = this.pending?.edgeId === best.edgeId ? { edgeId: best.edgeId, count: this.pending.count + 1 } : { edgeId: best.edgeId, count: 1 };
        if (this.pending.count >= needed) {
          chosen = best;
          this.pending = null;
        }
      } else {
        this.pending = null;
      }
    } else if (best.offset > o.offTrail) {
      return []; // jeszcze nie na ścieżce
    }

    // Poza ścieżką / powrót.
    if (chosen.offset > o.offTrail) {
      if (this.status !== 'off-trail') events.push({ type: 'offTrail' });
      this.status = 'off-trail';
      return events;
    }
    if (this.status === 'off-trail') {
      if (chosen.offset > o.offTrail * 0.75) return events; // histereza
      events.push({ type: 'backOnTrail' });
    }
    this.status = 'on-trail';

    // Kierunek ruchu.
    if (prev && prev.edgeId !== chosen.edgeId) {
      const node = this.sharedNode(prev.edgeId, chosen.edgeId);
      const edge = this.tg.graph.edges.get(chosen.edgeId)!;
      this.direction = node === edge.from ? 1 : node === edge.to ? -1 : 0;
      this.movement = 0;
    } else if (prev) {
      this.movement += chosen.along - prev.along;
      if (Math.abs(this.movement) >= o.directionThreshold) {
        this.direction = this.movement > 0 ? 1 : -1;
        this.movement = 0;
      }
    }

    this.position = {
      edgeId: chosen.edgeId,
      along: chosen.along,
      point: this.tg.proj.inverse(chosen.point),
      offset: chosen.offset,
    };

    events.push(...this.checkStops(), ...this.checkJunction());
    return events;
  }

  /** Ręczne oznaczenie przystanku jako odwiedzonego (np. „Jestem przy przystanku”). */
  markVisited(stopId: string) {
    for (const s of this.groupOf(stopId)) this.visited.add(s.id);
  }

  /** Następny nieodwiedzony przystanek na trasie i odległość do niego po ścieżce. */
  nextStop(): { stopId: string; distance: number | null } | null {
    const order = this.route?.stops ?? this.stops.map((s) => s.id);
    const id = order.find((sid) => !this.visited.has(sid));
    if (!id) return null;
    const stop = this.stops.find((s) => s.id === id)!;
    const distance = this.position
      ? distanceAlongGraph(this.tg.graph, { edgeId: this.position.edgeId, along: this.position.along }, { edgeId: stop.segmentId, along: stop.along })
      : null;
    return { stopId: id, distance };
  }

  private checkStops(): TrackerEvent[] {
    const pos = this.position!;
    const events: TrackerEvent[] = [];
    // Tylko przystanki na bieżącym odcinku: przystanek tuż za rozwidleniem czeka,
    // aż odcinek (gałąź) zostanie rozpoznany.
    for (const s of this.stops) {
      if (this.visited.has(s.id) || s.segmentId !== pos.edgeId) continue;
      if (Math.abs(s.along - pos.along) <= s.radius) {
        const group = this.groupOf(s.id).filter((g) => !this.visited.has(g.id));
        for (const g of group) this.visited.add(g.id);
        events.push({ type: 'arrived', stopIds: group.map((g) => g.id) });
      }
    }
    return events;
  }

  private checkJunction(): TrackerEvent[] {
    const { junctionWarning } = this.options;
    if (!junctionWarning) return [];
    const pos = this.position!;
    const here = this.tg.proj.forward(pos.point);
    for (const id of this.announced) {
      if (dist(here, this.tg.graph.nodes.get(id)!.xy) > junctionWarning * 3) this.announced.delete(id);
    }
    if (this.direction === 0) return [];
    const edge = this.tg.graph.edges.get(pos.edgeId)!;
    const nodeId = this.direction === 1 ? edge.to : edge.from;
    const node = this.tg.graph.nodes.get(nodeId)!;
    const toNode = this.direction === 1 ? edge.length - pos.along : pos.along;
    if (node.edges.length >= 3 && toNode <= junctionWarning && !this.announced.has(nodeId)) {
      this.announced.add(nodeId);
      return [{ type: 'junction', nodeId }];
    }
    return [];
  }

  private groupOf(stopId: string): Stop[] {
    const s = this.stops.find((x) => x.id === stopId);
    if (!s) return [];
    return s.group ? this.stops.filter((x) => x.group === s.group) : [s];
  }

  private sharedNode(a: string, b: string): string | null {
    const ea = this.tg.graph.edges.get(a)!;
    const eb = this.tg.graph.edges.get(b)!;
    if (ea.from === eb.from || ea.from === eb.to) return ea.from;
    if (ea.to === eb.from || ea.to === eb.to) return ea.to;
    return null;
  }
}

/** Odległość w linii prostej między odczytem a punktem [m] (pomocniczo dla UI). */
export function fixDistance(tg: TrailGraph, fix: Fix, point: LonLat): number {
  const a: XY = tg.proj.forward([fix.lon, fix.lat]);
  return dist(a, tg.proj.forward(point));
}
