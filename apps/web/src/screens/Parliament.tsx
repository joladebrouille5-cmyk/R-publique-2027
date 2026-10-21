import type { Alignment, Bill, GameState, Ruleset } from '@r2027/shared';
import { useRuleset } from '../api/hooks';
import { Badge, type BadgeTone } from '../components/Badge';
import { ErrorMessage } from '../components/ErrorMessage';
import { card } from '../components/ui';
import { formatGameDate } from '../labels';
import { useCurrentGame } from './GameLayout';

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

const STATUS_LABELS = { estimation: 'Position estimée (CHES)', hypothese: 'Position supposée' };

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
              contre, {vote.abstention} abstentions — votes de groupe simulés
            </caption>
            <thead>
              <tr>
                <th scope="col">Groupe</th>
                <th scope="col">Pour</th>
                <th scope="col">Contre</th>
                <th scope="col">Abstention</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(vote.parGroupe).map(([id, v]) => (
                <tr key={id}>
                  <th scope="row" className="font-normal">
                    {groups.get(id)?.sigle ?? id}
                  </th>
                  <td className="tabular-nums">{v.pour}</td>
                  <td className="tabular-nums">{v.contre}</td>
                  <td className="tabular-nums">{v.abstention}</td>
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
        </p>
      )}
    </li>
  );
}

function Content({ state, ruleset }: { state: GameState; ruleset: Ruleset }) {
  const parliament = state.parlement;
  if (!parliament || !state.quinquennat) {
    return (
      <p className={`${card} text-sm`}>
        L’Assemblée nationale entre en jeu avec le quinquennat, après l’élection présidentielle.
      </p>
    );
  }
  const filled = Object.values(parliament.groupes).reduce((sum, g) => sum + g.sieges, 0);
  const majority = Math.floor(filled / 2) + 1;
  const seatsOf = (alignment: Alignment) =>
    Object.values(parliament.groupes)
      .filter((g) => g.alignement === alignment)
      .reduce((sum, g) => sum + g.sieges, 0);
  const assembly = ruleset.assemblee;
  const source = assembly.sources.find((s) => s.id === 'an-deputes-en-exercice');
  const textes = [...parliament.textes].reverse();

  return (
    <>
      <section aria-labelledby="titre-assemblee" className={`${card} space-y-3 text-sm`}>
        <h2 id="titre-assemblee" className="text-lg font-semibold">
          Assemblée nationale ({assembly.legislature}e législature)
        </h2>
        <p>
          {filled} sièges pourvus sur {assembly.siegesTotal} ; majorité des membres : {majority}{' '}
          voix. Soutiens du président : {seatsOf('soutien')} sièges ; non alignés :{' '}
          {seatsOf('independant')} ; opposition : {seatsOf('opposition')}.
        </p>
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
                      <span className="font-semibold">{g.sigle}</span>{' '}
                      <span className="text-slate-600 dark:text-slate-400">{g.libelle}</span>
                    </th>
                    <td className="tabular-nums">{current.sieges}</td>
                    <td>
                      <Badge tone={alignment.tone}>{alignment.text}</Badge>
                    </td>
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
          Composition réelle d’après la liste ouverte des députés en exercice de l’Assemblée
          nationale
          {source ? ` (${source.version}, consultée le ${formatGameDate(source.consulteLe)})` : ''},
          sans aucun nom de député ; positions des groupes d’après l’enquête d’experts Chapel Hill
          2024 ou supposées. Les votes et la position à l’égard du président sont simulés par groupe
          : aucun vote n’est attribué à un député réel.
        </p>
      </section>

      <section aria-labelledby="titre-textes" className="space-y-3">
        <h2 id="titre-textes" className="text-lg font-semibold">
          Textes de la feuille de route
        </h2>
        {textes.length > 0 ? (
          <ul className="space-y-3">
            {textes.map((bill) => (
              <BillCard key={bill.id} bill={bill} state={state} ruleset={ruleset} />
            ))}
          </ul>
        ) : (
          <p className={`${card} text-sm`}>
            {state.quinquennat.feuilleDeRoute.length > 0
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
      <h1 id="titre-ecran-parlement" className="text-2xl font-bold">
        Parlement
      </h1>
      {ruleset.isError && (
        <ErrorMessage error={ruleset.error} onRetry={() => void ruleset.refetch()} />
      )}
      {ruleset.isPending && <p>Chargement du jeu de règles…</p>}
      {ruleset.data && <Content state={game.state} ruleset={ruleset.data} />}
    </section>
  );
}
