/**
 * Akcja Svelte: uzupełnia adresy zdjęć wstawionych w tekst przystanku. Build zapisuje je
 * jako `data-rel-src` / `data-rel-srcset` (względem katalogu ścieżki), bo adres treści
 * zależy od środowiska (serwer deweloperski, aplikacja, w przyszłości pamięć urządzenia).
 */
import { trailFileUrl } from './content';

export function resolveMedia(node: HTMLElement, trailId: string) {
  const apply = (id: string) => {
    for (const img of node.querySelectorAll<HTMLImageElement>('img[data-rel-src]')) {
      img.src = trailFileUrl(id, img.dataset.relSrc!);
      if (img.dataset.relSrcset) {
        img.srcset = img.dataset.relSrcset
          .split(',')
          .map((part) => {
            const [rel, w] = part.trim().split(/\s+/);
            return `${trailFileUrl(id, rel!)} ${w}`;
          })
          .join(', ');
        img.sizes = '(min-width: 640px) 640px, 100vw';
      }
    }
  };
  apply(trailId);
  // Treść {@html} zmienia się po przejściu do innego przystanku lub zmianie języka.
  const observer = new MutationObserver(() => apply(trailId));
  observer.observe(node, { childList: true, subtree: true });
  return {
    update(id: string) {
      trailId = id;
      apply(id);
    },
    destroy() {
      observer.disconnect();
    },
  };
}
