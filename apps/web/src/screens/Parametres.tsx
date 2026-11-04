import type { Ruleset } from '@r2027/shared';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useCurrentRuleset, useHealth } from '../api/hooks';
import { ErrorMessage } from '../components/ErrorMessage';
import { LogoCreditLine } from '../components/RealMedia';
import { PhotoCreditLine } from '../components/RealPersonality';
import { ReminderSettings } from '../components/ReminderSettings';
import { MusicCredits, SoundSettings } from '../components/SoundSettings';
import { SectionNav } from '../components/SectionNav';
import { ThemeChoice } from '../components/ThemeChoice';
import { card, input, screenTitle } from '../components/ui';
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

/** Polices embarquées (phase 22) : mention de droit d'auteur lue dans le LICENSE de chaque paquet. */
const FONTS = [
  {
    nom: 'Anybody',
    copyright: 'Copyright 2020 The Anybody Project Authors',
    source: 'https://github.com/Etcetera-Type-Co/Anybody',
    paquet: '@fontsource-variable/anybody',
  },
  {
    nom: 'Atkinson Hyperlegible Next',
    copyright: 'Copyright 2020-2024 The Atkinson Hyperlegible Next Project Authors',
    source: 'https://github.com/googlefonts/atkinson-hyperlegible-next',
    paquet: '@fontsource-variable/atkinson-hyperlegible-next',
  },
  {
    nom: 'Archivo',
    copyright: 'Copyright 2020 The Archivo Project Authors',
    source: 'https://github.com/Omnibus-Type/Archivo',
    paquet: '@fontsource-variable/archivo',
  },
] as const;

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

/** Entrées d'une catégorie : ses éléments de liste de premier niveau. */
const entriesOf = (root: HTMLElement) =>
  [...root.querySelectorAll('li')].filter((li) => !li.parentElement?.closest('li'));

/**
 * Catégorie de crédits (phase 22) : élément <details> natif — le contenu reste dans la page
 * (recherche du navigateur, lecteurs d'écran) —, titre et nombre d'entrées dans le résumé.
 */
function Sub({
  title,
  children,
  open = false,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [count, setCount] = useState(0);
  // Recompté quand le contenu change : certaines catégories attendent des données chargées à part.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setCount(entriesOf(element).length);
    update();
    const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(update);
    observer?.observe(element, { childList: true, subtree: true });
    return () => observer?.disconnect();
  }, []);
  return (
    <details
      ref={ref}
      open={open}
      data-categorie
      className="group border-t border-filet pt-2 first-of-type:border-t-0 first-of-type:pt-0"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md font-display font-bold [font-stretch:92%] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-republique-600 dark:focus-visible:outline-dorure [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden="true"
          className="text-encre-3 transition-transform duration-200 group-open:rotate-90"
        >
          ›
        </span>
        <span data-titre>
          {title}
          {count > 0 ? ` (${count})` : ''}
        </span>
      </summary>
      <div className="space-y-2 pt-1 pb-3">{children}</div>
    </details>
  );
}

const normalize = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr-FR');

/**
 * Filtre des crédits : cache les entrées (éléments de liste, paragraphes) qui ne contiennent
 * pas le texte cherché, ouvre les catégories qui en contiennent ; rend le nombre d'entrées
 * trouvées (null sans recherche). Le contenu reste dans la page, seulement masqué.
 */
function useCreditsFilter(query: string) {
  const root = useRef<HTMLDivElement>(null);
  const [found, setFound] = useState<number | null>(null);
  useLayoutEffect(() => {
    const container = root.current;
    if (!container) return;
    const wanted = normalize(query.trim());
    let total = 0;
    for (const category of container.querySelectorAll<HTMLDetailsElement>(
      'details[data-categorie]',
    )) {
      const units = [
        ...entriesOf(category),
        ...[...category.querySelectorAll<HTMLElement>('p, dl > div')].filter(
          (el) => !el.closest('li'),
        ),
      ];
      const title = category.querySelector('[data-titre]')?.textContent ?? '';
      const titleMatch = wanted !== '' && normalize(title).includes(wanted);
      let matches = 0;
      for (const unit of units) {
        const hit =
          wanted === '' || titleMatch || normalize(unit.textContent ?? '').includes(wanted);
        unit.hidden = !hit;
        if (hit) matches += 1;
      }
      category.hidden = wanted !== '' && matches === 0;
      if (wanted !== '' && matches > 0) category.open = true;
      total += matches;
    }
    setFound(wanted === '' ? null : total);
  }, [query]);
  return { root, found };
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
  const [query, setQuery] = useState('');
  const { root, found } = useCreditsFilter(query);
  return (
    <Section id="titre-credits" title="Crédits et mentions légales">
      <label className="block max-w-md">
        <span className="sr-only">Filtrer les crédits</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filtrer les crédits (auteur, licence, source…)"
          className={input}
        />
      </label>
      {found === 0 && (
        <p role="status" className="text-sm text-encre-2">
          Aucun crédit ne correspond à « {query.trim()} ».
        </p>
      )}
      <div ref={root} className="space-y-2">
        <Sub title="Mentions légales" open>
          <div className="space-y-2 text-sm">
            <p>
              RÉPUBLIQUE 2027 est un jeu de simulation politique indépendant, sans lien avec un
              parti, un média, une institution ou une personne cités. Les événements, résultats,
              sondages, débats, réactions et passages dans les médias sont simulés ; les comptes qui
              réagissent sont inventés. Les données réelles reprises (calendrier, règles, résultats,
              médias, économie, Assemblée, personnalités) sont listées ci-dessous avec leur source
              et leur licence.
            </p>
            <p>
              Personnalités réelles : aucun propos ni aucune citation ne leur est attribué ; leurs
              actions, stratégies, nominations et résultats dans une partie sont simulés. Médias
              réels : aucune ligne éditoriale ne leur est prêtée et aucune question n’est attribuée
              à un journaliste ; logos et noms restent les marques de leurs titulaires.
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
            Personnalités (relevé du {formatGameDate(ruleset.personnalites.verifieLe)}),
            personnalités nominables au gouvernement ({formatGameDate(ruleset.figures.verifieLe)}),
            médias ({formatGameDate(ruleset.mediasReels.verifieLe)}), économie, Assemblée nationale
            et législatives de 2024.
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
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {o.libelle}
                </span>{' '}
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

        <Sub title="Polices">
          <ul className="space-y-1 text-sm">
            {FONTS.map((font) => (
              <li key={font.nom}>
                <a href={font.source} {...external}>
                  {font.nom}
                </a>{' '}
                — {font.copyright} ; licence SIL Open Font License 1.1 ; distribuée par Fontsource
                (paquet {font.paquet} 5.3.0), embarquée dans le jeu : aucune connexion.
              </li>
            ))}
          </ul>
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
      </div>
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
        <ThemeChoice />
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
