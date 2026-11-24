/**
 * Geometria w lokalnym układzie metrycznym.
 *
 * Wszystkie obliczenia odległości (w buildzie i w aplikacji) robimy w tym samym
 * lokalnym rzucie równoodległościowym, zaczepionym w środku ścieżki. Na obszarze
 * kilku kilometrów błąd jest pomijalny (<0,1%), a dzięki temu build i telefon
 * liczą pozycje przystanków identycznie.
 */

export type LonLat = [lon: number, lat: number];
export type XY = [x: number, y: number];

const EARTH_RADIUS = 6371008.8;
const DEG = Math.PI / 180;

export interface LocalProjection {
  origin: LonLat;
  forward(p: LonLat): XY;
  inverse(p: XY): LonLat;
}

export function createLocalProjection(origin: LonLat): LocalProjection {
  const [lon0, lat0] = origin;
  const kx = EARTH_RADIUS * DEG * Math.cos(lat0 * DEG);
  const ky = EARTH_RADIUS * DEG;
  return {
    origin,
    forward: ([lon, lat]) => [(lon - lon0) * kx, (lat - lat0) * ky],
    inverse: ([x, y]) => [lon0 + x / kx, lat0 + y / ky],
  };
}

/** Środek prostokąta ograniczającego zbiór punktów. */
export function bboxCenter(points: LonLat[]): LonLat {
  if (points.length === 0) throw new Error('bboxCenter: brak punktów');
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

export function dist(a: XY, b: XY): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

export function polylineLength(line: XY[]): number {
  let len = 0;
  for (let i = 1; i < line.length; i++) len += dist(line[i - 1]!, line[i]!);
  return len;
}

export interface PolylineProjection {
  /** Odległość wzdłuż linii od jej początku do rzutu punktu [m]. */
  along: number;
  /** Odległość punktu od linii [m]. */
  offset: number;
  /** Rzut punktu na linię. */
  point: XY;
}

/** Rzut punktu na łamaną: najbliższy punkt linii i jego pozycja wzdłuż niej. */
export function projectOnPolyline(p: XY, line: XY[]): PolylineProjection {
  if (line.length < 2) throw new Error('projectOnPolyline: linia musi mieć co najmniej 2 punkty');
  let best: PolylineProjection = { along: 0, offset: Infinity, point: line[0]! };
  let walked = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const segLen2 = dx * dx + dy * dy;
    const segLen = Math.sqrt(segLen2);
    let t = segLen2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / segLen2;
    t = Math.max(0, Math.min(1, t));
    const q: XY = [a[0] + t * dx, a[1] + t * dy];
    const d = dist(p, q);
    if (d < best.offset) best = { along: walked + t * segLen, offset: d, point: q };
    walked += segLen;
  }
  return best;
}

/** Punkt na łamanej w zadanej odległości od jej początku. */
export function pointAlong(line: XY[], along: number): XY {
  if (line.length === 0) throw new Error('pointAlong: pusta linia');
  if (along <= 0) return line[0]!;
  let walked = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const segLen = dist(a, b);
    if (walked + segLen >= along) {
      const t = segLen === 0 ? 0 : (along - walked) / segLen;
      return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    }
    walked += segLen;
  }
  return line[line.length - 1]!;
}
