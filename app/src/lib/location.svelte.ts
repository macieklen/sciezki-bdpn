/**
 * Źródła położenia. W etapie 5 dojdzie źródło natywne (Capacitor, praca w tle)
 * o tym samym interfejsie.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';
import type { Fix } from '@sciezki/core';

export interface LocationSource {
  readonly kind: 'gps' | 'sym';
  start(onFix: (fix: Fix) => void, onError: (message: string) => void): void;
  stop(): void;
}

/** Geolokalizacja przeglądarki — działa tylko przy otwartej karcie. */
export class WebLocation implements LocationSource {
  readonly kind = 'gps';
  private watchId: number | null = null;

  start(onFix: (fix: Fix) => void, onError: (message: string) => void) {
    if (!('geolocation' in navigator)) {
      onError('Ta przeglądarka nie udostępnia położenia.');
      return;
    }
    this.watchId = navigator.geolocation.watchPosition(
      (p) => onFix({ lon: p.coords.longitude, lat: p.coords.latitude, accuracy: p.coords.accuracy, time: p.timestamp }),
      (e) => onError(e.code === e.PERMISSION_DENIED ? 'Brak zgody na dostęp do położenia.' : 'Nie udało się ustalić położenia.'),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 },
    );
  }

  stop() {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
  }
}

/** Odtwarza przygotowane odczyty (symulacja lub ślad GPX) w przyspieszonym tempie. */
export class SimulatedLocation implements LocationSource {
  readonly kind = 'sym';
  speed = $state(10);
  playing = $state(false);
  index = $state(0);
  private timer: ReturnType<typeof setInterval> | null = null;
  private clock = 0;
  private onFix: ((fix: Fix) => void) | null = null;

  constructor(readonly fixes: Fix[]) {}

  get progress() {
    return this.fixes.length ? this.index / this.fixes.length : 0;
  }
  get finished() {
    return this.index >= this.fixes.length;
  }

  start(onFix: (fix: Fix) => void) {
    this.onFix = onFix;
    this.clock = this.fixes[0]?.time ?? 0;
    this.play();
  }

  play() {
    if (this.timer || this.finished) return;
    this.playing = true;
    const TICK = 100;
    this.timer = setInterval(() => {
      this.clock += TICK * this.speed;
      while (!this.finished && this.fixes[this.index]!.time <= this.clock) {
        this.onFix?.(this.fixes[this.index]!);
        this.index++;
      }
      if (this.finished) this.pause();
    }, TICK);
  }

  pause() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.playing = false;
  }

  stop() {
    this.pause();
    this.onFix = null;
  }
}

// ── Źródło natywne (Capacitor): działa także przy zablokowanym ekranie ──

export const isNative = () => Capacitor.isNativePlatform();

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

export class NativeLocation implements LocationSource {
  readonly kind = 'gps';
  private watcherId: string | null = null;
  private stopped = false;

  constructor(private readonly backgroundMessage: string, private readonly backgroundTitle: string) {}

  start(onFix: (fix: Fix) => void, onError: (message: string) => void) {
    this.stopped = false;
    BackgroundGeolocation.addWatcher(
      {
        // Podanie komunikatu włącza pracę w tle (Android: usługa pierwszoplanowa ze stałym powiadomieniem).
        backgroundMessage: this.backgroundMessage,
        backgroundTitle: this.backgroundTitle,
        requestPermissions: true,
        stale: false,
        distanceFilter: 5,
      },
      (location, error) => {
        if (error) {
          if (error.code === 'NOT_AUTHORIZED') {
            onError('Brak zgody na dostęp do położenia. Włącz ją w ustawieniach aplikacji.');
          } else onError(error.message);
          return;
        }
        if (location) {
          onFix({ lon: location.longitude, lat: location.latitude, accuracy: location.accuracy, time: location.time ?? Date.now() });
        }
      },
    ).then((id) => {
      if (this.stopped) BackgroundGeolocation.removeWatcher({ id });
      else this.watcherId = id;
    });
  }

  stop() {
    this.stopped = true;
    if (this.watcherId) BackgroundGeolocation.removeWatcher({ id: this.watcherId });
    this.watcherId = null;
  }

  static openSettings() {
    return BackgroundGeolocation.openSettings();
  }
}
