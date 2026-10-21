# RÉPUBLIQUE 2027 — application Android hors ligne

L'application Android embarque **tout le jeu** : l'interface de `apps/web`, le moteur de simulation, les jeux de règles et le référentiel cartographique de démonstration. Elle fonctionne **sans réseau** et ne demande **aucune permission** (pas même l'accès à Internet). Les parties sont enregistrées sur l'appareil.

## Fonctionnement

```
WebView Android (Capacitor 8, https://localhost servi depuis l'APK)
 └─ interface apps/web (mêmes écrans)
     └─ transport d'API remplacé : requêtes /api/... traitées dans l'application
         └─ @r2027/local-api : même contrat que l'API Fastify
             ├─ moteur (@r2027/engine), règles (@r2027/rulesets), sauvegardes (@r2027/save-engine)
             ├─ IndexedDB « republique-2027 » : parties, sauvegardes, journal, progressions
             └─ cartes : jeu de démonstration COG 2026 (Ain, Corse, DROM), embarqué
```

- Chaque requête de l'interface est copiée comme sur le réseau (JSON) : l'interface ne calcule jamais l'état et ne partage aucun objet avec le moteur.
- Toutes les écritures d'une requête (état, sauvegarde automatique, journal, clé d'idempotence) passent par **une seule transaction IndexedDB** : appliquées ensemble ou pas du tout.
- Au démarrage, l'application demande à Android un stockage **persistant**. S'il n'est pas accordé, le pied de page l'indique : exportez alors régulièrement vos parties (écran Sauvegardes → « Exporter la partie (JSON) », qui ouvre la feuille de partage d'Android : Fichiers, Drive, messagerie…).
- La base électorale est celle de la **démonstration, fictive** et affichée comme telle ; les résultats réels de 2022 ne sont pas embarqués (licence non précisée, question Q8 du plan).
- Les liens vers les sources (Wikipédia, Insee…) s'ouvrent dans le navigateur de l'appareil, qui a, lui, accès au réseau.

## Construire l'APK

### Option 1 — sans rien installer : GitHub Actions

Chaque push lance le workflow **Android (APK)** (`.github/workflows/android.yml`) : il construit l'APK de débogage, puis l'essaie sur un émulateur Android 14 hors réseau (création d'une partie, une semaine, carte, export partagé, relance de l'application).

1. Sur GitHub : onglet **Actions** → workflow **Android (APK)** → dernière exécution réussie (coche verte).
2. En bas de la page, section **Artifacts** : télécharger `republique-2027-apk-debug` (un fichier zip contenant `app-debug.apk`).
3. Pour relancer à la main : **Actions** → **Android (APK)** → **Run workflow**.

### Option 2 — sur votre ordinateur

Prérequis :

- Node.js 22.22 ou plus et pnpm 10 (`corepack enable`) ;
- **JDK 21** (par exemple Temurin 21) ; `java -version` doit afficher 21 ;
- **Android Studio** (il installe le SDK Android) ou, à défaut, les outils en ligne de commande du SDK avec la plateforme Android 36 ; la variable `ANDROID_HOME` (ou un fichier `apps/mobile/android/local.properties` contenant `sdk.dir=…`) doit désigner le SDK.

Commandes, depuis la racine du dépôt :

```bash
pnpm install
pnpm --filter @r2027/mobile build          # paquet web hors ligne → apps/mobile/dist
cd apps/mobile
npx cap sync android                       # copie le paquet et les greffons dans android/
cd android
./gradlew assembleDebug                    # Windows : gradlew.bat assembleDebug
```

L'APK est alors dans `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`. Raccourci équivalent depuis la racine (macOS, Linux) : `pnpm mobile:apk` ; sous Windows, suivre les commandes ci-dessus avec `gradlew.bat`.

Pour ouvrir le projet dans Android Studio (émulateur, débogage) : `cd apps/mobile && npx cap open android`.

### Installer l'APK sur un téléphone

- **Par câble** : activer les options pour les développeurs et le débogage USB, puis `adb install -r app-debug.apk`.
- **Par fichier** : copier l'APK sur le téléphone, l'ouvrir et autoriser l'installation d'applications de cette source.

L'APK de débogage est signé par la clé de débogage de la machine qui l'a construit : il convient pour essayer le jeu, pas pour une publication. Une mise à jour doit être signée par la même clé (sinon, désinstaller d'abord : les parties de l'appareil sont alors effacées — exportez-les avant).

## APK de publication signé

La clé de signature ne doit **jamais** être commitée. Créer une clé une fois pour toutes, et la conserver avec ses mots de passe en lieu sûr (sa perte empêche toute mise à jour de l'application) :

```bash
keytool -genkeypair -v -keystore republique-2027.jks -alias republique-2027 \
  -keyalg RSA -keysize 4096 -validity 10000
```

Construction locale :

```bash
export R2027_KEYSTORE_FILE=/chemin/absolu/republique-2027.jks
export R2027_KEYSTORE_PASSWORD='…'
export R2027_KEY_ALIAS=republique-2027
export R2027_KEY_PASSWORD='…'
pnpm --filter @r2027/mobile run android:sync
cd apps/mobile/android && ./gradlew assembleRelease
# → app/build/outputs/apk/release/app-release.apk
```

Dans GitHub Actions : créer les secrets `R2027_KEYSTORE_BASE64` (sortie de `base64 -w0 republique-2027.jks`), `R2027_KEYSTORE_PASSWORD`, `R2027_KEY_ALIAS` et `R2027_KEY_PASSWORD` (Settings → Secrets and variables → Actions). Sur la branche `main` ou une étiquette de version (`v1.0.0`…), le workflow produit alors aussi l'artefact `republique-2027-apk-release` ; une branche de travail ne voit jamais la clé. Sans ces secrets, seule la version de débogage est construite.

Avant une publication sur un magasin d'applications : l'identifiant `io.github.joladebrouille5cmyk.republique2027` (`capacitor.config.ts`, `android/app/build.gradle`) devient définitif, et `versionCode` doit augmenter à chaque version.

## Tests

| Commande | Contenu |
|---|---|
| `pnpm test` (projets `mobile` et `local-api`) | contrat du moteur local, idempotence, sauvegardes, export/import, persistance IndexedDB après réouverture, transaction annulée en bloc, fichiers cartographiques embarqués, stockage non garanti signalé |
| `pnpm test:mobile` | Playwright, téléphone émulé : le paquet de l'APK servi tel quel, **tout le réseau coupé** ; partie créée, semaine résolue, reprise après rechargement, carte, export et import ; échoue si une requête sort ou si la politique de sécurité du contenu bloque quelque chose |
| workflow Android (CI) | APK construit puis essayé sur un émulateur Android 14 en mode avion (`scripts/essai-android.mjs` ; refuse un appareil réel, dont il effacerait les parties, sauf `R2027_ESSAI_APPAREIL_REEL=1`) |

## Développement

- `pnpm --filter @r2027/mobile dev` : l'application hors ligne dans le navigateur (http://127.0.0.1:5174), sans API ni base.
- Après une modification de l'interface ou du moteur : `pnpm --filter @r2027/mobile run android:sync`.
- Mise à jour de Capacitor : mêmes versions pour `@capacitor/core`, `@capacitor/cli` et `@capacitor/android`, puis `npx cap sync android`.
