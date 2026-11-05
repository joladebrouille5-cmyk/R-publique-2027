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

/**
 * Active un lien ou un bouton au clavier (focus puis Entrée), comme un utilisateur de clavier :
 * dans la WebView de l'émulateur, la fenêtre visible peut être décalée par rapport à la page et
 * un clic par coordonnées tomber à côté de sa cible.
 */
async function activate(page, locator) {
  await expect(locator).toBeVisible();
  await locator.focus();
  await page.keyboard.press('Enter');
}

/**
 * Composant d'une ligne de `dumpsys` (« topResumedActivity=ActivityRecord{… u0
 * com.android.intentresolver/.ChooserActivity t12} », « mCurrentFocus=Window{… u0 pkg/.Main} ») ;
 * chaîne vide si aucune ligne connue n'en donne.
 */
function focusedComponent(dump) {
  for (const key of ['topResumedActivity', 'mResumedActivity', 'mCurrentFocus', 'mFocusedApp']) {
    const line = dump.split('\n').find((l) => l.trimStart().startsWith(`${key}=`));
    const component = line && /\s([\w.]+\/[\w.$]+)/.exec(line)?.[1];
    if (component) return component;
  }
  return '';
}

/**
 * Activité au premier plan (« com.android.intentresolver/.ChooserActivity »…). Android 14 ne
 * donne plus le focus dans `dumpsys window windows` : activités reprises d'abord, fenêtres ensuite.
 */
async function foreground() {
  for (const command of ['dumpsys activity activities', 'dumpsys window']) {
    const component = focusedComponent(await shell(command));
    if (component) return component;
  }
  return '';
}

async function waitForeground(test, label) {
  for (let i = 0; i < 120; i++) {
    if (test(await foreground())) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${label} : premier plan inattendu (${await foreground()})`);
}

async function launch() {
  await shell(`am start -W -n ${PKG}/.MainActivity`);
  const webview = await device.webView({ pkg: PKG });
  const page = await webview.page();
  page.setDefaultTimeout(120_000);
  // Une page fermée en cours d'essai (hors relance) signale une WebView perdue : on le note.
  page.on('crash', () => console.log('! Plantage du processus de rendu de la WebView'));
  page.on('close', () => console.log('! Page de la WebView fermée'));
  return { webview, page };
}

/**
 * Diagnostic d'un échec : le journal Android complet va dans les captures, et ses lignes utiles
 * (plantage ou arrêt du rendu de la WebView, processus tué faute de mémoire, ANR, signal fatal)
 * dans le journal de la CI, avec l'état de la mémoire de l'appareil.
 */
async function diagnose() {
  const log = await shell('logcat -d -v time');
  await writeFile(join(captures, 'logcat.txt'), log);
  const useful = log
    .split('\n')
    .filter(
      (line) =>
        /chromium|webview|sandboxed_process|renderer|lowmemorykiller|lmkd|has died|died|ANR in|FATAL|Fatal signal|am_kill|Kill|crash|OutOfMemory/i.test(
          line,
        ) && !/ColorBuffer/.test(line),
    );
  console.log('— Journal Android, lignes utiles (les 150 dernières) :');
  console.log(useful.slice(-150).join('\n'));
  console.log('— Mémoire de l’appareil :');
  console.log((await shell('cat /proc/meminfo')).split('\n').slice(0, 6).join('\n'));
}

try {
  step(`Appareil : ${device.model()} (${device.serial()})`);
  // Journal Android vidé : en cas d'échec, seul celui de l'essai est examiné.
  await shell('logcat -c');
  await shell('cmd connectivity airplane-mode enable');
  await shell(`pm uninstall ${PKG}`);
  await device.installApk(apk);

  step('Permissions : aucune demandée, pas même INTERNET');
  const dump = await shell(`dumpsys package ${PKG}`);
  if (/android\.permission\.INTERNET/.test(dump)) throw new Error('Permission INTERNET présente.');

  step('Démarrage hors ligne');
  let { webview, page } = await launch();
  // Moteur local prêt : aucune ligne d'état en pied de page (phase 14), ni démarrage ni panne.
  await expect(page.getByRole('link', { name: 'Nouvelle partie' })).toBeVisible();
  await expect(page.getByText('Démarrage du moteur local…')).toHaveCount(0);
  await expect(page.getByText('Moteur local indisponible')).toHaveCount(0);
  await expect(page.getByText(/Hors ligne · moteur/)).toHaveCount(0);
  const native = await page.evaluate(() => [
    globalThis.Capacitor?.isNativePlatform?.(),
    globalThis.Capacitor?.getPlatform?.(),
  ]);
  if (native[0] !== true || native[1] !== 'android') {
    throw new Error(`Pont Capacitor absent : ${JSON.stringify(native)}`);
  }

  step('Création d’une partie et première semaine');
  await activate(page, page.getByRole('link', { name: 'Nouvelle partie' }));
  // Assistant de création (phase 20) : « Suivant » jusqu'à l'étape voulue ; le nom de la partie
  // et la graine sont dans les options avancées de la dernière étape (« Le format »).
  const wizardTo = async (titre) => {
    for (let i = 0; i < 6; i++) {
      if (await page.getByRole('heading', { level: 2, name: titre }).isVisible()) return;
      await activate(page, page.getByRole('button', { name: 'Suivant' }));
    }
    throw new Error(`Étape de l'assistant introuvable : ${titre}`);
  };
  await wizardTo('Votre candidat');
  await page.getByLabel('Prénom').fill('Camille');
  await page.getByLabel(/^Nom \*/).fill('Émulateur');
  await page.getByLabel(/^Parti ou mouvement/).fill('Mouvement Android');
  await wizardTo('Le format');
  await activate(page, page.getByText('Options avancées'));
  await page.getByLabel('Nom de la partie').fill('Partie Android');
  await page.getByLabel('Graine (facultative)').fill('android');
  await activate(page, page.getByRole('button', { name: 'Créer la partie' }));
  // Phase 25 : la partie s'ouvre sur le plateau ; une carte Terrain se pose au Finistère.
  await expect(page.getByRole('button', { name: 'Jouer la semaine 0' })).toBeVisible();
  await writeFile(join(captures, '1-plateau.png'), await device.screenshot());
  await activate(page, page.getByRole('button', { name: /^Carte « Porte-à-porte »/ }));
  await activate(page, page.getByRole('button', { name: /^Finistère \(29\)/ }));
  await activate(page, page.getByRole('button', { name: 'Jouer la semaine 0' }));
  // Verdict de la semaine (phase 25) : plein écran, sur la feutrine.
  const verdict = page.getByRole('dialog', { name: 'Verdict de la semaine 0' });
  await expect(verdict).toBeVisible();
  await activate(page, verdict.getByRole('button', { name: 'Tout afficher' }));
  await writeFile(join(captures, '2-verdict.png'), await device.screenshot());
  await activate(page, verdict.getByRole('button', { name: 'Semaine suivante' }));
  await expect(verdict).toBeHidden();
  await expect(page.getByRole('button', { name: 'Jouer la semaine 1' })).toBeVisible();

  // Boîte de jeu du plateau, après avoir remis à plus tard les décisions en cartes plein écran.
  const openBox = async () => {
    for (let i = 0; i < 6; i++) {
      if (!(await page.getByRole('dialog').first().isVisible())) break;
      await shell('input keyevent KEYCODE_ESCAPE');
      await new Promise((r) => setTimeout(r, 500));
    }
    await activate(page, page.getByRole('button', { name: 'Boîte de jeu' }));
    return page.getByRole('dialog', { name: 'Boîte de jeu' });
  };

  step('Carte électorale (MapLibre dans la WebView)');
  await activate(page, (await openBox()).getByRole('link', { name: 'Carte électorale détaillée' }));
  await expect(page.getByRole('region', { name: 'Carte de la métropole' })).toHaveAttribute(
    'data-ready',
    'oui',
  );
  await writeFile(join(captures, '3-carte.png'), await device.screenshot());

  step('Export natif : fichier écrit dans cache/exports puis feuille de partage');
  // Le panneau « Sauvegardes » de la boîte de jeu, depuis le plateau.
  await activate(
    page,
    page
      .getByRole('navigation', { name: 'Espaces de la partie' })
      .getByRole('link', { name: 'Plateau', exact: true }),
  );
  await activate(page, (await openBox()).getByRole('button', { name: /^Sauvegardes/ }));
  await activate(page, page.getByRole('button', { name: 'Exporter la partie (JSON)' }));
  let exported = '';
  for (let i = 0; i < 120 && !exported.includes('.json'); i++) {
    exported = await shell(`run-as ${PKG} ls cache/exports`);
    if (!exported.includes('.json')) await new Promise((r) => setTimeout(r, 500));
  }
  if (!exported.includes('.json')) throw new Error(`Export absent : ${exported}`);
  // Feuille de partage du système au premier plan, puis fermée : « Retour » n'est envoyé qu'une
  // fois la feuille affichée (sinon il ferait quitter l'écran des sauvegardes).
  await waitForeground((a) => a !== '' && !a.startsWith(PKG), 'Feuille de partage');
  await writeFile(join(captures, '4-partage.png'), await device.screenshot());
  // Fermer la feuille de partage n'est pas une erreur : le bouton revient, sans alerte.
  await shell('input keyevent KEYCODE_BACK');
  await waitForeground((activity) => activity.startsWith(PKG), 'Retour à l’application');
  await expect(page.getByRole('button', { name: 'Exporter la partie (JSON)' })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);

  step('Relance de l’application : la partie est conservée');
  // Attendre la fermeture de l'ancienne WebView : sinon l'essai pourrait la reprendre.
  const closed = new Promise((resolve) => webview.once('close', resolve));
  await shell(`am force-stop ${PKG}`);
  await Promise.race([closed, new Promise((resolve) => setTimeout(resolve, 30_000))]);
  ({ webview, page } = await launch());
  await expect(page.getByRole('link', { name: /Partie Android/ })).toBeVisible();
  await writeFile(join(captures, '5-reprise.png'), await device.screenshot());
  step('Essai réussi');
} catch (error) {
  await diagnose().catch((e) => console.log(`Diagnostic impossible : ${e}`));
  throw error;
} finally {
  await writeFile(join(captures, 'fin.png'), await device.screenshot()).catch(() => {});
  await device.close();
}
