import { ChevronDown } from 'lucide-react';
import { createContext, useContext, type ReactNode } from 'react';
import { screenTitle } from './ui';

// Sections dépliables (phase 12) : un écran secondaire devient une section d'un espace, que l'on
// déplie sur place. Motif « disclosure » : un titre (niveau 2) qui contient le bouton, avec sa
// ligne d'état ; le contenu n'est rendu qu'une fois la section ouverte.

/** Vrai dans une section dépliable ou un tiroir : l'écran intégré n'affiche pas son titre. */
const EmbeddedContext = createContext(false);

export function Embedded({ children }: { children: ReactNode }) {
  return <EmbeddedContext.Provider value>{children}</EmbeddedContext.Provider>;
}

/**
 * Titre d'un écran (ou d'un panneau du QG, niveau 2) : un titre quand il est affiché seul, texte
 * masqué (qui nomme toujours sa région) quand il est intégré à une section ou à un tiroir déjà
 * titrés.
 */
export function ScreenHeading({
  id,
  children,
  level = 1,
  className = screenTitle,
}: {
  id: string;
  children: ReactNode;
  level?: 1 | 2;
  className?: string;
}) {
  const embedded = useContext(EmbeddedContext);
  if (embedded)
    return (
      <span id={id} hidden>
        {children}
      </span>
    );
  const Heading = level === 1 ? 'h1' : 'h2';
  return (
    <Heading id={id} className={className}>
      {children}
    </Heading>
  );
}

export function Disclosure({
  id,
  title,
  status,
  open,
  onToggle,
  icon,
  children,
}: {
  id: string;
  title: string;
  /** Ligne d'état, lue avec le titre (« 8 propositions annoncées »). */
  status?: ReactNode;
  open: boolean;
  onToggle: () => void;
  icon?: ReactNode;
  children: ReactNode;
}) {
  const contentId = `${id}-contenu`;
  const buttonId = `${id}-bouton`;
  return (
    <section
      id={id}
      className={`rounded-card border bg-white shadow-card transition-[border-color,box-shadow] duration-200 dark:bg-slate-900 ${
        open
          ? 'border-republique-300 dark:border-republique-400/50'
          : 'border-slate-200/80 dark:border-slate-800'
      }`}
    >
      <h2 className="m-0">
        <button
          id={buttonId}
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={onToggle}
          className="group flex min-h-16 w-full items-center gap-3 rounded-card px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-republique-500 sm:px-5"
        >
          {icon && (
            <span
              aria-hidden="true"
              className={`inline-flex size-10 shrink-0 items-center justify-center rounded-2xl transition-colors ${
                open
                  ? 'bg-republique-600 text-white dark:bg-republique-500'
                  : 'bg-republique-50 text-republique-700 group-hover:bg-republique-100 dark:bg-republique-950 dark:text-republique-300'
              }`}
            >
              {icon}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block font-display text-xl leading-tight font-extrabold">{title}</span>
            {status && (
              <span className="mt-0.5 block font-sans text-sm font-normal text-slate-600 dark:text-slate-400">
                {status}
              </span>
            )}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={`size-5 shrink-0 text-slate-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </h2>
      {/* Région nommée par son bouton (motif « accordéon ») : exposée seulement dépliée. */}
      <div
        id={contentId}
        role="region"
        aria-labelledby={buttonId}
        hidden={!open}
        className="border-t border-slate-200 px-4 pt-4 pb-5 sm:px-5 dark:border-slate-800"
      >
        {open && <Embedded>{children}</Embedded>}
      </div>
    </section>
  );
}
