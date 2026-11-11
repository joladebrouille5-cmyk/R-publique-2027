import { CURRENT_RULESET_KEY, getRuleset } from '@r2027/rulesets';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seatingOrder } from '../components/Hemicycle';
import { QualiteSettings } from '../components/QualiteSettings';
import { Hand } from '../plateau/Hand';
import { useQualiteStore } from '../stores/qualite';
import { oublierAppareil } from './appareil';
import { Cinematique } from './Cinematique';
import { fouleDuMeeting, meetingDuBilan } from './foule';
import { chargements, SceneDrapeau, SceneHemicycle } from './scenes';

// Les scènes three.js ne tournent pas sous jsdom : elles sont remplacées par des témoins, ce qui
// laisse vérifier ce qui compte ici — quand elles sont chargées, et quand le repli 2D s'affiche.
const charge = vi.hoisted(() => ({ hemicycle: 0, drapeau: 0, casse: false }));
vi.mock('./three/Hemicycle3D', () => {
  charge.hemicycle += 1;
  return {
    default: (props: { sieges: unknown[]; plan: string; reaction: string | null }) => {
      if (charge.casse) throw new Error('contexte WebGL perdu');
      return (
        <div data-testid="hemicycle-3d">
          {props.sieges.length} sièges, plan {props.plan}, réaction {props.reaction ?? 'aucune'}
        </div>
      );
    },
  };
});
vi.mock('./three/Drapeau3D', () => {
  charge.drapeau += 1;
  return { default: () => <div data-testid="drapeau-3d" /> };
});

const RULESET = getRuleset(CURRENT_RULESET_KEY);
const GROUPES = seatingOrder(RULESET.assemblee.groupes).map((g) => ({
  id: g.id,
  sigle: g.sigle,
  libelle: g.libelle,
  sieges: g.sieges,
  alignement: 'opposition' as const,
}));

/** Simule un appareil avec WebGL (processeur graphique donné) ; sans appel : jsdom, sans WebGL. */
function simulerWebGL(gpu = 'Mali-G68 MP5') {
  vi.stubGlobal('WebGLRenderingContext', class {});
  // Téléphone de milieu de gamme : huit cœurs (la machine d'essai peut en avoir moins).
  vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(8);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        RENDERER: 1,
        getParameter: () => gpu,
        getExtension: (nom: string) =>
          nom === 'WEBGL_debug_renderer_info'
            ? { UNMASKED_RENDERER_WEBGL: 2 }
            : nom === 'WEBGL_lose_context'
              ? { loseContext() {} }
              : null,
      }) as never,
  );
  oublierAppareil();
}
function mouvementReduit(reduit: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduit && query.includes('reduced-motion'),
    addEventListener() {},
    removeEventListener() {},
  }));
}

const hemicycle = (plan: 'large' | 'question' | 'reponse' = 'large') => (
  <SceneHemicycle
    title="Hémicycle pendant les questions au gouvernement"
    total={RULESET.assemblee.siegesTotal}
    groups={GROUPES}
    speaker={GROUPES[0]!.id}
    plan={plan}
    reaction={null}
    tension={40}
  />
);

beforeEach(() => {
  charge.casse = false;
  useQualiteStore.setState({ choix: 'auto', abaisse: null });
  oublierAppareil();
  mouvementReduit(false);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  oublierAppareil();
});

describe('repli 2D des scènes', () => {
  it('affiche l’hémicycle 2D quand WebGL est indisponible, sans charger la scène', () => {
    const avant = charge.hemicycle;
    const { container } = render(hemicycle());
    expect(
      screen.getByRole('img', { name: /Hémicycle pendant les questions au gouvernement/ }),
    ).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('[data-scene3d]')).toBeNull();
    expect(charge.hemicycle).toBe(avant);
  });

  it('charge la scène 3D à la demande quand WebGL est disponible, au palier de l’appareil', async () => {
    simulerWebGL();
    const { container } = render(hemicycle('question'));
    // Pendant le chargement de three.js : le repli 2D tient la place.
    expect(container.querySelector('svg')).not.toBeNull();
    expect(await screen.findByTestId('hemicycle-3d')).toHaveTextContent(
      '577 sièges, plan question, réaction aucune',
    );
    const cadre = container.querySelector('[data-scene3d="hemicycle"]')!;
    expect(cadre).toHaveAttribute('data-palier', 'standard');
    expect(cadre).toHaveAttribute('role', 'img');
    expect(cadre).toHaveAccessibleName(/577 sièges/);
    expect(charge.hemicycle).toBe(1);
  });

  it('tient un rendu logiciel pour une absence de WebGL, sauf palier forcé', async () => {
    simulerWebGL('Google SwiftShader');
    const { container, unmount } = render(hemicycle());
    expect(container.querySelector('[data-scene3d]')).toBeNull();
    unmount();
    act(() => useQualiteStore.getState().setChoix('eco'));
    render(hemicycle());
    expect(await screen.findByTestId('hemicycle-3d')).toBeInTheDocument();
  });

  it('abaisse le palier puis replie en 2D quand les images par seconde restent sous 30', async () => {
    simulerWebGL();
    const { container } = render(hemicycle());
    await screen.findByTestId('hemicycle-3d');
    // Ce que fait la garde d'images par seconde de la toile quand elle signale.
    act(() => useQualiteStore.getState().abaisser('standard'));
    expect(container.querySelector('[data-scene3d]')).toHaveAttribute('data-palier', 'eco');
    act(() => useQualiteStore.getState().abaisser('eco'));
    expect(container.querySelector('[data-scene3d]')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('replie en 2D en mouvement réduit, sur choix « Sans 3D » et sur une erreur de rendu', async () => {
    simulerWebGL();
    mouvementReduit(true);
    const reduit = render(hemicycle());
    expect(reduit.container.querySelector('[data-scene3d]')).toBeNull();
    reduit.unmount();

    mouvementReduit(false);
    act(() => useQualiteStore.getState().setChoix('2d'));
    const choisi = render(hemicycle());
    expect(choisi.container.querySelector('[data-scene3d]')).toBeNull();
    choisi.unmount();

    act(() => useQualiteStore.getState().setChoix('auto'));
    charge.casse = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const casse = render(hemicycle());
    await vi.waitFor(() => expect(casse.container.querySelector('svg')).not.toBeNull());
    expect(casse.container.querySelector('[data-testid="hemicycle-3d"]')).toBeNull();
  });

  it('garde un drapeau statique à l’écran-titre pendant le chargement et sans WebGL', async () => {
    const sans = render(<SceneDrapeau />);
    expect(sans.container.querySelector('[data-drapeau="statique"]')).not.toBeNull();
    sans.unmount();
    simulerWebGL();
    const avec = render(<SceneDrapeau />);
    expect(avec.container.querySelector('[data-drapeau="statique"]')).not.toBeNull();
    expect(await screen.findByTestId('drapeau-3d')).toBeInTheDocument();
    expect(avec.container.querySelector('[data-drapeau="statique"]')).toBeNull();
  });
});

describe('chargement à la demande', () => {
  const SRC = join(__dirname, '..');
  const fichiers = (dossier: string): string[] =>
    readdirSync(dossier).flatMap((nom) => {
      const chemin = join(dossier, nom);
      return statSync(chemin).isDirectory() ? fichiers(chemin) : [chemin];
    });

  it('n’importe three.js que dans les scènes chargées à la demande', () => {
    const fautifs = fichiers(SRC)
      .filter((f) => /\.tsx?$/.test(f) && !f.includes(join('scenes3d', 'three')))
      .filter((f) =>
        /from '(three|three\/[^']*|@react-three\/[^']*)'/.test(readFileSync(f, 'utf8')),
      );
    expect(fautifs).toEqual([]);
  });

  it('n’atteint chaque scène que par un import dynamique', () => {
    const scenes = readFileSync(join(SRC, 'scenes3d', 'scenes.tsx'), 'utf8');
    expect(scenes).not.toMatch(/^import .*from '\.\/three\//m);
    expect(Object.keys(chargements).sort()).toEqual(
      [
        'carte',
        'confettis',
        'debat',
        'drapeau',
        'hemicycle',
        'investiture',
        'meeting',
        'ralliement',
      ].sort(),
    );
    for (const nom of Object.keys(chargements))
      expect(scenes).toMatch(new RegExp(`${nom}: \\(\\) => import\\('\\./three/`));
  });
});

describe('transitions', () => {
  it('se réduit à un écran statique qui attend « Continuer » sans 3D ou en mouvement réduit', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onFin = vi.fn();
    render(
      <Cinematique titre="L’investiture" dureeMs={1000} onFin={onFin}>
        <div />
      </Cinematique>,
    );
    const ecran = screen.getByRole('dialog', { name: 'L’investiture' });
    expect(ecran).toHaveAttribute('data-cinematique', 'statique');
    act(() => vi.advanceTimersByTime(5000));
    expect(onFin).not.toHaveBeenCalled();
    vi.useRealTimers();
    await userEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(onFin).toHaveBeenCalledTimes(1);
  });

  it('se saute au toucher et se referme d’elle-même en 3D', () => {
    simulerWebGL();
    vi.useFakeTimers();
    const onFin = vi.fn();
    render(
      <Cinematique titre="Ralliement" dureeMs={12_000} onFin={onFin}>
        <div />
      </Cinematique>,
    );
    const ecran = screen.getByRole('dialog', { name: 'Ralliement' });
    expect(ecran).toHaveAttribute('data-cinematique', 'animee');
    expect(screen.getByRole('button', { name: 'Passer' })).toBeInTheDocument();
    // Sans canevas à l'écran (ici, jamais), le compte à rebours part après six secondes d'attente.
    act(() => vi.advanceTimersByTime(6_100));
    act(() => vi.advanceTimersByTime(11_000));
    expect(onFin).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1_500));
    expect(onFin).toHaveBeenCalledTimes(1);
    act(() => ecran.click());
    expect(onFin).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

describe('réglages de qualité', () => {
  it('propose l’automatique, les trois paliers et « Sans 3D », et dit ce qui s’applique', async () => {
    simulerWebGL();
    render(<QualiteSettings />);
    const groupe = screen.getByRole('radiogroup', { name: 'Qualité des scènes 3D' });
    expect(groupe.querySelectorAll('input[type=radio]')).toHaveLength(5);
    expect(screen.getByRole('status')).toHaveTextContent('scènes 3D au palier standard.');
    await userEvent.click(screen.getByRole('radio', { name: /^Éco/ }));
    expect(useQualiteStore.getState().choix).toBe('eco');
    expect(screen.getByRole('status')).toHaveTextContent('scènes 3D au palier éco (forcé).');
    await userEvent.click(screen.getByRole('radio', { name: /^Sans 3D/ }));
    expect(screen.getByRole('status')).toHaveTextContent('versions 2D');
  });

  it('explique le repli quand l’appareil n’a pas WebGL', () => {
    render(<QualiteSettings />);
    expect(screen.getByRole('status')).toHaveTextContent('WebGL');
  });
});

describe('main de cartes et meeting', () => {
  it('écrit chaque titre de carte en entier, sans troncature, dans un éventail en CSS 3D', () => {
    const cards = RULESET.actions.map((definition) => ({ definition, reason: null, combo: null }));
    const { container } = render(
      <Hand cards={cards} ruleset={RULESET} presidency={false} armed="tournee" onPlay={() => {}} />,
    );
    expect(container.querySelector('[data-eventail="3d"]')).not.toBeNull();
    const titres = [...container.querySelectorAll<HTMLElement>('[data-titre-carte]')];
    expect(titres).toHaveLength(RULESET.actions.length);
    expect(titres.map((t) => t.textContent).sort()).toEqual(
      RULESET.actions.map((a) => a.libelle).sort(),
    );
    expect(titres.map((t) => t.textContent)).toContain('Tournée de terrain (3 jours)');
    for (const titre of titres) expect(titre.className).not.toMatch(/truncate|line-clamp|ellipsis/);
    expect(container.querySelectorAll('.truncate')).toHaveLength(0);
    expect(container.querySelectorAll('.carte-prise')).toHaveLength(1);
  });

  it('lit le meeting du joueur dans le bilan de la semaine', () => {
    const report = {
      actions: [
        {
          actorId: 'adv',
          actionId: 'meeting',
          label: 'Meeting public',
          status: 'validee',
          cible: 'Nord (59)',
        },
        {
          actorId: 'moi',
          actionId: 'porte-a-porte',
          label: 'Porte-à-porte',
          status: 'validee',
          cible: 'Nord (59)',
        },
        {
          actorId: 'moi',
          actionId: 'grand-meeting',
          label: 'Grand meeting national',
          status: 'validee',
          cible: 'Corse-du-Sud (2A)',
        },
      ],
      implantation: [{ actorId: 'moi', departement: '2A', before: 60, after: 80 }],
    };
    const joueur = { id: 'moi', militants: 12_000, implantation: { '2A': 80 } };
    const trouve = meetingDuBilan(report, joueur, RULESET.implantation.gains)!;
    expect(trouve.departement).toBe('2A');
    expect(trouve.lieu).toBe('Corse-du-Sud');
    expect(trouve.meeting).toEqual({
      implantation: 60,
      militants: 12_000,
      gain: 20,
      gainNominal: RULESET.implantation.gains['grand-meeting'],
      grand: true,
    });
    expect(fouleDuMeeting(trouve.meeting, 3000).reussi).toBe(true);
    expect(
      meetingDuBilan({ ...report, actions: report.actions.slice(0, 2) }, joueur, {}),
    ).toBeNull();
  });
});
