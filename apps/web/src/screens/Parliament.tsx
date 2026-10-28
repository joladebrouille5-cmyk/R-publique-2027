import {
  candidateName,
  groupOfActor,
  type Alignment,
  type Bill,
  type GameState,
  type OppositionIntervention,
  type Ruleset,
} from '@r2027/shared';
import { useContext } from 'react';
import { useRuleset } from '../api/hooks';
import { Badge, type BadgeTone } from '../components/Badge';
import { ErrorMessage } from '../components/ErrorMessage';
import { colorOf, Hemicycle, seatingOrder } from '../components/Hemicycle';
import { MajorityGauge, TensionFactors, TensionGauge } from '../components/ParliamentGauges';
import { card } from '../components/ui';
import { useCurrentGame } from './GameLayout';
import { MandateOverviewShown } from './pouvoir/MandateOverview';
import { ScreenHeading } from '../components/Disclosure';

const ALIGNMENT_LABELS: Record<Alignment, { text: string; tone: BadgeTone }> = {
  soutien: { text: 'Soutien', tone: 'succes' },
  independant: { text: 'Non aligné', tone: 'neutre' },
  opposition: { text: 'Opposition', tone: 'danger' },
};

const STAGE_LABELS: Record<Bill['etape'], string> = {
  commission: 'En commission',
  seance: 'En séance',
  navette: 'Au Sénat (navette)',
  lecture_definitive: 'Lecture définitive à l’Assemblée',
  adopte: 'Adopté',
  rejete: 'Rejeté',
  retire: 'Retiré',
};

const STATUS_LABELS = { estimation: 'Position estimée', hypothese: 'Position supposée' };

const rebels = (vote: Bill['votes'][number]) =>
  Object.values(vote.parGroupe).reduce((sum, g) => sum + g.frondeurs, 0);

/** Intervention de l'opposition à un vote clé, telle que l'a simulée le moteur (aucun propos). */
export function interventionText(
  state: GameState,
  ruleset: Ruleset,
  intervention: OppositionIntervention,
): string {
  const sigle =
    ruleset.assemblee.groupes.find((g) => g.id === intervention.groupe)?.sigle ??
    intervention.groupe;
  const leader = intervention.meneur ? state.actors[intervention.meneur] : undefined;
  return leader
    ? `${candidateName(leader.candidate)} (personnage fictif) mène l’offensive de l’opposition (${sigle}) auprès des groupes non alignés`
    : `Le groupe ${sigle} mène l’offensive de l’opposition auprès des groupes non alignés`;
}

function BillCard({ bill, state, ruleset }: { bill: Bill; state: GameState; ruleset: Ruleset }) {
  const proposal = ruleset.programme.propositions.find((p) => p.id === bill.propositionId);
  const groups = new Map(ruleset.assemblee.groupes.map((g) => [g.id, g]));
  const reform = state.parlement!.reformes.find((r) => r.texteId === bill.id);
  const finished = bill.issue !== null;
  return (
    <li
      className={`${card} space-y-2 text-sm`}
      aria-label={proposal?.libelle ?? bill.propositionId}
    >
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{proposal?.libelle ?? bill.propositionId}</span>
        <Badge
          tone={bill.etape === 'adopte' ? 'succes' : bill.etape === 'rejete' ? 'danger' : 'neutre'}
        >
          {STAGE_LABELS[bill.etape]}
        </Badge>
        {bill.procedure === '49-3' && <Badge tone="alerte">Article 49 alinéa 3</Badge>}
        {bill.concessions > 0 && <Badge>{bill.concessions} concession(s)</Badge>}
        {bill.frondeursNegocies && <Badge>Négocié avec les frondeurs</Badge>}
      </p>
      <p className="text-slate-600 dark:text-slate-400">
        Déposé en semaine {bill.deposeSemaine}
        {finished
          ? ` ; ${bill.issue!.motif} en semaine ${bill.issue!.semaine}.`
          : ` ; prochaine étape en semaine ${bill.echeance}.`}
        {reform &&
          (reform.appliquee
            ? ` En vigueur depuis la semaine ${reform.vigueurSemaine}.`
            : ` Entrée en vigueur prévue en semaine ${reform.vigueurSemaine} (délai de la mesure).`)}
      </p>
      {bill.votes.map((vote) => (
        <div
          key={`${vote.lecture}-${vote.semaine}`}
          className="overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label={`Votes ${vote.lecture === 'premiere' ? 'en première lecture' : 'en lecture définitive'}, tableau défilant`}
        >
          <table className="w-full min-w-[22rem] text-left text-xs">
            <caption className="mb-1 text-left font-medium">
              {vote.lecture === 'premiere' ? 'Première lecture' : 'Lecture définitive'} (semaine{' '}
              {vote.semaine}) : {vote.adopte ? 'adopté' : 'rejeté'}, {vote.pour} pour, {vote.contre}{' '}
              contre, {vote.abstention} abstentions
              {rebels(vote) > 0 && ` (dont ${rebels(vote)} frondeur(s) de la majorité contre)`} —
              votes de groupe simulés
              {vote.intervention && (
                <span className="mt-0.5 block font-normal text-amber-800 dark:text-amber-300">
                  Vote clé : {interventionText(state, ruleset, vote.intervention)} (simulé).
                </span>
              )}
            </caption>
            <thead>
              <tr>
                <th scope="col">Groupe</th>
                <th scope="col">Pour</th>
                <th scope="col">Contre</th>
                <th scope="col">Abstention</th>
                <th scope="col">Frondeurs</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(vote.parGroupe).map(([id, v]) => (
                <tr key={id}>
                  <th scope="row" className="font-normal">
                    <span
                      aria-hidden="true"
                      className={`mr-1.5 inline-block size-2 rounded-full ${colorOf(id).swatch}`}
                    />
                    {groups.get(id)?.sigle ?? id}
                  </th>
                  <td className="tabular-nums">{v.pour}</td>
                  <td className="tabular-nums">{v.contre}</td>
                  <td className="tabular-nums">{v.abstention}</td>
                  <td className="tabular-nums">{v.frondeurs > 0 ? v.frondeurs : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {bill.censure && (
        <p>
          Motion de censure (semaine {bill.censure.semaine}) : {bill.censure.pour} voix pour,{' '}
          {bill.censure.majorite} requises —{' '}
          {bill.censure.adoptee ? 'adoptée, le gouvernement est renversé' : 'rejetée'}.
          {bill.censure.intervention &&
            ` ${interventionText(state, ruleset, bill.censure.intervention)} (simulé).`}
        </p>
      )}
    </li>
  );
}

function Content({ state, ruleset }: { state: GameState; ruleset: Ruleset }) {
  const overview = useContext(MandateOverviewShown);
  const parliament = state.parlement;
  if (!parliament) {
    return (
      <p className={`${card} text-sm`}>
        L’Assemblée nationale entre en jeu avec le quinquennat, après l’élection présidentielle.
      </p>
    );
  }
  const campaign = state.quinquennat === null;
  const seatsOf = (alignment: Alignment) =>
    Object.values(parliament.groupes)
      .filter((g) => g.alignement === alignment)
      .reduce((sum, g) => sum + g.sieges, 0);
  const assembly = ruleset.assemblee;
  const textes = [...parliament.textes].reverse();
  const playerActor = state.player.actorId ? state.actors[state.player.actorId] : undefined;
  const mine = playerActor ? groupOfActor(ruleset, playerActor) : null;
  const coalition = parliament.coalition;
  const coalitionBloc = coalition
    ? (ruleset.legislatives.blocs.find((b) => b.id === coalition.bloc)?.libelle ?? coalition.bloc)
    : null;

  return (
    <>
      {campaign && (
        <p className={`${card} text-sm`}>
          Campagne présidentielle en cours : le Parlement n’est pas simulé (simplification du jeu).
          Il reprend avec le quinquennat suivant, dans sa composition actuelle.
        </p>
      )}
      <section aria-labelledby="titre-assemblee" className={`${card} space-y-3 text-sm`}>
        <h2 id="titre-assemblee" className="text-lg font-semibold">
          Assemblée nationale ({assembly.legislature}e législature)
        </h2>
        <p>
          Soutiens du président : {seatsOf('soutien')} sièges ; non alignés :{' '}
          {seatsOf('independant')} ; opposition : {seatsOf('opposition')}.
          {coalition &&
            ` Coalition de gouvernement avec le bloc « ${coalitionBloc} » depuis la semaine ${coalition.depuis} (simulée).`}
        </p>
        {overview ? (
          // Vue du mandat affichée en tête de l'espace : pas de second hémicycle ici.
          <div className="space-y-1.5">
            <p className="text-slate-600 dark:text-slate-400">
              Hémicycle, majorité et tension parlementaire ({parliament.tension.valeur}/100) : vue
              du mandat, en tête de l’espace. Détail de la tension :
            </p>
            <TensionFactors tension={parliament.tension} />
          </div>
        ) : (
          <>
            <Hemicycle
              title="Hémicycle de l’Assemblée nationale"
              total={assembly.siegesTotal}
              playerGroup={mine?.groupe ?? null}
              playerConvention={mine?.convention ?? false}
              groups={seatingOrder(assembly.groupes.filter((g) => parliament.groupes[g.id])).map(
                (g) => ({
                  id: g.id,
                  sigle: g.sigle,
                  libelle: g.libelle,
                  sieges: parliament.groupes[g.id]!.sieges,
                  alignement: parliament.groupes[g.id]!.alignement,
                  fronde: parliament.fronde[g.id] ?? 0,
                }),
              )}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <MajorityGauge
                parliament={parliament}
                coalition={
                  coalition && coalitionBloc
                    ? {
                        libelle: coalitionBloc,
                        sieges: coalition.groupes.reduce(
                          (sum, g) => sum + (parliament.groupes[g]?.sieges ?? 0),
                          0,
                        ),
                      }
                    : null
                }
              />
              {!campaign && (
                <TensionGauge
                  tension={parliament.tension}
                  seuilMotion={ruleset.parlement.tension.seuilMotion}
                />
              )}
            </div>
          </>
        )}
        <div
          className="overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Groupes politiques, tableau défilant"
        >
          <table className="w-full min-w-[30rem] text-left">
            <caption className="sr-only">Groupes politiques et sièges</caption>
            <thead className="text-xs text-slate-500 dark:text-slate-400">
              <tr>
                <th scope="col">Groupe</th>
                <th scope="col">Sièges</th>
                <th scope="col">À l’égard du président</th>
                <th scope="col">Fronde</th>
                <th scope="col">Position</th>
              </tr>
            </thead>
            <tbody>
              {assembly.groupes.map((g) => {
                const current = parliament.groupes[g.id];
                if (!current) return null;
                const alignment = ALIGNMENT_LABELS[current.alignement];
                return (
                  <tr key={g.id} className="border-t border-slate-200 dark:border-slate-800">
                    <th scope="row" className="py-1 pr-2 font-normal">
                      <span
                        aria-hidden="true"
                        className={`mr-1.5 inline-block size-2.5 rounded-full ${colorOf(g.id).swatch}`}
                      />
                      <span className="font-semibold">{g.sigle}</span>{' '}
                      <span className="text-slate-600 dark:text-slate-400">{g.libelle}</span>
                      {mine?.groupe === g.id && (
                        <>
                          {' '}
                          <Badge tone="simule">
                            Votre groupe{mine.convention ? ' (convention du jeu)' : ''}
                          </Badge>
                        </>
                      )}
                    </th>
                    <td className="tabular-nums">{current.sieges}</td>
                    <td>
                      <Badge tone={alignment.tone}>{alignment.text}</Badge>
                      {coalition?.groupes.includes(g.id) && (
                        <>
                          {' '}
                          <Badge>Coalition</Badge>
                        </>
                      )}
                    </td>
                    <td className="tabular-nums">{parliament.fronde[g.id] ?? '—'}</td>
                    <td className="text-xs" title={g.positionDetail}>
                      {STATUS_LABELS[g.positionStatut]}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Composition réelle par groupe, sans aucun nom de député ; positions des groupes estimées
          ou supposées. Les votes, la fronde et la position à l’égard du président sont simulés par
          groupe : aucun vote n’est attribué à un député réel. Votre groupe : celui de votre
          personnalité réelle, sinon le groupe le plus proche de votre positionnement (convention du
          jeu).
        </p>
      </section>

      {parliament.motions.length > 0 && (
        <section aria-labelledby="titre-motions" className={`${card} space-y-2 text-sm`}>
          <h2 id="titre-motions" className="text-lg font-semibold">
            Motions de censure spontanées (art. 49 al. 2)
          </h2>
          <ul className="space-y-1.5">
            {[...parliament.motions].reverse().map((m) => (
              <li key={m.id}>
                Semaine {m.semaine} : {m.pour} voix pour, {m.majorite} requises —{' '}
                <span className="font-semibold">
                  {m.adoptee ? 'adoptée, le gouvernement est renversé' : 'rejetée'}
                </span>
                .{m.intervention && ` ${interventionText(state, ruleset, m.intervention)}.`}
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Motions simulées, déposées par l’opposition quand la tension parlementaire dépasse le
            seuil du jeu ; au plus trois par session ordinaire (simplification de la limite de
            signatures par député).
          </p>
        </section>
      )}

      <section aria-labelledby="titre-textes" className="space-y-3">
        <h2 id="titre-textes" className="text-lg font-semibold">
          {campaign ? 'Textes du quinquennat précédent' : 'Textes de la feuille de route'}
        </h2>
        {textes.length > 0 ? (
          <ul className="space-y-3">
            {textes.map((bill) => (
              <BillCard key={bill.id} bill={bill} state={state} ruleset={ruleset} />
            ))}
          </ul>
        ) : (
          <p className={`${card} text-sm`}>
            {campaign
              ? 'Aucun texte n’a été déposé pendant le quinquennat précédent.'
              : state.quinquennat!.feuilleDeRoute.length > 0
                ? 'Aucun texte déposé pour l’instant : le gouvernement dépose la feuille de route après sa nomination.'
                : 'La feuille de route est vide : aucun texte ne sera déposé.'}
          </p>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Procédure simplifiée (paramètres de jeu) : commission, séance, navette avec le Sénat
          (accord simulé), lecture définitive à l’Assemblée en cas de désaccord (art. 45) ;
          engagement de responsabilité (art. 49 al. 3) une fois par session ordinaire hors lois
          financières ; motion de censure adoptée à la majorité des membres. Un texte rejeté ou
          retiré n’est jamais appliqué ; un texte adopté entre en vigueur après le délai de la
          mesure.
        </p>
      </section>
    </>
  );
}

export function Parliament() {
  const game = useCurrentGame();
  const ruleset = useRuleset(game.rulesetVersion, game.state.cycle);
  return (
    <section aria-labelledby="titre-ecran-parlement" className="space-y-6">
      <ScreenHeading id="titre-ecran-parlement">Parlement</ScreenHeading>
      {ruleset.isError && (
        <ErrorMessage error={ruleset.error} onRetry={() => void ruleset.refetch()} />
      )}
      {ruleset.isPending && <p>Chargement du jeu de règles…</p>}
      {ruleset.data && <Content state={game.state} ruleset={ruleset.data} />}
    </section>
  );
}
