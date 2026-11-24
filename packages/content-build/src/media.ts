/**
 * Obróbka multimediów. Nazwy plików wynikowych zawierają skrót treści
 * źródła, więc niezmienione pliki nie są przetwarzane ponownie.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';

const run = promisify(execFile);

export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff'];
export const AUDIO_EXTENSIONS = ['.m4a', '.mp3', '.wav', '.aac', '.ogg', '.flac'];
export const IMAGE_WIDTHS = [800, 1600];

export async function fileHash(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

const stem = (file: string) => basename(file, extname(file)).toLowerCase().replace(/[^a-z0-9_-]+/g, '-');

/** Atomowy zapis: najpierw plik tymczasowy, potem zmiana nazwy. */
async function produce(target: string, make: (tmp: string) => Promise<void>) {
  if (existsSync(target)) return;
  const tmp = `${target}.tmp${extname(target)}`;
  await make(tmp);
  await rename(tmp, target);
}

export interface ProcessedImage {
  source: string;
  width: number;
  height: number;
  /** Szerokość → ścieżka względem `outDir`. */
  variants: Record<string, string>;
}

export async function processImage(src: string, outDir: string, relDir: string): Promise<ProcessedImage> {
  const hash = (await fileHash(src)).slice(0, 10);
  const meta = await sharp(src).rotate().metadata();
  // Po rotate() wymiary mogą być zamienione (orientacja EXIF).
  const swap = (meta.orientation ?? 1) >= 5;
  const width = (swap ? meta.height : meta.width) ?? 0;
  const height = (swap ? meta.width : meta.height) ?? 0;
  await mkdir(outDir, { recursive: true });
  const variants: Record<string, string> = {};
  const widths = IMAGE_WIDTHS.filter((w) => w < width);
  if (widths.length < IMAGE_WIDTHS.length) widths.push(width); // oryginał, jeśli mniejszy od największego wariantu
  for (const w of [...new Set(widths)]) {
    const name = `${stem(src)}-${hash}-${w}.webp`;
    await produce(join(outDir, name), (tmp) =>
      sharp(src).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 80 }).toFile(tmp).then(() => {}),
    );
    variants[String(w)] = `${relDir}/${name}`;
  }
  return { source: basename(src), width, height, variants };
}

export interface ProcessedAudio {
  file: string;
  duration: number;
}

/** Nagranie lektora: mono AAC 64 kb/s w kontenerze m4a — wystarcza dla mowy, działa na iOS i Androidzie. */
export async function processAudio(src: string, outDir: string, relDir: string): Promise<ProcessedAudio> {
  const hash = (await fileHash(src)).slice(0, 10);
  await mkdir(outDir, { recursive: true });
  const name = `${stem(src)}-${hash}.m4a`;
  const target = join(outDir, name);
  await produce(target, async (tmp) => {
    await run('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vn', '-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', '-f', 'mp4', tmp]);
  });
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', target]);
  return { file: `${relDir}/${name}`, duration: Math.round(Number(stdout.trim()) * 10) / 10 };
}
