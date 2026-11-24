/**
 * Sesja spaceru: jedna na aplikację, przetrwa przejście do ekranu przystanku i z powrotem.
 * Łączy źródło położenia z logiką śledzenia z packages/core.
 */
import { Tracker, trailGraph, type Fix, type TrackerEvent, type TrailBundle, type TrailGraph } from '@sciezki/core';
import type { LocationSource } from './location.svelte';

type Route = TrailBundle['routes'][number];

export interface Arrival {
  stopIds: string[];
  at: number;
}

class WalkSession {
  trailId = $state<string | null>(null);
  routeKey = $state<string | null>(null);
  source = $state<LocationSource | null>(null);
  status = $state<'waiting' | 'on-trail' | 'off-trail'>('waiting');
  position = $state<[number, number] | null>(null);
  rawFix = $state<Fix | null>(null);
  visited = $state<string[]>([]);
  next = $state<{ stopId: string; distance: number | null } | null>(null);
  arrival = $state<Arrival | null>(null);
  junctionAhead = $state<string | null>(null);
  error = $state<string | null>(null);

  tg: TrailGraph | null = null;
  private tracker: Tracker | null = null;
  private listeners = new Set<(e: TrackerEvent) => void>();

  get active() {
    return this.source !== null;
  }

  isFor(trailId: string, from: string, to: string) {
    return this.trailId === trailId && this.routeKey === `${from}>${to}`;
  }

  start(bundle: TrailBundle, route: Route, source: LocationSource) {
    this.stop();
    this.tg = trailGraph(bundle);
    this.tracker = new Tracker(this.tg, route);
    this.trailId = bundle.id;
    this.routeKey = `${route.from}>${route.to}`;
    this.status = 'waiting';
    this.position = null;
    this.rawFix = null;
    this.visited = [];
    this.arrival = null;
    this.junctionAhead = null;
    this.error = null;
    this.next = this.tracker.nextStop();
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
    this.routeKey = null;
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
    this.sync();
    for (const e of events) {
      if (e.type === 'arrived') this.arrival = { stopIds: e.stopIds, at: fix.time };
      if (e.type === 'junction') this.junctionAhead = e.nodeId;
      for (const fn of this.listeners) fn(e);
    }
    // Zapowiedź rozwidlenia znika, gdy je miniemy.
    if (this.junctionAhead && this.tracker.position && this.tg) {
      const node = this.tg.graph.nodes.get(this.junctionAhead)!;
      if (!node.edges.includes(this.tracker.position.edgeId)) this.junctionAhead = null;
    }
  }

  private sync() {
    const t = this.tracker!;
    this.status = t.status;
    this.position = t.position ? [t.position.point[0], t.position.point[1]] : null;
    this.visited = [...t.visited];
    this.next = t.nextStop();
  }
}

export const walk = new WalkSession();
