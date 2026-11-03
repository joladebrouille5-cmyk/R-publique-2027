import type { GameDetail, Ruleset } from '@r2027/shared';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { useRuleset } from '../api/hooks';
import { Disclosure, DisclosureGroup } from '../components/Disclosure';
import { Unavailable } from '../components/Unavailable';
import { screenTitle } from '../components/ui';
import { useCurrentGame } from './GameLayout';
import { MandateOverview, MandateOverviewShown, showsMandate } from './pouvoir/MandateOverview';
import { GAME_SCREENS } from './registry';
import { SECTION_SCREENS, sectionStatus } from './sections';
import { mergedSection, SECTION_ICONS, sectionOf, type Hub } from './shell/navigation';

// Espace de la partie (phase 12) : un titre, puis les écrans de l'espace en sections
// dépliables. L'adresse `#section` (ou une ancienne adresse d'écran, redirigée ici) déplie la
// section et l'amène à l'écran.

const screens = new Map(GAME_SCREENS.map((s) => [s.path, s]));

/**
 * Sections dépliées d'une page, ouvertes aussi par l'ancre de l'adresse. L'ancre d'un écran
 * présenté dans une section commune (phase 20, `#resultats`) déplie cette section et amène
 * l'écran à la vue. Une page d'une seule section l'ouvre d'emblée.
 */
export function useOpenSections(paths: readonly string[]) {
  const { hash } = useLocation();
  const target = decodeURIComponent(hash.slice(1));
  const targetSection = target ? sectionOf(target) : '';
  const [open, setOpen] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        paths.includes(targetSection) ? [targetSection] : paths.length === 1 ? [paths[0]!] : [],
      ),
  );
  // Nouvelle ancre : la section visée est dépliée (pendant le rendu, sans effet en cascade).
  const [handled, setHandled] = useState(target);
  if (handled !== target) {
    setHandled(target);
    if (paths.includes(targetSection) && !open.has(targetSection))
      setOpen(new Set([...open, targetSection]));
  }
  useEffect(() => {
    if (!paths.includes(targetSection)) return;
    // Après le rendu du contenu : la section (ou l'écran visé) défile sous le bandeau.
    const frame = requestAnimationFrame(() =>
      document.getElementById(target)?.scrollIntoView({ block: 'start' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [target, targetSection, paths]);
  const toggle = (path: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  /**
   * Déplie une section et l'amène à l'écran, focus sur son titre (bouton) ; l'écran d'une section
   * commune est amené lui-même à la vue.
   */
  const show = (path: string) => {
    const section = sectionOf(path);
    setOpen((current) => (current.has(section) ? current : new Set([...current, section])));
    requestAnimationFrame(() => {
      document.getElementById(path)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      document
        .getElementById(section)
        ?.querySelector<HTMLElement>('button[aria-expanded]')
        ?.focus({ preventScroll: true });
    });
  };
  return { open, toggle, show };
}

/** Écran du registre, ou avis d'indisponibilité. */
function ScreenBody({ path }: { path: string }) {
  const screen = screens.get(path)!;
  const Screen = SECTION_SCREENS[path]!;
  return screen.available ? <Screen /> : <Unavailable screen={screen} />;
}

/** Section dépliable présentant un écran du registre, ou plusieurs (section commune). */
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
  const Icon = SECTION_ICONS[path]!;
  const merged = mergedSection(path);
  if (merged)
    return (
      <Disclosure
        id={path}
        title={merged.label}
        status={sectionStatus(path, game, ruleset)}
        open={open}
        onToggle={onToggle}
        icon={<Icon className="size-5" strokeWidth={2} />}
      >
        <div className="space-y-8">
          {merged.parts.map((part, index) => (
            // Un simple bloc : l'écran intégré est lui-même une région nommée par son titre.
            <div
              key={part}
              id={part}
              className={`scroll-mt-40 space-y-3 ${
                index > 0 ? 'border-t border-slate-200 pt-6 dark:border-slate-800' : ''
              }`}
            >
              <h2 id={`${part}-partie`} className="font-display text-xl">
                {screens.get(part)!.label}
              </h2>
              <ScreenBody path={part} />
            </div>
          ))}
        </div>
      </Disclosure>
    );
  const screen = screens.get(path)!;
  return (
    <Disclosure
      id={path}
      title={screen.label}
      status={sectionStatus(path, game, ruleset) ?? screen.description}
      open={open}
      onToggle={onToggle}
      icon={<Icon className="size-5" strokeWidth={2} />}
    >
      <ScreenBody path={path} />
    </Disclosure>
  );
}

export function Espace({ hub }: { hub: Hub }) {
  const game = useCurrentGame();
  const ruleset = useRuleset(game.rulesetVersion, game.state.cycle);
  const { open, toggle, show } = useOpenSections(hub.sections);
  const overview = hub.path === 'pouvoir' && ruleset.data !== undefined && showsMandate(game.state);
  return (
    <section aria-labelledby="titre-espace" className="space-y-5">
      <div className="space-y-1">
        <h1 id="titre-espace" className={screenTitle}>
          {hub.titre}
        </h1>
        <p className="text-slate-600 dark:text-slate-400">{hub.intro}</p>
      </div>
      {/* Phase 13 : l'essentiel du mandat, toujours visible, en tête de l'espace Pouvoir. */}
      {overview && ruleset.data && (
        <MandateOverview state={game.state} ruleset={ruleset.data} onShow={show} />
      )}
      <MandateOverviewShown.Provider value={overview}>
        <DisclosureGroup>
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
        </DisclosureGroup>
      </MandateOverviewShown.Provider>
    </section>
  );
}
