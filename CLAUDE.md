# Ścieżki przyrodnicze BdPN — kontekst dla Claude

Aplikacja mobilna (Android/iOS) z opisami ścieżek przyrodniczych Bieszczadzkiego Parku
Narodowego. Właściciel projektu jest jednocześnie redaktorem treści; ma doświadczenie
programistyczne i GIS (QGIS, Python). Komunikacja po polsku, zwracamy się „Pan”.

## Ustalenia (nie zmieniać bez rozmowy)

- **Stos:** SvelteKit + Svelte 5 (tryb SPA, adapter-static) opakowany w **Capacitor**.
  Rozwój i iteracje w przeglądarce; PWA jako kanał testowy. Publikacja w sklepach dopiero
  po działającym prototypie.
- **Monorepo npm:** `packages/core` (schematy Zod, geometria, graf — wspólne dla buildu
  i aplikacji), `packages/content-build` (build treści w TypeScript), `app/`.
  Pipeline mapy/terenu (OSM, NMT) będzie w **Pythonie/GDAL** — osobno, uruchamiany rzadko.
- **Treści w plikach, bez CMS:** `content/trails/<id>/` = `trail.yaml`, `trail.gpkg`
  (warstwy `segments`, `entrances`, `stops`), `stops/<id>.<lang>.md`, nagrania
  `<id>.<lang>.m4a`, zdjęcia `<id>-N.jpg`. Szczegóły w README.
- **Model ścieżki:** sieć odcinków będąca **drzewem** (bez pętli). Rozwidlenia to zwykle
  alternatywne **wejścia**; nieliczne ślepe odnogi (np. punkt widokowy) chodzi się tam i z powrotem.
- **Bez narzucania trasy** (wdrożone na `etap-3`): użytkownik nie
  wybiera trasy ani celu; aplikacja reaguje na ruch. Bez szacowania czasu i bez sekcji
  „możliwe przejścia” — tylko licznik „X z Y przystanków”. Kierunek marszu wynika z ruchu
  wzdłuż odcinka; „przed Tobą” pokazujemy tylko przy pewnym kierunku, inaczej najbliższe
  przystanki. Przy rozwidleniu (ok. 50 m przed węzłem) opcje gałęzi jako **etykiety
  w mianowniku** („Przełęcz · 1,2 km · 3 przystanki”, „Jaskinia · 400 m · ślepa odnoga”) —
  bez zdań wymagających odmiany, bez „w lewo/w prawo”; opcje nie migają (zostają do
  potwierdzenia gałęzi). Powiadomienie o rozwidleniu przy zablokowanym ekranie **tylko gdy
  któraś gałąź ma nieodwiedzone przystanki**. Opisy gałęzi wylicza build z nazwanych
  **końców** (wejścia + ślepe końce z nazwami, typ `wejście`/`koniec`), z opcjonalnym
  nadpisaniem atrybutem na pierwszym odcinku gałęzi. Ekran przystanku: sąsiedzi po ścieżce
  w obu kierunkach zamiast poprzedni/następny. `guideDirection` zostaje tylko dla notek
  kierunkowych (liczonych z faktycznego kierunku ruchu). Aplikacja nigdy nie generuje
  tekstów dynamicznie (żadnych LLM w aplikacji). Działanie przy rozwidleniach do
  zweryfikowania na prawdziwych śladach GPX.
- **Przegląd i nawigacja** (gałęzie `eksperyment-arkusz` → `eksperyment-nawigacja`): ekran startowy
  = mapa wszystkich ścieżek z etykietami nazw (bez przystanków i pozycji); dotknięcie ścieżki
  przybliża mapę i od razu otwiera jej nawigację (bez osobnego ekranu opisu — decyzja właściciela).
  Ekran ścieżki: mapa w górnej 1/3, arkusz na 2/3 z nazwą ścieżki, „Rozpocznij spacer”, krótkim
  opisem (`summary`) i listą przystanków; bez górnego paska z nazwą (miejsce w cenie) — nad mapą
  tylko okrągłe przyciski „wstecz” i „pozycja”. Systemowy „wstecz” w Androidzie (`lib/back.ts`,
  @capacitor/app): przystanek → ścieżka → przegląd → minimalizacja. Nawigacja = mapa przez cały czas + arkusze od dołu: ciemny
  arkusz spaceru oraz arkusz przystanku w dwóch położeniach: „nisko” (tytuł, nagranie) i otwarty
  z pełną, przewijaną treścią (`components/Sheet.svelte`). Wysokość otwartego arkusza ustawia
  użytkownik, przeciągając uchwyt — bez stałych pozycji, zapamiętywana dla kolejnych przystanków;
  nad arkuszem zawsze zostaje pas mapy, a mapa centruje się na przystanku w widocznej części
  przez cały czas (także w trakcie przeciągania). Nowy przystanek otwiera się od początku opisu,
  powrót do już otwieranego przywraca miejsce czytania (do zamknięcia aplikacji).
  Szybki ruch w dół zwija do „nisko”. Bez gradientu i „Czytaj dalej” (decyzja właściciela:
  osobne „pół ekranu” i „cały ekran” to zbędne mnożenie bytów). Po dotarciu arkusz przystanku
  sam wysuwa się „nisko”.
  Śledzenie w tle dopiero po „Rozpocznij spacer” (wcześniej tylko podgląd pozycji przy otwartej
  aplikacji). Zdjęcia w tekście przystanku: `![podpis](07-1.jpg)` w Markdownie; niewstawione
  dokładane na końcu. Odtwarzacz: przycisk 44 px ciemnoszary `#4E4C4D` z białym znakiem,
  pasek postępu w tym samym kolorze.
- **Wykrywanie przystanków:** rzut pozycji GPS na odcinki (pozycja „wzdłuż trasy”), zmiana
  odcinka dopiero za węzłem po kilku zgodnych odczytach, filtr dokładności, każdy przystanek
  powiadamia raz na spacer, przystanki z tym samym `group` = jedno powiadomienie,
  zawsze ręczne wyjście awaryjne („Jestem przy przystanku”). Build i aplikacja liczą
  geometrię tym samym kodem z `packages/core` (lokalny rzut równoodległościowy wokół `origin`).
- **Lokalizacja w tle:** tryb „aktywnego spaceru” uruchamiany przez użytkownika —
  Android: foreground service; iOS: background location przy zgodzie „podczas używania”.
  Bez zgody „zawsze”. Powiadomienia lokalne. Wtyczka: `@capacitor-community/background-geolocation`
  (rezerwowo Transistorsoft). Logikę testujemy w przeglądarce przez `LocationService`
  z trzema implementacjami: natywna, webowa (`watchPosition`), **symulator** (GPX + szum GPS).
- **Kierunek przewodnika:** teksty pisane pod jeden kierunek (`guideDirection` w trail.yaml);
  `oppositeNote` przystanku pokazujemy tylko idąc pod prąd.
- **Offline-first:** paczki per ścieżka z manifestem (SHA-256, język pliku); audio pobierane
  tylko w wybranym języku. Mapa = osobna paczka regionu (PMTiles, ~30–80 MB z terenem).
- **Mapa:** MapLibre GL JS; kafelki wektorowe z OSM (Planetiler, własny odchudzony schemat),
  poziomice i cieniowanie z NMT GUGiK lub Copernicus DEM. Atrybucja „© OpenStreetMap contributors”.
  Offline w Capacitorze: PMTiles z lokalnego pliku — do sprawdzenia; rezerwa: katalog z/x/y.
- **Języki:** PL (domyślny) + EN; brak tłumaczenia = fallback na PL z adnotacją.
- **Audio:** nagrania lektora (ten sam tekst co w drukowanym przewodniku). Docelowo natywna
  wtyczka audio (odtwarzanie w tle, ekran blokady); teraz `<audio>` + Media Session.

## Identyfikacja wizualna (księga znaku BdPN)

- Kolory: zieleń `#508246`, ciemny brąz `#443425`, piaskowy `#D6B269`, szarobrązowy `#84725A`,
  ciemnoszary `#585858`, jasnoszary `#D8D8D8`. Triada zieleń/brąz/piaskowy jako pasek.
  Do tekstu ciemniejsza zieleń `#3F6B37` (kontrast). Piaskowy nigdy jako tekst na białym.
- Krój: **Lato** (używany w materiałach parku, OFL) — dołączony przez `@fontsource/lato`.
  Helvetica Neue tylko w logotypie (logo w SVG ma krzywe).
- Wzorce: zielony blok tytułowy (Lato Light), ciemnoszary panel jak nagłówek tablic
  (`#4E4C4D`), tekst wyrównany do lewej (nie justowany), cele dotyku ≥ 44–48 px.
- **Bez logo Polskich Parków Narodowych** (decyzja właściciela).
- Logo: `app/static/brand/` (poziome i okrągłe SVG, skonwertowane z plików parku).
- Makieta ekranów: https://claude.ai/artifact/5BxbJLqPa2hY8Azh6USw9Q

## Stan prac

1. ✅ Schemat danych, geometria, build treści z walidacją, ścieżka przykładowa (fikcyjna).
2. ✅ Aplikacja: lista ścieżek, ścieżka (wybór wejścia i celu, przystanki na trasie
   i odnogach), przystanek (galeria, notka kierunkowa, odtwarzacz, nawigacja).
3. ✅ Tryb spaceru: `Tracker` w `packages/core` (dopasowanie do grafu, histereza przy
   rozwidleniach, grupy, zapowiedź rozwidlenia) z testami scenariuszy; symulator
   (`simulateWalk`, GPX); ekran `/sciezka/<id>/spacer` z mapą MapLibre (na razie bez
   podkładu), panelem następnego przystanku, listą „Jestem przy przystanku”;
   `?zrodlo=sym` włącza panel symulatora.
   ✅ Podkład mapy: `map/build_map.py` (granica parku z `map/data` + bufor 2 km, wycinek OSM
   z lustra download.openstreetmap.fr, Planetiler, `map/schema.yml`) → `content/maps/bdpn.pmtiles`
   (12,7 MB, w repozytorium); build treści dołącza mapy do manifestu (`maps`); aplikacja
   wczytuje plik w całości do pamięci (`lib/basemap.ts`) i rysuje stylem `lib/map-style.ts`;
   czcionki Lato jako glify w `app/static/glyphs/`. NMT na razie pominięte (decyzja właściciela).
5. 🔧 Capacitor (przesunięty przed offline, żeby testować GPS w terenie): projekt `app/android`,
   `NativeLocation` (@capacitor-community/background-geolocation, `useLegacyBridge`),
   powiadomienia lokalne o przystankach (`lib/notify.ts`), ikona z logo, skrypty
   `android:run`, `android:live`, `apk`, workflow GitHub Actions budujący APK.
   Do zrobienia: pierwsze uruchomienie na telefonie (sesja desktopowa, USB), natywne audio,
   iOS (wymaga Maca).
4. Offline (po Capacitorze): pobieranie paczek, aktualizacje przez manifest, service worker / PWA.
6. Publikacja w sklepach.

## Praca z repozytorium

- `npm run dev` — aplikacja (http://localhost:5173) z przebudową treści po zmianach w `content/`.
- `npm test`, `npm run check` (typy), `npm run build`.
- Wymaga Node ≥ 22.13 i ffmpeg/ffprobe (lub `FFMPEG_PATH`/`FFPROBE_PATH`).
- Każdy etap na osobnej gałęzi (`etap-N`), scalany do `main` po akceptacji.
- Treść przykładowa w `content/trails/przyklad` jest fikcyjna; generator: `npm run sample`.
