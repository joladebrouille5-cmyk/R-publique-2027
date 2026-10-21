// Logos des organes : fichier désigné par l'infobox de l'article, repris seulement depuis
// Wikimedia Commons sous licence libre ou dans le domaine public (voir ../personnalites/
// commons.ts). Un SVG est conservé tel quel après contrôle : aucun script, aucun gestionnaire
// d'événement, aucune ressource externe.
import { imageFile, type Infobox } from './infobox';

/** Fichier du logo : champ `logo` d'abord pour une station de radio, `image` sinon. */
export function logoFile(box: Infobox | null): string | null {
  if (!box) return null;
  const order = /Station de radio/i.test(box.modele) ? ['logo', 'image'] : ['image', 'logo'];
  for (const name of order) {
    const file = imageFile(box.champs.get(name));
    if (file) return file;
  }
  return null;
}

/** Motif de refus d'un SVG (contenu actif ou externe), ou null s'il est sûr à servir. */
export function unsafeSvg(svg: string): string | null {
  if (!/<svg[\s>]/i.test(svg)) return 'fichier SVG illisible';
  if (/<script[\s>]/i.test(svg)) return 'SVG avec script';
  if (/<foreignObject[\s>]/i.test(svg)) return 'SVG avec contenu étranger (foreignObject)';
  if (/\son[a-z]+\s*=/i.test(svg)) return 'SVG avec gestionnaire d’événement';
  if (/<!ENTITY/i.test(svg)) return 'SVG avec entité XML';
  if (/(?:xlink:)?href\s*=\s*["']\s*(?!#|data:image\/(?:png|jpeg|gif|webp);)/i.test(svg))
    return 'SVG avec ressource externe';
  if (/@import|url\(\s*["']?\s*(?!#)[a-z]+:/i.test(svg)) return 'SVG avec ressource externe (CSS)';
  return null;
}
