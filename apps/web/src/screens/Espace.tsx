import type { GameDetail, Ruleset } from '@r2027/shared';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { useRuleset } from '../api/hooks';
import { Disclosure } from '../components/Disclosure';
import { Unavailable } from '../components/Unavailable';
import { screenTitle } from '../components/ui';
import { useCurrentGame } from './GameLayout';
import { GAME_SCREENS } from './registry';
import { SECTION_SCREENS, sectionStatus } from './sections';
import { SECTION_ICONS, type Hub } from './shell/navigation';

// Espace de la partie (phase 12) : un titre, puis les écrans de l'espace en sections
// dépliables. L'adresse `#section` (ou une ancienne adresse d'écran, redirigée ici) déplie la
// section et l'amène à l'écran.

const screens = new Map(GAME_SCREENS.map((s) => [s.path, s]));

/** Sections dépliées d'une page, ouvertes aussi par l'ancre de l'adresse. */
export function useOpenSections(paths: readonly string[]) {
  const { hash } = useLocation();
  const target = decodeURIComponent(hash.slice(1));
  const [open, setOpen] = useState<ReadonlySet<string>>(
    () => new Set(paths.includes(target) ? [target] : []),
  );
  // Nouvelle ancre : la section visée est dépliée (pendant le rendu, sans effet en cascade).
  const [handled, setHandled] = useState(target);
  if (handled !== target) {
    setHandled(target);
    if (paths.includes(target) && !open.has(target)) setOpen(new Set([...open, target]));
  }
  useEffect(() => {
    if (!paths.includes(target)) return;
    // Après le rendu du contenu : la section défile sous le bandeau de la partie.
    const frame = requestAnimationFrame(() =>
      document.getElementById(target)?.scrollIntoView({ block: 'start' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [target, paths]);
  const toggle = (path: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  /** Déplie une section et l'amène à l'écran, focus sur son titre (bouton). */
  const show = (path: string) => {
    setOpen((current) => (current.has(path) ? current : new Set([...current, path])));
    requestAnimationFrame(() => {
      const section = document.getElementById(path);
      section?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      section?.querySelector<HTMLElement>('button[aria-expanded]')?.focus({ preventScroll: true });
    });
  };
  return { open, toggle, show };
}

/** Section dépliable présentant un écran du registre. */
export function ScreenSection({
  path,
  game,
  ruleset,
  open,
  onToggle,
}: {
  path: string;
  game: GameDetail;
  ruleset: Ruleset | undefined;
  open: boolean;
  onToggle: () => void;
}) {
  const screen = screens.get(path)!;
  const Screen = SECTION_SCREENS[path]!;
  const Icon = SECTION_ICONS[path]!;
  return (
    <Disclosure
      id={path}
      title={screen.label}
      status={sectionStatus(path, game, ruleset) ?? screen.description}
      open={open}
      onToggle={onToggle}
      icon={<Icon className="size-5" strokeWidth={2} />}
    >
      {screen.available ? <Screen /> : <Unavailable screen={screen} />}
    </Disclosure>
  );
}

export function Espace({ hub }: { hub: Hub }) {
  const game = useCurrentGame();
  const ruleset = useRuleset(game.rulesetVersion, game.state.cycle);
  const { open, toggle } = useOpenSections(hub.sections);
  return (
    <section aria-labelledby="titre-espace" className="space-y-5">
      <div className="space-y-1">
        <h1 id="titre-espace" className={screenTitle}>
          {hub.titre}
        </h1>
        <p className="text-slate-600 dark:text-slate-400">{hub.intro}</p>
      </div>
      <div className="space-y-3">
        {hub.sections.map((path) => (
          <ScreenSection
            key={path}
            path={path}
            game={game}
            ruleset={ruleset.data}
            open={open.has(path)}
            onToggle={() => toggle(path)}
          />
        ))}
      </div>
    </section>
  );
}
