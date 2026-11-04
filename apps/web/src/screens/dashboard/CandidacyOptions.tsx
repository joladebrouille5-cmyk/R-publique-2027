import {
  parseSuccessorOptionId,
  REPRESENT_OPTION_ID,
  type GameState,
  type PendingDecision,
  type Ruleset,
} from '@r2027/shared';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import {
  portraitOf,
  portraitOfPersonality,
  portraitOfProfile,
  type Portrait,
} from '../../portraits';

// Décision de candidature à la présidentielle suivante (phase 23) : une carte par option, avec
// le portrait, le nom, le parti et la fonction (description du moteur), et la nature de la
// personne — personnalité réelle dont la candidature est simulée, ou personnage fictif. Rien
// n'est calculé ici : l'option et sa description viennent du moteur.

export type CandidacyCard = {
  portrait: Portrait | null;
  /** Personnalité réelle (candidature simulée) ou personnage fictif ; null pour « se représenter ». */
  nature: 'reel' | 'fictif' | null;
};

/** Portrait et nature de la personne d'une option de la décision de candidature. */
export function candidacyCard(
  optionId: string,
  state: GameState | undefined,
  ruleset: Ruleset | undefined,
): CandidacyCard {
  const playerId = state?.player.actorId;
  const player = playerId ? state?.actors[playerId] : undefined;
  if (optionId === REPRESENT_OPTION_ID)
    return { portrait: player ? portraitOf(player, ruleset) : null, nature: null };
  const source = parseSuccessorOptionId(optionId);
  if (!source || !ruleset) return { portrait: null, nature: null };
  if (source.nature === 'acteur') {
    const actor = state?.actors[source.ref];
    if (!actor) return { portrait: null, nature: null };
    return {
      portrait: portraitOf(actor, ruleset),
      nature: actor.candidate.nature === 'reel' ? 'reel' : 'fictif',
    };
  }
  if (source.nature === 'figure') {
    const figure = ruleset.figures.figures.find((f) => f.id === source.ref);
    return figure
      ? { portrait: portraitOfPersonality(figure, ruleset), nature: 'reel' }
      : { portrait: null, nature: null };
  }
  const profile = ruleset.quinquennat.profils.find((p) => p.id === source.ref);
  return profile
    ? { portrait: portraitOfProfile(profile, ruleset), nature: 'fictif' }
    : { portrait: null, nature: null };
}

/** Description du moteur sans sa mention finale de nature, que l'étiquette affiche déjà. */
const withoutNature = (description: string) =>
  description.replace(/ ; (personnalité réelle, candidature simulée|personnage fictif)$/, '');

/** Contenu d'une carte d'option : portrait, choix, description et nature. */
export function CandidacyOptionBody({
  option,
  decision,
  state,
  ruleset,
}: {
  option: PendingDecision['options'][number];
  decision: PendingDecision;
  state: GameState | undefined;
  ruleset: Ruleset | undefined;
}) {
  const card = candidacyCard(option.id, state, ruleset);
  return (
    <span className="flex items-start gap-3">
      {card.portrait && <Avatar portrait={card.portrait} size="lg" />}
      <span className="min-w-0 space-y-1">
        <span className="block font-bold">{option.libelle}</span>
        <span className="block text-sm text-encre-2">
          {card.nature ? withoutNature(option.description) : option.description}
        </span>
        <span className="flex flex-wrap gap-1.5">
          {card.nature === 'reel' && (
            <Badge tone="reel">Personnalité réelle — candidature simulée</Badge>
          )}
          {card.nature === 'fictif' && <Badge tone="fictif">Personnage fictif</Badge>}
          {option.id === decision.defaultOptionId && (
            <span className="text-xs font-semibold text-encre-3">Choix proposé</span>
          )}
        </span>
      </span>
    </span>
  );
}
