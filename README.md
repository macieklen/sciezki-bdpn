# Ścieżki przyrodnicze BdPN

Aplikacja mobilna (Android/iOS, technologie webowe + Capacitor) z opisami ścieżek
przyrodniczych Bieszczadzkiego Parku Narodowego: przystanki z tekstami, zdjęciami
i nagraniami lektora, działanie offline i powiadomienia o zbliżaniu się do przystanku.

## Struktura

```
content/                 treści źródłowe (edytowane ręcznie)
  config.yaml            języki
  trails/<id>/           jedna ścieżka
packages/core/           wspólne dla buildu i aplikacji: schematy danych, geometria, graf ścieżki
packages/content-build/  build treści: content/ → dist/content/ (paczki dla aplikacji)
scripts/                 narzędzia pomocnicze (np. generator ścieżki przykładowej)
```

Wymagania: Node.js ≥ 22.13, `ffmpeg` i `ffprobe` w PATH.

```bash
npm install
npm run build:content   # buduje paczki do dist/content/ i raportuje problemy
npm test
```

## Jak przygotować ścieżkę

```
content/trails/<id>/          id: małe litery, cyfry, "-" i "_"
  trail.yaml                  nazwa, opis, nazwy wejść, kierunek przewodnika
  trail.gpkg                  geometria (QGIS)
  cover.jpg                   zdjęcie tytułowe (opcjonalne)
  stops/
    07.pl.md   07.en.md       tekst przystanku w każdym języku
    07.pl.m4a  07.en.mp3      nagranie lektora (opcjonalne; m4a/mp3/wav/aac/ogg/flac)
    07-1.jpg   07-2.jpg       zdjęcia, w kolejności numerów
```

### Geometria: `trail.gpkg`

Trzy warstwy, w układzie **EPSG:2180** lub **EPSG:4326**:

| Warstwa | Typ | Atrybuty |
|---|---|---|
| `segments` | linia | `id` (tekst, opcjonalny) |
| `entrances` | punkt | `id` (tekst, wymagany; klucz do nazw w `trail.yaml`) |
| `stops` | punkt | `id` (wymagany; nazwa plików w `stops/`), `number` (numer z przewodnika), `radius` (promień powiadomienia [m], opcjonalny), `group` (opcjonalny) |

- Odcinki rysujemy **od węzła do węzła** (rozwidlenie, wejście, ślepy koniec) z włączonym
  przyciąganiem do wierzchołków. Końce bliższe niż 2 m są sklejane automatycznie.
- Sieć odcinków musi być **drzewem**: spójna i bez pętli.
- Wejście musi leżeć na końcu odcinka lub na rozwidleniu (do 10 m).
- Przystanek nie dalej niż 25 m od ścieżki; build sam wylicza jego pozycję na odcinku.
- Przystanki bardzo blisko siebie (np. dwie tablice przy jednym źródle) dostają wspólną
  wartość `group` — wtedy aplikacja wyśle jedno powiadomienie.

Progi walidacji można zmienić w `trail.yaml` (sekcja `validation`).

### Tekst przystanku: `stops/<id>.<lang>.md`

```markdown
---
title: Źródlisko
oppositeNote: Idziesz w przeciwną stronę niż przewodnik — tablica jest po prawej.
captions:
  07-1.jpg: Wysięki wody w buczynie
---

Treść w Markdownie.
```

Tekst w języku domyślnym jest wymagany. Brak tłumaczenia to ostrzeżenie — aplikacja
pokaże wtedy wersję w języku domyślnym.

### Ścieżka przykładowa

`content/trails/przyklad` to fikcyjna ścieżka z trzema wejściami, ślepą odnogą
i grupą bliskich przystanków. Teksty, plansze zamiast zdjęć i sygnał testowy zamiast
nagrań są zmyślone. Można ją odtworzyć poleceniem `npm run sample`.

## Wynik buildu: `dist/content/`

```
manifest.json                      lista ścieżek, wersje, pliki z rozmiarami i skrótami SHA-256
trails/<id>/trail.json             geometria, węzły, przystanki, trasy między wejściami (wspólne)
trails/<id>/texts.<lang>.json      teksty i nagrania w danym języku
trails/<id>/media/img/…            zdjęcia WebP (800 i 1600 px)
trails/<id>/media/audio/<lang>/…   nagrania AAC mono 64 kb/s
```

Pliki multimediów mają w nazwie skrót treści źródła, więc kolejne buildy przetwarzają
tylko zmienione pliki, a aplikacja pobiera tylko to, co się zmieniło. Każdy plik
w manifeście ma przypisany język (`null` = wspólny), żeby pobierać tylko nagrania
w wybranym języku.
