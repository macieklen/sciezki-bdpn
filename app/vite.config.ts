import { spawn } from 'node:child_process';
import { cpSync, createReadStream, existsSync, rmSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';

const repo = resolve(import.meta.dirname, '..');
const contentSrc = join(repo, 'content');
const contentOut = join(repo, 'dist', 'content');

const MIME: Record<string, string> = {
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.m4a': 'audio/mp4',
  '.pmtiles': 'application/octet-stream',
};

function runContentBuild(): Promise<void> {
  return new Promise((done) => {
    const p = spawn(
      process.execPath,
      ['--no-warnings=ExperimentalWarning', '--import', 'tsx', 'packages/content-build/src/cli.ts', '--quiet'],
      { cwd: repo, stdio: 'inherit' },
    );
    p.on('close', () => done());
  });
}

/**
 * Treści ścieżek:
 * - dev: build treści przy starcie i po każdej zmianie w content/, serwowanie dist/content pod /content/
 *   i przeładowanie strony;
 * - build: kopia dist/content do static/content, skąd trafia do paczki aplikacji.
 */
function trailContent(): Plugin {
  let command: 'build' | 'serve' = 'serve';
  return {
    name: 'trail-content',
    config(_config, env) {
      command = env.command;
    },
    async configureServer(server) {
      await runContentBuild();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let running = Promise.resolve();
      server.watcher.add(contentSrc);
      server.watcher.on('all', (_event, file) => {
        if (!file.startsWith(contentSrc)) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          running = running.then(async () => {
            server.config.logger.info('Zmiana w content/ — przebudowa treści…', { timestamp: true });
            await runContentBuild();
            server.ws.send({ type: 'full-reload' });
          });
        }, 300);
      });
      server.middlewares.use('/content', (req, res, next) => {
        const url = decodeURIComponent((req.url ?? '/').split('?')[0]!);
        const file = normalize(join(contentOut, url));
        if (!file.startsWith(contentOut) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        createReadStream(file).pipe(res);
      });
    },
    buildStart() {
      if (command !== 'build') return;
      const target = join(import.meta.dirname, 'static', 'content');
      rmSync(target, { recursive: true, force: true });
      if (existsSync(contentOut)) cpSync(contentOut, target, { recursive: true });
      else this.warn('Brak dist/content — uruchom najpierw "npm run build:content".');
    },
  };
}

export default defineConfig({
  plugins: [trailContent(), sveltekit()],
  server: { fs: { allow: [repo] } },
});
