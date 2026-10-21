# Mesure des formats de carte (spike P4-01)

> Mesure du 20/10/2026, reproductible avec `pnpm mesure:carte` (script `scripts/spike-carte/`,
> après `pnpm data:geo`). Décision consignée dans [ARCHITECTURE.md](./ARCHITECTURE.md) (D7).

## Méthode

- Navigateur Chromium (Playwright 1.56.1) émulant un **Pixel 7**, processeur **ralenti 4×**,
  réseau **4G** (9 Mbit/s descendant, 1,5 Mbit/s montant, 85 ms de latence), cache désactivé.
- Rendu MapLibre GL 6.12.0 sans fond de carte ; mêmes géométries pour les deux variantes :
  communes IGN ADMIN EXPRESS COG CARTO 2026 simplifiées à 100 m (mapshaper), fichiers compressés
  (gzip) par le serveur.
- Mesures : temps jusqu'au premier rendu complet (événement `idle`), octets transférés (CDP,
  bibliothèques comprises), mémoire JavaScript utilisée (`JSHeapUsedSize`). Médiane de 3 essais.

## Résultats

| Variante | Premier rendu | Communes d'un département (Pas-de-Calais, le plus lourd) | Transféré | Mémoire JS |
|---|---|---|---|---|
| **Aperçu national (départements, 34 Ko) puis TopoJSON par département** | **1,6 s** | **1,5 s** | **0,43 Mo** | **11,5 Mo** |
| GeoJSON national de toutes les communes (coordonnées à 4 décimales) | 21,3 s | — | 8,0 Mo | 268 Mo |

Tailles des fichiers du référentiel complet : aperçu 112 Ko (34 Ko compressé) ; communes par
département 14,8 Mo au total (4,9 Mo compressés), 98 Ko compressés au plus (Pas-de-Calais).

## Décision

**TopoJSON par département, chargé à la demande** (niveau communal : départements visibles, au
plus 6, et départements recherchés) : 13 fois plus rapide, 19 fois moins de données et 23 fois
moins de mémoire que le fichier national, dans le budget d'un téléphone. Les tuiles vectorielles
(PMTiles) n'ont pas été mesurées : `tippecanoe`, nécessaire pour les produire, ne s'installe pas
dans l'environnement de développement (pas de compilateur ni de Docker). Elles restent une
option si le niveau communal national doit un jour s'afficher d'un seul tenant (phase 8).
