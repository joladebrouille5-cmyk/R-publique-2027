// Essai de l'APK sur un appareil ou un émulateur Android (phase 8), lancé par le workflow
// .github/workflows/android.yml après la compilation :
//   node apps/mobile/scripts/essai-android.mjs <chemin de l'APK> [dossier des captures]
// Exige un serveur adb démarré et un émulateur connecté (APK de débogage : WebView
// inspectable). L'émulateur est mis hors réseau ; l'application ne demande aucune permission.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { _android as android, expect as baseExpect } from '@playwright/test';

// Émulateur sans accélération graphique (rendu logiciel, deux cœurs) : environ dix fois plus
// lent qu'un ordinateur ; les vérifications attendent donc jusqu'à deux minutes.
const expect = baseExpect.configure({ timeout: 120_000 });

const PKG = 'io.github.joladebrouille5cmyk.republique2027';
const [apk, captures = 'essai-android'] = process.argv.slice(2);
if (!apk)
  throw new Error('Usage : node essai-android.mjs <chemin de l’APK> [dossier des captures]');
await mkdir(captures, { recursive: true });

const [device] = await android.devices({ omitDriverInstall: true });
if (!device) throw new Error('Aucun appareil Android détecté par adb.');
// L'essai désinstalle l'application (parties comprises) et active le mode avion : émulateur
// seulement, sauf demande explicite (R2027_ESSAI_APPAREIL_REEL=1).
if (!device.serial().startsWith('emulator-') && process.env.R2027_ESSAI_APPAREIL_REEL !== '1') {
  await device.close();
  throw new Error(
    `${device.serial()} n’est pas un émulateur : l’essai effacerait les parties de l’appareil.`,
  );
}
device.setDefaultTimeout(120_000);
const shell = async (command) => (await device.shell(command)).toString();
const step = (text) => console.log(`— ${text}`);

async function launch() {
  await shell(`am start -W -n ${PKG}/.MainActivity`);
  const webview = await device.webView({ pkg: PKG });
  const page = await webview.page();
  page.setDefaultTimeout(120_000);
  return { webview, page };
}

try {
  step(`Appareil : ${device.model()} (${device.serial()})`);
  await shell('cmd connectivity airplane-mode enable');
  await shell(`pm uninstall ${PKG}`);
  await device.installApk(apk);

  step('Permissions : aucune demandée, pas même INTERNET');
  const dump = await shell(`dumpsys package ${PKG}`);
  if (/android\.permission\.INTERNET/.test(dump)) throw new Error('Permission INTERNET présente.');

  step('Démarrage hors ligne');
  let { webview, page } = await launch();
  await expect(page.getByText(/Hors ligne · moteur .* sur l’appareil/)).toBeVisible();
  const native = await page.evaluate(() => [
    globalThis.Capacitor?.isNativePlatform?.(),
    globalThis.Capacitor?.getPlatform?.(),
  ]);
  if (native[0] !== true || native[1] !== 'android') {
    throw new Error(`Pont Capacitor absent : ${JSON.stringify(native)}`);
  }

  step('Création d’une partie et première semaine');
  await page.getByRole('link', { name: 'Nouvelle partie' }).click();
  await page.getByLabel('Nom de la partie').fill('Partie Android');
  await page.getByLabel('Prénom').fill('Camille');
  await page.getByLabel(/^Nom \*/).fill('Émulateur');
  await page.getByLabel(/^Parti ou mouvement/).fill('Mouvement Android');
  await page.getByLabel('Graine (facultative)').fill('android');
  await page.getByRole('button', { name: 'Créer la partie' }).click();
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter Meeting public' }).click();
  await page.getByRole('button', { name: 'Résoudre la semaine 0' }).click();
  await expect(page.getByRole('button', { name: 'Résoudre la semaine 1' })).toBeVisible();
  await writeFile(join(captures, '1-tableau-de-bord.png'), await device.screenshot());

  step('Carte électorale (MapLibre dans la WebView)');
  // Menu complet : feuille « Tous les écrans » de la barre du bas sur téléphone.
  const openScreen = async (label) => {
    const nav = page.getByRole('navigation', { name: 'Écrans de la partie' });
    const more = page.getByRole('button', { name: 'Tous les écrans' });
    await expect(nav.or(more).first()).toBeVisible();
    if (!(await nav.isVisible())) await more.click();
    await nav.getByRole('link', { name: label }).click();
  };
  await openScreen('Carte électorale');
  await expect(page.getByRole('region', { name: 'Carte de la métropole' })).toHaveAttribute(
    'data-ready',
    'oui',
  );
  await writeFile(join(captures, '2-carte.png'), await device.screenshot());

  step('Export natif : fichier écrit dans cache/exports puis feuille de partage');
  await openScreen('Sauvegardes');
  await page.getByRole('button', { name: 'Exporter la partie (JSON)' }).click();
  let exported = '';
  for (let i = 0; i < 120 && !exported.includes('.json'); i++) {
    exported = await shell(`run-as ${PKG} ls cache/exports`);
    if (!exported.includes('.json')) await new Promise((r) => setTimeout(r, 500));
  }
  if (!exported.includes('.json')) throw new Error(`Export absent : ${exported}`);
  await writeFile(join(captures, '3-partage.png'), await device.screenshot());
  // Fermer la feuille de partage n'est pas une erreur : le bouton revient, sans alerte.
  await shell('input keyevent KEYCODE_BACK');
  await expect(page.getByRole('button', { name: 'Exporter la partie (JSON)' })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);

  step('Relance de l’application : la partie est conservée');
  // Attendre la fermeture de l'ancienne WebView : sinon l'essai pourrait la reprendre.
  const closed = new Promise((resolve) => webview.once('close', resolve));
  await shell(`am force-stop ${PKG}`);
  await Promise.race([closed, new Promise((resolve) => setTimeout(resolve, 30_000))]);
  ({ webview, page } = await launch());
  await expect(page.getByRole('link', { name: /Partie Android/ })).toBeVisible();
  await writeFile(join(captures, '4-reprise.png'), await device.screenshot());
  step('Essai réussi');
} finally {
  await writeFile(join(captures, 'fin.png'), await device.screenshot()).catch(() => {});
  await device.close();
}
