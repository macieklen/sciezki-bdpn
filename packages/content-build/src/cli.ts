/**
 * npm run build:content [-- --content content --out dist/content --quiet]
 */
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { buildContent } from './build.ts';
import { formatMessages } from './report.ts';

const { values } = parseArgs({
  options: {
    content: { type: 'string', default: 'content' },
    out: { type: 'string', default: 'dist/content' },
    quiet: { type: 'boolean', default: false },
  },
});

const started = Date.now();
const result = await buildContent({ contentDir: resolve(values.content!), outDir: resolve(values.out!) });
const text = formatMessages(result.messages, { color: Boolean(process.stdout.isTTY), showInfo: !values.quiet });
if (text) console.log(text);

const count = (l: string) => result.messages.filter((m) => m.level === l).length;
const trails = result.manifest?.trails ?? [];
console.log(
  `\n${result.ok ? '✔' : '✖'} ${trails.length} ścieżek, ${trails.reduce((s, t) => s + t.stopCount, 0)} przystanków · ` +
    `błędy: ${count('error')}, ostrzeżenia: ${count('warning')} · ${((Date.now() - started) / 1000).toFixed(1)} s`,
);
process.exit(result.ok ? 0 : 1);
