/**
 * Ładowanie paczek treści. Na tym etapie z serwera (dev) lub z plików aplikacji;
 * w etapie 4 dojdzie pobieranie do pamięci urządzenia (offline).
 */
import { base } from '$app/paths';
import {
  manifestSchema,
  trailBundleSchema,
  trailTextsSchema,
  type Manifest,
  type TrailBundle,
  type TrailTexts,
} from '@sciezki/core';
import type { ZodTypeAny, z } from 'zod';

export const contentBase = `${base}/content`;

/** Adres pliku z paczki ścieżki (np. zdjęcia), względem katalogu ścieżki. */
export const trailFileUrl = (trailId: string, rel: string) => `${contentBase}/trails/${trailId}/${rel}`;

const cache = new Map<string, Promise<unknown>>();

async function load<S extends ZodTypeAny>(path: string, schema: S): Promise<z.output<S>> {
  let p = cache.get(path);
  if (!p) {
    p = fetch(`${contentBase}/${path}`).then(async (res) => {
      if (!res.ok) throw new Error(`Nie udało się wczytać ${path} (${res.status})`);
      return schema.parse(await res.json());
    });
    cache.set(path, p);
    p.catch(() => cache.delete(path));
  }
  return p as Promise<z.output<S>>;
}

export const loadManifest = (): Promise<Manifest> => load('manifest.json', manifestSchema);

export async function loadTrail(id: string): Promise<TrailBundle> {
  const manifest = await loadManifest();
  const entry = manifest.trails.find((t) => t.id === id);
  if (!entry) throw new Error(`Nie ma ścieżki "${id}"`);
  // Wersja w adresie: po aktualizacji treści nie dostaniemy starej kopii z pamięci podręcznej.
  return load(`trails/${id}/trail.json?v=${entry.version}`, trailBundleSchema);
}

export async function loadTexts(id: string, lang: string): Promise<TrailTexts> {
  const manifest = await loadManifest();
  const entry = manifest.trails.find((t) => t.id === id);
  const l = manifest.languages.includes(lang) ? lang : manifest.defaultLanguage;
  return load(`trails/${id}/texts.${l}.json?v=${entry?.version ?? ''}`, trailTextsSchema);
}
