# Podkład mapy (kafelki wektorowe)

Buduje plik `content/maps/bdpn.pmtiles` z danych OpenStreetMap dla obszaru parku
(granica z `data/granica_bdpn_uproszczona.*` + bufor). Uruchamiany rzadko — gdy chcemy
odświeżyć dane OSM albo zmienić zawartość mapy.

```bash
pip install -r map/requirements.txt
python map/build_map.py                    # domyślnie: bufor 2 km, zoom do 15
python map/build_map.py --buffer 5000 --maxzoom 14
```

Wymaga Pythona 3.10+ i Javy 21+ (np. Temurin; JDK z Android Studio też wystarczy).
Przy pierwszym uruchomieniu skrypt pobiera do `map/.cache/` wycinek OSM województwa
podkarpackiego (~175 MB) i Planetiler (~90 MB). Żeby odświeżyć dane OSM, usuń
`map/.cache/podkarpackie.osm.pbf`.

Zawartość mapy opisuje `schema.yml` (warstwy: `landcover`, `water`, `waterway`,
`transportation`, `building`, `place`, `poi`, `park`). Wycinek kończy się na granicy
państwa, więc po stronie Ukrainy i Słowacji mapa jest pusta.

Plik trafia do repozytorium (`content/maps/`), a build treści dołącza go do aplikacji
i manifestu — mapa działa offline. Styl mapy jest w `app/src/lib/map-style.ts`,
czcionki do napisów (Lato, z polskimi znakami) w `app/static/glyphs/`.

| Wariant | Rozmiar |
|---|---|
| bufor 2 km, zoom ≤ 15 (domyślny; potoki od zoomu 12) | 12,7 MB |
| bufor 2 km, zoom ≤ 14 | ok. 10 MB |
| bufor 5 km, zoom ≤ 15 | ok. 18 MB |

Dane: © OpenStreetMap contributors (ODbL) — atrybucja musi być widoczna na mapie.
