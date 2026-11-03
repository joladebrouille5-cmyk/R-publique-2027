import type { Progression } from '@r2027/shared';
import { CalendarCheck, Check, Lock } from 'lucide-react';
import { Link } from 'react-router';
import { useProgression } from '../api/hooks';
import { formatGameDate, formatShare } from '../labels';
import { ErrorMessage } from './ErrorMessage';
import { buttonPrimary, card } from './ui';

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
        <span className="font-display text-5xl leading-none font-bold text-or-600 dark:text-dorure">
          {niveau.numero}
        </span>
        <span>
          <span className="block font-display text-2xl leading-tight font-semibold">
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
        className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10"
      >
        <span
          className="block h-full rounded-full bg-or-500 dark:bg-dorure"
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
        <dl className="grid grid-cols-3 gap-3 text-center">
          {[
            ['Parties', String(data.parties)],
            ['Victoires', String(data.victoires)],
            [
              'Meilleur 1er tour',
              data.meilleurPremierTour === null ? '—' : share(data.meilleurPremierTour),
            ],
          ].map(([term, value]) => (
            <div key={term} className="rounded-2xl bg-slate-100 px-2 py-3 dark:bg-white/[0.05]">
              <dt className="text-xs text-slate-600 dark:text-slate-400">{term}</dt>
              <dd className="font-display text-2xl font-bold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <ul aria-label="Déblocages" className="space-y-2">
          {data.deblocages.map((d) => (
            <li key={d.id} className="flex items-start gap-2 text-sm">
              {d.debloque ? (
                <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              ) : (
                <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-700" />
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
      <section aria-labelledby="titre-defi" className={`${card} flex flex-col gap-4`}>
        <h3 id="titre-defi" className="flex items-center gap-2 text-xl">
          <CalendarCheck aria-hidden="true" className="size-5 text-or-600 dark:text-dorure" />
          Défi du jour
        </h3>
        <p className="text-slate-700 dark:text-slate-300">
          Même campagne pour tous ce {formatGameDate(defi.date)}, en format court. Votre score :
          votre part des voix au premier tour.
        </p>
        <p className="font-display text-4xl font-bold tabular-nums">
          {defi.meilleurScore === null ? 'Pas encore de score' : share(defi.meilleurScore)}
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {defi.tentatives === 0
            ? 'Aucune tentative aujourd’hui.'
            : `${plural(defi.tentatives, 'tentative')} aujourd’hui${defi.meilleurScore === null ? ', premier tour à venir' : ''}.`}
        </p>
        <Link to="/nouvelle-partie?defi=1" className={`${buttonPrimary} mt-auto self-start`}>
          Relever le défi
        </Link>
      </section>
    </div>
  );
}
