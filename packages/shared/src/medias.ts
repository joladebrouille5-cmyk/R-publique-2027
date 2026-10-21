import { z } from 'zod';
import { IsoDateSchema } from './game';
import { FREE_LICENSES, ImportedSourceSchema } from './personalities';
import { PersonalityIdSchema } from './politics';

// Médias réels (phase 5 ter, décisions du 21/10/2026) : chaînes de télévision et de radio
// suivies par l'Arcom, presse quotidienne mesurée par l'ACPM, émissions politiques et leurs
// présentateurs (faits publics sourcés), logos sous licence libre. Produit par
// `pnpm data:medias`. Aucune ligne éditoriale n'est prêtée à un média et aucune question ni
// aucun propos n'est attribué à un journaliste : le schéma n'a aucun champ pour cela.

export const REAL_MEDIA_TYPES = ['television', 'radio', 'presse'] as const;
export type RealMediaType = (typeof REAL_MEDIA_TYPES)[number];

const OutletId = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

/** Mesure d'audience publiée par l'organisme de mesure, reprise telle quelle. */
export const AudienceMeasureSchema = z
  .object({
    /**
     * part_audience : part du temps d'écoute du média (Médiamétrie, %) ;
     * lecteurs_numero_moyen : lecteurs d'un numéro moyen (ACPM OneNext, personnes).
     */
    indicateur: z.enum(['part_audience', 'lecteurs_numero_moyen']),
    valeur: z.number().positive(),
    /** Population et jours couverts par la mesure (« individus de 4 ans et plus »). */
    population: z.string().min(1),
    periode: z.string().min(1),
    sourceId: z.string().min(1),
    /** Libellé de l'organe dans le fichier source. */
    libelleSource: z.string().min(1),
    /**
     * Part de l'organe dans l'audience cumulée des organes retenus de son type (0 à 1), calculée
     * à l'import : base du poids d'audience dans le jeu.
     */
    partDuType: z.number().gt(0).max(1),
  })
  .strict();
export type AudienceMeasure = z.infer<typeof AudienceMeasureSchema>;

/** Temps de parole relevés par l'Arcom sur la période de référence, pour un service. */
export const SpeakingTimeSchema = z
  .object({
    /** Libellé du service dans les relevés de l'Arcom. */
    libelleSource: z.string().min(1),
    /** Temps de parole des partis politiques, cumulé sur la période (secondes). */
    partisSecondes: z.number().int().positive(),
    /** Temps de parole du pouvoir exécutif (président de la République et gouvernement). */
    executifSecondes: z.number().int().min(0),
    /** Part de chaque parti suivi dans le temps des partis (0 à 1, quatre décimales). */
    parts: z.record(z.string().min(1), z.number().min(0).max(1)),
    /** Part de tous les autres partis réunis. */
    autres: z.number().min(0).max(1),
    /**
     * Exposition relative (estimation) : part du parti sur ce service divisée par sa part sur
     * l'ensemble des services retenus (1 : exposition moyenne).
     */
    propension: z.record(z.string().min(1), z.number().min(0)),
  })
  .strict()
  .superRefine((t, ctx) => {
    const total = Object.values(t.parts).reduce((sum, v) => sum + v, t.autres);
    if (Math.abs(total - 1) > 0.002)
      ctx.addIssue({
        code: 'custom',
        path: ['parts'],
        message: `Les parts des partis totalisent ${(total * 100).toFixed(2)} % au lieu de 100 %`,
      });
    for (const party of Object.keys(t.propension))
      if (!(party in t.parts))
        ctx.addIssue({
          code: 'custom',
          path: ['propension', party],
          message: 'Propension d’un parti non suivi',
        });
  });
export type SpeakingTime = z.infer<typeof SpeakingTimeSchema>;

/** Logo repris de Wikimedia Commons sous licence libre (ou domaine public), crédité. */
export const LogoCreditSchema = z
  .object({
    /** Chemin servi par l'interface (`apps/web/public`). */
    fichier: z.string().regex(/^medias\/[a-z0-9-]+\.(svg|webp)$/),
    auteur: z.string().min(1),
    licence: z.string().regex(FREE_LICENSES, 'licence libre attendue'),
    licenceUrl: z.url().nullable(),
    /** Page du fichier sur Wikimedia Commons. */
    source: z.url(),
    modification: z.string().min(1),
  })
  .strict();
export type LogoCredit = z.infer<typeof LogoCreditSchema>;

export const RealOutletSchema = z
  .object({
    id: OutletId,
    libelle: z.string().min(1),
    type: z.enum(REAL_MEDIA_TYPES),
    portee: z.enum(['nationale', 'regionale']),
    /** Article Wikipédia, à la révision consultée. */
    article: z.url(),
    audience: AudienceMeasureSchema,
    /** Relevés de l'Arcom (télévision et radio) ; la presse écrite n'est pas mesurée. */
    tempsDeParole: SpeakingTimeSchema.nullable(),
    logo: LogoCreditSchema.nullable(),
    /** Motif de l'absence de logo (licence non libre, fichier hors de Commons…). */
    logoAbsent: z.string().min(1).nullable(),
  })
  .strict()
  .superRefine((o, ctx) => {
    if ((o.logo === null) === (o.logoAbsent === null))
      ctx.addIssue({
        code: 'custom',
        path: ['logo'],
        message: 'Logo crédité ou motif d’absence, exactement l’un des deux',
      });
    if ((o.type === 'presse') !== (o.tempsDeParole === null))
      ctx.addIssue({
        code: 'custom',
        path: ['tempsDeParole'],
        message: 'Temps de parole Arcom pour la télévision et la radio seulement',
      });
    const expected = o.type === 'presse' ? 'lecteurs_numero_moyen' : 'part_audience';
    if (o.audience.indicateur !== expected)
      ctx.addIssue({
        code: 'custom',
        path: ['audience', 'indicateur'],
        message: `Indicateur attendu pour ce type : ${expected}`,
      });
  });
export type RealOutlet = z.infer<typeof RealOutletSchema>;

/** Émission politique réelle : faits publics seulement (titre, chaîne, présentateurs, diffusion). */
export const PoliticalShowSchema = z
  .object({
    id: z.string().regex(/^emi-[a-z0-9]+(-[a-z0-9]+)*$/),
    titre: z.string().min(1),
    /** Organe de diffusion principal (premier organe retenu cité par la source). */
    organeId: OutletId,
    /** Autres organes retenus qui diffusent l'émission. */
    autresOrganes: z.array(OutletId),
    presentateurs: z.array(z.string().min(1)).min(1).max(6),
    /** Jour ou périodicité de diffusion, d'après la source ; null si elle ne l'indique pas. */
    diffusion: z.string().min(1).nullable(),
    /** Article Wikipédia, à la révision consultée. */
    article: z.url(),
  })
  .strict();
export type PoliticalShow = z.infer<typeof PoliticalShowSchema>;

export const RealMediaSchema = z
  .object({
    verifieLe: IsoDateSchema,
    decision: z.string().min(1),
    sources: z.array(ImportedSourceSchema).min(1),
    /** Période de référence des temps de parole (mois complets). */
    periodeArcom: z.object({ debut: IsoDateSchema, fin: IsoDateSchema }).strict(),
    methode: z
      .object({
        selection: z.string().min(1),
        audience: z.string().min(1),
        tempsDeParole: z.string().min(1),
        propension: z.string().min(1),
        emissions: z.string().min(1),
        logos: z.string().min(1),
      })
      .strict(),
    organes: z.array(RealOutletSchema).min(1),
    emissions: z.array(PoliticalShowSchema),
    /** Parti des relevés de l'Arcom rattaché à chaque personnalité réelle (null : non mesuré). */
    rattachements: z.array(
      z
        .object({
          personnaliteId: PersonalityIdSchema,
          partiArcom: z.string().min(1).nullable(),
          motif: z.string().min(1),
        })
        .strict(),
    ),
    /** Services ou titres mesurés mais non retenus, avec le motif. */
    exclus: z.array(z.object({ libelle: z.string().min(1), motif: z.string().min(1) }).strict()),
    /** Articles d'émissions examinés mais non retenus, avec le motif. */
    emissionsNonRetenues: z.array(
      z.object({ titre: z.string().min(1), motif: z.string().min(1) }).strict(),
    ),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    for (const [i, o] of value.organes.entries()) {
      if (ids.has(o.id))
        ctx.addIssue({
          code: 'custom',
          path: ['organes', i, 'id'],
          message: 'Identifiant en double',
        });
      ids.add(o.id);
    }
    const shows = new Set<string>();
    for (const [i, e] of value.emissions.entries()) {
      if (shows.has(e.id))
        ctx.addIssue({
          code: 'custom',
          path: ['emissions', i, 'id'],
          message: 'Identifiant en double',
        });
      shows.add(e.id);
      for (const id of [e.organeId, ...e.autresOrganes])
        if (!ids.has(id))
          ctx.addIssue({
            code: 'custom',
            path: ['emissions', i, 'organeId'],
            message: `Organe inconnu : ${id}`,
          });
    }
    const measured = new Set(
      value.organes.flatMap((o) => (o.tempsDeParole ? Object.keys(o.tempsDeParole.parts) : [])),
    );
    for (const [i, r] of value.rattachements.entries())
      if (r.partiArcom !== null && !measured.has(r.partiArcom))
        ctx.addIssue({
          code: 'custom',
          path: ['rattachements', i, 'partiArcom'],
          message: `Parti non suivi : ${r.partiArcom}`,
        });
  });
export type RealMedia = z.infer<typeof RealMediaSchema>;
