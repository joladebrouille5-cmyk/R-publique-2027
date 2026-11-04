// Classes Tailwind partagées : un seul endroit pour l'apparence des contrôles (design system
// « Tract », phase 21, sur les jetons d'index.css). Des feuilles d'imprimé plutôt qu'un seul
// modèle de carte : la feuille (contenu courant), le dossier (ce qui engage le joueur, bandeau
// d'encre bleue en tête), la liste à filets (le reste). Boutons d'encre aplatie ; le bouton
// décisif est surligné de jaune, l'encre bleue décalée dessous comme un calage d'imprimerie.

const focus =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-republique-600 dark:focus-visible:outline-dorure';
export const pressable = `transition duration-150 ease-sortie active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:active:scale-100 ${focus}`;

/** Libellé de bouton : la grotesque des affiches, à peine condensée. */
const buttonType = 'font-display font-bold [font-stretch:94%] tracking-[0.005em]';

export const buttonPrimary = `inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-republique-600 px-5 py-2.5 text-[0.95rem] text-white ${buttonType} hover:bg-republique-700 dark:bg-republique-500 dark:hover:bg-republique-400 ${pressable}`;

/**
 * Bouton décisif (créer la partie, reprendre, résoudre la semaine) : phase 25, l'or des pions de
 * la Feutrine, qui s'enfonce d'un cran à l'appui (tranche dorée dessous). Un seul par écran.
 */
export const buttonPrestige = `inline-flex min-h-12 items-center justify-center gap-2.5 rounded-2xl bg-or px-6 py-3 text-[1.05rem] font-extrabold text-sur-or shadow-[0_4px_0_0_var(--color-or-ombre)] ${buttonType} hover:brightness-105 active:translate-y-[3px] active:scale-100 active:shadow-[0_1px_0_0_var(--color-or-ombre)] ${pressable}`;

/** Bouton secondaire posé sur la feutrine (phase 25) : filet de craie. */
export const boutonCraie = `inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border-2 border-craie px-5 py-2.5 text-[0.95rem] text-craie ${buttonType} hover:bg-craie hover:text-feutrine ${pressable}`;

export const buttonSecondary = `inline-flex min-h-11 items-center justify-center gap-2 rounded-md border-[1.5px] border-slate-800 bg-transparent px-5 py-2.5 text-[0.95rem] text-slate-900 ${buttonType} hover:bg-slate-900 hover:text-papier dark:border-slate-200 dark:text-slate-100 dark:hover:bg-slate-100 dark:hover:text-slate-950 ${pressable}`;

export const buttonDanger = `inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-red-600 px-5 py-2.5 text-[0.95rem] text-white ${buttonType} hover:bg-red-700 ${pressable}`;

/** Bouton discret (icône ou texte court) dans une barre ou une feuille. */
export const buttonGhost = `inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold text-slate-700 hover:bg-slate-200/70 dark:text-slate-200 dark:hover:bg-white/[0.08] ${pressable}`;

/** Feuille : contenu courant ; son filet s'encre quand un de ses contrôles a le focus. */
export const card =
  'rounded-card border border-slate-200 bg-papier p-4 shadow-card transition-[border-color] duration-150 focus-within:border-slate-400 sm:p-6 dark:border-white/[0.09] dark:bg-slate-900/80 dark:shadow-none dark:focus-within:border-white/25';

/** Feuille qu'on touche (tuile d'action, format, publication) : filet d'encre au survol. */
export const cardInteractive = `${card} hover:border-slate-800 dark:hover:border-slate-200`;

/**
 * Dossier : ce qui engage le joueur (décision, résultat, course aux parrainages). Bandeau
 * d'encre bleue en tête de feuille, comme l'en-tête d'un tract ; `cardRaisedBase` laisse la couleur
 * du bandeau au dossier (une décision prend celle de son genre).
 */
export const cardRaisedBase =
  'rounded-dossier border border-slate-300 border-t-[6px] bg-papier p-5 shadow-raised sm:p-7 dark:border-white/[0.12] dark:bg-slate-900 dark:shadow-none';
export const cardRaised = `${cardRaisedBase} border-t-republique-600 dark:border-t-republique-400`;

/** Groupe de lignes séparées par des filets (sections dépliables, listes de dossiers). */
export const listPanel =
  'overflow-hidden rounded-dossier border border-slate-300 bg-papier divide-y divide-slate-200 shadow-card dark:border-white/[0.1] dark:bg-slate-900/70 dark:divide-white/[0.08] dark:shadow-none';

const field =
  'rounded-md border-[1.5px] border-slate-300 bg-white px-3.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-republique-600 sm:text-sm dark:border-white/20 dark:bg-slate-950/70 dark:text-slate-100 dark:focus:border-dorure';

export const input = `block w-full py-2.5 ${field}`;

/**
 * Champ compact, à la largeur de son contenu (sélecteur dans une barre ou une phrase). Variante à
 * part entière : ajouter `w-auto py-1.5` à `input` ne garantit rien, deux utilitaires d'une même
 * propriété s'ordonnant selon la feuille générée et non selon l'attribut `class`.
 */
export const inputCompact = `w-auto py-1.5 ${field}`;

export const label = 'block text-sm font-bold text-slate-700 dark:text-slate-300';

/** Titre d'écran (h1) : grotesque d'affiche très condensée, très grasse, serrée. */
export const screenTitle =
  'font-display text-[2.9rem] leading-[0.92] font-[850] [font-stretch:66%] tracking-[-0.012em] sm:text-7xl';

/**
 * Choix illustré (mode, adversaires, difficulté, scénario…) : une tuile entière cliquable,
 * surlignée de jaune et cerclée d'encre quand son bouton radio est coché.
 */
export const optionTile =
  'flex cursor-pointer gap-3 rounded-lg border-[1.5px] border-slate-200 bg-papier p-4 transition-[border-color,background-color] duration-150 hover:border-slate-500 has-[:checked]:border-slate-900 has-[:checked]:bg-or-100 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/30 dark:has-[:checked]:border-dorure dark:has-[:checked]:bg-dorure/[0.1]';

/** Bouton radio d'une tuile de choix. */
export const radio = 'mt-0.5 size-4 shrink-0 accent-republique-600 dark:accent-dorure';

// Identité « Feutrine » (phase 25) : la boîte de jeu. Le plateau en carton bordé d'or, les
// cartes épaisses (tranche sombre en ombres empilées, bandeau de famille), les pastilles dorées.

/** Plateau de carton crème bordé d'or, posé sur la feutrine. */
export const carton = 'rounded-plateau bg-carton text-encre-carton shadow-plateau';

/** Carte épaisse : face de carton, bord sombre, tranche en ombres empilées. */
export const carte = `relative flex flex-col overflow-hidden rounded-carte border-2 border-bord-carte bg-carton text-encre-carton shadow-carte ${pressable}`;

/** Bandeau de famille en tête de carte (couleur franche, texte blanc). */
export const bandeauFamille = {
  terrain: 'bg-famille-terrain text-white',
  medias: 'bg-famille-medias text-white',
  numerique: 'bg-famille-numerique text-white',
  organisation: 'bg-famille-organisation text-white',
} as const;

/** Pastille dorée (rang, compteur, pion) : chiffre gras sur l'or. */
export const pastille =
  'inline-flex min-h-8 min-w-8 items-center justify-center rounded-full bg-or px-2.5 font-display text-sm font-extrabold text-sur-or tabular-nums shadow-pion';

/** Gros bouton doré (valider la semaine) : il s'enfonce d'un cran à l'appui. */
export const boutonOr = `inline-flex min-h-12 items-center justify-center gap-2.5 rounded-2xl bg-or px-6 py-3 font-display text-[1.05rem] font-extrabold text-sur-or shadow-[0_4px_0_0_var(--color-or-ombre)] hover:brightness-105 active:translate-y-[3px] active:scale-100 active:shadow-[0_1px_0_0_var(--color-or-ombre)] ${pressable}`;
