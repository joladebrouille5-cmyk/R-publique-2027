// Portrait illustré généré (phase 13) pour les personnages fictifs du jeu — adversaires,
// profils fictifs du gouvernement, candidat personnalisé sans photo : un buste dessiné, déduit
// d'une graine (toujours le même pour le même personnage), sans ressemblance recherchée. Jamais
// employé pour une personne réelle : une personnalité réelle sans photo libre garde une
// silhouette neutre et ses initiales.

/** Empreinte FNV-1a (32 bits) d'une chaîne. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Suite pseudo-aléatoire déterministe (mulberry32) : décor seulement, aucun effet de jeu. */
function sequence(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const SKINS = [
  '#f7dcc8',
  '#efc4a4',
  '#e2ae8b',
  '#cf9670',
  '#b17a55',
  '#8f5d3f',
  '#6e452c',
  '#4f311f',
];
const HAIRS = [
  '#1d1916',
  '#36261c',
  '#563826',
  '#7f5432',
  '#b78a55',
  '#d8bf8c',
  '#8d8d8d',
  '#d9d9d9',
];
const SUITS = ['#1f2a44', '#2d3340', '#3f4652', '#4a3b33', '#5b2433', '#23403a'];
const SHIRTS = ['#ffffff', '#dbe7f5', '#f3efe6'];
export const HAIR_STYLES = [
  'court',
  'raie',
  'carre',
  'long',
  'chignon',
  'boucle',
  'degarni',
  'rase',
] as const;

export type FaceTraits = {
  peau: string;
  cheveux: string;
  coiffure: (typeof HAIR_STYLES)[number];
  costume: string;
  chemise: string;
  cravate: boolean;
  lunettes: boolean;
  barbe: 'aucune' | 'courte' | 'moustache';
  sourire: number;
};

/** Traits d'un visage, déduits de la graine (mêmes traits pour la même graine). */
export function faceTraits(seed: string): FaceTraits {
  const next = sequence(hash(seed));
  const pick = <T,>(list: readonly T[]) => list[Math.floor(next() * list.length)]!;
  const coiffure = pick(HAIR_STYLES);
  const beard = next();
  return {
    peau: pick(SKINS),
    cheveux: pick(HAIRS),
    coiffure,
    costume: pick(SUITS),
    chemise: pick(SHIRTS),
    cravate: next() < 0.55,
    lunettes: next() < 0.28,
    barbe: beard < 0.14 ? 'courte' : beard < 0.22 ? 'moustache' : 'aucune',
    sourire: 0.5 + next() * 2,
  };
}

/** Teinte assombrie (ombres du visage, du cou). */
function shade(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) =>
    Math.max(0, Math.round(((n >> shift) & 255) * (1 - amount)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

/** Cheveux derrière la tête (coiffures longues). */
function HairBack({ traits }: { traits: FaceTraits }) {
  const c = traits.cheveux;
  if (traits.coiffure === 'carre')
    return (
      <path
        d="M18.5 30 C16.5 11 47.5 11 45.5 30 L46 41 C42 43 41 40 40.5 37 L23.5 37 C23 40 22 43 18 41 Z"
        fill={c}
      />
    );
  if (traits.coiffure === 'long')
    return (
      <path
        d="M18 30 C16 10 48 10 46 30 L48 52 C42 55 40 50 40 46 L24 46 C24 50 22 55 16 52 Z"
        fill={c}
      />
    );
  if (traits.coiffure === 'chignon') return <circle cx="32" cy="12.5" r="5.5" fill={c} />;
  return null;
}

/** Cheveux sur le front et les tempes. */
function HairFront({ traits }: { traits: FaceTraits }) {
  const c = traits.cheveux;
  switch (traits.coiffure) {
    case 'court':
      return <path d="M20.6 27 C20 14 44 14 43.4 27 C41 20.5 23 20.5 20.6 27 Z" fill={c} />;
    case 'raie':
      return (
        <path
          d="M20.4 28 C19.5 13 44.5 12.5 43.6 27.5 C42 20 33 17.5 27 21.5 C24.5 23.5 22.3 25.5 20.4 28 Z"
          fill={c}
        />
      );
    case 'carre':
    case 'long':
      return (
        <path
          d="M20.5 27.5 C20 13.5 44 13.5 43.5 27.5 C40 21 35 19 32 22.5 C29 19 24 21 20.5 27.5 Z"
          fill={c}
        />
      );
    case 'chignon':
      return (
        <path d="M20.8 26.5 C20.5 15 43.5 15 43.2 26.5 C40.5 20.5 23.5 20.5 20.8 26.5 Z" fill={c} />
      );
    case 'boucle':
      return (
        <g fill={c}>
          {[
            [22, 22],
            [25.5, 17.5],
            [30, 15.5],
            [34.5, 15.5],
            [38.5, 17.5],
            [42, 22],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="4.2" />
          ))}
        </g>
      );
    case 'degarni':
      return (
        <g fill={c}>
          <path d="M20.6 30 C20 23 21.5 20 23.5 19.5 C23 23 22.5 26 22.6 30 Z" />
          <path d="M43.4 30 C44 23 42.5 20 40.5 19.5 C41 23 41.5 26 41.4 30 Z" />
        </g>
      );
    case 'rase':
      return (
        <path d="M21 26 C21 15.5 43 15.5 43 26 C40 21.5 24 21.5 21 26 Z" fill={c} opacity="0.55" />
      );
  }
}

export function GeneratedPortrait({
  seed,
  background,
}: {
  seed: string;
  /** Fond : couleur de la famille politique (convention du jeu). */
  background: string;
}) {
  const t = faceTraits(seed);
  const skinShade = shade(t.peau, 0.14);
  const ink = '#1d232b';
  return (
    <svg viewBox="7 5 50 50" className="size-full" aria-hidden="true" focusable="false">
      <rect width="64" height="64" fill={background} />
      <circle cx="32" cy="24" r="26" fill="#ffffff" opacity="0.12" />
      <HairBack traits={t} />
      {/* Buste : épaules, col, cravate. */}
      <path d="M7 64 C9 50 19 45.5 32 45.5 C45 45.5 55 50 57 64 Z" fill={t.costume} />
      <path d="M25.5 46 L32 55.5 L38.5 46 Z" fill={t.chemise} />
      {t.cravate ? (
        <path
          d="M30.8 48.5 L33.2 48.5 L34.4 57.5 L32 60.5 L29.6 57.5 Z"
          fill={shade(background, 0.35)}
        />
      ) : (
        <path
          d="M29 46 L32 50.5 L35 46"
          fill="none"
          stroke={shade(t.chemise, 0.25)}
          strokeWidth="0.8"
        />
      )}
      <rect x="27" y="37" width="10" height="10.5" rx="4.5" fill={skinShade} />
      {/* Visage. */}
      <circle cx="20.8" cy="29.5" r="2.6" fill={skinShade} />
      <circle cx="43.2" cy="29.5" r="2.6" fill={skinShade} />
      <ellipse cx="32" cy="28.5" rx="11.2" ry="13.2" fill={t.peau} />
      <HairFront traits={t} />
      <path
        d="M26 25.6 Q28 24.6 30 25.6"
        fill="none"
        stroke={t.cheveux}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M34 25.6 Q36 24.6 38 25.6"
        fill="none"
        stroke={t.cheveux}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="28" cy="29" r="1.25" fill={ink} />
      <circle cx="36" cy="29" r="1.25" fill={ink} />
      <path
        d="M32 30 Q33.6 33.8 31.4 34.4"
        fill="none"
        stroke={shade(t.peau, 0.3)}
        strokeWidth="0.9"
        strokeLinecap="round"
      />
      {t.barbe === 'courte' && (
        <path
          d="M21.5 32 C22 41 27 43.5 32 43.5 C37 43.5 42 41 42.5 32 C40 37.5 37 39 32 39 C27 39 24 37.5 21.5 32 Z"
          fill={t.cheveux}
          opacity="0.92"
        />
      )}
      {t.barbe === 'moustache' && (
        <path
          d="M28.3 36 Q32 34.2 35.7 36 Q32 35.6 28.3 36 Z"
          fill={t.cheveux}
          stroke={t.cheveux}
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
      )}
      <path
        d={`M28.6 37.3 Q32 ${37.3 + t.sourire} 35.4 37.3`}
        fill="none"
        stroke="#7a3b31"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      {t.lunettes && (
        <g fill="none" stroke={ink} strokeWidth="0.9">
          <circle cx="28" cy="29" r="3.3" />
          <circle cx="36" cy="29" r="3.3" />
          <path d="M31.3 29 L32.7 29" />
        </g>
      )}
    </svg>
  );
}

/** Silhouette neutre (personne réelle sans photo libre) : aucune figure dessinée. */
export function Silhouette() {
  return (
    <svg
      viewBox="0 0 64 64"
      className="absolute inset-0 size-full"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="32" cy="26" r="11" fill="#ffffff" opacity="0.18" />
      <path
        d="M10 64 C12 50 21 44.5 32 44.5 C43 44.5 52 50 54 64 Z"
        fill="#ffffff"
        opacity="0.18"
      />
    </svg>
  );
}
