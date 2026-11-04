import { X } from 'lucide-react';
import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useModal } from './useModal';

// Tiroir de détail (phase 12) : panneau coulissant qui garde la page en place — depuis le bas
// sur téléphone (au-dessus de la barre de gestes, sous la barre d'état), depuis la droite sur
// ordinateur. Dialogue modal nommé ; Échap, le bouton « Fermer » ou un clic sur le fond le
// referment ; le focus revient à l'élément qui l'a ouvert. L'adresse de la page ne change pas.

export function Drawer({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Actions du tiroir (bouton principal), toujours visibles en bas. */
  footer?: ReactNode;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const onKeyDown = useModal(panel, onClose);

  // Portail sur le corps du document : aucun parent animé ne peut le placer sous la navigation.
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex animate-apparait items-end justify-end bg-slate-950/60 backdrop-blur-[2px] lg:items-stretch"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="flex max-h-[calc(100dvh-var(--sat)-0.75rem)] w-full animate-feuille flex-col rounded-t-dossier bg-white shadow-raised outline-none lg:h-full lg:max-h-none lg:w-[min(38rem,92vw)] lg:animate-volet lg:rounded-none lg:rounded-l-dossier lg:pt-(--sat) dark:bg-slate-900 dark:shadow-[0_0_0_1px_rgb(227_196_108/0.16),0_24px_48px_-20px_rgb(0_0_0/0.8)]"
      >
        <span
          aria-hidden="true"
          className="mx-auto mt-2.5 h-1.5 w-12 shrink-0 rounded-full bg-slate-300 lg:hidden dark:bg-slate-700"
        />
        <div className="flex shrink-0 items-start gap-3 border-b border-slate-200 px-4 pt-3 pb-3 sm:px-6 dark:border-white/[0.08]">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-display text-2xl leading-tight font-bold">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-sm text-encre-2">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.07]"
          >
            <X aria-hidden="true" className="size-5" />
            <span className="sr-only">Fermer</span>
          </button>
        </div>
        {/* Zone défilante atteignable au clavier (son contenu peut ne rien avoir de focalisable). */}
        <div
          role="region"
          aria-label={`Contenu : ${title}`}
          tabIndex={0}
          className={`min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pt-4 outline-none sm:px-6 ${
            footer ? 'pb-4' : 'pb-[calc(1.5rem+var(--sab))]'
          }`}
        >
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-slate-200 px-4 pt-3 pb-[calc(0.75rem+var(--sab))] sm:px-6 dark:border-white/[0.08]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
