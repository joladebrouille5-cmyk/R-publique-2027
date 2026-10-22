import type { GameScreen } from '../screens/registry';
import { screenTitle } from './ui';

/** Écran prévu mais non implémenté : on l'annonce, sans aucune donnée factice. */
export function Unavailable({ screen }: { screen: GameScreen }) {
  return (
    <section aria-labelledby="titre-ecran" className="space-y-4">
      <h1 id="titre-ecran" className={screenTitle}>
        {screen.label}
      </h1>
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
        <p className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
          Non disponible — prévu en phase {screen.phase}
        </p>
        <p className="mt-3 text-slate-700 dark:text-slate-300">{screen.description}</p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Cet écran sera activé lorsque le moteur correspondant sera implémenté et testé.
        </p>
      </div>
    </section>
  );
}
