// Classes Tailwind partagées : un seul endroit pour l'apparence des contrôles (design system
// « Grand Soir », phase 16, sur les jetons de couleur, de rayon et d'ombre d'index.css). Une
// hiérarchie de surfaces plutôt qu'un seul modèle de carte : la scène (moments forts), le dossier
// (ce qui engage le joueur, liseré d'or), la carte (contenu courant) et la liste à filets (le
// reste). Retour visuel : bordure et lumière au survol et au focus, léger enfoncement à l'appui.

const focus =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-republique-500 dark:focus-visible:outline-dorure';
export const pressable = `transition duration-200 ease-sortie active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:active:scale-100 ${focus}`;

export const buttonPrimary = `inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-republique-600 px-5 py-2.5 text-sm font-bold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_8px_20px_-12px_rgb(43_70_217/0.9)] hover:bg-republique-700 dark:bg-republique-500 dark:hover:bg-republique-400 ${pressable}`;

/**
 * Bouton décisif (créer la partie, reprendre, résoudre la semaine) : la dorure des grands
 * soirs. Un seul par écran.
 */
export const buttonPrestige = `inline-flex min-h-12 items-center justify-center gap-2.5 rounded-full bg-or-400 px-6 py-3 text-base font-bold text-or-900 shadow-dore hover:bg-or-300 dark:bg-dorure dark:text-[#1d1503] dark:hover:bg-or-200 ${pressable}`;

export const buttonSecondary = `inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:border-republique-400 hover:bg-slate-50 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-100 dark:hover:border-dorure/60 dark:hover:bg-white/[0.08] ${pressable}`;

export const buttonDanger = `inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 ${pressable}`;

/** Bouton discret (icône ou texte court) dans une barre ou une carte. */
export const buttonGhost = `inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/[0.07] ${pressable}`;

/** Carte : contenu courant ; sa bordure s'allume quand un de ses contrôles a le focus. */
export const card =
  'rounded-card border border-slate-200/90 bg-white p-4 shadow-card transition-[border-color,box-shadow] duration-200 focus-within:border-republique-300 sm:p-6 dark:border-white/[0.08] dark:bg-slate-900/70 dark:shadow-none dark:focus-within:border-dorure/40';

/** Carte qu'on touche (tuile d'action, format, publication) : bordure et lumière réactives. */
export const cardInteractive = `${card} hover:border-republique-300 hover:shadow-raised dark:hover:border-dorure/40 dark:hover:bg-slate-900`;

/**
 * Dossier : ce qui engage le joueur (décision, résultat, course aux parrainages). Liseré d'or
 * et lumière de tête, rayon plus grand que la carte.
 */
export const cardRaised =
  'rounded-dossier border border-or-300/50 bg-white p-5 shadow-raised sm:p-7 dark:border-dorure/20 dark:bg-[linear-gradient(180deg,rgb(227_196_108/0.06),transparent_9rem),linear-gradient(var(--color-slate-900),var(--color-slate-900))] dark:shadow-[inset_0_1px_0_rgb(227_196_108/0.18),0_24px_48px_-20px_rgb(0_0_0/0.7)]';

/** Groupe de lignes séparées par des filets (sections dépliables, listes de dossiers). */
export const listPanel =
  'overflow-hidden rounded-dossier border border-slate-200/90 bg-white divide-y divide-slate-200/90 shadow-card dark:border-white/[0.08] dark:bg-slate-900/55 dark:divide-white/[0.07] dark:shadow-none';

const field =
  'rounded-xl border border-slate-300 bg-white px-3.5 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-republique-500 sm:text-sm dark:border-white/15 dark:bg-slate-950/70 dark:text-slate-100 dark:focus:border-dorure/70';

export const input = `block w-full py-2.5 ${field}`;

/**
 * Champ compact, à la largeur de son contenu (sélecteur dans une barre ou une phrase). Variante à
 * part entière : ajouter `w-auto py-1.5` à `input` ne garantit rien, deux utilitaires d'une même
 * propriété s'ordonnant selon la feuille générée et non selon l'attribut `class`.
 */
export const inputCompact = `w-auto py-1.5 ${field}`;

export const label = 'block text-sm font-semibold text-slate-700 dark:text-slate-300';

/** Titre d'écran (h1) : Didone de prestige, serré, à fort contraste. */
export const screenTitle =
  'font-display text-[2.6rem] leading-[0.95] font-bold tracking-[-0.02em] sm:text-6xl';

/**
 * Choix illustré (mode, adversaires, difficulté, scénario…) : une tuile entière cliquable, qui se
 * dore quand son bouton radio est coché.
 */
export const optionTile =
  'flex cursor-pointer gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition-[border-color,background-color,box-shadow] duration-200 hover:border-republique-300 has-[:checked]:border-or-500 has-[:checked]:bg-or-50/80 has-[:checked]:shadow-[inset_0_0_0_1px_var(--color-or-500)] dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-dorure/40 dark:has-[:checked]:border-dorure/70 dark:has-[:checked]:bg-dorure/[0.08] dark:has-[:checked]:shadow-[inset_0_0_0_1px_rgb(227_196_108/0.6)]';

/** Bouton radio d'une tuile de choix. */
export const radio = 'mt-0.5 size-4 shrink-0 accent-or-600 dark:accent-dorure';
