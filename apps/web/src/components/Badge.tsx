import type { ReactNode } from 'react';

// Étiquettes « Tract » (phase 21) : petits pavés d'encre, comme des mentions tamponnées.
const TONES = {
  neutre: 'bg-slate-200/80 text-slate-800 dark:bg-white/10 dark:text-slate-100',
  simule:
    'bg-republique-100 text-republique-900 dark:bg-republique-400/20 dark:text-republique-100',
  fictif: 'bg-[#e9e2fb] text-surimpression dark:bg-violet-400/20 dark:text-violet-100',
  reel: 'bg-teal-100 text-teal-900 dark:bg-teal-400/20 dark:text-teal-100',
  alerte: 'bg-or-200 text-or-900 dark:bg-dorure/20 dark:text-or-100',
  danger: 'bg-red-100 text-red-900 dark:bg-red-400/20 dark:text-red-100',
  succes: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-400/20 dark:text-emerald-100',
} as const;

export type BadgeTone = keyof typeof TONES;

/** Étiquette courte ; le texte porte le sens (jamais la couleur seule). */
export function Badge({ tone = 'neutre', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-[3px] px-1.5 py-0.5 text-xs font-bold ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
