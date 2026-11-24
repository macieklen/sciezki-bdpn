/**
 * Źródła położenia. W etapie 5 dojdzie źródło natywne (Capacitor, praca w tle)
 * o tym samym interfejsie.
 */
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
