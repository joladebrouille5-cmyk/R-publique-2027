# Consignes pour Claude Code — RÉPUBLIQUE 2027

- Référence fonctionnelle : `docs/Cahier_des_charges_Republique_2027.pdf`. Plan et état d'avancement : `docs/PLAN_DEVELOPPEMENT.md`.
- Implémenter **une seule phase à la fois** ; rappeler ses critères d'acceptation avant de coder ; s'arrêter à la fin de la phase.
- Ne jamais simuler une fonctionnalité non implémentée ni masquer une erreur ; un écran sans moteur l'indique explicitement.
- Chaque fonctionnalité arrive avec ses tests ; lancer les tests avant tout commit.
- Le moteur (`packages/engine`) reste pur : pas de `Math.random`, `Date`, réseau, base ni DOM.
- Ne jamais inventer une donnée officielle (date, résultat, plafond, URL) : la sourcer dans `docs/SOURCES.md` ou l'étiqueter `estimation` / `hypothèse`.
- Codes géographiques toujours en chaînes de caractères (`2A`, `2B`, `01`…).
- Aucun secret dans Git ; variables d'environnement documentées dans `.env.example`.
- Documentation et interface en français.
- Compte rendu de fin de phase : résumé, fichiers modifiés, tests et résultats, limites, prochaine étape.
