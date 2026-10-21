import { candidateName, type GameState, type MemberRef, type Ruleset } from '@r2027/shared';
import { Link } from 'react-router';
import { useRuleset } from '../api/hooks';
import { Badge } from '../components/Badge';
import { ErrorMessage } from '../components/ErrorMessage';
import { card } from '../components/ui';
import { formatGameDate } from '../labels';
import { useCurrentGame } from './GameLayout';

/** Nom d'un membre du gouvernement et nature affichée (jamais la couleur seule). */
export function memberInfo(state: GameState, ruleset: Ruleset, member: MemberRef) {
  if (member.nature === 'profil') {
    const profile = ruleset.quinquennat.profils.find((p) => p.id === member.ref);
    return {
      name: profile ? `${profile.prenom} ${profile.nom}` : member.ref,
      detail: profile ? `${profile.famille} — ${profile.parcours}` : null,
      badge: { tone: 'fictif' as const, text: 'Profil fictif' },
    };
  }
  const actor = state.actors[member.ref];
  if (!actor) return { name: member.ref, detail: null, badge: null };
  return {
    name: candidateName(actor.candidate),
    detail: actor.candidate.parti,
    badge:
      actor.candidate.nature === 'reel'
        ? { tone: 'simule' as const, text: 'Personnalité réelle — nomination simulée' }
        : actor.candidate.nature === 'fictif'
          ? { tone: 'fictif' as const, text: 'Candidat fictif' }
          : { tone: 'neutre' as const, text: 'Candidat de la partie' },
  };
}

function Member({
  state,
  ruleset,
  member,
}: {
  state: GameState;
  ruleset: Ruleset;
  member: MemberRef;
}) {
  const info = memberInfo(state, ruleset, member);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="font-medium">{info.name}</span>
      {info.badge && <Badge tone={info.badge.tone}>{info.badge.text}</Badge>}
    </span>
  );
}

function Content({ state, ruleset }: { state: GameState; ruleset: Ruleset }) {
  const q = state.quinquennat;
  if (!q) {
    return (
      <p className={`${card} text-sm`}>
        La présidentielle n’est pas encore jouée : le président élu nommera son Premier ministre à
        l’investiture, qui suit le second tour.
      </p>
    );
  }
  const president = state.actors[q.mandat.presidentId];
  const isPlayer = q.mandat.presidentId === state.player.actorId;
  const government = q.gouvernement;
  const pending = state.pendingDecisions.some((d) => d.kind === 'gouvernement');
  const postes = new Map(ruleset.quinquennat.postes.map((p) => [p.id, p.libelle]));
  const proposals = new Map(ruleset.programme.propositions.map((p) => [p.id, p.libelle]));

  return (
    <>
      <section aria-labelledby="titre-presidence" className={`${card} space-y-2 text-sm`}>
        <h2 id="titre-presidence" className="text-lg font-semibold">
          Présidence de la République
        </h2>
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">
            {president ? candidateName(president.candidate) : q.mandat.presidentId}
          </span>
          {isPlayer ? (
            <Badge tone="succes">Vous</Badge>
          ) : president?.candidate.nature === 'reel' ? (
            <Badge tone="simule">Personnalité réelle — présidence simulée</Badge>
          ) : (
            <Badge>Président(e) IA</Badge>
          )}
        </p>
        <p>
          Mandat n° {q.mandat.numero} du {formatGameDate(q.mandat.debut)} au{' '}
          {formatGameDate(q.mandat.fin)} (cinq ans, deux mandats consécutifs au plus : Constitution,
          art. 6).
        </p>
      </section>

      <section aria-labelledby="titre-gouvernement" className={`${card} space-y-3 text-sm`}>
        <h2 id="titre-gouvernement" className="text-lg font-semibold">
          {government ? `Gouvernement n° ${government.numero}` : 'Gouvernement'}
        </h2>
        {government ? (
          <>
            <p>Nommé la semaine du {formatGameDate(government.nommeLe)}.</p>
            <dl className="grid gap-2 sm:grid-cols-[14rem_1fr]">
              <dt className="text-slate-500 dark:text-slate-400">Premier ministre</dt>
              <dd>
                <Member state={state} ruleset={ruleset} member={government.premierMinistre} />
              </dd>
              {government.ministres.map((minister) => (
                <div key={minister.posteId} className="contents">
                  <dt className="text-slate-500 dark:text-slate-400">
                    {postes.get(minister.posteId) ?? minister.posteId}
                  </dt>
                  <dd>
                    <Member state={state} ruleset={ruleset} member={minister} />
                  </dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <p>
            Matignon est vacant :{' '}
            {pending
              ? 'nommez le Premier ministre depuis le tableau de bord.'
              : `le Premier ministre sera nommé la semaine de l’investiture (${formatGameDate(q.mandat.debut)}).`}
          </p>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Les personnalités réelles nommées ne prennent part au jeu que par une simulation : aucun
          propos ne leur est attribué. Les profils fictifs sont des personnages inventés.
        </p>
      </section>

      {q.anciensGouvernements.length > 0 && (
        <section aria-labelledby="titre-anciens" className={`${card} space-y-2 text-sm`}>
          <h2 id="titre-anciens" className="text-lg font-semibold">
            Gouvernements précédents
          </h2>
          <ul className="space-y-1">
            {q.anciensGouvernements.map((g) => (
              <li key={g.numero} className="flex flex-wrap items-center gap-2">
                <span>n° {g.numero} :</span>
                <Member state={state} ruleset={ruleset} member={g.premierMinistre} />
                <span className="text-slate-500 dark:text-slate-400">
                  du {formatGameDate(g.debut)} au {formatGameDate(g.fin)} ({g.motif})
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {q.refus.length > 0 && (
        <section aria-labelledby="titre-refus" className={`${card} space-y-2 text-sm`}>
          <h2 id="titre-refus" className="text-lg font-semibold">
            Refus (simulés)
          </h2>
          <ul className="list-inside list-disc">
            {q.refus.map((r) => (
              <li key={`${r.acteurId}-${r.semaine}`}>
                Semaine {r.semaine} :{' '}
                {state.actors[r.acteurId]
                  ? candidateName(state.actors[r.acteurId]!.candidate)
                  : r.acteurId}{' '}
                a décliné Matignon.
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="titre-feuille" className={`${card} space-y-2 text-sm`}>
        <h2 id="titre-feuille" className="text-lg font-semibold">
          Feuille de route
        </h2>
        {q.feuilleDeRoute.length > 0 ? (
          <ol className="list-inside list-decimal space-y-1">
            {q.feuilleDeRoute.map((id) => (
              <li key={id}>{proposals.get(id) ?? id}</li>
            ))}
          </ol>
        ) : (
          <p>
            Aucune proposition : le programme du président est vide (aucun programme n’est prêté à
            une personnalité réelle jouée par l’IA).
          </p>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Le gouvernement dépose ces propositions au Parlement, dans l’ordre ; seules celles que le
          Parlement adopte sont appliquées.{' '}
          <Link to="../parlement" className="underline">
            Parlement
          </Link>
        </p>
      </section>
    </>
  );
}

export function Government() {
  const game = useCurrentGame();
  const ruleset = useRuleset(game.rulesetVersion);
  return (
    <section aria-labelledby="titre-ecran-gouvernement" className="space-y-6">
      <h1 id="titre-ecran-gouvernement" className="text-2xl font-bold">
        Gouvernement
      </h1>
      {ruleset.isError && (
        <ErrorMessage error={ruleset.error} onRetry={() => void ruleset.refetch()} />
      )}
      {ruleset.isPending && <p>Chargement du jeu de règles…</p>}
      {ruleset.data && <Content state={game.state} ruleset={ruleset.data} />}
    </section>
  );
}
