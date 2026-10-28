// Classes Tailwind partagées : un seul endroit pour l'apparence des contrôles (design system
// « Soirée électorale », phase 9 : jetons de couleur, de rayon, d'ombre et de halo néon définis
// dans index.css). Retour visuel : halo au survol et au focus, léger enfoncement à l'appui.

const focus =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-republique-500 dark:focus-visible:outline-republique-400';
export const pressable = `transition duration-200 ease-sortie active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:active:scale-100 ${focus}`;

export const buttonPrimary = `inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-republique-600 px-5 py-2.5 text-sm font-bold text-white shadow-card hover:bg-republique-700 hover:shadow-raised dark:bg-republique-500 dark:hover:bg-republique-400 dark:hover:shadow-neon ${pressable}`;

export const buttonSecondary = `inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:border-republique-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-republique-400/70 dark:hover:bg-slate-800 dark:hover:shadow-neon ${pressable}`;

export const buttonDanger = `inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 ${pressable}`;

/** Bouton discret (icône ou texte court) dans une barre ou une carte. */
export const buttonGhost = `inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 ${pressable}`;

/** Carte : sa bordure s'allume quand un de ses contrôles a le focus. */
export const card =
  'rounded-card border border-slate-200/80 bg-white p-4 shadow-card transition-[border-color,box-shadow] duration-200 focus-within:border-republique-300 sm:p-6 dark:border-slate-800 dark:bg-slate-900 dark:focus-within:border-republique-400/60';

/** Carte qu'on touche (tuile d'action, format, publication) : bordure et halo réactifs. */
export const cardInteractive = `${card} hover:border-republique-300 hover:shadow-raised dark:hover:border-republique-400/60 dark:hover:shadow-neon`;

/** Carte mise en avant (dossier de la semaine, décision, résultat). */
export const cardRaised =
  'rounded-dossier border border-slate-200/70 bg-white p-5 shadow-raised sm:p-7 dark:border-slate-700/70 dark:bg-slate-900 dark:shadow-[0_0_0_1px_rgb(98_134_255/0.12),0_24px_48px_-20px_rgb(0_0_0/0.6)]';

const field =
  'rounded-xl border border-slate-300 bg-white px-3.5 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-republique-500 sm:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

export const input = `block w-full py-2.5 ${field}`;

/**
 * Champ compact, à la largeur de son contenu (sélecteur dans une barre ou une phrase). Variante à
 * part entière : ajouter `w-auto py-1.5` à `input` ne garantit rien, deux utilitaires d'une même
 * propriété s'ordonnant selon la feuille générée et non selon l'attribut `class`.
 */
export const inputCompact = `w-auto py-1.5 ${field}`;

export const label = 'block text-sm font-semibold text-slate-700 dark:text-slate-300';

/** Titre d'écran (h1) : capitale condensée de plateau, avec un liseré tricolore. */
export const screenTitle = 'font-display text-4xl leading-none font-extrabold sm:text-5xl';
