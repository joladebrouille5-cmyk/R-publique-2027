import {
  candidateName,
  memberExpertise,
  memberPostCompetence,
  type GameState,
  type GovernmentFigure,
  type MemberRef,
  type Ruleset,
} from '@r2027/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { useRuleset } from '../api/hooks';
import { Avatar } from '../components/Avatar';
import { Badge, type BadgeTone } from '../components/Badge';
import { Drawer } from '../components/Drawer';
import { ErrorMessage } from '../components/ErrorMessage';
import {
  expertiseLabel,
  FigureFilterBar,
  figureExpertiseOf,
  matchesFigure,
  NO_FILTER,
} from '../components/FigureFilter';
import { buttonSecondary, card } from '../components/ui';
import { mainFunction } from '../figures';
import { formatGameDate } from '../labels';
import { portraitOf, portraitOfPersonality, portraitOfProfile, type Portrait } from '../portraits';
import { useCurrentGame } from './GameLayout';
import { ScreenHeading } from '../components/Disclosure';

const pct = (value: number) => `${Math.round(value * 100)} %`;

export { mainFunction };

type MemberInfo = {
  name: string;
  detail: string | null;
  badge: { tone: BadgeTone; text: string } | null;
  portrait: Portrait | null;
  /** Compétence affichée et sa nature (estimation pour une figure, paramètre de jeu sinon). */
  competence: { value: number; tone: BadgeTone; label: string } | null;
};

/** Nom d'un membre du gouvernement et nature affichée (jamais la couleur seule). */
export function memberInfo(state: GameState, ruleset: Ruleset, member: MemberRef): MemberInfo {
  if (member.nature === 'profil') {
    const profile = ruleset.quinquennat.profils.find((p) => p.id === member.ref);
    return {
      name: profile ? `${profile.prenom} ${profile.nom}` : member.ref,
      detail: profile ? `${profile.famille} — ${profile.parcours}` : null,
      badge: { tone: 'fictif', text: 'Profil fictif' },
      portrait: profile ? portraitOfProfile(profile, ruleset) : null,
      competence: profile
        ? { value: profile.competence, tone: 'neutre', label: 'Paramètre du jeu' }
        : null,
    };
  }
  if (member.nature === 'figure') {
    const figure = ruleset.figures.figures.find((f) => f.id === member.ref);
    if (!figure)
      return { name: member.ref, detail: null, badge: null, portrait: null, competence: null };
    return {
      name: `${figure.prenom} ${figure.nom}`,
      detail: `${figure.parti} — ${mainFunction(figure)}`,
      badge: { tone: 'simule', text: 'Personnalité réelle — nomination simulée' },
      portrait: portraitOfPersonality(figure, ruleset),
      competence: { value: figure.competence.valeur, tone: 'alerte', label: 'Estimation' },
    };
  }
  const actor = state.actors[member.ref];
  if (!actor)
    return { name: member.ref, detail: null, badge: null, portrait: null, competence: null };
  return {
    name: candidateName(actor.candidate),
    detail: actor.candidate.parti,
    badge:
      actor.candidate.nature === 'reel'
        ? { tone: 'simule', text: 'Personnalité réelle — nomination simulée' }
        : actor.candidate.nature === 'fictif'
          ? { tone: 'fictif', text: 'Candidat fictif' }
          : { tone: 'neutre', text: 'Candidat de la partie' },
    portrait: portraitOf(actor, ruleset),
    competence: {
      value: ruleset.quinquennat.equipe.competenceActeur,
      tone: 'neutre',
      label: 'Paramètre du jeu',
    },
  };
}

/**
 * Compétence sur le poste et expertise qui la fonde (règle partagée avec le moteur) ; null
 * sans expertise sur ce poste.
 */
export function postExpertiseInfo(
  ruleset: Ruleset,
  member: MemberRef,
  posteId: string,
): { competence: number; fonction: string; enCours: boolean } | null {
  const expertise = memberExpertise(ruleset, member).find((e) => e.posteId === posteId);
  if (!expertise) return null;
  return {
    competence: memberPostCompetence(ruleset, member, posteId),
    fonction: expertise.fonction,
    enCours: expertise.enCours,
  };
}

function Member({
  state,
  ruleset,
  member,
  posteId = null,
}: {
  state: GameState;
  ruleset: Ruleset;
  member: MemberRef;
  /** Poste occupé (ministre) : compétence sur ce poste et expertise affichées. */
  posteId?: string | null;
}) {
  const info = memberInfo(state, ruleset, member);
  const expertise = posteId ? postExpertiseInfo(ruleset, member, posteId) : null;
  return (
    <span className="flex items-start gap-3">
      {info.portrait && <Avatar portrait={info.portrait} size="sm" />}
      <span className="min-w-0 space-y-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{info.name}</span>
          {info.badge && <Badge tone={info.badge.tone}>{info.badge.text}</Badge>}
        </span>
        {(info.detail || info.competence) && (
          <span className="block text-xs text-slate-600 dark:text-slate-400">
            {info.detail}
            {info.detail && info.competence && ' · '}
            {info.competence && (
              <>
                Compétence {pct(info.competence.value)}
                {expertise && `, ${pct(expertise.competence)} sur ce poste`}{' '}
                <Badge tone={info.competence.tone}>{info.competence.label}</Badge>
              </>
            )}
          </span>
        )}
        {expertise && (
          <span className="block text-xs text-emerald-800 dark:text-emerald-300">
            Expertise : {expertise.fonction}
            {expertise.enCours ? '' : ' (fonction passée)'}
          </span>
        )}
      </span>
    </span>
  );
}

/** Nom d'une personne sollicitée (acteur ou figure), pour les refus. */
function solicitedName(state: GameState, ruleset: Ruleset, id: string): string {
  const actor = state.actors[id];
  if (actor) return candidateName(actor.candidate);
  const figure = ruleset.figures.figures.find((f) => f.id === id);
  return figure ? `${figure.prenom} ${figure.nom}` : id;
}

/**
 * Personnalités réelles nominables (phase 11 ; vivier élargi en phase 14) : fiches du jeu de
 * règles, par parti, avec recherche et filtres (parti, ministère d'expertise). Fonctions relevées
 * dans les sources ; compétence estimée ; expertise ministérielle ; aucun propos. La liste
 * s'ouvre dans un tiroir.
 */
function Figures({ ruleset }: { ruleset: Ruleset }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState(NO_FILTER);
  const all = ruleset.figures.figures;
  const shown = all.filter((f) => matchesFigure(ruleset, f, filter));
  const parties = new Map<string, GovernmentFigure[]>();
  for (const f of shown) parties.set(f.parti, [...(parties.get(f.parti) ?? []), f]);
  const partyCount = new Set(all.map((f) => f.parti)).size;
  const count = `${all.length} personnalités de ${partyCount} partis`;
  return (
    <section aria-labelledby="titre-figures" className={`${card} space-y-3 text-sm`}>
      <h2 id="titre-figures" className="text-lg font-semibold">
        Personnalités nominables
      </h2>
      <p className="text-slate-600 dark:text-slate-400">
        Outre les candidats de la partie et les profils fictifs, le président peut solliciter ces
        personnalités réelles pour Matignon ou un ministère ; le Premier ministre les place là où
        elles sont expertes. Leur réponse est simulée : une personnalité éloignée du président peut
        refuser.
      </p>
      <button type="button" className={buttonSecondary} onClick={() => setOpen(true)}>
        Voir les {count}
      </button>
      {open && (
        <Drawer
          title="Personnalités nominables"
          subtitle={`${count} ; fonctions relevées dans les sources, compétence estimée, expertise d’après les fonctions ministérielles.`}
          onClose={() => setOpen(false)}
        >
          <div className="space-y-4 text-sm">
            <FigureFilterBar
              ruleset={ruleset}
              value={filter}
              onChange={setFilter}
              shown={shown.length}
              total={all.length}
              idPrefix="vivier"
            />
            {shown.length === 0 && (
              <p>Aucune personnalité ne répond à ces critères : élargissez la recherche.</p>
            )}
            {[...parties].map(([parti, figures]) => (
              <div key={parti} className="space-y-2">
                <h3 className="font-semibold">{parti}</h3>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {figures.map((f) => {
                    const expertise = figureExpertiseOf(ruleset, f.id);
                    return (
                      <li
                        key={f.id}
                        aria-label={`${f.prenom} ${f.nom}`}
                        className="flex items-start gap-3 rounded-lg border border-slate-200 p-2 dark:border-slate-800"
                      >
                        <Avatar portrait={portraitOfPersonality(f, ruleset)} size="sm" />
                        <span className="min-w-0 space-y-0.5">
                          <span className="block font-medium">
                            {f.prenom} {f.nom}
                          </span>
                          <span className="block text-xs text-slate-600 dark:text-slate-400">
                            {mainFunction(f)}
                          </span>
                          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                            <span className="inline-flex items-center gap-1">
                              Compétence {pct(f.competence.valeur)}{' '}
                              <Badge tone="alerte">Estimation</Badge>
                            </span>
                            <span>Notoriété {f.notoriete.niveau}/3</span>
                          </span>
                          {expertise.length > 0 && (
                            <span className="block text-xs text-emerald-800 dark:text-emerald-300">
                              Expertise :{' '}
                              {expertise.map((e) => expertiseLabel(ruleset, e)).join(', ')}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </Drawer>
      )}
    </section>
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
                    <Member
                      state={state}
                      ruleset={ruleset}
                      member={minister}
                      posteId={minister.posteId}
                    />
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
          propos ne leur est attribué ; leur compétence est une estimation tirée des fonctions
          exercées ; une fonction ministérielle du domaine d’un poste (passée ou présente) y ajoute
          une expertise (hypothèse de jeu). Les profils fictifs sont des personnages inventés. La
          compétence du Premier ministre et celle des ministres sur leur poste pèsent sur l’action
          du gouvernement, la gestion des crises et la censure ; un groupe non allié représenté au
          gouvernement soutient davantage les textes.
        </p>
      </section>

      <Figures ruleset={ruleset} />

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
              <li key={`${r.acteurId}-${r.semaine}-${r.posteId}`}>
                Semaine {r.semaine} : {solicitedName(state, ruleset, r.acteurId)} a décliné{' '}
                {r.posteId === 'premier-ministre'
                  ? 'Matignon'
                  : `le ministère « ${postes.get(r.posteId) ?? r.posteId} »`}
                .
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
  const ruleset = useRuleset(game.rulesetVersion, game.state.cycle);
  return (
    <section aria-labelledby="titre-ecran-gouvernement" className="space-y-6">
      <ScreenHeading id="titre-ecran-gouvernement">Gouvernement</ScreenHeading>
      {ruleset.isError && (
        <ErrorMessage error={ruleset.error} onRetry={() => void ruleset.refetch()} />
      )}
      {ruleset.isPending && <p>Chargement du jeu de règles…</p>}
      {ruleset.data && <Content state={game.state} ruleset={ruleset.data} />}
    </section>
  );
}
