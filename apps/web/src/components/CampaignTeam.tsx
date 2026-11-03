import type { GameState, Poll, ResourceKey, WeeklyReport } from '@r2027/shared';
import { formatCount, formatDelta, formatEuros, formatPollDelta, formatShare } from '../labels';
import { GeneratedPortrait } from './GeneratedPortrait';

// L'équipe de campagne raconte la semaine (phase 20) : quatre personnages fictifs, chacun dans son
// domaine, en une phrase. Chaque phrase est tirée du bilan du moteur (variations, sondage,
// événements) ; rien n'est recalculé, et aucun propos n'est prêté à une personne réelle.

export type TeamLine = { id: string; prenom: string; role: string; texte: string; fond: string };

const MEMBERS = {
  direction: { prenom: 'Inès', role: 'Directrice de campagne', fond: '#3f4c8f' },
  tresor: { prenom: 'Paul', role: 'Trésorier', fond: '#7a5a1f' },
  opinion: { prenom: 'Maya', role: 'Conseillère opinion', fond: '#2f6f6a' },
  terrain: { prenom: 'Hugo', role: 'Responsable du terrain', fond: '#8a3b3b' },
} as const;

const isMainPoll = (poll: Poll) => poll.kind !== 'popularite' && !poll.id.endsWith('-hypothese-t2');

/** Phrases de l'équipe pour la semaine du joueur (vide sans candidat). */
export function teamBriefing(report: WeeklyReport, state: GameState): TeamLine[] {
  const playerId = state.player.actorId;
  const player = playerId ? state.actors[playerId] : undefined;
  if (!playerId || !player) return [];
  const delta = (ressource: ResourceKey) => {
    const change = report.changes.find((c) => c.actorId === playerId && c.ressource === ressource);
    return change ? change.after - change.before : 0;
  };
  const line = (id: keyof typeof MEMBERS, texte: string): TeamLine => ({
    id,
    ...MEMBERS[id],
    texte,
  });

  // Direction : la semaine en une phrase ; un événement majeur passe avant tout.
  const own = report.actions.filter((a) => a.actorId === playerId);
  const done = own.filter((a) => a.status === 'validee').length;
  const refused = own.length - done;
  const major = report.events.find((e) => e.majeur);
  const best = (['notoriete', 'popularite'] as const)
    .map((r) => ({ r, d: delta(r) }))
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))[0]!;
  const tendency =
    best.d === 0
      ? 'les lignes ne bougent pas'
      : `${best.r === 'notoriete' ? 'la notoriété' : 'la popularité'} ${best.d > 0 ? 'gagne' : 'recule de'} ${formatDelta(best.r, best.d).replace(/^[+−]/, best.d > 0 ? '+' : '')}`;
  const direction = major
    ? `Coup de tonnerre cette semaine : « ${major.label} ». ${done > 0 ? `Nos ${done} action${done > 1 ? 's' : ''} n’en ont que plus compté.` : 'Il faudra réagir.'}`
    : done === 0
      ? `Semaine blanche : aucune action menée${refused ? `, ${refused} refusée${refused > 1 ? 's' : ''}` : ''}. Et ${tendency}.`
      : `${done} action${done > 1 ? 's' : ''} menée${done > 1 ? 's' : ''}${refused ? ` (${refused} refusée${refused > 1 ? 's' : ''})` : ''} : ${tendency}.`;

  // Trésor : dépense de la semaine et caisse restante.
  const spent = delta('budgetCentimes');
  const cash = formatEuros(player.resources.budgetCentimes);
  const tresor =
    spent < 0
      ? `Nous avons dépensé ${formatEuros(-spent)} ; il reste ${cash} en caisse.`
      : spent > 0
        ? `Les caisses se remplissent : ${formatEuros(spent)} de plus, ${cash} disponibles.`
        : `Pas un euro dépensé : ${cash} en caisse.`;

  // Opinion : le sondage d'intentions de la semaine.
  const poll = report.polls.find(isMainPoll);
  const ranked = poll ? [...poll.results].sort((a, b) => b.value - a.value) : [];
  const mine = ranked.findIndex((r) => r.actorId === playerId);
  const opinion =
    poll && mine >= 0
      ? `Sondage ${poll.institute} : ${mine === 0 ? 'vous êtes en tête' : `vous êtes ${mine + 1}e`} avec ${formatShare(ranked[mine]!.value)}${ranked[mine]!.variation === null ? '' : ` (${formatPollDelta(ranked[mine]!.variation)})`}.`
      : 'Pas de sondage d’intentions cette semaine : rien à lire, tout à faire.';

  // Terrain : les militants.
  const activists = delta('militants');
  const terrain =
    activists === 0
      ? `${formatCount(player.resources.militants)} militants mobilisés, sans changement.`
      : `${activists > 0 ? 'Le terrain répond' : 'Le terrain s’essouffle'} : ${formatDelta('militants', activists)} militants, ${formatCount(player.resources.militants)} au total.`;

  return [
    line('direction', direction),
    line('tresor', tresor),
    line('opinion', opinion),
    line('terrain', terrain),
  ];
}

export function CampaignTeam({ report, state }: { report: WeeklyReport; state: GameState }) {
  const lines = teamBriefing(report, state);
  if (lines.length === 0) return null;
  return (
    <section aria-labelledby="equipe-titre" className="space-y-3">
      <h3 id="equipe-titre" className="text-lg">
        Votre équipe raconte la semaine
      </h3>
      <ul className="space-y-3">
        {lines.map((l) => (
          <li key={l.id} className="flex items-start gap-3">
            <span className="size-11 shrink-0 overflow-hidden rounded-full ring-2 ring-or-400/60 dark:ring-dorure/50">
              <GeneratedPortrait seed={`equipe:${l.prenom}`} background={l.fond} />
            </span>
            <p className="min-w-0 rounded-2xl rounded-tl-sm bg-slate-100 px-3.5 py-2.5 dark:bg-white/[0.06]">
              <span className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                {l.prenom}, {l.role.toLocaleLowerCase('fr-FR')}
              </span>
              {l.texte}
            </p>
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        Équipe fictive ; ses mots résument le bilan du moteur, détaillé ci-dessous.
      </p>
    </section>
  );
}
