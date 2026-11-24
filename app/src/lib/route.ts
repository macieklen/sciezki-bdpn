/** Wybór trasy między wejściami i pomocnicze obliczenia dla widoków. */
import type { TrailBundle } from '@sciezki/core';

export type Route = TrailBundle['routes'][number];

/** Średnie tempo marszu po szlaku leśnym [km/h]. */
const WALK_SPEED_KMH = 3.5;
export const walkMinutes = (meters: number) => (meters / 1000 / WALK_SPEED_KMH) * 60;

export function defaultStart(trail: TrailBundle): string | undefined {
  return trail.guideDirection?.from ?? trail.entrances[0]?.id;
}

/** Domyślny koniec: koniec trasy przewodnika albo najdłuższa trasa z danego wejścia. */
export function defaultEnd(trail: TrailBundle, from: string): string | undefined {
  const g = trail.guideDirection;
  if (g) {
    if (g.from === from) return g.to;
    if (g.to === from) return g.from;
  }
  const routes = trail.routes.filter((r) => r.from === from).sort((a, b) => b.length - a.length);
  return routes[0]?.to;
}

export function findRoute(trail: TrailBundle, from?: string | null, to?: string | null): Route | undefined {
  return trail.routes.find((r) => r.from === from && r.to === to);
}

/** Przystanki leżące poza trasą (na odnogach), w kolejności numerów. */
export function spurStops(trail: TrailBundle, route: Route | undefined) {
  const onRoute = new Set(route?.stops ?? []);
  return trail.stops
    .filter((s) => !onRoute.has(s.id))
    .sort((a, b) => a.number.localeCompare(b.number, 'pl', { numeric: true }));
}

/**
 * Czy na tym przystanku idziemy w przeciwną stronę niż przewodnik?
 * Porównujemy kierunek przejścia odcinka z przystankiem na naszej trasie i na trasie przewodnika.
 */
export function isOppositeToGuide(trail: TrailBundle, route: Route | undefined, stopId: string): boolean {
  const g = trail.guideDirection;
  if (!g || !route) return false;
  const guide = findRoute(trail, g.from, g.to);
  const stop = trail.stops.find((s) => s.id === stopId);
  if (!guide || !stop) return false;
  const mine = route.segments.find((s) => s.id === stop.segmentId);
  const theirs = guide.segments.find((s) => s.id === stop.segmentId);
  return !!mine && !!theirs && mine.reversed !== theirs.reversed;
}
