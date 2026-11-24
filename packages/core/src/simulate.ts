/**
 * Symulacja spaceru: generuje odczyty GPS wzdłuż zaplanowanej drogi,
 * z szumem i zmienną dokładnością. Używane w testach i w symulatorze w aplikacji.
 */
import { pointAlong, type XY } from './geo.ts';
import { pathBetween } from './graph.ts';
import type { Fix } from './tracker.ts';
import type { TrailGraph } from './trail-graph.ts';

/** Fragment drogi: przejście odcinka od `fromAlong` do `toAlong` (w dowolną stronę). */
export interface WalkLeg {
  edgeId: string;
  fromAlong: number;
  toAlong: number;
}

/** Droga przez kolejne węzły (np. wejście → koniec odnogi → inne wejście). */
export function walkThroughNodes(tg: TrailGraph, nodeIds: string[]): WalkLeg[] {
  const legs: WalkLeg[] = [];
  for (let i = 1; i < nodeIds.length; i++) {
    const path = pathBetween(tg.graph, nodeIds[i - 1]!, nodeIds[i]!);
    if (!path) throw new Error(`Brak drogi ${nodeIds[i - 1]} → ${nodeIds[i]}`);
    for (const step of path) {
      const len = tg.graph.edges.get(step.edgeId)!.length;
      legs.push(step.reversed ? { edgeId: step.edgeId, fromAlong: len, toAlong: 0 } : { edgeId: step.edgeId, fromAlong: 0, toAlong: len });
    }
  }
  return legs;
}

export interface SimulationOptions {
  /** Prędkość marszu [m/s]. */
  speed: number;
  /** Odstęp między odczytami [s]. */
  interval: number;
  /** Odchylenie standardowe szumu GPS [m]. */
  noise: number;
  /** Ziarno generatora (powtarzalne wyniki). */
  seed: number;
  startTime: number;
}

export const DEFAULT_SIMULATION: SimulationOptions = { speed: 1.1, interval: 2, noise: 8, seed: 1, startTime: 0 };

/** Prosty generator pseudolosowy z ziarnem (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Punkty drogi (lokalne) co `step` metrów. */
export function samplePath(tg: TrailGraph, legs: WalkLeg[], step: number): XY[] {
  const out: XY[] = [];
  let carry = 0;
  for (const leg of legs) {
    const line = tg.graph.edges.get(leg.edgeId)!.line;
    const len = Math.abs(leg.toAlong - leg.fromAlong);
    const sign = leg.toAlong >= leg.fromAlong ? 1 : -1;
    let d = carry;
    for (; d <= len; d += step) out.push(pointAlong(line, leg.fromAlong + sign * d));
    carry = d - len;
  }
  return out;
}

export function simulateWalk(tg: TrailGraph, legs: WalkLeg[], options: Partial<SimulationOptions> = {}): Fix[] {
  const o = { ...DEFAULT_SIMULATION, ...options };
  const rand = seededRandom(o.seed);
  const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand());
  return samplePath(tg, legs, o.speed * o.interval).map((p, i) => {
    // Szum skorelowany w czasie byłby wierniejszy; na potrzeby testów wystarcza niezależny.
    const [lon, lat] = tg.proj.inverse([p[0] + gauss() * o.noise, p[1] + gauss() * o.noise]);
    return {
      lon,
      lat,
      accuracy: Math.round(o.noise * (1 + rand())),
      time: o.startTime + i * o.interval * 1000,
    };
  });
}

/** Odczyty z pliku GPX (punkty śladu `trkpt`). */
export function parseGpx(text: string): Fix[] {
  const fixes: Fix[] = [];
  const re = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>|<trkpt\b([^>]*)\/>/g;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    const attrs = m[1] ?? m[3] ?? '';
    const body = m[2] ?? '';
    const lat = Number(/lat="([^"]+)"/.exec(attrs)?.[1]);
    const lon = Number(/lon="([^"]+)"/.exec(attrs)?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const time = /<time>([^<]+)<\/time>/.exec(body)?.[1];
    const hdop = /<hdop>([^<]+)<\/hdop>/.exec(body)?.[1];
    fixes.push({
      lon,
      lat,
      accuracy: hdop ? Number(hdop) * 5 : undefined,
      time: time ? Date.parse(time) : i * 1000,
    });
    i++;
  }
  return fixes;
}
