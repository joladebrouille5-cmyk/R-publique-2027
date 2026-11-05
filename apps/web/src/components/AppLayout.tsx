import { Settings } from 'lucide-react';
import { Link, Outlet, useMatch } from 'react-router';
import { useHealth } from '../api/hooks';
import { useAmbiance, useSoundEngine } from '../audio/hooks';
import { platform } from '../platform';
import { SoundToggle } from './SoundToggle';
import { ThemeToggle, useApplyTheme } from './ThemeToggle';

/**
 * État du serveur (web) ou du moteur local (application) : sur l'appareil, rien n'est affiché
 * quand le moteur fonctionne (phase 14, demande de l'utilisateur) ; seuls le démarrage et une
 * panne sont signalés. La version du moteur reste dans Paramètres.
 */
function ServerStatus() {
  const health = useHealth();
  const data = health.data;
  const ok = data?.status === 'ok';
  const local = platform().kind === 'local';
  if (local && ok) return null;
  const text = health.isPending
    ? local
      ? 'Démarrage du moteur local…'
      : 'Connexion au serveur…'
    : ok
      ? `Serveur connecté · moteur ${data.versions.engine}`
      : local
        ? 'Moteur local indisponible'
        : 'Serveur ou base de données indisponible';
  return (
    <p className="flex items-center gap-2" role="status">
      <span
        aria-hidden="true"
        className={`inline-block size-2 rounded-full ${health.isPending ? 'bg-slate-400' : ok ? 'bg-emerald-500' : 'bg-red-500'}`}
      />
      {text}
    </p>
  );
}

/**
 * Pastille de la marque (phase 21) : deux aplats d'encre, bleu et rouge, imprimés l'un sur
 * l'autre avec un léger décalage ; leur chevauchement donne l'encre de surimpression.
 */
export function Echarpe({ className = 'size-6' }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`relative inline-block shrink-0 ${className}`}>
      <span className="absolute top-0 left-0 size-[72%] bg-republique-600 dark:bg-republique-400" />
      <span className="absolute right-0 bottom-0 size-[72%] bg-red-500 mix-blend-multiply dark:bg-red-400 dark:mix-blend-screen" />
    </span>
  );
}

/** Marque : la pastille et le nom du jeu en grotesque d'affiche condensée. */
function Brand() {
  return (
    <Link
      to="/"
      className="flex items-center gap-2.5 rounded-md py-1 font-display text-[1.2rem] font-[850] tracking-[0.01em] whitespace-nowrap [font-stretch:72%] sm:text-[1.35rem]"
    >
      <Echarpe />
      RÉPUBLIQUE 2027
    </Link>
  );
}

export function AppLayout() {
  useApplyTheme();
  // Son (phase 19) : réglages et premier geste ; musique de l'écran-titre hors d'une partie.
  useSoundEngine();
  useAmbiance('accueil', 0);
  const { storageNotice } = platform();
  const inGame = useMatch('/parties/:gameId/*') !== null;
  // Phase 25 : le plateau est plein cadre, sur la feutrine ; son bandeau porte le son et la boîte
  // de jeu (Paramètres et accueil compris).
  const immersive = useMatch('/parties/:gameId/plateau') !== null;
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-slate-900"
      >
        Aller au contenu
      </a>
      {/* Fond sous la barre d'état de l'appareil : le contenu qui défile ne passe pas dessous. */}
      <div
        aria-hidden="true"
        className={`fixed inset-x-0 top-0 z-40 h-(--sat) ${immersive ? 'bg-feutrine' : 'bg-slate-50 dark:bg-slate-950'}`}
      />
      {!immersive && (
        <header className="border-b border-slate-200/80 pt-(--sat) pr-(--sar) pl-(--sal) dark:border-white/[0.07]">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 pt-3 pb-2 sm:gap-4">
            <Brand />
            <div className="flex items-center gap-0.5 sm:gap-2">
              <SoundToggle />
              <ThemeToggle />
              <Link
                to="/parametres"
                className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-bold text-slate-800 hover:bg-slate-200/70 dark:text-slate-200 dark:hover:bg-white/[0.08] dark:hover:text-white"
              >
                <Settings aria-hidden="true" className="size-5" />
                <span className="sr-only sm:not-sr-only">Paramètres</span>
              </Link>
            </div>
          </div>
        </header>
      )}
      <main id="contenu" className="flex-1">
        <Outlet />
      </main>
      <footer
        className={`border-t text-xs ${immersive ? 'border-white/10 bg-feutrine-3 pb-[calc(17rem+var(--sab))] text-craie-2 sm:pb-[calc(19.5rem+var(--sab))]' : `border-slate-200 text-slate-600 dark:border-white/[0.07] dark:text-slate-400 ${inGame ? 'max-lg:pb-[calc(6rem+var(--sab))]' : ''}`}`}
      >
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4 sm:flex-row sm:justify-between">
          <ServerStatus />
          <p>
            Simulation : les événements et résultats affichés sont simulés sauf mention contraire.
          </p>
        </div>
        {storageNotice && (
          <p
            className={`mx-auto max-w-7xl px-4 pb-3 ${immersive ? 'text-amber-300' : 'text-amber-800 dark:text-amber-300'}`}
          >
            {storageNotice}
          </p>
        )}
      </footer>
    </div>
  );
}
