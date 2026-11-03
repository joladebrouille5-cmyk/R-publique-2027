import type { Progression } from '@r2027/shared';
import { CalendarCheck, Check, Lock } from 'lucide-react';
import { Link } from 'react-router';
import { useProgression } from '../api/hooks';
import { formatGameDate, formatShare } from '../labels';
import { ErrorMessage } from './ErrorMessage';
import { card } from './ui';

// Palmarès (phase 20) : niveau de joueur, résultats, déblocages et défi du jour, tels que le
// serveur (ou le moteur local) les calcule à partir des parties. Rien n'est recalculé ici.

const share = (value: number) => formatShare(Math.round(value * 10_000));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

function Level({ progression }: { progression: Progression }) {
  const { niveau, points } = progression;
  const next = niveau.suivant;
  const span = next ? next.points - niveau.points : 1;
  const done = next ? points - niveau.points : 1;
  return (
    <div className="space-y-3">
      <p className="flex items-baseline gap-3">
        <span className="font-display text-6xl leading-none font-black text-red-600 [font-stretch:110%] dark:text-red-400">
          {niveau.numero}
        </span>
        <span>
          <span className="block font-display text-2xl leading-tight font-[780] [font-stretch:80%]">
            {niveau.titre}
          </span>
          <span className="block text-sm text-slate-600 dark:text-slate-400">
            {plural(points, 'point')}
            {next ? `, ${next.points - points} avant « ${next.titre} »` : ', niveau le plus haut'}
          </span>
        </span>
      </p>
      <div
        role="meter"
        aria-label={next ? `Progression vers le niveau ${next.numero}` : 'Niveau le plus haut'}
        aria-valuemin={0}
        aria-valuemax={span}
        aria-valuenow={done}
        className="h-3 overflow-hidden border-[1.5px] border-slate-900 bg-papier dark:border-slate-200 dark:bg-transparent"
      >
        <span
          className="block h-full bg-or-400 dark:bg-dorure"
          style={{ width: `${Math.round((done / span) * 100)}%` }}
        />
      </div>
    </div>
  );
}

export function Palmares() {
  const progression = useProgression();
  if (progression.isPending) return <p>Chargement du palmarès…</p>;
  if (progression.isError)
    return <ErrorMessage error={progression.error} onRetry={() => void progression.refetch()} />;
  const data = progression.data;
  const { defi } = data;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section aria-labelledby="titre-niveau" className={`${card} space-y-5`}>
        <h3 id="titre-niveau" className="text-xl">
          Votre niveau
        </h3>
        <Level progression={data} />
        <dl className="grid grid-cols-3 divide-x divide-slate-300 border-y border-slate-300 dark:divide-white/15 dark:border-white/15">
          {[
            ['Parties', String(data.parties)],
            ['Victoires', String(data.victoires)],
            [
              'Meilleur 1er tour',
              data.meilleurPremierTour === null ? '—' : share(data.meilleurPremierTour),
            ],
          ].map(([term, value]) => (
            <div key={term} className="px-3 py-3 first:pl-0">
              <dt className="text-xs text-slate-600 dark:text-slate-400">{term}</dt>
              <dd className="font-display text-3xl font-black tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <ul aria-label="Déblocages" className="space-y-2">
          {data.deblocages.map((d) => (
            <li key={d.id} className="flex items-start gap-2 text-sm">
              {d.debloque ? (
                <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              ) : (
                <Lock
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400"
                />
              )}
              <span>
                <span className="font-semibold">{d.libelle}</span>
                {d.debloque
                  ? ' : débloqué'
                  : ` : ${d.condition.toLocaleLowerCase('fr-FR')} pour le débloquer`}
              </span>
            </li>
          ))}
        </ul>
      </section>
      {/* Le défi du jour : le tract rouge de la journée, imprimé en aplat. */}
      <section
        aria-labelledby="titre-defi"
        className="flex flex-col gap-4 rounded-card bg-red-700 p-4 text-white sm:p-6 dark:bg-red-800"
      >
        <h3 id="titre-defi" className="flex items-center gap-2 text-xl">
          <CalendarCheck aria-hidden="true" className="size-5" />
          Défi du jour
        </h3>
        <p className="text-white/95">
          Même campagne pour tous ce {formatGameDate(defi.date)}, en format court. Votre score :
          votre part des voix au premier tour.
        </p>
        <p className="font-display text-5xl leading-[0.95] font-black tabular-nums [font-stretch:78%]">
          {defi.meilleurScore === null ? 'Pas encore de score' : share(defi.meilleurScore)}
        </p>
        <p className="text-sm text-white/90">
          {defi.tentatives === 0
            ? 'Aucune tentative aujourd’hui.'
            : `${plural(defi.tentatives, 'tentative')} aujourd’hui${defi.meilleurScore === null ? ', premier tour à venir' : ''}.`}
        </p>
        <Link
          to="/nouvelle-partie?defi=1"
          className="mt-auto inline-flex min-h-11 items-center justify-center self-start rounded-md bg-papier px-5 py-2.5 font-display text-[0.95rem] font-bold text-red-700 [font-stretch:94%] transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.98] dark:text-red-800"
        >
          Relever le défi
        </Link>
      </section>
    </div>
  );
}
