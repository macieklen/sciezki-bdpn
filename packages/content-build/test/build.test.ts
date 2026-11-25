import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLocalProjection, trailBundleSchema, type XY } from '@sciezki/core';
import { buildContent } from '../src/build.ts';
import { decodeGpkgGeometry, encodeGpkgGeometry, writeGpkg } from '../src/gpkg.ts';

const repo = join(import.meta.dirname, '..', '..', '..');

describe('GeoPackage', () => {
  it('koduje i dekoduje geometrię', () => {
    const line = { type: 'LineString' as const, coordinates: [[22.7, 49.07], [22.71, 49.08]] as [number, number][] };
    expect(decodeGpkgGeometry(encodeGpkgGeometry(line, 4326))).toEqual(line);
  });
});

describe('build ścieżki przykładowej', () => {
  it('buduje się bez błędów i wyznacza trasy', async () => {
    const out = mkdtempSync(join(tmpdir(), 'sciezki-'));
    const res = await buildContent({ contentDir: join(repo, 'content'), outDir: out });
    expect(res.messages.filter((m) => m.level !== 'info')).toEqual([]);
    expect(res.ok).toBe(true);
    const trail = trailBundleSchema.parse(JSON.parse(readFileSync(join(out, 'trails/przyklad/trail.json'), 'utf8')));
    expect(trail.entrances.filter((e) => e.kind === 'entrance').map((e) => e.id).sort()).toEqual(['parking', 'przelecz', 'wies']);
    expect(trail.entrances.find((e) => e.id === 'punkt-widokowy')?.kind).toBe('end');
    const route = trail.routes.find((r) => r.from === 'przelecz' && r.to === 'parking')!;
    expect(route.stops).toEqual(['09', '08', '07', '06', '04', '03', '02', '01']);
    const files = res.manifest!.trails[0]!.files;
    expect(files.some((f) => f.lang === 'en' && f.path.endsWith('.m4a'))).toBe(true);
    expect(files.find((f) => f.path.endsWith('trail.json'))?.lang).toBeNull();
    // Zdjęcia w tekście i dane do przeglądu.
    const texts = JSON.parse(readFileSync(join(out, 'trails/przyklad/texts.pl.json'), 'utf8'));
    expect(texts.stops['01'].inlineImages).toEqual(['01-1.jpg', '01-2.jpg']);
    expect(texts.stops['01'].html).toContain('<figure><img data-rel-src="media/img/01-1-');
    expect(texts.stops['01'].html).not.toContain('<p><figure>');
    expect(texts.trail.summary).toBeTruthy();
    const overview = res.manifest!.trails[0]!.overview;
    expect(overview.lines).toHaveLength(5);
  });
});

/** Mała ścieżka testowa: prosty odcinek 500 m z wejściami na końcach. */
function fixture(stops: { id: string; at: XY; group?: string }[]) {
  const dir = mkdtempSync(join(tmpdir(), 'sciezki-src-'));
  const trail = join(dir, 'trails', 't');
  mkdirSync(join(trail, 'stops'), { recursive: true });
  writeFileSync(join(dir, 'config.yaml'), 'languages: [pl]\ndefaultLanguage: pl\n');
  writeFileSync(join(trail, 'trail.yaml'), 'name: { pl: Test }\nentrances:\n  a: { pl: A }\n  b: { pl: B }\n');
  const p = createLocalProjection([22.7, 49.07]);
  writeGpkg(join(trail, 'trail.gpkg'), [
    { name: 'segments', geometryType: 'LINESTRING', columns: { id: 'TEXT' }, features: [{ geometry: { type: 'LineString', coordinates: [p.inverse([0, 0]), p.inverse([500, 0])] }, properties: { id: 's' } }] },
    { name: 'entrances', geometryType: 'POINT', columns: { id: 'TEXT' }, features: [
      { geometry: { type: 'Point', coordinates: p.inverse([0, 1]) }, properties: { id: 'a' } },
      { geometry: { type: 'Point', coordinates: p.inverse([500, 1]) }, properties: { id: 'b' } },
    ] },
    { name: 'stops', geometryType: 'POINT', columns: { id: 'TEXT', group: 'TEXT' }, features: stops.map((s) => ({ geometry: { type: 'Point' as const, coordinates: p.inverse(s.at) }, properties: { id: s.id, group: s.group ?? null } })) },
  ]);
  for (const s of stops) writeFileSync(join(trail, 'stops', `${s.id}.pl.md`), `---\ntitle: ${s.id}\n---\nTekst.\n`);
  return dir;
}

describe('walidacja', () => {
  const run = async (dir: string) => buildContent({ contentDir: dir, outDir: mkdtempSync(join(tmpdir(), 'sciezki-out-')) });

  it('przystanek za daleko od ścieżki to błąd', async () => {
    const res = await run(fixture([{ id: 'x', at: [200, 40] }]));
    expect(res.ok).toBe(false);
    expect(res.messages.some((m) => m.level === 'error' && m.text.includes('od ścieżki'))).toBe(true);
  });

  it('bliskie przystanki: ostrzeżenie, chyba że są w jednej grupie', async () => {
    const close = await run(fixture([{ id: 'x', at: [200, 3] }, { id: 'y', at: [220, -3] }]));
    expect(close.messages.some((m) => m.level === 'warning' && m.text.includes('20 m od siebie'))).toBe(true);
    const grouped = await run(fixture([{ id: 'x', at: [200, 3], group: 'g' }, { id: 'y', at: [220, -3], group: 'g' }]));
    expect(grouped.messages.filter((m) => m.level === 'warning')).toEqual([]);
  });

  it('brak tekstu w języku domyślnym to błąd', async () => {
    const dir = fixture([{ id: 'x', at: [200, 3] }]);
    writeFileSync(join(dir, 'trails/t/stops/x.pl.md'), 'bez frontmattera');
    const res = await run(dir);
    expect(res.messages.some((m) => m.level === 'error' && m.text.includes('title'))).toBe(true);
  });
});
