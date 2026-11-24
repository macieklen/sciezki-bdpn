// Uruchamia Gradle w app/android niezależnie od systemu (gradlew / gradlew.bat).
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const dir = join(import.meta.dirname, '..', 'app', 'android');
const win = process.platform === 'win32';
const r = spawnSync(win ? 'gradlew.bat' : './gradlew', process.argv.slice(2), { cwd: dir, stdio: 'inherit', shell: win });
process.exit(r.status ?? 1);
