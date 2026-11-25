/**
 * Systemowy przycisk „wstecz” (Android): nawigacja po hierarchii ekranów zamiast historii
 * i zamiast minimalizowania aplikacji:
 *   przystanek → ścieżka → przegląd → (dopiero wtedy) minimalizacja.
 */
import { App } from '@capacitor/app';
import { goto } from '$app/navigation';
import { base } from '$app/paths';
import { isNative } from './location.svelte';

/** Ekran „wyżej” w hierarchii albo null, gdy jesteśmy na przeglądzie. */
export function parentPath(pathname: string, search: string): string | null {
  const path = pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  const parts = path.split('/').filter(Boolean);
  // ['sciezka', id, stop?]
  if (parts[0] !== 'sciezka' || !parts[1]) return null;
  if (parts[2]) return `${base}/sciezka/${parts[1]}${search}`;
  return `${base}/`;
}

export function registerBackButton() {
  if (!isNative()) return;
  App.addListener('backButton', () => {
    const up = parentPath(location.pathname, location.search);
    if (up) goto(up, { replaceState: true });
    else App.minimizeApp();
  });
}
