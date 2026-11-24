import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Tryb live reload na telefonie: ustaw CAP_SERVER_URL na adres serwera
 * deweloperskiego w sieci lokalnej (np. http://192.168.1.20:5173) i uruchom
 * `npm run android:live`. Bez tej zmiennej aplikacja używa zbudowanych plików.
 */
const liveUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  // Identyfikator aplikacji — po publikacji w sklepie nie da się go zmienić.
  appId: 'pl.gov.bdpn.sciezki',
  appName: 'Ścieżki BdPN',
  webDir: 'build',
  android: {
    // Wymagane przez wtyczkę lokalizacji w tle: bez tego Android wstrzymuje
    // odczyty po ~5 minutach w tle.
    useLegacyBridge: true,
  },
  server: liveUrl ? { url: liveUrl, cleartext: true } : undefined,
};

export default config;
