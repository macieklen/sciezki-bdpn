/**
 * Sesja spaceru: jedna na aplikację, przetrwa przejście do ekranu przystanku i z powrotem.
 * Łączy źródło położenia z logiką śledzenia z packages/core. Bez narzuconej trasy:
 * aplikacja reaguje na ruch (przystanki przed nami, opcje przy rozwidleniu).
 */
import {
  Tracker,
  dist,
  trailGraph,
  type BranchOption,
  type Fix,
  type Outlook,
  type TrackerEvent,
  type TrailBundle,
  type TrailGraph,
} from '@sciezki/core';
import type { LocationSource } from './location.svelte';

export interface Arrival {
  stopIds: string[];
  at: number;
}

class WalkSession {
  trailId = $state<string | null>(null);
  source = $state<LocationSource | null>(null);
  status = $state<'waiting' | 'on-trail' | 'off-trail'>('waiting');
  position = $state<[number, number] | null>(null);
  rawFix = $state<Fix | null>(null);
  /** Odległość od ścieżki [m] — do komunikatu „jesteś poza ścieżką”. */
  trailDistance = $state<number | null>(null);
  visited = $state<string[]>([]);
  outlook = $state<Outlook>({ kind: 'none' });
  arrival = $state<Arrival | null>(null);
  /** Rozwidlenie przed nami z opcjami; widoczne do potwierdzenia gałęzi (nie miga). */
  junction = $state<{ nodeId: string; options: BranchOption[] } | null>(null);
  /** Kierunek marszu przy dotarciu do przystanku (do notek „pod prąd przewodnika”). */
  arrivalDirection = $state<Record<string, 1 | -1 | 0>>({});
  error = $state<string | null>(null);

  tg: TrailGraph | null = null;
  private tracker: Tracker | null = null;
  private listeners = new Set<(e: TrackerEvent) => void>();

  get active() {
    return this.source !== null;
  }

  isFor(trailId: string) {
    return this.trailId === trailId;
  }

  start(bundle: TrailBundle, source: LocationSource) {
    this.stop();
    this.tg = trailGraph(bundle);
    this.tracker = new Tracker(this.tg);
    this.trailId = bundle.id;
    this.status = 'waiting';
    this.position = null;
    this.rawFix = null;
    this.trailDistance = null;
    this.visited = [];
    this.outlook = { kind: 'none' };
    this.arrival = null;
    this.junction = null;
    this.arrivalDirection = {};
    this.error = null;
    this.source = source;
    source.start(
      (fix) => this.onFix(fix),
      (message) => (this.error = message),
    );
  }

  stop() {
    this.source?.stop();
    this.source = null;
  }

  /** Zakończ i wyczyść stan. */
  end() {
    this.stop();
    this.trailId = null;
    this.tracker = null;
  }

  markVisited(stopId: string) {
    this.tracker?.markVisited(stopId);
    this.sync();
  }

  dismissArrival() {
    this.arrival = null;
  }

  onEvent(fn: (e: TrackerEvent) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private onFix(fix: Fix) {
    if (!this.tracker) return;
    this.error = null;
    this.rawFix = fix;
    const events = this.tracker.update(fix);
    for (const e of events) {
      if (e.type === 'arrived') {
        this.arrival = { stopIds: e.stopIds, at: fix.time };
        this.arrivalDirection = { ...this.arrivalDirection, ...Object.fromEntries(e.stopIds.map((id) => [id, e.direction])) };
      }
      if (e.type === 'junction') this.junction = { nodeId: e.nodeId, options: e.options };
    }
    this.updateJunction();
    this.sync();
    for (const e of events) for (const fn of this.listeners) fn(e);
  }

  /** Opcje rozwidlenia znikają, gdy wejdziemy w którąś gałąź albo oddalimy się od węzła. */
  private updateJunction() {
    const j = this.junction;
    const pos = this.tracker?.position;
    if (!j || !pos || !this.tg) return;
    const enteredBranch = j.options.some((o) => o.edgeId === pos.edgeId);
    const node = this.tg.graph.nodes.get(j.nodeId)!;
    const far = dist(this.tg.proj.forward(pos.point), node.xy) > this.tracker!.options.junctionWarning * 2;
    if (enteredBranch || far) this.junction = null;
  }

  private sync() {
    const t = this.tracker!;
    this.status = t.status;
    this.trailDistance = t.trailDistance;
    this.position = t.position ? [t.position.point[0], t.position.point[1]] : null;
    this.visited = [...t.visited];
    this.outlook = t.outlook();
  }
}

export const walk = new WalkSession();
