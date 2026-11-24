/** Podkłady map: content/maps/*.pmtiles → dist/content/maps/ (nazwa ze skrótem treści). */
import { existsSync } from 'node:fs';
import { copyFile, mkdir, open, readdir, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { Manifest } from '@sciezki/core';
import { fileHash } from './media.ts';
import type { Reporter } from './report.ts';

/** Zasięg i zakres zoomu z nagłówka PMTiles v3. */
async function readHeader(path: string) {
  const fh = await open(path, 'r');
  try {
    const buf = Buffer.alloc(127);
    await fh.read(buf, 0, 127, 0);
    if (buf.toString('ascii', 0, 7) !== 'PMTiles' || buf[7] !== 3) throw new Error('to nie jest plik PMTiles w wersji 3');
    const e7 = (o: number) => buf.readInt32LE(o) / 1e7;
    return {
      minZoom: buf[100]!,
      maxZoom: buf[101]!,
      bounds: [e7(102), e7(106), e7(110), e7(114)] as [number, number, number, number],
    };
  } finally {
    await fh.close();
  }
}

export async function buildMaps(contentDir: string, outDir: string, r: Reporter): Promise<Manifest['maps']> {
  const src = join(contentDir, 'maps');
  const out = join(outDir, 'maps');
  const files = existsSync(src) ? (await readdir(src)).filter((f) => f.endsWith('.pmtiles')).sort() : [];
  if (files.length === 0) r.info('Brak podkładu mapy (content/maps/*.pmtiles) — mapa spaceru pokaże tylko ścieżkę.');
  await mkdir(out, { recursive: true });
  const maps: Manifest['maps'] = [];
  const keep = new Set<string>();
  for (const f of files) {
    const path = join(src, f);
    const id = basename(f, '.pmtiles');
    try {
      const header = await readHeader(path);
      const sha256 = await fileHash(path);
      const name = `${id}-${sha256.slice(0, 10)}.pmtiles`;
      if (!existsSync(join(out, name))) await copyFile(path, join(out, name));
      keep.add(name);
      const { size } = await stat(path);
      maps.push({ id, path: `maps/${name}`, size, sha256, ...header });
    } catch (e) {
      r.error(`Mapa ${f}: ${(e as Error).message}`);
    }
  }
  for (const f of await readdir(out)) if (!keep.has(f)) await rm(join(out, f));
  return maps;
}
