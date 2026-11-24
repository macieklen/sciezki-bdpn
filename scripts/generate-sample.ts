/**
 * Generuje fikcyjną ścieżkę przykładową w content/trails/przyklad/.
 * Pokazuje wszystkie przypadki z modelu: trzy wejścia, rozwidlenia,
 * ślepą odnogę do punktu widokowego i parę bliskich przystanków w jednej grupie.
 *
 *   npm run sample
 *
 * Geometria, teksty, zdjęcia i nagrania są zmyślone (zdjęcia to plansze,
 * nagrania to sygnał testowy) — do podmiany na prawdziwe dane.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { createLocalProjection, type LonLat, type XY } from '../packages/core/src/index.ts';
import { writeGpkg } from '../packages/content-build/src/gpkg.ts';

const root = join(import.meta.dirname, '..', 'content');
const dir = join(root, 'trails', 'przyklad');
const stopsDir = join(dir, 'stops');
rmSync(dir, { recursive: true, force: true });
mkdirSync(stopsDir, { recursive: true });

// Fikcyjne położenie w okolicy Bieszczadów.
const proj = createLocalProjection([22.70, 49.07]);
const ll = (p: XY): LonLat => {
  const [lon, lat] = proj.inverse(p);
  return [Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7];
};

// ── Odcinki (metry: x na wschód, y na północ) ──
const segments: Record<string, XY[]> = {
  'parking-rozwidlenie': [[0, 0], [60, 200], [20, 420], [90, 650], [70, 880], [150, 1100]],
  'rozwidlenie-zrodla': [[150, 1100], [260, 1300], [330, 1520], [420, 1700]],
  'zrodla-przelecz': [[420, 1700], [480, 1900], [620, 2080], [700, 2300]],
  'odnoga-widokowa': [[150, 1100], [300, 1120], [430, 1180], [520, 1170]],
  'zrodla-wies': [[420, 1700], [250, 1760], [80, 1850], [-120, 1880]],
};

const entrances: { id: string; at: XY }[] = [
  { id: 'parking', at: [2, -2] },
  { id: 'przelecz', at: [701, 2302] },
  { id: 'wies', at: [-121, 1882] },
];

interface StopDef {
  id: string;
  number: string;
  at: XY;
  group?: string;
  pl: { title: string; body: string; oppositeNote?: string };
  en: { title: string; body: string };
  images: number;
  audio?: ('pl' | 'en')[];
}

const stops: StopDef[] = [
  {
    id: '01', number: '1', at: [66, 203], images: 2, audio: ['pl', 'en'],
    pl: { title: 'Buczyna karpacka', body: 'Buczyna karpacka to las z przewagą buka zwyczajnego, typowy dla regla dolnego.\n\n*[Przykładowy tekst — do zastąpienia treścią z przewodnika.]*' },
    en: { title: 'Carpathian beech forest', body: 'A forest dominated by the European beech, typical of the lower montane zone.\n\n*[Sample text.]*' },
  },
  {
    id: '02', number: '2', at: [24, 440], images: 1, audio: ['pl'],
    pl: { title: 'Martwe drewno', body: 'Leżące i stojące martwe drzewa są domem dla grzybów, owadów i ptaków.\n\n*[Przykładowy tekst.]*', oppositeNote: 'Idziesz w przeciwną stronę niż przewodnik — powalony pień jest po prawej stronie ścieżki.' },
    en: { title: 'Deadwood', body: 'Fallen and standing dead trees are home to fungi, insects and birds.\n\n*[Sample text.]*' },
  },
  {
    id: '03', number: '3', at: [85, 660], images: 1, audio: ['pl'],
    pl: { title: 'Jodła pospolita', body: 'Jodła dobrze znosi cień i często rośnie pod okapem buków.\n\n*[Przykładowy tekst.]*' },
    en: { title: 'Silver fir', body: 'Fir tolerates shade well and often grows under the beech canopy.\n\n*[Sample text.]*' },
  },
  {
    id: '04', number: '4', at: [76, 900], images: 1,
    pl: { title: 'Ślady zwierząt', body: 'Na błotnistej ścieżce łatwo znaleźć tropy jeleni, dzików, a czasem rysia.\n\n*[Przykładowy tekst.]*' },
    en: { title: 'Animal tracks', body: 'On the muddy path you can find tracks of deer, wild boar and sometimes lynx.\n\n*[Sample text.]*' },
  },
  {
    id: '05', number: '5', at: [432, 1186], images: 2,
    pl: { title: 'Punkt widokowy', body: 'Z tego miejsca widać połoniny po drugiej stronie doliny.\n\n*[Przykładowy tekst.]*' },
    en: { title: 'Viewpoint', body: 'From here you can see the mountain meadows across the valley.\n\n*[Sample text.]*' },
  },
  {
    id: '06', number: '6', at: [262, 1296], images: 1,
    pl: { title: 'Wiatrołom', body: 'Silny wiatr potrafi powalić całe płaty lasu. Natura sama odbudowuje to miejsce.\n\n*[Przykładowy tekst.]*' },
    en: { title: 'Windthrow', body: 'Strong winds can topple whole patches of forest. Nature restores the place on its own.\n\n*[Sample text.]*' },
  },
  {
    id: '07', number: '7', at: [333, 1514], group: 'zrodliska', images: 1,
    pl: { title: 'Źródlisko', body: 'Wysięki wody tworzą podmokłe, bogate w gatunki miejsca.\n\n*[Przykładowy tekst.]*' },
    en: { title: 'Spring area', body: 'Seeping water creates wet places rich in species.\n\n*[Sample text.]*' },
  },
  {
    id: '08', number: '8', at: [347, 1546], group: 'zrodliska', images: 1,
    pl: { title: 'Salamandra plamista', body: 'W wilgotne dni przy źródłach można spotkać salamandrę plamistą.\n\n*[Przykładowy tekst.]*' },
    en: { title: 'Fire salamander', body: 'On damp days you may meet a fire salamander near the springs.\n\n*[Sample text.]*' },
  },
  {
    id: '09', number: '9', at: [560, 2005], images: 1,
    pl: { title: 'Granica lasu', body: 'Wyżej las przerzedza się i ustępuje miejsca połoninom.\n\n*[Przykładowy tekst.]*' },
    en: { title: 'Tree line', body: 'Higher up the forest thins out and gives way to mountain meadows.\n\n*[Sample text.]*' },
  },
  {
    id: '10', number: '10', at: [160, 1812], images: 1,
    pl: { title: 'Dawne pola', body: 'Kamienne miedze i dzikie jabłonie to ślady dawnej wsi.\n\n*[Przykładowy tekst.]*' },
    en: { title: 'Former fields', body: 'Stone field boundaries and wild apple trees are traces of a former village.\n\n*[Sample text.]*' },
  },
];

// ── GeoPackage ──
writeGpkg(join(dir, 'trail.gpkg'), [
  {
    name: 'segments',
    geometryType: 'LINESTRING',
    columns: { id: 'TEXT' },
    features: Object.entries(segments).map(([id, pts]) => ({
      geometry: { type: 'LineString', coordinates: pts.map(ll) },
      properties: { id },
    })),
  },
  {
    name: 'entrances',
    geometryType: 'POINT',
    columns: { id: 'TEXT' },
    features: entrances.map((e) => ({ geometry: { type: 'Point', coordinates: ll(e.at) }, properties: { id: e.id } })),
  },
  {
    name: 'stops',
    geometryType: 'POINT',
    columns: { id: 'TEXT', number: 'TEXT', radius: 'REAL', group: 'TEXT' },
    features: stops.map((s) => ({
      geometry: { type: 'Point', coordinates: ll(s.at) },
      properties: { id: s.id, number: s.number, radius: null, group: s.group ?? null },
    })),
  },
]);

// ── trail.yaml ──
writeFileSync(
  join(dir, 'trail.yaml'),
  `# Ścieżka przykładowa (fikcyjna) — pokazuje strukturę danych.
name:
  pl: Ścieżka przykładowa
  en: Sample trail
subtitle:
  pl: Ścieżka przyrodnicza
  en: Nature trail
description:
  pl: |
    Fikcyjna ścieżka do testów aplikacji: trzy wejścia, rozwidlenia,
    ślepa odnoga do punktu widokowego i dwa bliskie przystanki przy źródliskach.
  en: |
    A fictional trail for testing: three entrances, junctions,
    a dead-end spur to a viewpoint and two close stops by the springs.

# Nazwy wejść; klucze = atrybut "id" w warstwie "entrances".
entrances:
  parking:
    pl: Parking przy leśniczówce
    en: Forester's lodge car park
  przelecz:
    pl: Przełęcz
    en: Mountain pass
  wies:
    pl: Wejście od strony wsi
    en: Village entrance

# Kierunek, w którym napisano drukowany przewodnik.
guideDirection:
  from: parking
  to: przelecz

defaultRadius: 40
`,
);

// ── Teksty ──
for (const s of stops) {
  for (const lang of ['pl', 'en'] as const) {
    const t = s[lang];
    const fm = [`title: ${JSON.stringify(t.title)}`];
    if ('oppositeNote' in t && t.oppositeNote) fm.push(`oppositeNote: ${JSON.stringify(t.oppositeNote)}`);
    if (lang === 'pl' && s.images > 0) {
      fm.push('captions:');
      for (let i = 1; i <= s.images; i++) fm.push(`  ${s.id}-${i}.jpg: ${JSON.stringify(`${t.title} — zdjęcie ${i} (plansza zastępcza)`)}`);
    }
    writeFileSync(join(stopsDir, `${s.id}.${lang}.md`), `---\n${fm.join('\n')}\n---\n\n${t.body}\n`);
  }
}

// ── Zdjęcia zastępcze ──
const palette = ['#508246', '#84725A', '#443425', '#6E8F5E', '#9C8A6A'];
async function placeholder(path: string, label: string, color: string) {
  const esc = label.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1067">
    <rect width="100%" height="100%" fill="${color}"/>
    <path d="M0 800 L300 520 L520 700 L820 380 L1150 720 L1350 560 L1600 760 L1600 1067 L0 1067 Z" fill="#000" opacity="0.18"/>
    <text x="80" y="140" font-family="Lato, DejaVu Sans, sans-serif" font-size="72" fill="#fff">${esc}</text>
    <text x="80" y="210" font-family="Lato, DejaVu Sans, sans-serif" font-size="40" fill="#fff" opacity="0.8">plansza zastępcza</text>
  </svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 70 }).toFile(path);
}
await placeholder(join(dir, 'cover.jpg'), 'Ścieżka przykładowa', '#508246');
for (const [i, s] of stops.entries()) {
  for (let n = 1; n <= s.images; n++) {
    await placeholder(join(stopsDir, `${s.id}-${n}.jpg`), `${s.number}. ${s.pl.title}`, palette[(i + n) % palette.length]!);
  }
}

// ── Nagrania zastępcze (krótki sygnał) ──
for (const s of stops) {
  for (const lang of s.audio ?? []) {
    execFileSync('ffmpeg', [
      '-v', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=${lang === 'pl' ? 440 : 523}:duration=4`,
      '-ac', '1', '-c:a', 'aac', '-b:a', '48k', join(stopsDir, `${s.id}.${lang}.m4a`),
    ]);
  }
}

writeFileSync(join(root, 'config.yaml'), '# Języki treści; pierwszy na liście nie musi być domyślnym.\nlanguages: [pl, en]\ndefaultLanguage: pl\n');
console.log(`Wygenerowano ${dir}`);
