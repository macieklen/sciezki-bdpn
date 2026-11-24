/**
 * Powiadomienia o dotarciu do przystanku. W aplikacji natywnej — powiadomienia
 * lokalne (działają przy zablokowanym ekranie); w przeglądarce — Notification API,
 * gdy karta jest w tle.
 */
import { LocalNotifications } from '@capacitor/local-notifications';
import { isNative } from './location.svelte';

const CHANNEL = 'przystanki';
let prepared = false;

/** Prośba o zgodę i kanał powiadomień (wywołać przy starcie spaceru). */
export async function prepareNotifications(channelName: string) {
  if (prepared) return;
  prepared = true;
  try {
    if (isNative()) {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') await LocalNotifications.requestPermissions();
      await LocalNotifications.createChannel({ id: CHANNEL, name: channelName, importance: 5, vibration: true, visibility: 1 });
    } else if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  } catch {
    prepared = false;
  }
}

export async function notifyArrival(title: string, body: string, url: string) {
  navigator.vibrate?.([200, 100, 200]);
  // Na pierwszym planie wystarcza panel w aplikacji.
  if (!document.hidden) return;
  if (isNative()) {
    await LocalNotifications.schedule({
      notifications: [{ id: Math.floor(Date.now() % 2147483647), title, body, channelId: CHANNEL, extra: { url } }],
    });
  } else if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, tag: 'przystanek' });
  }
}

/** Dotknięcie powiadomienia otwiera ekran przystanku. */
export function onNotificationTap(open: (url: string) => void) {
  if (!isNative()) return;
  LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
    const url = action.notification.extra?.url;
    if (typeof url === 'string') open(url);
  });
}
