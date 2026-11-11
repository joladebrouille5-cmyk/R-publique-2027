import { lazy, useMemo, type ReactNode } from 'react';
import { groupHex, Hemicycle, type HemicycleGroup } from '../components/Hemicycle';
import { useMode } from '../map/useMode';
import type { BoardShape } from '../plateau/geometry';
import { Cadre3D } from './Cadre3D';
import type { Departement3D } from './carte';
import type { Foule } from './foule';
import { disposerSieges, type Reaction } from './hemicycle';

// Scènes 3D du jeu (phase 26), côté application : chaque scène est un composant léger qui décide
// (dans son cadre) entre la 3D et son repli, et ne charge three.js qu'à ce moment-là, à la
// demande. Rien de three.js n'est importé ici de façon statique : le paquet initial n'en contient
// pas une ligne.

export const chargements = {
  hemicycle: () => import('./three/Hemicycle3D'),
  carte: () => import('./three/France3D'),
  meeting: () => import('./three/Meeting3D'),
  debat: () => import('./three/Debat3D'),
  ralliement: () => import('./three/Ralliement3D'),
  investiture: () => import('./three/Investiture3D'),
  drapeau: () => import('./three/Drapeau3D'),
  confettis: () => import('./three/Confettis3D'),
};

const Hemicycle3D = lazy(chargements.hemicycle);
const France3D = lazy(chargements.carte);
const Meeting3D = lazy(chargements.meeting);
const Debat3D = lazy(chargements.debat);
const Ralliement3D = lazy(chargements.ralliement);
const Investiture3D = lazy(chargements.investiture);
const Drapeau3D = lazy(chargements.drapeau);
const Confettis3D = lazy(chargements.confettis);

/** Hémicycle des questions au gouvernement : salle 3D, ou l'hémicycle 2D en repli. */
export function SceneHemicycle({
  groups,
  total,
  title,
  speaker,
  plan,
  reaction,
  tension,
}: {
  /** Groupes de la partie, de la gauche vers la droite (`seatingOrder`). */
  groups: HemicycleGroup[];
  total: number;
  title: string;
  speaker: string | null;
  plan: 'large' | 'question' | 'reponse';
  reaction: Reaction | null;
  /** Tension parlementaire de la partie (0 à 100). */
  tension: number;
}) {
  const sombre = useMode() === 'dark';
  const sieges = useMemo(() => disposerSieges(total, groups), [total, groups]);
  const couleurs = useMemo(
    () => Object.fromEntries(groups.map((g) => [g.id, groupHex(g.id, sombre)])),
    [groups, sombre],
  );
  const alignements = useMemo(
    () => Object.fromEntries(groups.map((g) => [g.id, g.alignement])),
    [groups],
  );
  const orateur = groups.find((g) => g.id === speaker);
  return (
    <Cadre3D
      nom="hemicycle"
      label={`${title} : ${total} sièges, ${groups.filter((g) => g.sieges > 0).length} groupes${
        orateur ? `, ${orateur.libelle} interpelle le gouvernement` : ''
      }`}
      repli={<Hemicycle title={title} total={total} groups={groups} speaker={speaker} />}
      className="aspect-[16/10] w-full rounded-2xl bg-slate-100 dark:bg-[#0a0f22]"
    >
      {(palier, visible) => (
        <Hemicycle3D
          palier={palier}
          visible={visible}
          sieges={sieges}
          couleurs={couleurs}
          alignements={alignements}
          orateur={speaker}
          plan={plan}
          reaction={reaction}
          tension={tension}
          sombre={sombre}
        />
      )}
    </Cadre3D>
  );
}

export type ArcCarte = { depuis: string; jusqua: string; intensite: number; couleur: string };

/** Carte de France 3D : départements extrudés, dépouillement en onde, arcs de reports de voix. */
export function SceneCarte({
  nom = 'carte',
  label,
  shapes,
  etats,
  arcs = [],
  attente,
  repli,
  intro = true,
  className = '',
}: {
  nom?: string;
  label: string;
  shapes: readonly BoardShape[];
  etats: Readonly<Record<string, Departement3D>>;
  arcs?: readonly ArcCarte[];
  /** Teinte d'un département en attente. */
  attente: string;
  repli: ReactNode;
  intro?: boolean;
  className?: string;
}) {
  const sombre = useMode() === 'dark';
  const formes = useMemo(
    () => shapes.map((s) => ({ code: s.code, d: s.d, label: s.label })),
    [shapes],
  );
  const traces = useMemo(() => {
    const points = new Map(shapes.map((s) => [s.code, s.label]));
    return arcs.flatMap((arc) => {
      const depuis = points.get(arc.depuis);
      const jusqua = points.get(arc.jusqua);
      return depuis && jusqua
        ? [{ depuis, jusqua, intensite: arc.intensite, couleur: arc.couleur }]
        : [];
    });
  }, [arcs, shapes]);
  return (
    <Cadre3D nom={nom} label={label} repli={repli} className={className}>
      {(palier, visible) => (
        <France3D
          nom={nom}
          palier={palier}
          visible={visible}
          formes={formes}
          etats={etats}
          arcs={traces}
          sombre={sombre}
          attente={attente}
          intro={intro}
        />
      )}
    </Cadre3D>
  );
}

export function SceneMeeting({
  foule,
  couleur,
  label,
  repli,
  className = '',
}: {
  foule: Foule;
  couleur: string;
  label: string;
  repli: ReactNode;
  className?: string;
}) {
  return (
    <Cadre3D nom="meeting" label={label} repli={repli} className={className}>
      {(palier, visible) => (
        <Meeting3D palier={palier} visible={visible} foule={foule} couleur={couleur} />
      )}
    </Cadre3D>
  );
}

export function SceneDebat({
  pupitres,
  parle,
  cible,
  tension,
  label,
  className = '',
}: {
  pupitres: readonly { id: string; couleur: string }[];
  parle: string | null;
  cible: string | null;
  tension: number;
  label: string;
  className?: string;
}) {
  // Sans 3D, le plateau garde son habillage 2D existant (pupitres en HTML) : pas de repli propre.
  return (
    <Cadre3D nom="debat" label={label} repli={null} className={className}>
      {(palier, visible) => (
        <Debat3D
          palier={palier}
          visible={visible}
          pupitres={pupitres}
          parle={parle}
          cible={cible}
          tension={tension}
        />
      )}
    </Cadre3D>
  );
}

export function SceneRalliement({
  rallie,
  camp,
  duree,
  label,
  repli,
  className = '',
}: {
  rallie: string;
  camp: string;
  duree: number;
  label: string;
  repli: ReactNode;
  className?: string;
}) {
  return (
    <Cadre3D nom="ralliement" label={label} repli={repli} className={className}>
      {(palier, visible) => (
        <Ralliement3D palier={palier} visible={visible} rallie={rallie} camp={camp} duree={duree} />
      )}
    </Cadre3D>
  );
}

export function SceneInvestiture({
  duree,
  label,
  repli,
  className = '',
}: {
  duree: number;
  label: string;
  repli: ReactNode;
  className?: string;
}) {
  return (
    <Cadre3D nom="investiture" label={label} repli={repli} className={className}>
      {(palier, visible) => <Investiture3D palier={palier} visible={visible} duree={duree} />}
    </Cadre3D>
  );
}

/** Drapeau de l'écran-titre : tissu animé, ou drapeau statique (CSS) en repli et pendant le chargement. */
export function SceneDrapeau({ className = '' }: { className?: string }) {
  const statique = (
    <div
      aria-hidden="true"
      data-drapeau="statique"
      className={`bg-[linear-gradient(90deg,#1f3a93_0_33.33%,#f4f1ea_33.33%_66.66%,#d0312d_66.66%)] ${className}`}
    />
  );
  return (
    <Cadre3D
      nom="drapeau"
      label="Drapeau tricolore qui ondule"
      repli={statique}
      className={`touch-pan-y ${className}`}
    >
      {(palier, visible) => <Drapeau3D palier={palier} visible={visible} />}
    </Cadre3D>
  );
}

/** Confettis de la victoire aux couleurs du camp : par-dessus l'écran, sans capter le toucher. */
export function Confettis({ couleur }: { couleur: string }) {
  const couleurs = useMemo(() => [couleur, '#ffffff', '#e3c46c', couleur], [couleur]);
  return (
    <Cadre3D
      nom="confettis"
      label="Confettis de la victoire"
      repli={null}
      className="pointer-events-none !fixed inset-0 z-[65]"
    >
      {(palier, visible) => <Confettis3D palier={palier} visible={visible} couleurs={couleurs} />}
    </Cadre3D>
  );
}
