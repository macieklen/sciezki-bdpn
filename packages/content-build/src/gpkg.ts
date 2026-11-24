/**
 * Minimalny odczyt i zapis GeoPackage (SQLite) bez zależności natywnych:
 * korzysta z wbudowanego node:sqlite. Obsługuje punkty i linie (także Z/M
 * oraz MultiLineString złożony z jednej linii).
 */
import { DatabaseSync } from 'node:sqlite';

export type Coord = [number, number];
export type Geometry =
  | { type: 'Point'; coordinates: Coord }
  | { type: 'LineString'; coordinates: Coord[] }
  | { type: 'MultiLineString'; coordinates: Coord[][] };

export interface Feature {
  fid: number;
  geometry: Geometry | null;
  properties: Record<string, unknown>;
}

export interface Layer {
  name: string;
  srsId: number;
  /** Definicja układu z gpkg_spatial_ref_sys (organizacja + kod). */
  srs: { organization: string; code: number };
  geometryColumn: string;
  features: Feature[];
}

export function readGpkgLayers(path: string): Map<string, Layer> {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const cols = db
      .prepare(
        `SELECT g.table_name AS t, g.column_name AS c, g.srs_id AS s,
                r.organization AS org, r.organization_coordsys_id AS code
           FROM gpkg_geometry_columns g
           JOIN gpkg_spatial_ref_sys r ON r.srs_id = g.srs_id`,
      )
      .all() as { t: string; c: string; s: number; org: string; code: number }[];
    const layers = new Map<string, Layer>();
    for (const { t, c, s, org, code } of cols) {
      const rows = db.prepare(`SELECT * FROM "${t.replaceAll('"', '""')}"`).all() as Record<string, unknown>[];
      const pk = primaryKey(db, t);
      const features = rows.map((row, i) => {
        const { [c]: blob, ...props } = row;
        const fid = pk ? Number(row[pk]) : i + 1;
        if (pk) delete props[pk];
        return { fid, geometry: blob ? decodeGpkgGeometry(blob as Uint8Array) : null, properties: props };
      });
      layers.set(t, {
        name: t,
        srsId: s,
        srs: { organization: String(org ?? '').toUpperCase(), code: Number(code) },
        geometryColumn: c,
        features,
      });
    }
    return layers;
  } finally {
    db.close();
  }
}

function primaryKey(db: DatabaseSync, table: string): string | null {
  const info = db.prepare(`PRAGMA table_info("${table.replaceAll('"', '""')}")`).all() as { name: string; pk: number }[];
  return info.find((c) => c.pk === 1)?.name ?? null;
}

// ─── Dekodowanie geometrii ─────────────────────────────────────────────────

const ENVELOPE_SIZES = [0, 32, 48, 48, 64];

export function decodeGpkgGeometry(blob: Uint8Array): Geometry | null {
  const buf = Buffer.from(blob.buffer, blob.byteOffset, blob.byteLength);
  if (buf[0] !== 0x47 || buf[1] !== 0x50) throw new Error('To nie jest geometria GeoPackage (brak nagłówka "GP").');
  const flags = buf[3]!;
  const empty = (flags >> 4) & 1;
  const envelope = (flags >> 1) & 0b111;
  if (empty) return null;
  const envSize = ENVELOPE_SIZES[envelope];
  if (envSize === undefined) throw new Error(`Nieznany typ obwiedni GeoPackage: ${envelope}`);
  return readWkb(buf, 8 + envSize).geometry;
}

function readWkb(buf: Buffer, offset: number): { geometry: Geometry; offset: number } {
  const le = buf[offset] === 1;
  offset += 1;
  const rawType = le ? buf.readUInt32LE(offset) : buf.readUInt32BE(offset);
  offset += 4;
  // ISO WKB (1000/2000/3000) i EWKB (flagi w wysokich bitach).
  let hasZ = (rawType & 0x80000000) !== 0;
  let hasM = (rawType & 0x40000000) !== 0;
  let type = rawType & 0x0fffffff;
  if (type >= 3000) { hasZ = true; hasM = true; type -= 3000; }
  else if (type >= 2000) { hasM = true; type -= 2000; }
  else if (type >= 1000) { hasZ = true; type -= 1000; }
  const dims = 2 + (hasZ ? 1 : 0) + (hasM ? 1 : 0);
  const readDouble = (o: number) => (le ? buf.readDoubleLE(o) : buf.readDoubleBE(o));
  const readUInt = (o: number) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  const readPoint = (): Coord => {
    const p: Coord = [readDouble(offset), readDouble(offset + 8)];
    offset += dims * 8;
    return p;
  };
  const readPoints = (): Coord[] => {
    const n = readUInt(offset);
    offset += 4;
    const pts: Coord[] = [];
    for (let i = 0; i < n; i++) pts.push(readPoint());
    return pts;
  };

  switch (type) {
    case 1:
      return { geometry: { type: 'Point', coordinates: readPoint() }, offset };
    case 2:
      return { geometry: { type: 'LineString', coordinates: readPoints() }, offset };
    case 5: {
      const n = readUInt(offset);
      offset += 4;
      const lines: Coord[][] = [];
      for (let i = 0; i < n; i++) {
        const r = readWkb(buf, offset);
        if (r.geometry.type !== 'LineString') throw new Error('MultiLineString zawiera inną geometrię niż linia.');
        lines.push(r.geometry.coordinates);
        offset = r.offset;
      }
      return { geometry: { type: 'MultiLineString', coordinates: lines }, offset };
    }
    default:
      throw new Error(`Nieobsługiwany typ geometrii WKB: ${rawType}. Używaj punktów i linii.`);
  }
}

// ─── Zapis (do generowania danych przykładowych i testów) ──────────────────

export interface LayerDef {
  name: string;
  geometryType: 'POINT' | 'LINESTRING';
  columns: Record<string, 'TEXT' | 'REAL' | 'INTEGER'>;
  features: { geometry: Geometry; properties: Record<string, string | number | null> }[];
}

const WGS84_WKT =
  'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4326"]]';

/** Zapisuje warstwy w EPSG:4326 do nowego pliku GeoPackage. */
export function writeGpkg(path: string, layers: LayerDef[]): void {
  const db = new DatabaseSync(path);
  try {
    db.exec(`
      PRAGMA application_id = 1196444487;
      PRAGMA user_version = 10300;
      CREATE TABLE gpkg_spatial_ref_sys (srs_name TEXT NOT NULL, srs_id INTEGER PRIMARY KEY, organization TEXT NOT NULL,
        organization_coordsys_id INTEGER NOT NULL, definition TEXT NOT NULL, description TEXT);
      CREATE TABLE gpkg_contents (table_name TEXT NOT NULL PRIMARY KEY, data_type TEXT NOT NULL, identifier TEXT UNIQUE,
        description TEXT DEFAULT '', last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE, srs_id INTEGER);
      CREATE TABLE gpkg_geometry_columns (table_name TEXT NOT NULL, column_name TEXT NOT NULL, geometry_type_name TEXT NOT NULL,
        srs_id INTEGER NOT NULL, z TINYINT NOT NULL, m TINYINT NOT NULL, PRIMARY KEY (table_name, column_name));
    `);
    const srs = db.prepare('INSERT INTO gpkg_spatial_ref_sys VALUES (?, ?, ?, ?, ?, ?)');
    srs.run('Undefined cartesian SRS', -1, 'NONE', -1, 'undefined', null);
    srs.run('Undefined geographic SRS', 0, 'NONE', 0, 'undefined', null);
    srs.run('WGS 84 geodetic', 4326, 'EPSG', 4326, WGS84_WKT, null);

    for (const layer of layers) {
      const colDefs = Object.entries(layer.columns).map(([n, t]) => `, "${n}" ${t}`).join('');
      db.exec(`CREATE TABLE "${layer.name}" (fid INTEGER PRIMARY KEY AUTOINCREMENT, geom ${layer.geometryType}${colDefs})`);
      const all = layer.features.flatMap((f) => (f.geometry.type === 'Point' ? [f.geometry.coordinates] : f.geometry.type === 'LineString' ? f.geometry.coordinates : f.geometry.coordinates.flat()));
      const xs = all.map((c) => c[0]);
      const ys = all.map((c) => c[1]);
      db.prepare('INSERT INTO gpkg_contents (table_name, data_type, identifier, min_x, min_y, max_x, max_y, srs_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
        layer.name, 'features', layer.name, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), 4326,
      );
      db.prepare('INSERT INTO gpkg_geometry_columns VALUES (?, ?, ?, ?, 0, 0)').run(layer.name, 'geom', layer.geometryType, 4326);
      const names = Object.keys(layer.columns);
      const insert = db.prepare(
        `INSERT INTO "${layer.name}" (geom${names.map((n) => `, "${n}"`).join('')}) VALUES (?${names.map(() => ', ?').join('')})`,
      );
      for (const f of layer.features) insert.run(encodeGpkgGeometry(f.geometry, 4326), ...names.map((n) => f.properties[n] ?? null));
    }
  } finally {
    db.close();
  }
}

export function encodeGpkgGeometry(g: Geometry, srsId: number): Uint8Array {
  const parts: Buffer[] = [];
  const header = Buffer.alloc(8);
  header.write('GP', 0, 'ascii');
  header[2] = 0; // wersja
  header[3] = 0b00000001; // little endian, bez obwiedni
  header.writeInt32LE(srsId, 4);
  parts.push(header);
  const writeCoords = (cs: Coord[]) => {
    const b = Buffer.alloc(4 + cs.length * 16);
    b.writeUInt32LE(cs.length, 0);
    cs.forEach((c, i) => { b.writeDoubleLE(c[0], 4 + i * 16); b.writeDoubleLE(c[1], 12 + i * 16); });
    return b;
  };
  const head = (type: number) => { const b = Buffer.alloc(5); b[0] = 1; b.writeUInt32LE(type, 1); return b; };
  if (g.type === 'Point') {
    const b = Buffer.alloc(16);
    b.writeDoubleLE(g.coordinates[0], 0);
    b.writeDoubleLE(g.coordinates[1], 8);
    parts.push(head(1), b);
  } else if (g.type === 'LineString') {
    parts.push(head(2), writeCoords(g.coordinates));
  } else {
    const n = Buffer.alloc(4);
    n.writeUInt32LE(g.coordinates.length);
    parts.push(head(5), n, ...g.coordinates.flatMap((l) => [head(2), writeCoords(l)]));
  }
  return new Uint8Array(Buffer.concat(parts));
}
