import type { ReactNode } from 'react';

const TONES = {
  neutre: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  simule: 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100',
  fictif: 'bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-100',
  reel: 'bg-teal-100 text-teal-900 dark:bg-teal-900/40 dark:text-teal-100',
  alerte: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
  danger: 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100',
  succes: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100',
} as const;

export type BadgeTone = keyof typeof TONES;

/** Étiquette courte ; le texte porte le sens (jamais la couleur seule). */
export function Badge({ tone = 'neutre', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
