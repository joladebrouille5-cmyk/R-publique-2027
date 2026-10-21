// Assemblage du fichier des médias réels (`packages/rulesets/src/medias-2027.json`) à partir
// des relevés de l'Arcom, des mesures d'audience, des articles Wikipédia et des logos. Chaque
// contrôle d'acceptation de la phase 5 ter fait échouer l'import plutôt que de compléter une
// donnée manquante.
import {
  RealMediaSchema,
  type LogoCredit,
  type RealMedia,
  type RealOutlet,
  type RealPersonality,
} from '@r2027/shared';
import { ImportError } from '../geometry/coverage';
import { aggregateArcom, speakingTimeEstimates, type ArcomMonth, type ArcomTotals } from './arcom';
import { buildShow, type ShowArticle } from './emissions';
import { normalizeLabel, type Measures } from './mesures';
import {
  DECISION,
  METHODE,
  OUTLETS,
  PQN_EXCLUSIONS,
  PQR_EXCLUSION,
  SEUIL_PARTI_SECONDES,
  SEUIL_SERVICE_SECONDES_PAR_MOIS,
  type AudienceSource,
  type OutletSelection,
} from './selection';

export type SourcedMeasures = Measures & { sourceId: string; population: string };

export type MediaInputs = {
  verifieLe: string;
  sources: RealMedia['sources'];
  periodeArcom: RealMedia['periodeArcom'];
  arcom: readonly ArcomMonth[];
  mesures: Readonly<Record<AudienceSource, SourcedMeasures>>;
  /** Article de chaque organe (révision consultée), par identifiant. */
  articles: ReadonlyMap<string, { url: string }>;
  /** Logo crédité ou motif de refus, par identifiant ; absent : pas de logo dans l'infobox. */
  logos: ReadonlyMap<string, LogoCredit | { refus: string }>;
  shows: readonly ShowArticle[];
  personnalites: readonly RealPersonality[];
  /** Sélection (paramètre pour les tests ; par défaut, celle du projet). */
  outlets?: readonly OutletSelection[];
  /** Seuil de suivi d'un parti (paramètre pour les tests ; par défaut, celui du projet). */
  seuilPartiSecondes?: number;
};

const duration = (s: number) =>
  s < 3600
    ? `${Math.round(s / 60)} min`
    : `${(s / 3600).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h`;

function serviceExclusion(t: ArcomTotals, mesures: MediaInputs['mesures'], months: number): string {
  const perMonth = (t.executif + t.totalPartis) / t.mois;
  if (perMonth < SEUIL_SERVICE_SECONDES_PAR_MOIS)
    return `moins d’une heure de temps de parole par mois en moyenne sur la période (${Math.round(perMonth / 60)} min${t.mois < months ? `, relevé sur ${t.mois} mois` : ''})`;
  const key = normalizeLabel(t.libelle);
  if (!mesures.mediamat.valeurs.has(key) && !mesures.ear.valeurs.has(key))
    return 'aucune part d’audience nationale dans les mesures utilisées (Médiamat mensuel, EAR National)';
  throw new ImportError(
    `Arcom : le service ${t.libelle} remplit les critères mais n’est pas dans la sélection ; sélection à revoir.`,
  );
}

/** Assemble et valide le fichier des médias réels. */
export function buildMedias(input: MediaInputs): RealMedia {
  const selection = input.outlets ?? OUTLETS;
  const totals = aggregateArcom(input.arcom);

  // Services de l'Arcom retenus (relevés sur tous les mois de la période) et exclus.
  const retained: ArcomTotals[] = [];
  for (const o of selection) {
    if (!o.arcom) continue;
    const t = totals.get(o.arcom);
    if (!t) throw new ImportError(`Arcom : service ${o.arcom} absent des relevés.`);
    if (t.mois !== input.arcom.length)
      throw new ImportError(
        `Arcom : ${t.libelle} n’est relevé que sur ${t.mois} mois sur ${input.arcom.length}.`,
      );
    if ((t.executif + t.totalPartis) / t.mois < SEUIL_SERVICE_SECONDES_PAR_MOIS)
      throw new ImportError(`Arcom : ${o.arcom} est sous le seuil d’une heure par mois.`);
    retained.push(t);
  }
  const selectedServices = new Set(retained.map((t) => t.libelle));
  const exclus: RealMedia['exclus'] = [...totals.values()]
    .filter((t) => !selectedServices.has(t.libelle))
    .map((t) => ({
      libelle: t.libelle,
      motif: serviceExclusion(t, input.mesures, input.arcom.length),
    }));
  const seuil = input.seuilPartiSecondes ?? SEUIL_PARTI_SECONDES;
  const { suivis, estimates } = speakingTimeEstimates(retained, seuil);

  // Presse : chaque ligne du classement national est retenue ou écartée avec un motif.
  const pressLabels = new Set(
    selection
      .filter((o) => o.audience.source === 'onenext-pqn')
      .map((o) => normalizeLabel(o.audience.libelle)),
  );
  for (const [key, { libelle }] of input.mesures['onenext-pqn'].valeurs) {
    if (pressLabels.has(key)) continue;
    const motif = PQN_EXCLUSIONS[libelle];
    if (!motif)
      throw new ImportError(
        `ACPM : titre « ${libelle} » sans décision de sélection ; sélection à revoir.`,
      );
    exclus.push({ libelle, motif });
  }
  const pqrOthers = [...input.mesures['onenext-pqr'].valeurs.values()].filter(
    (v) =>
      !selection.some(
        (o) =>
          o.audience.source === 'onenext-pqr' &&
          normalizeLabel(o.audience.libelle) === normalizeLabel(v.libelle),
      ),
  );
  if (pqrOthers.length > 0)
    exclus.push({
      libelle: `Presse quotidienne régionale : ${pqrOthers.length} autres lignes du classement`,
      motif: PQR_EXCLUSION,
    });

  // Audience de chaque organe et part dans l'audience cumulée des organes de son type.
  const measured = selection.map((o) => {
    const mesure = input.mesures[o.audience.source];
    const value = mesure.valeurs.get(normalizeLabel(o.audience.libelle));
    if (!value)
      throw new ImportError(`${o.libelle} : aucune source d’audience (${o.audience.libelle}).`);
    return { o, mesure, value };
  });
  const typeTotal = new Map<string, number>();
  for (const { o, value } of measured)
    typeTotal.set(o.type, (typeTotal.get(o.type) ?? 0) + value.valeur);

  const organes: RealOutlet[] = measured.map(({ o, mesure, value }) => {
    const article = input.articles.get(o.id);
    if (!article) throw new ImportError(`${o.libelle} : article Wikipédia non consulté.`);
    const logo = input.logos.get(o.id);
    const speaking = o.arcom ? estimates.get(o.arcom)! : null;
    return {
      id: o.id,
      libelle: o.libelle,
      type: o.type,
      portee: o.portee,
      article: article.url,
      audience: {
        indicateur: o.type === 'presse' ? 'lecteurs_numero_moyen' : 'part_audience',
        valeur: value.valeur,
        population: mesure.population,
        periode: mesure.periode,
        sourceId: mesure.sourceId,
        libelleSource: value.libelle,
        partDuType: Math.round((value.valeur / typeTotal.get(o.type)!) * 10_000) / 10_000,
      },
      tempsDeParole: speaking && { libelleSource: o.arcom!, ...speaking },
      logo: logo && !('refus' in logo) ? logo : null,
      logoAbsent: !logo
        ? 'aucun logo dans l’infobox de l’article'
        : 'refus' in logo
          ? logo.refus
          : null,
    };
  });

  // Émissions examinées.
  const outletByArticle = new Map<string, string>();
  for (const o of selection) {
    outletByArticle.set(normalizeLabel(o.article), o.id);
    outletByArticle.set(normalizeLabel(o.libelle), o.id);
  }
  const emissions: RealMedia['emissions'] = [];
  const emissionsNonRetenues: RealMedia['emissionsNonRetenues'] = [];
  for (const show of input.shows) {
    const result = buildShow(show, outletByArticle);
    if ('motif' in result) emissionsNonRetenues.push({ titre: show.titre, motif: result.motif });
    else emissions.push(result.emission);
  }

  // Parti des relevés de l'Arcom rattaché à chaque personnalité réelle.
  const pooled = new Map<string, number>();
  for (const t of retained)
    for (const [party, s] of t.partis) pooled.set(party, (pooled.get(party) ?? 0) + s);
  const byLabel = new Map([...pooled.keys()].map((p) => [normalizeLabel(p), p]));
  const rattachements: RealMedia['rattachements'] = input.personnalites.map((p) => {
    const parts = p.parti.split(/\s*\/\s*/);
    const found = parts
      .map((part) => ({ part, label: byLabel.get(normalizeLabel(part)) }))
      .find((x) => x.label !== undefined);
    if (!found)
      return {
        personnaliteId: p.id,
        partiArcom: null,
        motif: `aucun parti de la fiche (« ${p.parti} ») n’apparaît dans les relevés de l’Arcom sur la période : exposition moyenne`,
      };
    if (!suivis.includes(found.label!))
      return {
        personnaliteId: p.id,
        partiArcom: null,
        motif: `« ${found.label} » : ${duration(pooled.get(found.label!)!)} de temps de parole cumulé sur la période, sous le seuil de ${duration(seuil)} : exposition moyenne`,
      };
    return {
      personnaliteId: p.id,
      partiArcom: found.label!,
      motif: `parti de la fiche : « ${found.part} »`,
    };
  });

  const result = RealMediaSchema.safeParse({
    verifieLe: input.verifieLe,
    decision: DECISION,
    sources: input.sources,
    periodeArcom: input.periodeArcom,
    methode: METHODE,
    organes,
    emissions,
    rattachements,
    exclus,
    emissionsNonRetenues,
  });
  if (!result.success)
    throw new ImportError(
      `Médias réels invalides : ${result.error.issues
        .map((i) => `${i.path.join('.')} : ${i.message}`)
        .join(' ; ')}`,
    );
  return result.data;
}
