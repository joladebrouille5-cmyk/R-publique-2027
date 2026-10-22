// Classes Tailwind partagées : un seul endroit pour l'apparence des contrôles (design system
// « République », phase 9 : jetons de couleur, de rayon et d'ombre définis dans index.css).

const focus =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-republique-500';
const pressable = `transition duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${focus}`;

export const buttonPrimary = `inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-republique-600 px-5 py-2.5 text-sm font-bold text-white shadow-card hover:bg-republique-700 ${pressable}`;

export const buttonSecondary = `inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 ${pressable}`;

export const buttonDanger = `inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 ${pressable}`;

/** Bouton discret (icône ou texte court) dans une barre ou une carte. */
export const buttonGhost = `inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 ${pressable}`;

export const card =
  'rounded-card border border-slate-200/80 bg-white p-4 shadow-card sm:p-6 dark:border-slate-800 dark:bg-slate-900';

/** Carte mise en avant (dossier de la semaine, décision, résultat). */
export const cardRaised =
  'rounded-dossier border border-slate-200/70 bg-white p-5 shadow-raised sm:p-7 dark:border-slate-700/70 dark:bg-slate-900';

export const input =
  'block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-republique-500 sm:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

export const label = 'block text-sm font-semibold text-slate-700 dark:text-slate-300';

/** Titre d'écran (h1). */
export const screenTitle = 'font-display text-3xl font-bold tracking-tight sm:text-4xl';
