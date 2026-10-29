# Fixtures des tests de bout en bout

## `president-joueur.json`

Export de partie (`republique-2027/partie`, format de sauvegarde 19, jeu de règles `presidentielle-2027@16.0.0`, moteur 0.18.0) importé par `institutions.spec.ts` pour tester, dans le navigateur, le mandat d'un **président joueur** : pop-ups d'urgence ministérielle et de questions au gouvernement, Conseil des ministres, objectifs du mandat, déplacement programmé depuis la carte.

Produit par le vrai moteur, sans retouche de l'état sinon une :
1. partie créée comme dans `helpers.ts` (`createGame` : Camille Durand, « Mouvement Playwright », adversaires fictifs, scénario de référence), graine `e2e-president` ;
2. campagne jouée comme `advanceAsCandidate` (deux rencontres d'élus par semaine jusqu'à la clôture des présentations, puis la préparation des débats ; décisions par défaut) jusqu'à l'ouverture du quinquennat ;
3. **le joueur déclaré élu** (seule retouche, comme dans les tests de composants `institutions.test.tsx` et `quinquennat.test.tsx`) : un joueur qui se contente de ces actions est toujours éliminé au premier tour, et aucun parcours de campagne automatisé ne le mène sûrement à l'Élysée ;
4. mandat joué par le moteur (décisions par défaut) jusqu'à la semaine 34 (24 mai 2027), où une urgence ministérielle et une séance de questions au gouvernement attendent le président, sans autre décision en attente.

Les résultats électoraux archivés de la partie restent ceux de la simulation (un adversaire en tête) : l'état n'est pas une partie jouable de bout en bout, seulement un point de départ de test. Le format évoluera avec les migrations de `packages/save-engine` : un état d'un ancien format est migré à l'import.
