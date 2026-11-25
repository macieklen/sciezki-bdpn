/**
 * Schematy danych: źródła (pliki edytowane przez redaktora) i paczki
 * (to, co build produkuje i co czyta aplikacja). Jedno źródło prawdy
 * dla buildu i aplikacji.
 */
import { z } from 'zod';

export const SCHEMA_VERSION = 1;

const lonLat = z.tuple([z.number(), z.number()]);
const langCode = z.string().regex(/^[a-z]{2}$/, 'kod języka, np. "pl"');
const slug = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, 'małe litery, cyfry, "-" i "_"');

/** Tekst w wielu językach: { pl: "...", en: "..." }. */
export const localized = z.record(langCode, z.string());
export type Localized = z.infer<typeof localized>;

// ─── Źródła ────────────────────────────────────────────────────────────────

/** content/config.yaml */
export const contentConfigSchema = z
  .object({
    languages: z.array(langCode).min(1),
    defaultLanguage: langCode,
  })
  .refine((c) => c.languages.includes(c.defaultLanguage), {
    message: 'defaultLanguage musi być na liście languages',
  });
export type ContentConfig = z.infer<typeof contentConfigSchema>;

export const validationSettingsSchema = z.object({
  /** Tolerancja sklejania końców odcinków w węzły [m]. */
  snapTolerance: z.number().positive().default(2),
  /** Maksymalna odległość wejścia od węzła [m]. */
  entranceTolerance: z.number().positive().default(10),
  /** Maksymalna odległość przystanku od ścieżki [m]. */
  maxStopOffset: z.number().positive().default(25),
  /** Ostrzeżenie, gdy przystanek leży bliżej węzła niż tyle metrów. */
  nearNodeWarning: z.number().nonnegative().default(20),
  /** Ostrzeżenie, gdy dwa przystanki (bez wspólnej grupy) są bliżej niż tyle metrów po ścieżce. */
  closeStopsWarning: z.number().nonnegative().default(40),
});
export type ValidationSettings = z.infer<typeof validationSettingsSchema>;

/** content/trails/<id>/trail.yaml */
export const trailSourceSchema = z.object({
  name: localized,
  subtitle: localized.optional(),
  /** Krótki opis (1–2 zdania) do przeglądu ścieżek. */
  summary: localized.optional(),
  /** Opis w Markdownie. */
  description: localized.optional(),
  /** Nazwy wejść i nazwanych ślepych końców, kluczowane atrybutem `id` z warstwy `entrances`. */
  entrances: z.record(slug, localized),
  /** Kierunek, w którym napisano drukowany przewodnik. */
  guideDirection: z.object({ from: slug, to: slug }).optional(),
  /** Domyślny promień powiadomienia o przystanku [m]. */
  defaultRadius: z.number().positive().default(40),
  validation: validationSettingsSchema.default({}),
});
export type TrailSource = z.infer<typeof trailSourceSchema>;

/** Frontmatter pliku stops/<id>.<lang>.md */
export const stopFrontmatterSchema = z.object({
  title: z.string().min(1),
  /** Notka pokazywana, gdy idziesz w przeciwną stronę niż przewodnik. */
  oppositeNote: z.string().optional(),
  /** Podpisy zdjęć: { "07-1.jpg": "Podpis" }. */
  captions: z.record(z.string(), z.string()).optional(),
});
export type StopFrontmatter = z.infer<typeof stopFrontmatterSchema>;

// ─── Paczka: trail.json (wspólna dla języków) ──────────────────────────────

export const imageSchema = z.object({
  /** Nazwa pliku źródłowego, klucz do podpisów. */
  source: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  /** Warianty rozmiarów: szerokość → ścieżka względem katalogu ścieżki. */
  variants: z.record(z.string(), z.string()),
});

export const trailBundleSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: slug,
  version: z.string(),
  /** Środek lokalnego rzutu metrycznego (używany też przez aplikację). */
  origin: lonLat,
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  length: z.number(),
  /** Zdjęcie tytułowe (plik cover.* w katalogu ścieżki). */
  cover: imageSchema.optional(),
  nodes: z.array(
    z.object({
      id: z.string(),
      coord: lonLat,
      degree: z.number().int(),
      entranceId: slug.optional(),
    }),
  ),
  segments: z.array(
    z.object({
      id: z.string(),
      from: z.string(),
      to: z.string(),
      length: z.number(),
      coords: z.array(lonLat).min(2),
    }),
  ),
  /** Nazwane końce ścieżki: wejścia i ślepe końce (np. punkt widokowy). */
  entrances: z.array(z.object({ id: slug, nodeId: z.string(), kind: z.enum(['entrance', 'end']).default('entrance') })),
  stops: z.array(
    z.object({
      id: slug,
      number: z.string(),
      segmentId: z.string(),
      /** Odległość od początku odcinka (węzła `from`) [m]. */
      along: z.number(),
      /** Odległość punktu przystanku od ścieżki [m]. */
      offset: z.number(),
      /** Położenie przystanku (punkt z warstwy, nie rzut). */
      coord: lonLat,
      radius: z.number(),
      group: z.string().optional(),
      images: z.array(imageSchema),
    }),
  ),
  /** Trasy między każdą parą wejść (w drzewie droga jest jednoznaczna). */
  routes: z.array(
    z.object({
      from: slug,
      to: slug,
      length: z.number(),
      segments: z.array(z.object({ id: z.string(), reversed: z.boolean() })),
      stops: z.array(slug),
    }),
  ),
  guideDirection: z.object({ from: slug, to: slug }).optional(),
});
export type TrailBundle = z.infer<typeof trailBundleSchema>;

// ─── Paczka: texts.<lang>.json ─────────────────────────────────────────────

export const trailTextsSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  lang: langCode,
  trail: z.object({
    name: z.string(),
    subtitle: z.string().optional(),
    summary: z.string().optional(),
    descriptionHtml: z.string().optional(),
  }),
  entrances: z.record(slug, z.string()),
  stops: z.record(
    slug,
    z.object({
      title: z.string(),
      html: z.string(),
      oppositeNote: z.string().optional(),
      captions: z.record(z.string(), z.string()),
      /** Zdjęcia wstawione w tekst (`![podpis](07-1.jpg)`); pozostałe aplikacja dokłada na końcu. */
      inlineImages: z.array(z.string()).default([]),
      audio: z.object({ file: z.string(), duration: z.number() }).optional(),
      /** true, gdy tekstu brakuje w tym języku i wstawiono język domyślny. */
      fallback: z.boolean().optional(),
    }),
  ),
});
export type TrailTexts = z.infer<typeof trailTextsSchema>;

// ─── Manifest ──────────────────────────────────────────────────────────────

export const manifestFileSchema = z.object({
  path: z.string(),
  size: z.number().int(),
  sha256: z.string(),
  /** null = plik wspólny dla wszystkich języków. */
  lang: langCode.nullable(),
});
export type ManifestFile = z.infer<typeof manifestFileSchema>;

export const manifestSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  generatedAt: z.string(),
  languages: z.array(langCode),
  defaultLanguage: langCode,
  /** Podkłady map (PMTiles), wspólne dla wszystkich ścieżek w regionie. */
  maps: z
    .array(
      z.object({
        id: slug,
        path: z.string(),
        size: z.number().int(),
        sha256: z.string(),
        bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]),
        minZoom: z.number().int(),
        maxZoom: z.number().int(),
      }),
    )
    .default([]),
  trails: z.array(
    z.object({
      id: slug,
      version: z.string(),
      name: localized,
      length: z.number(),
      stopCount: z.number().int(),
      /** Miniatura zdjęcia tytułowego (ścieżka względem katalogu treści). */
      cover: z.string().optional(),
      /** Uproszczone linie ścieżki i punkt na etykietę — do mapy przeglądu bez wczytywania paczki. */
      overview: z.object({ lines: z.array(z.array(lonLat)), label: lonLat }),
      bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
      files: z.array(manifestFileSchema),
    }),
  ),
});
export type Manifest = z.infer<typeof manifestSchema>;
