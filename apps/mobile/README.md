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
             └─ cartes : jeu de démonstration COG 2026 (Ain, Corse, Somme, DROM), embarqué
```

- Chaque requête de l'interface est copiée comme sur le réseau (JSON) : l'interface ne calcule jamais l'état et ne partage aucun objet avec le moteur.
- Toutes les écritures d'une requête (état, sauvegarde automatique, journal, clé d'idempotence) passent par **une seule transaction IndexedDB** : appliquées ensemble ou pas du tout.
- Au démarrage, l'application demande à Android un stockage **persistant**. S'il n'est pas accordé, le pied de page l'indique : exportez alors régulièrement vos parties (QG → section Sauvegardes → « Exporter la partie (JSON) », qui ouvre la feuille de partage d'Android : Fichiers, Drive, messagerie…).
- La base électorale est celle de la **démonstration, fictive** et affichée comme telle ; les résultats réels de 2022 ne sont pas embarqués (licence non précisée, question Q8 du plan).
- Les liens vers les sources (Wikipédia, Insee…), rassemblés dans Paramètres → Crédits et mentions légales, s'ouvrent dans le navigateur de l'appareil, qui a, lui, accès au réseau.
- Version **1.13.0** (`versionCode` 14, phase 21) : refonte « Tract » de l'interface — deux encres en aplat (bleu, rouge) et leur surimpression, surligneur jaune pour ce qui décide, titres et chiffres en Anybody (largeur variable), texte en Atkinson Hyperlegible Next (polices embarquées, sous licence OFL) ; écran-titre en affiche imprimée en surimpression, palmarès et défi du jour en tract rouge, bandeau de campagne avec compte à rebours sur pavé rouge, QG en pupitre (vue d'ensemble et résolution côte à côte sur grand écran), coup de tampon « Semaine bouclée » au débriefing, décisions au bandeau de leur couleur, thème clair, nuit ou celui du système (par défaut). Nouvelles musiques : *Orient et Occident* (Saint-Saëns) et la *Marche hongroise* (Berlioz) par l'US Marine Band (domaine public), *Catalyst*, *Hiraeth* et *Born of the Sky* de Scott Buckley (CC BY 4.0) ; jingles réécrits (marimba, cordes pincées, caisse claire, téléscripteur) et nouveau son du tampon. Aucune permission ajoutée ; ni le moteur, ni les règles, ni le format de sauvegarde ne changent.
- Version 1.12.0 (`versionCode` 13, phase 20) : création en assistant pas à pas et format court (la partie s'arrête au soir de la présidentielle) ; l'équipe de campagne raconte la semaine ; quatre paires d'écrans réunies ; événements en chaîne et coups des adversaires ; jours fériés et campagne officielle (égalité des temps de parole) ; palmarès, niveau de joueur, Légende et scénario d'outsider à débloquer, défi du jour. **Une permission ajoutée, à la demande de l'utilisateur** : `POST_NOTIFICATIONS`, pour le rappel quotidien du défi du jour (désactivé par défaut, demandé seulement quand vous l'activez dans Paramètres) ; les autres permissions de l'extension de notifications sont retirées (pas d'alarme exacte, pas de réveil au démarrage du téléphone : le rappel est reprogrammé à chaque ouverture). Toujours aucune permission `INTERNET`. Format de sauvegarde 22 (parties existantes migrées).
- Version **1.11.0** (`versionCode` 12, phase 19) : le son — musique d'ambiance (écran-titre, campagne, mandat ; cinq morceaux de Kevin MacLeod sous licence CC BY 3.0, embarqués, crédités dans Paramètres) et jingles des moments forts fabriqués par le jeu (résultat à 20 h à l'ouverture de la soirée électorale, victoire ou défaite à la fin du dépouillement, ouverture d'un débat, nouvelle importante) ; aucun son avant votre premier geste, musique coupée quand l'application passe en arrière-plan, bouton « Couper le son » dans l'en-tête, réglages de la musique et des jingles dans Paramètres. Aucune permission ajoutée ; ni le moteur ni le format de sauvegarde ne changent.
- Version 1.10.0 (`versionCode` 11, phase 18) : cinq niveaux de difficulté — Découverte (moyens confortables, adversaires moins actifs, moins fortunés et deux fois moins connus au départ), Accessible, Standard, Expert et Légende (moyens maigres, adversaires impitoyables et plus connus) ; à la création, une échelle de cinq tuiles et la fiche du niveau choisi (vos moyens de départ, vos adversaires, leur maîtrise au débat), rappelée dans la section « La partie » du QG. Le niveau est fixé à la création. Les parties des versions précédentes sont migrées au format de sauvegarde 20 à leur ouverture, sans changement de leur niveau ni de leurs moyens.
- Version 1.9.0 (`versionCode` 10, phase 17) : débats télévisés obligatoires — quand vous êtes invité à un débat de la semaine, la semaine ne se résout qu'une fois le débat joué jusqu'au bout (ou sa fin simulée depuis le plateau), ou refusé avant le premier échange (chaise vide) ; le QG l'annonce et mène au plateau, l'avance rapide s'arrête avant. Aucune modification des règles ni du format de sauvegarde.
- Version 1.8.0 (`versionCode` 9, phase 16) : refonte « Grand Soir » de l'interface — écran-titre au mur d'affichage électoral (une affiche par candidat fictif, panneau libre pour le vôtre) et reprise de la dernière partie d'un geste, création de partie en chapitres avec votre affiche mise à jour en direct et une boussole politique, bandeau de campagne avec compte à rebours doré, QG en tableau d'affichage, actions teintées par famille, bouton doré de résolution, débriefing qui s'ouvre sur la page du calendrier, sondages et résultats aux couleurs des candidats, titres en Didone (Bodoni Moda, embarquée : aucune connexion requise). Aucune modification des règles ni du format de sauvegarde : les parties de la version 1.7.0 s'ouvrent telles quelles.
- Version 1.7.0 (`versionCode` 8, phase 15) : pré-campagne dynamisée — orientation stratégique du mouvement choisie à la création (moyens et base électorale de départ), course aux parrainages au QG (seuil, départements, compte à rebours, classement), rendez-vous d'élus à recevoir ou décliner, négociations de soutien avec les personnalités réelles (probabilité d'accord affichée, ministère promis possible ; soutiens et refus simulés) ; pendant le mandat, pop-ups d'urgence ministérielle avec le ministre en charge et sa photo, questions au gouvernement « en direct » (hémicycle, groupe qui interpelle, tension ; réponse facultative), Conseil des ministres hebdomadaire (popularité prêtée, loyauté, départs simulés), remaniement ciblé, objectifs et note du mandat sur 20, succès, déplacements du président programmés depuis la carte et tracés. Les parties des versions précédentes sont migrées au format de sauvegarde 19 à leur ouverture.
- Version 1.6.0 (`versionCode` 7, phase 14) : 108 personnalités réelles nominables au gouvernement, toutes avec une photo sous licence libre, à rechercher par nom ou à filtrer par parti et par ministère d'expertise ; expertise ministérielle (une ancienne fonction de ministre du domaine rend plus compétent sur le poste ; le Premier ministre place chacun là où il est expert) ; figures des blocs aux législatives et visages des blocs dans les accords électoraux ; barre « Résoudre la semaine » plus compacte sur téléphone ; la ligne « Hors ligne · moteur … sur l'appareil » disparaît du pied de page (seuls un démarrage en cours ou une panne du moteur local s'y affichent). Les parties des versions précédentes sont migrées au format de sauvegarde 18 à leur ouverture.
- Version 1.5.0 (`versionCode` 6, phase 13) : vue du mandat en tête de l'espace Pouvoir (hémicycle aux couleurs des groupes avec liseré sur votre groupe, jauges de majorité et de tension parlementaire, ministres et effets de leur domaine) ; frondeurs, interventions de l'opposition aux votes clés et motions de censure spontanées ; nouvelles actions du chef de l'État (visites d'usine et de CHU, sommet de crise et négociation sociale à l'Élysée, discours devant le Congrès, commémoration, panthéonisation) ; législatives avec accords électoraux (investitures communes, désistements, front républicain), coalition et carte par bloc rejouable ; photo du candidat personnalisé, préparée sur l'appareil, et portraits illustrés des personnages fictifs. Les parties des versions précédentes sont migrées au format de sauvegarde 17 à leur ouverture.
- Version 1.4.0 (`versionCode` 5, phase 12) : navigation à plat en cinq espaces (QG, Carte, Campagne, Opinion, Pouvoir) dans la barre du bas, sans menu « Tous les écrans » ; écrans secondaires en sections dépliables sur place ; QG « en un coup d'œil » (budget, notoriété, actions programmées, décisions, sondage clé, échéances) tenant dans le premier écran du téléphone ; détails (actions, sondages, finances, gouvernement…) ouverts en tiroir coulissant sans quitter la page. Aucun changement du moteur ni du format de sauvegarde (16).
- Version 1.3.0 (`versionCode` 4, phase 11) : rythme de la soirée électorale réglable (pause, lent, temps réel, ×2, ×5) ; personnalités réelles nominables au gouvernement (Matignon et ministères régaliens, compétence estimée, refus simulés) ; écran Paramètres avec les crédits et mentions légales (les écrans de jeu ne portent plus de sources) ; marges de sécurité du téléphone ; événements contextuels ; débriefing de la semaine en plein écran ; sondages stables et expliqués ; passages dans les médias sans aléa (posture, préparation, format) ; réactions plus variées. Les parties des versions précédentes sont migrées au format de sauvegarde 16 à leur ouverture.
- Version 1.2.0 (`versionCode` 3, phase 10) : débats télévisés jouables sur l'appareil (débat à cinq, débat de tous les candidats, débat d'entre-deux-tours : cartes, attaques ciblées, chaise vide, sondage flash, relecture) et interview longue révisée (Legend). Les parties des versions précédentes restent sur l'appareil lors d'une mise à jour signée par la même clé, et sont migrées au format de sauvegarde 15 à leur ouverture.
- Version 1.1.0 (`versionCode` 2, phase 9) : identité « soirée électorale », navigation basse, réseaux sociaux et nouveaux médias, direct de la soirée électorale (Somme comprise).

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
