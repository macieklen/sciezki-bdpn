/**
 * Teksty interfejsu (treści ścieżek mają własne tłumaczenia w paczkach).
 * Prosty słownik; w razie potrzeby można go zastąpić biblioteką (np. Paraglide).
 */

const messages = {
  pl: {
    trails: 'Ścieżki przyrodnicze',
    trailsIntro: 'Wybierz ścieżkę. Przed wyjściem w teren warto ją pobrać — w lesie często nie ma zasięgu.',
    natureTrail: 'Ścieżka przyrodnicza',
    length: 'długość',
    stops: 'przystanków',
    stopsHeading: 'Przystanki',
    stopsCount: (n: number) => `${n} ${plural(n, 'przystanek', 'przystanki', 'przystanków')}`,
    walkTime: (min: number) => `ok. ${formatDuration(min, 'pl')}`,
    startFrom: 'Zaczynasz z',
    endAt: 'Kończysz w',
    routeLength: 'trasa',
    startWalk: 'Rozpocznij spacer',
    startWalkSoon: 'Tryb spaceru z mapą i powiadomieniami pojawi się w kolejnym etapie.',
    onSpurs: 'Na odnogach',
    onSpursHint: 'Przystanki poza wybraną trasą, np. przy punkcie widokowym.',
    back: 'Wróć',
    stopOf: (n: number, total: number) => `${n} z ${total} na Twojej trasie`,
    stopOnSpur: 'Przystanek na odnodze',
    previous: 'Poprzedni',
    next: 'Następny',
    narration: 'Nagranie lektora',
    play: 'Odtwórz nagranie',
    pause: 'Wstrzymaj nagranie',
    rewind: 'Cofnij o 15 sekund',
    speed: 'Szybkość odtwarzania',
    position: 'Pozycja w nagraniu',
    translationMissing: 'Ten tekst nie jest jeszcze przetłumaczony — wyświetlamy wersję polską.',
    language: 'Język',
    loadError: 'Nie udało się wczytać danych.',
    retry: 'Spróbuj ponownie',
    photo: (n: number, total: number) => `Zdjęcie ${n} z ${total}`,
    simulateWalk: 'Symuluj spacer',
    walking: 'Trwa spacer',
    visitedOf: (n: number, total: number) => `${n} z ${total} przystanków`,
    endWalk: 'Zakończ',
    waitingGps: 'Czekam na położenie…',
    offTrail: 'Jesteś poza ścieżką',
    junctionAhead: 'Zbliżasz się do rozwidlenia',
    nextStop: 'Następny przystanek',
    allVisited: 'Wszystkie przystanki odwiedzone',
    arrivedAt: 'Jesteś przy przystanku',
    open: 'Otwórz',
    close: 'Zamknij',
    centerOnMe: 'Pokaż moją pozycję',
    stopsList: 'Lista przystanków',
    imHere: 'Jestem przy przystanku',
    backToWalk: 'Wróć do mapy spaceru',
    simulator: 'Symulator',
    scenario: 'Scenariusz',
    scenarioRoute: 'Wybrana trasa',
    scenarioSpurs: 'Trasa z wejściem w odnogi',
    gpxFile: 'Ślad GPX',
    simSpeed: 'Tempo',
    noise: 'Szum GPS',
    simPlay: 'Start',
    simPause: 'Pauza',
    restart: 'Od nowa',
    mapNote: 'Podkład mapy pojawi się wraz z kafelkami parku.',
  },
  en: {
    trails: 'Nature trails',
    trailsIntro: 'Choose a trail. Download it before you set off — there is often no signal in the forest.',
    natureTrail: 'Nature trail',
    length: 'length',
    stops: 'stops',
    stopsHeading: 'Stops',
    stopsCount: (n: number) => `${n} ${n === 1 ? 'stop' : 'stops'}`,
    walkTime: (min: number) => `approx. ${formatDuration(min, 'en')}`,
    startFrom: 'Starting from',
    endAt: 'Finishing at',
    routeLength: 'route',
    startWalk: 'Start walk',
    startWalkSoon: 'Walk mode with a map and notifications is coming in the next stage.',
    onSpurs: 'Side branches',
    onSpursHint: 'Stops off the selected route, e.g. at a viewpoint.',
    back: 'Back',
    stopOf: (n: number, total: number) => `${n} of ${total} on your route`,
    stopOnSpur: 'Stop on a side branch',
    previous: 'Previous',
    next: 'Next',
    narration: 'Narration',
    play: 'Play narration',
    pause: 'Pause narration',
    rewind: 'Rewind 15 seconds',
    speed: 'Playback speed',
    position: 'Playback position',
    translationMissing: 'This text has not been translated yet — showing the Polish version.',
    language: 'Language',
    loadError: 'Could not load data.',
    retry: 'Try again',
    photo: (n: number, total: number) => `Photo ${n} of ${total}`,
    simulateWalk: 'Simulate walk',
    walking: 'Walk in progress',
    visitedOf: (n: number, total: number) => `${n} of ${total} stops`,
    endWalk: 'Finish',
    waitingGps: 'Waiting for location…',
    offTrail: 'You are off the trail',
    junctionAhead: 'Junction ahead',
    nextStop: 'Next stop',
    allVisited: 'All stops visited',
    arrivedAt: 'You have reached stop',
    open: 'Open',
    close: 'Close',
    centerOnMe: 'Show my location',
    stopsList: 'List of stops',
    imHere: "I'm at this stop",
    backToWalk: 'Back to walk map',
    simulator: 'Simulator',
    scenario: 'Scenario',
    scenarioRoute: 'Selected route',
    scenarioSpurs: 'Route with side branches',
    gpxFile: 'GPX track',
    simSpeed: 'Speed',
    noise: 'GPS noise',
    simPlay: 'Play',
    simPause: 'Pause',
    restart: 'Restart',
    mapNote: 'The base map will appear with the park tiles.',
  },
} as const;

export type Lang = keyof typeof messages;
export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: 'pl', label: 'Polski' },
  { code: 'en', label: 'English' },
];

function plural(n: number, one: string, few: string, many: string) {
  if (n === 1) return one;
  const d = n % 10, h = n % 100;
  return d >= 2 && d <= 4 && (h < 12 || h > 14) ? few : many;
}

export function formatDuration(min: number, lang: Lang): string {
  if (min < 60) return `${Math.max(5, Math.round(min / 5) * 5)} min`;
  const h = Math.round((min / 60) * 2) / 2;
  return lang === 'pl' ? `${String(h).replace('.', ',')} h` : `${h} h`;
}

export function formatDistance(m: number, lang: Lang): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  const km = (m / 1000).toFixed(1);
  return `${lang === 'pl' ? km.replace('.', ',') : km} km`;
}

const STORAGE_KEY = 'sciezki.lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in messages) return saved as Lang;
  } catch {
    /* brak dostępu do localStorage */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language.slice(0, 2) : 'pl';
  return nav in messages ? (nav as Lang) : 'pl';
}

export const i18n = $state({ lang: initialLang() });

export function setLang(lang: Lang) {
  i18n.lang = lang;
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignorujemy */
  }
}

/** Słownik dla bieżącego języka: `t().trails`, `t().stopsCount(3)`. */
export const t = () => messages[i18n.lang];
