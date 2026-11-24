/**
 * Build treści: content/ → dist/content/ (paczki dla aplikacji).
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';
import { marked } from 'marked';
import { parse as parseYaml } from 'yaml';
import type { z, ZodTypeAny } from 'zod';
import {
  SCHEMA_VERSION,
  contentConfigSchema,
  manifestSchema,
  stopFrontmatterSchema,
  trailBundleSchema,
  trailSourceSchema,
  trailTextsSchema,
  type ContentConfig,
  type Manifest,
  type ManifestFile,
  type TrailBundle,
  type TrailTexts,
} from '@sciezki/core';
import { processGeometry } from './geometry.ts';
import { AUDIO_EXTENSIONS, IMAGE_EXTENSIONS, fileHash, processAudio, processImage } from './media.ts';
import { Reporter, type Message } from './report.ts';

export interface BuildOptions {
  contentDir: string;
  outDir: string;
}

export interface BuildResult {
  messages: Message[];
  manifest: Manifest | null;
  ok: boolean;
}

const naturalSort = (a: string, b: string) => a.localeCompare(b, 'pl', { numeric: true });

function parseWith<S extends ZodTypeAny>(schema: S, data: unknown, r: Reporter, what: string): z.output<S> | null {
  const res = schema.safeParse(data);
  if (res.success) return res.data;
  for (const issue of res.error.issues) r.error(`${what}: ${issue.path.join('.') || '(całość)'} — ${issue.message}`);
  return null;
}

async function readYaml(path: string, r: Reporter): Promise<unknown> {
  try {
    return parseYaml(await readFile(path, 'utf8'));
  } catch (e) {
    r.error(`Błąd w ${path}: ${(e as Error).message}`);
    return undefined;
  }
}

export function splitFrontmatter(text: string): { data: unknown; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { data: {}, body: text };
  return { data: parseYaml(m[1]!) ?? {}, body: m[2]! };
}

const renderMd = (md: string) => (marked.parse(md, { async: false }) as string).trim();

export async function buildContent({ contentDir, outDir }: BuildOptions): Promise<BuildResult> {
  const root = new Reporter('content');
  const configRaw = await readYaml(join(contentDir, 'config.yaml'), root);
  const config = configRaw === undefined ? null : parseWith(contentConfigSchema, configRaw, root, 'config.yaml');
  if (!config) return { messages: root.messages, manifest: null, ok: false };

  const trailsDir = join(contentDir, 'trails');
  const trailIds = existsSync(trailsDir)
    ? (await readdir(trailsDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort(naturalSort)
    : [];
  if (trailIds.length === 0) root.warning('Brak ścieżek w content/trails/.');

  const manifest: Manifest = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    languages: config.languages,
    defaultLanguage: config.defaultLanguage,
    trails: [],
  };
  let ok = true;
  for (const id of trailIds) {
    const r = root.child(id);
    const entry = await buildTrail(id, join(trailsDir, id), join(outDir, 'trails', id), outDir, config, r);
    if (entry) manifest.trails.push(entry);
    else ok = false;
  }

  // Usuń paczki ścieżek, których już nie ma w źródłach.
  const outTrails = join(outDir, 'trails');
  if (existsSync(outTrails)) {
    for (const d of await readdir(outTrails)) {
      if (!manifest.trails.some((t) => t.id === d) && !trailIds.includes(d)) await rm(join(outTrails, d), { recursive: true, force: true });
    }
  }
  const checked = manifestSchema.parse(manifest);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'manifest.json'), JSON.stringify(checked, null, 2));
  return { messages: root.messages, manifest: checked, ok: ok && !root.hasErrors };
}

async function buildTrail(
  id: string,
  dir: string,
  out: string,
  outRoot: string,
  config: ContentConfig,
  r: Reporter,
): Promise<Manifest['trails'][number] | null> {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(id)) {
    r.error('Nazwa katalogu ścieżki może zawierać tylko małe litery, cyfry, "-" i "_".');
    return null;
  }
  const sourceRaw = await readYaml(join(dir, 'trail.yaml'), r);
  const source = sourceRaw === undefined ? null : parseWith(trailSourceSchema, sourceRaw, r, 'trail.yaml');
  if (!source) return null;
  const { languages, defaultLanguage: def } = config;
  if (!source.name[def]) r.error(`trail.yaml: brak nazwy ścieżki w języku domyślnym (${def}).`);
  for (const [eid, names] of Object.entries(source.entrances)) {
    if (!names[def]) r.error(`trail.yaml: wejście "${eid}" nie ma nazwy w języku domyślnym (${def}).`);
  }

  const geometry = processGeometry(join(dir, 'trail.gpkg'), source, r);
  if (!geometry) return null;

  // ── Pliki przystanków ──
  const stopsDir = join(dir, 'stops');
  const files = existsSync(stopsDir) ? (await readdir(stopsDir)).sort(naturalSort) : [];
  const stopIds = new Set(geometry.stops.map((s) => s.id));
  const belongsTo = (f: string, sid: string) => f.startsWith(`${sid}.`) || f.startsWith(`${sid}-`);
  for (const f of files) {
    if (!f.startsWith('.') && ![...stopIds].some((sid) => belongsTo(f, sid))) {
      r.warning(`Plik stops/${f} nie pasuje do żadnego przystanku z warstwy "stops".`);
    }
  }
  for (const a of stopIds) {
    for (const b of stopIds) {
      if (a !== b && b.startsWith(`${a}-`)) r.warning(`Id przystanków "${a}" i "${b}" są niejednoznaczne dla nazw zdjęć (${b}-1.jpg). Zmień jedno z nich.`);
    }
  }

  const imgOut = join(out, 'media', 'img');
  const imgRel = 'media/img';
  const cover = await findCover(dir);
  const bundle: TrailBundle = {
    schemaVersion: SCHEMA_VERSION,
    id,
    version: '',
    ...geometry,
    cover: cover ? await processImage(cover, imgOut, imgRel) : undefined,
    stops: [],
  };
  const texts: Record<string, TrailTexts> = {};
  for (const lang of languages) {
    texts[lang] = {
      schemaVersion: SCHEMA_VERSION,
      lang,
      trail: {
        name: source.name[lang] ?? source.name[def] ?? id,
        subtitle: source.subtitle?.[lang] ?? source.subtitle?.[def],
        descriptionHtml: (source.description?.[lang] ?? source.description?.[def]) ? renderMd(source.description?.[lang] ?? source.description![def]!) : undefined,
      },
      entrances: Object.fromEntries(Object.entries(source.entrances).map(([eid, n]) => [eid, n[lang] ?? n[def] ?? eid])),
      stops: {},
    };
    if (lang !== def && !source.name[lang]) r.warning(`trail.yaml: brak nazwy ścieżki w języku "${lang}" — użyto ${def}.`);
  }

  for (const stop of geometry.stops) {
    const sr = r.child(`przystanek ${stop.id}`);
    const imageFiles = files.filter((f) => f.startsWith(`${stop.id}-`) && IMAGE_EXTENSIONS.includes(extname(f).toLowerCase()));
    const images = [];
    for (const f of imageFiles) {
      try {
        images.push(await processImage(join(stopsDir, f), imgOut, imgRel));
      } catch (e) {
        sr.error(`Nie można przetworzyć zdjęcia ${f}: ${(e as Error).message}`);
      }
    }
    if (images.length === 0) sr.info('Brak zdjęć.');
    bundle.stops.push({ ...stop, images });

    let defaultText: TrailTexts['stops'][string] | null = null;
    for (const lang of [def, ...languages.filter((l) => l !== def)]) {
      const mdPath = join(stopsDir, `${stop.id}.${lang}.md`);
      const audioFile = files.find((f) => f.startsWith(`${stop.id}.${lang}.`) && AUDIO_EXTENSIONS.includes(extname(f).toLowerCase()));
      let audio;
      if (audioFile) {
        try {
          audio = await processAudio(join(stopsDir, audioFile), join(out, 'media', 'audio', lang), `media/audio/${lang}`);
        } catch (e) {
          sr.error(`Nie można przetworzyć nagrania ${audioFile}: ${(e as Error).message}`);
        }
      }
      if (!existsSync(mdPath)) {
        if (lang === def) sr.error(`Brak pliku stops/${stop.id}.${def}.md.`);
        else sr.warning(`Brak tłumaczenia stops/${stop.id}.${lang}.md — użyto ${def}.`);
        if (defaultText) texts[lang]!.stops[stop.id] = { ...defaultText, audio: audio ?? undefined, fallback: true };
        continue;
      }
      let parsed;
      try {
        parsed = splitFrontmatter(await readFile(mdPath, 'utf8'));
      } catch (e) {
        sr.error(`Błąd frontmattera w ${stop.id}.${lang}.md: ${(e as Error).message}`);
        continue;
      }
      const fm = parseWith(stopFrontmatterSchema, parsed.data, sr, `${stop.id}.${lang}.md`);
      if (!fm) continue;
      for (const key of Object.keys(fm.captions ?? {})) {
        if (!imageFiles.includes(key)) sr.warning(`${stop.id}.${lang}.md: podpis dla nieistniejącego zdjęcia "${key}".`);
      }
      if (!parsed.body.trim()) sr.warning(`${stop.id}.${lang}.md: pusty tekst.`);
      const text = {
        title: fm.title,
        html: renderMd(parsed.body),
        oppositeNote: fm.oppositeNote,
        captions: fm.captions ?? {},
        audio: audio ?? undefined,
      };
      texts[lang]!.stops[stop.id] = text;
      if (lang === def) defaultText = { ...text, audio: undefined };
    }
  }

  if (r.hasErrors) return null;

  // ── Zapis ──
  await mkdir(out, { recursive: true });
  const textFiles: [string, string][] = languages.map((lang) => [
    `texts.${lang}.json`,
    JSON.stringify(trailTextsSchema.parse(texts[lang]), null, 1),
  ]);
  for (const [name, body] of textFiles) await writeFile(join(out, name), body);

  // Wersja ścieżki: skrót ze wszystkich plików oprócz samego trail.json.
  const media = await listFiles(join(out, 'media'));
  const used = new Set<string>([
    ...bundle.stops.flatMap((s) => s.images.flatMap((i) => Object.values(i.variants))),
    ...Object.values(bundle.cover?.variants ?? {}),
    ...Object.values(texts).flatMap((t) => Object.values(t.stops).flatMap((s) => (s.audio ? [s.audio.file] : []))),
  ]);
  for (const f of media) {
    const rel = relative(out, f).split(sep).join('/');
    if (!used.has(rel)) await rm(f); // nieużywane już warianty
  }

  const manifestFiles: ManifestFile[] = [];
  const addFile = async (rel: string, lang: string | null) => {
    const abs = join(out, rel);
    manifestFiles.push({
      path: relative(outRoot, abs).split(sep).join('/'),
      size: (await stat(abs)).size,
      sha256: await fileHash(abs),
      lang,
    });
  };
  for (const rel of [...used].sort()) {
    const lang = /^media\/audio\/([a-z]{2})\//.exec(rel)?.[1] ?? null;
    await addFile(rel, lang);
  }
  for (const [name] of textFiles) await addFile(name, /^texts\.([a-z]{2})\.json$/.exec(name)![1]!);

  const geomHash = createHash('sha256').update(JSON.stringify({ ...bundle, version: '' })).digest('hex');
  bundle.version = createHash('sha256')
    .update(geomHash + manifestFiles.map((f) => f.sha256).join(''))
    .digest('hex')
    .slice(0, 12);
  await writeFile(join(out, 'trail.json'), JSON.stringify(trailBundleSchema.parse(bundle)));
  await addFile('trail.json', null);

  return {
    id,
    version: bundle.version,
    name: Object.fromEntries(languages.map((l) => [l, texts[l]!.trail.name])),
    length: bundle.length,
    stopCount: bundle.stops.length,
    bbox: bundle.bbox,
    files: manifestFiles,
  };
}

async function findCover(dir: string): Promise<string | null> {
  for (const ext of IMAGE_EXTENSIONS) {
    const p = join(dir, `cover${ext}`);
    if (existsSync(p)) return p;
  }
  return null;
}

async function listFiles(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listFiles(p)));
    else out.push(p);
  }
  return out;
}
