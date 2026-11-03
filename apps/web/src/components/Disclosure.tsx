import { ChevronDown } from 'lucide-react';
import { createContext, useContext, type ReactNode } from 'react';
import { listPanel, screenTitle } from './ui';

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

/**
 * Groupe de sections dépliables (phase 16) : un seul panneau à filets, comme un sommaire de
 * dossiers, plutôt qu'une pile de cartes identiques.
 */
export function DisclosureGroup({ children }: { children: ReactNode }) {
  return <div className={listPanel}>{children}</div>;
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
      className={`relative scroll-mt-40 transition-colors duration-200 ${
        open ? 'bg-slate-50/80 dark:bg-white/[0.025]' : ''
      }`}
    >
      {/* Section ouverte : trait de surligneur sur le bord, comme une page marquée. */}
      <span
        aria-hidden="true"
        className={`absolute top-0 bottom-0 left-0 w-[5px] origin-top bg-or-400 transition-transform duration-300 ease-sortie dark:bg-dorure ${
          open ? 'scale-y-100' : 'scale-y-0'
        }`}
      />
      <h2 className="m-0">
        <button
          id={buttonId}
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={onToggle}
          className="group flex min-h-16 w-full items-center gap-4 px-4 py-3.5 text-left hover:bg-slate-100/70 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-republique-600 sm:px-6 dark:hover:bg-white/[0.035] dark:focus-visible:outline-dorure"
        >
          {icon && (
            <span
              aria-hidden="true"
              className={`inline-flex size-6 shrink-0 items-center justify-center transition-colors ${
                open
                  ? 'text-slate-950 dark:text-dorure'
                  : 'text-republique-600 group-hover:text-republique-700 dark:text-slate-400 dark:group-hover:text-slate-200'
              }`}
            >
              {icon}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[1.4rem] leading-tight font-[780] tracking-[-0.005em]">
              {title}
            </span>
            {status && (
              <span className="mt-0.5 block font-sans text-sm font-normal text-encre-2">
                {status}
              </span>
            )}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={`size-5 shrink-0 text-slate-500 transition-transform duration-300 ease-sortie dark:text-slate-400 ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </h2>
      {/* Région nommée par son bouton (motif « accordéon ») : exposée seulement dépliée. */}
      <div
        id={contentId}
        role="region"
        aria-labelledby={buttonId}
        hidden={!open}
        className="px-4 pt-1 pb-6 sm:px-6"
      >
        {open && <Embedded>{children}</Embedded>}
      </div>
    </section>
  );
}
