import type { CouncilReport, GameState, MemberRef, Ruleset } from '@r2027/shared';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { useJournal, useRuleset } from '../api/hooks';
import { Avatar } from '../components/Avatar';
import { Badge } from '../components/Badge';
import { ScreenHeading } from '../components/Disclosure';
import { ErrorMessage } from '../components/ErrorMessage';
import { InfoPopover } from '../components/InfoPopover';
import { card } from '../components/ui';
import { useCurrentGame } from './GameLayout';
import { memberInfo } from './Government';

// Conseil des ministres (phase 15 ; Constitution, art. 9 : le président préside le Conseil des
// ministres ; rythme hebdomadaire : usage). Pour chaque membre du gouvernement : popularité
// prêtée (hypothèse du jeu, jamais un sondage) et loyauté envers le président, avec la variation
// de la semaine et ses facteurs, faits relevés par le moteur, départs simulés et alertes. Tout est
// lu dans l'état et le bilan servis par l'API ; aucun propos n'est rapporté.

type Track = CouncilReport['ministres'][number]['popularite'];

const signed = (value: number, unit = '') =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}${unit}`;

function Variation({ track, unit, scale }: { track: Track; unit: string; scale: number }) {
  const delta = (track.apres - track.avant) / scale;
  if (delta === 0)
    return <span className="text-xs text-slate-500 dark:text-slate-400">stable</span>;
  const Icon = delta > 0 ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
        delta > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'
      }`}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {signed(Math.round(delta * 10) / 10, unit)}
    </span>
  );
}

function Factors({ track, scale, unit }: { track: Track; scale: number; unit: string }) {
  return (
    <ul className="space-y-1">
      {track.facteurs.map((f) => (
        <li key={f.label} className="flex justify-between gap-3">
          <span>{f.label}</span>
          <span className="shrink-0 font-semibold tabular-nums">
            {signed(Math.round((f.value / scale) * 100) / 100, unit)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Content({
  state,
  ruleset,
  report,
}: {
  state: GameState;
  ruleset: Ruleset;
  report: CouncilReport | null;
}) {
  const q = state.quinquennat;
  const government = q?.gouvernement;
  if (!q || !government)
    return (
      <p className={`${card} text-sm`}>
        {q
          ? 'Matignon est vacant : le Conseil des ministres se réunira une fois le gouvernement nommé.'
          : 'Le Conseil des ministres se réunit pendant le quinquennat, une fois le gouvernement nommé.'}
      </p>
    );
  const postes = new Map(ruleset.quinquennat.postes.map((p) => [p.id, p.libelle]));
  const members: { member: MemberRef; posteId: string | null }[] = [
    { member: government.premierMinistre, posteId: null },
    ...government.ministres.map((m) => ({ member: m, posteId: m.posteId })),
  ];
  const { loyauteMax, populariteMax } = ruleset.quinquennat.suivi.depart;
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {report
          ? 'Compte rendu du dernier Conseil des ministres. '
          : Object.keys(q.suivi).length > 0
            ? 'Le compte rendu du dernier Conseil n’est pas dans le journal récent de la partie (partie importée ou reprise) : voici l’état du gouvernement. '
            : 'Le premier Conseil des ministres se tiendra à la fin de la semaine. '}
        Popularité prêtée et loyauté : hypothèses du jeu (jamais un sondage). Sous {loyauteMax}/100
        de loyauté ou {Math.round(populariteMax / 100)} % de popularité prêtée, un départ simulé
        devient possible.
      </p>
      {report && report.departs.length > 0 && (
        <section aria-labelledby="titre-departs" className={`${card} space-y-1 text-sm`}>
          <h2 id="titre-departs" className="font-semibold">
            Départs de la semaine
          </h2>
          <ul className="list-inside list-disc">
            {report.departs.map((d) => (
              <li key={d.ref}>
                {memberInfo(state, ruleset, d).name} ({postes.get(d.posteId) ?? d.posteId}) :{' '}
                {d.motif}
              </li>
            ))}
          </ul>
        </section>
      )}
      {report && report.alertes.length > 0 && (
        <ul className="space-y-1 text-sm" aria-label="Alertes du Conseil">
          {report.alertes.map((a) => (
            <li
              key={a}
              className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100"
            >
              {a}
            </li>
          ))}
        </ul>
      )}
      <ul className="grid gap-2.5 md:grid-cols-2" aria-label="Membres du gouvernement">
        {members.map(({ member, posteId }) => {
          const info = memberInfo(state, ruleset, member);
          const track = q.suivi[member.ref];
          const entry = report?.ministres.find((m) => m.ref === member.ref);
          return (
            <li key={member.ref} className={`${card} space-y-2 text-sm`}>
              <div className="flex items-center gap-3">
                {info.portrait && <Avatar portrait={info.portrait} size="md" />}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{info.name}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {posteId ? postes.get(posteId) : 'Premier ministre'}
                    {track ? ` · en poste depuis la semaine ${track.depuis}` : ''}
                  </p>
                </div>
              </div>
              {track ? (
                <dl className="grid grid-cols-2 gap-2">
                  <div>
                    <dt className="text-xs text-slate-500 dark:text-slate-400">
                      Popularité prêtée
                    </dt>
                    <dd className="flex items-center gap-1.5">
                      <span className="font-display text-lg font-bold tabular-nums">
                        {Math.round(track.popularite / 100)} %
                      </span>
                      {entry && <Variation track={entry.popularite} unit=" pt" scale={100} />}
                      {entry && entry.popularite.facteurs.length > 0 && (
                        <InfoPopover
                          label={`Facteurs de la popularité prêtée : ${info.name}`}
                          title={`Popularité prêtée : ${info.name}`}
                          className="-my-2"
                        >
                          <Factors track={entry.popularite} scale={100} unit=" pt" />
                        </InfoPopover>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500 dark:text-slate-400">Loyauté</dt>
                    <dd className="flex items-center gap-1.5">
                      <span className="font-display text-lg font-bold tabular-nums">
                        {track.loyaute}/100
                      </span>
                      {entry && <Variation track={entry.loyaute} unit="" scale={1} />}
                      {entry && entry.loyaute.facteurs.length > 0 && (
                        <InfoPopover
                          label={`Facteurs de la loyauté : ${info.name}`}
                          title={`Loyauté : ${info.name}`}
                          className="-my-2"
                        >
                          <Factors track={entry.loyaute} scale={1} unit="" />
                        </InfoPopover>
                      )}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Suivi ouvert au prochain Conseil des ministres.
                </p>
              )}
              {entry && entry.faits.length > 0 && (
                <ul className="space-y-0.5 text-xs text-slate-600 dark:text-slate-400">
                  {entry.faits.map((fait) => (
                    <li key={fait}>• {fait}</li>
                  ))}
                </ul>
              )}
              {track && (track.loyaute <= loyauteMax || track.popularite <= populariteMax) && (
                <Badge tone="danger">Départ possible</Badge>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Constitution, art. 9 : le président de la République préside le Conseil des ministres ; son
        rythme hebdomadaire est un usage. Nominations, départs et faits sont simulés ; aucun propos
        n’est attribué aux personnalités réelles.
      </p>
    </div>
  );
}

export function Conseil() {
  const game = useCurrentGame();
  const ruleset = useRuleset(game.rulesetVersion, game.state.cycle);
  const journal = useJournal(game.id);
  const report =
    journal.data?.pages[0]?.entries.find((entry) => entry.report?.conseil)?.report?.conseil ?? null;
  return (
    <section aria-labelledby="titre-ecran-conseil" className="space-y-6">
      <ScreenHeading id="titre-ecran-conseil">Conseil des ministres</ScreenHeading>
      {ruleset.isError && (
        <ErrorMessage error={ruleset.error} onRetry={() => void ruleset.refetch()} />
      )}
      {ruleset.isPending && <p>Chargement du jeu de règles…</p>}
      {ruleset.data && <Content state={game.state} ruleset={ruleset.data} report={report} />}
    </section>
  );
}
