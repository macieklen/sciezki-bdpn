/** Pomocnicze obliczenia dla widoków (bez narzucania trasy). */
import type { BranchOption, TrailBundle } from '@sciezki/core';

/** Przystanki w kolejności numeracji przewodnika. */
export function stopsByNumber(trail: TrailBundle) {
  return trail.stops.toSorted((a, b) => a.number.localeCompare(b.number, 'pl', { numeric: true }));
}

/**
 * Czy idąc w kierunku `direction` (wzdłuż odcinka przystanku) idziemy pod prąd przewodnika?
 * Porównujemy z kierunkiem, w którym trasa przewodnika przechodzi ten odcinek.
 */
export function isOppositeToGuide(trail: TrailBundle, stopId: string, direction: 1 | -1 | 0 | undefined): boolean {
  const g = trail.guideDirection;
  if (!g || !direction) return false;
  const guide = trail.routes.find((r) => r.from === g.from && r.to === g.to);
  const stop = trail.stops.find((s) => s.id === stopId);
  const seg = guide?.segments.find((s) => s.id === stop?.segmentId);
  if (!seg) return false;
  const guideDir = seg.reversed ? -1 : 1;
  return direction !== guideDir;
}

/** Etykieta gałęzi z nazw końców (mianownik, bez odmiany): „Przełęcz · Wieś”. */
export function branchLabel(option: BranchOption, names: Record<string, string>): string {
  return option.endpoints.map((e) => names[e.id] ?? e.id).join(' · ');
}
