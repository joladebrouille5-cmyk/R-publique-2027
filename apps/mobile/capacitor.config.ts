import type { CapacitorConfig } from '@capacitor/cli';

// Application Android hors ligne (phase 8) : l'interface web construite (dist/) est servie par
// la WebView depuis l'APK ; le moteur et les parties restent sur l'appareil.
const config: CapacitorConfig = {
  // Identifiant Android (définitif une fois l'application publiée sur un magasin).
  appId: 'io.github.joladebrouille5cmyk.republique2027',
  appName: 'RÉPUBLIQUE 2027',
  webDir: 'dist',
  android: {
    // Aucun contenu http : l'application ne charge que ses propres fichiers (https://localhost).
    allowMixedContent: false,
  },
};

export default config;
