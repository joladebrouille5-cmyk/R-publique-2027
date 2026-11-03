import type { Ruleset } from '@r2027/shared';
import type { ReactNode } from 'react';
import { useCurrentRuleset, useHealth } from '../api/hooks';
import { ErrorMessage } from '../components/ErrorMessage';
import { LogoCreditLine } from '../components/RealMedia';
import { PhotoCreditLine } from '../components/RealPersonality';
import { ReminderSettings } from '../components/ReminderSettings';
import { MusicCredits, SoundSettings } from '../components/SoundSettings';
import { SectionNav } from '../components/SectionNav';
import { ThemeToggle } from '../components/ThemeToggle';
import { card, screenTitle } from '../components/ui';
import { formatGameDate } from '../labels';
import { useGeoManifest } from '../map/data';
import { platform } from '../platform';

// Paramètres (phase 11) : apparence, son (phase 19), crédits et mentions légales, à propos. Toutes les sources,
// licences, crédits de photos et de logos et notes de méthode, retirés des écrans de jeu (qui
// ne gardent que leurs étiquettes courtes : réel, simulé, estimation, hypothèse, fictif), sont
// rassemblés ici, à partir du jeu de règles et du référentiel géographique servis par l'API.

/** Notes de méthode des blocs du jeu de règles, avec leur intitulé. */
const NOTES: { key: keyof Ruleset; label: string }[] = [
  { key: 'modele', label: 'Modèle électoral' },
  { key: 'programme', label: 'Programme et propositions' },
  { key: 'parrainages', label: 'Parrainages' },
  { key: 'finances', label: 'Financement de la campagne' },
  { key: 'medias', label: 'Médias' },
  { key: 'numerique', label: 'Réseaux sociaux et nouveaux médias' },
  { key: 'prestations', label: 'Passages dans les médias' },
  { key: 'debats', label: 'Débats télévisés' },
  { key: 'quinquennat', label: 'Présidence et quinquennat' },
  { key: 'parlement', label: 'Parlement' },
  { key: 'economie', label: 'Économie' },
  { key: 'legislatives', label: 'Élections législatives' },
  { key: 'personnalitesReelles', label: 'Moyens des personnalités réelles' },
];

const noteOf = (ruleset: Ruleset, key: keyof Ruleset): string | null => {
  const block = ruleset[key] as { note?: unknown } | undefined;
  return typeof block?.note === 'string' ? block.note : null;
};

const external = { target: '_blank', rel: 'noreferrer', className: 'underline' } as const;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={`${card} space-y-3`}>
      <h2 id={id} className="text-xl font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="font-semibold">{title}</h3>
      {children}
    </div>
  );
}

type Imported = { id: string; titre: string; url: string; licence: string; version?: string };

/** Sources des données importées, chacune une seule fois (même source pour deux jeux). */
function ImportedSources({ sources }: { sources: readonly Imported[] }) {
  const unique = [...new Map(sources.map((s) => [`${s.url} ${s.titre}`, s])).values()];
  return (
    <ul className="space-y-1 text-sm">
      {unique.map((s) => (
        <li key={s.id}>
          <a href={s.url} {...external}>
            {s.titre}
          </a>
          {s.version && ` — ${s.version}`} ; licence : {s.licence}.
        </li>
      ))}
    </ul>
  );
}

function Credits({ ruleset }: { ruleset: Ruleset }) {
  const geo = useGeoManifest();
  const personalities = ruleset.personnalites.personnalites;
  const outlets = ruleset.mediasReels.organes;
  return (
    <Section id="titre-credits" title="Crédits et mentions légales">
      <Sub title="Mentions légales">
        <div className="space-y-2 text-sm">
          <p>
            RÉPUBLIQUE 2027 est un jeu de simulation politique indépendant, sans lien avec un parti,
            un média, une institution ou une personne cités. Les événements, résultats, sondages,
            débats, réactions et passages dans les médias sont simulés ; les comptes qui réagissent
            sont inventés. Les données réelles reprises (calendrier, règles, résultats, médias,
            économie, Assemblée, personnalités) sont listées ci-dessous avec leur source et leur
            licence.
          </p>
          <p>
            Personnalités réelles : aucun propos ni aucune citation ne leur est attribué ; leurs
            actions, stratégies, nominations et résultats dans une partie sont simulés. Médias réels
            : aucune ligne éditoriale ne leur est prêtée et aucune question n’est attribuée à un
            journaliste ; logos et noms restent les marques de leurs titulaires.
          </p>
          <p>
            {platform().kind === 'local'
              ? 'Données personnelles : sur l’application Android, les parties restent sur l’appareil (stockage local) ; l’application ne demande pas l’accès à Internet.'
              : 'Données personnelles : la version web garde vos parties sur le serveur du jeu, rattachées à une session anonyme (cookie de session signé, sans compte ni adresse électronique).'}
          </p>
        </div>
      </Sub>

      <Sub title="Sources du jeu de règles">
        <ul className="space-y-1 text-sm">
          {Object.entries(ruleset.sources)
            .sort(([, a], [, b]) => a.titre.localeCompare(b.titre, 'fr'))
            .map(([id, source]) => (
              <li key={id}>
                {source.url ? (
                  <a href={source.url} {...external}>
                    {source.titre}
                  </a>
                ) : (
                  source.titre
                )}
                {source.consulteLe && ` — consultée le ${formatGameDate(source.consulteLe)}`}.
              </li>
            ))}
        </ul>
      </Sub>

      <Sub title="Données importées">
        <p className="text-sm text-encre-2">
          Personnalités (relevé du {formatGameDate(ruleset.personnalites.verifieLe)}), personnalités
          nominables au gouvernement ({formatGameDate(ruleset.figures.verifieLe)}), médias (
          {formatGameDate(ruleset.mediasReels.verifieLe)}), économie, Assemblée nationale et
          législatives de 2024.
        </p>
        <ImportedSources
          sources={[
            ...ruleset.personnalites.sources,
            ...ruleset.figures.sources,
            ...ruleset.mediasReels.sources,
            ...ruleset.economieReelle.sources,
            ...ruleset.assemblee.sources,
            ...ruleset.legislatives2024.sources,
          ]}
        />
      </Sub>

      <Sub title="Sélection des données">
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="font-semibold">Personnalités</dt>
            <dd className="text-encre-2">{ruleset.personnalites.decision}</dd>
          </div>
          {ruleset.personnalites.nonIntegrees.length > 0 && (
            <div>
              <dt className="font-semibold">Candidatures déclarées non intégrées</dt>
              <dd className="text-encre-2">
                {ruleset.personnalites.nonIntegrees
                  .map((n) => `${n.prenom} ${n.nom} (${n.parti}) : ${n.motif}`)
                  .join(' ; ')}
              </dd>
            </div>
          )}
          <div>
            <dt className="font-semibold">Personnalités nominables au gouvernement</dt>
            <dd className="text-encre-2">{ruleset.figures.decision}</dd>
          </div>
          {ruleset.figures.ecartees.length > 0 && (
            <div>
              <dt className="font-semibold">Personnalités de la sélection écartées à l’import</dt>
              <dd className="text-encre-2">
                {ruleset.figures.ecartees
                  .map((e) => `${e.prenom} ${e.nom} : ${e.motif}`)
                  .join(' ; ')}
              </dd>
            </div>
          )}
          <div>
            <dt className="font-semibold">Médias</dt>
            <dd className="text-encre-2">{ruleset.mediasReels.decision}</dd>
          </div>
          <div>
            <dt className="font-semibold">Médias mesurés mais non retenus</dt>
            <dd className="text-encre-2">
              {[
                ...ruleset.mediasReels.exclus.map((e) => `${e.libelle} : ${e.motif}`),
                ...ruleset.mediasReels.emissionsNonRetenues.map((e) => `${e.titre} : ${e.motif}`),
              ].join(' ; ')}
            </dd>
          </div>
        </dl>
      </Sub>

      <Sub title="Cartographie">
        {geo.data ? (
          <ul className="space-y-1 text-sm">
            {geo.data.sources.map((s) => (
              <li key={s.id}>
                <a href={s.url} {...external}>
                  {s.producteur} — {s.titre}
                </a>{' '}
                ({s.millesime}) ; licence : {s.licence}.
              </li>
            ))}
            <li>
              Rendu de la carte :{' '}
              <a href="https://maplibre.org/" {...external}>
                MapLibre GL JS
              </a>{' '}
              (licence BSD-3-Clause).
            </li>
          </ul>
        ) : geo.isError ? (
          <ErrorMessage error={geo.error} />
        ) : (
          <p className="text-sm">Chargement du référentiel géographique…</p>
        )}
      </Sub>

      <Sub title="Photos des personnalités">
        <ul className="space-y-2">
          {personalities.map((p) => (
            <li key={p.id}>
              <p className="text-sm font-semibold">
                {p.prenom} {p.nom}
              </p>
              <PhotoCreditLine personality={p} />
              <p className="text-xs text-encre-2">Position : {p.position.detail}</p>
              <p className="text-xs text-encre-2">
                Fiche :{' '}
                <a href={p.article} {...external}>
                  article Wikipédia
                </a>
                {p.wikidata && (
                  <>
                    {', '}
                    <a href={`https://www.wikidata.org/wiki/${p.wikidata}`} {...external}>
                      Wikidata
                    </a>
                  </>
                )}
                {' ; candidature : '}
                <a href={p.candidature.source.url} {...external}>
                  {p.candidature.source.site ?? 'référence de presse'}
                </a>
                .
              </p>
            </li>
          ))}
        </ul>
      </Sub>

      <Sub title="Personnalités nominables au gouvernement">
        <ul className="space-y-2">
          {ruleset.figures.figures.map((f) => (
            <li key={f.id}>
              <p className="text-sm font-semibold">
                {f.prenom} {f.nom}
              </p>
              <PhotoCreditLine personality={f} />
              <p className="text-xs text-encre-2">
                Position : {f.position.detail} Compétence estimée :{' '}
                {f.competence.facteurs
                  .map(
                    (x) =>
                      `${x.libelle} (${x.valeur > 0 ? '+' : ''}${x.valeur.toFixed(2).replace('.', ',')})`,
                  )
                  .join(' ; ')}
                . Notoriété {f.notoriete.niveau} : {f.notoriete.motif}.
              </p>
              <p className="text-xs text-encre-2">
                Fiche :{' '}
                <a href={f.article} {...external}>
                  article Wikipédia (révision importée)
                </a>
                {', '}
                <a href={`https://www.wikidata.org/wiki/${f.wikidata}`} {...external}>
                  Wikidata
                </a>
                .
              </p>
            </li>
          ))}
        </ul>
      </Sub>

      <Sub title="Logos des médias">
        <ul className="space-y-1 text-xs text-encre-2">
          {outlets.map((o) => (
            <li key={o.id}>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{o.libelle}</span>{' '}
              — <LogoCreditLine outlet={o} />{' '}
              <a href={o.article} {...external}>
                Article Wikipédia
              </a>
              .
            </li>
          ))}
        </ul>
      </Sub>

      <Sub title="Musique">
        <MusicCredits />
      </Sub>

      <Sub title="Émissions politiques">
        <ul className="space-y-1 text-sm">
          {ruleset.mediasReels.emissions.map((show) => (
            <li key={show.id}>
              <a href={show.article} {...external}>
                {show.titre}
              </a>{' '}
              (article Wikipédia, révision consultée).
            </li>
          ))}
        </ul>
      </Sub>

      <Sub title="Notes de méthode">
        <dl className="space-y-2 text-sm">
          {NOTES.map(({ key, label }) => {
            const note = noteOf(ruleset, key);
            return note ? (
              <div key={key}>
                <dt className="font-semibold">{label}</dt>
                <dd className="text-encre-2">{note}</dd>
              </div>
            ) : null;
          })}
          <div>
            <dt className="font-semibold">Sondages simulés</dt>
            <dd className="text-encre-2">{ruleset.sondages.limites}</dd>
          </div>
          <div>
            <dt className="font-semibold">Équipe gouvernementale</dt>
            <dd className="text-encre-2">{ruleset.quinquennat.equipe.note}</dd>
          </div>
          {[
            ...Object.values(ruleset.personnalites.methode),
            ...Object.values(ruleset.figures.methode),
            ...Object.values(ruleset.mediasReels.methode),
            ...Object.values(ruleset.assemblee.methode),
          ].map((text) => (
            <div key={text}>
              <dt className="sr-only">Méthode des données importées</dt>
              <dd className="text-encre-2">{text}</dd>
            </div>
          ))}
        </dl>
      </Sub>
    </Section>
  );
}

export function Parametres() {
  const ruleset = useCurrentRuleset();
  const health = useHealth();
  const versions = health.data?.versions;
  return (
    <section aria-labelledby="titre-parametres" className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <h1 id="titre-parametres" className={screenTitle}>
        Paramètres
      </h1>
      {/* Phase 22 : sommaire collant de la page (la liste des crédits est longue). */}
      <SectionNav
        label="Sommaire des paramètres"
        items={[
          { id: 'titre-apparence', label: 'Apparence' },
          { id: 'titre-son', label: 'Son' },
          { id: 'titre-rappels', label: 'Rappels' },
          ...(ruleset.data ? [{ id: 'titre-credits', label: 'Crédits' }] : []),
          { id: 'titre-a-propos', label: 'À propos' },
        ]}
      />

      <Section id="titre-apparence" title="Apparence">
        <ThemeToggle />
      </Section>

      <Section id="titre-son" title="Son">
        <SoundSettings />
      </Section>

      <Section id="titre-rappels" title="Rappels">
        <ReminderSettings />
      </Section>

      {ruleset.data ? (
        <Credits ruleset={ruleset.data} />
      ) : ruleset.isError ? (
        <ErrorMessage error={ruleset.error} />
      ) : (
        <p>Chargement des crédits…</p>
      )}

      <Section id="titre-a-propos" title="À propos">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-encre-2">Jeu de règles</dt>
          <dd>{ruleset.data ? `${ruleset.data.libelle} (${ruleset.data.version})` : '—'}</dd>
          <dt className="text-encre-2">Moteur</dt>
          <dd>{versions?.engine ?? '—'}</dd>
          <dt className="text-encre-2">Format de sauvegarde</dt>
          <dd>{versions?.saveSchema ?? '—'}</dd>
        </dl>
      </Section>
    </section>
  );
}
