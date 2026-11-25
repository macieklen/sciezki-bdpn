/**
 * Testy budują tylko ścieżkę przykładową (kopia w katalogu tymczasowym) — błędy w innych
 * ścieżkach redaktora pokazuje build treści, a nie testy.
 */
import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const content = join(import.meta.dirname, '..', '..', '..', 'content');

export function sampleContentDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sciezki-przyklad-'));
  cpSync(join(content, 'config.yaml'), join(dir, 'config.yaml'));
  cpSync(join(content, 'trails', 'przyklad'), join(dir, 'trails', 'przyklad'), { recursive: true });
  return dir;
}
