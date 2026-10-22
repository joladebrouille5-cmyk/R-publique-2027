import { Info, X } from 'lucide-react';
import { useId, type ReactNode } from 'react';

/**
 * Détails à la demande (API Popover native : couche supérieure, fermeture par Échap ou clic
 * extérieur). Sur téléphone, la fiche s'ouvre en bas de l'écran ; sur ordinateur, au centre.
 */
export function InfoPopover({
  label,
  title,
  children,
  className = '',
}: {
  /** Nom accessible du bouton (« Détails : Meeting public »). */
  label: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-republique-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-republique-300 ${className}`}
      >
        <Info aria-hidden="true" className="size-5" />
        <span className="sr-only">{label}</span>
      </button>
      <div
        id={id}
        popover="auto"
        role="dialog"
        aria-label={title}
        className="m-0 mx-auto mt-auto mb-[calc(5.5rem+var(--sab))] w-[min(28rem,calc(100vw-2rem))] rounded-card border border-slate-200 bg-white p-5 text-left text-slate-900 shadow-raised backdrop:bg-slate-950/30 open:animate-monte sm:my-auto dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <p className="font-display text-lg leading-tight font-bold">{title}</p>
          <button
            type="button"
            popoverTarget={id}
            popoverTargetAction="hide"
            className="-mt-2 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X aria-hidden="true" className="size-5" />
            <span className="sr-only">Fermer</span>
          </button>
        </div>
        <div className="space-y-3 text-sm">{children}</div>
      </div>
    </>
  );
}
