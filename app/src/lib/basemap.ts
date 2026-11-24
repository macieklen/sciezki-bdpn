/**
 * Podkład mapy z pliku PMTiles. Plik (~13 MB) wczytujemy w całości do pamięci
 * i czytamy z niego kafelki — działa tak samo w przeglądarce, offline i w aplikacji
 * natywnej, bez zależności od obsługi zapytań HTTP Range przez serwer.
 */
import maplibregl from 'maplibre-gl';
import { PMTiles, Protocol, type RangeResponse, type Source } from 'pmtiles';
import { contentBase, loadManifest } from './content';

class BufferSource implements Source {
  constructor(
    private readonly key: string,
    private readonly data: ArrayBuffer,
  ) {}
  getKey() {
    return this.key;
  }
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    return { data: this.data.slice(offset, offset + length) };
  }
}

let protocol: Protocol | null = null;
const loaded = new Map<string, Promise<string>>();

/** Zwraca adres `pmtiles://…` gotowy do użycia jako źródło w stylu, albo null, gdy brak mapy. */
export async function basemapUrl(id?: string): Promise<{ url: string } | null> {
  const manifest = await loadManifest();
  const map = id ? manifest.maps.find((m) => m.id === id) : manifest.maps[0];
  if (!map) return null;
  if (!protocol) {
    protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
  }
  let p = loaded.get(map.path);
  if (!p) {
    const proto = protocol;
    p = fetch(`${contentBase}/${map.path}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Nie udało się wczytać mapy (${res.status})`);
        return res.arrayBuffer();
      })
      .then((buf) => {
        proto.add(new PMTiles(new BufferSource(map.path, buf)));
        return `pmtiles://${map.path}`;
      });
    loaded.set(map.path, p);
    p.catch(() => loaded.delete(map.path));
  }
  return { url: await p };
}
