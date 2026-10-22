import { lazy, Suspense, type ComponentType } from 'react';
import { Navigate, type RouteObject } from 'react-router';
import { AppLayout } from './components/AppLayout';
import { Unavailable } from './components/Unavailable';
import { Bilan } from './screens/Bilan';
import { Candidates } from './screens/Candidates';
import { Dashboard } from './screens/Dashboard';
import { Finances } from './screens/Finances';
import { GameLayout } from './screens/GameLayout';
import { Crises } from './screens/Crises';
import { Economy } from './screens/Economy';
import { Government } from './screens/Government';
import { Parliament } from './screens/Parliament';
import { Home } from './screens/Home';
import { Journal } from './screens/Journal';
import { Legislatives } from './screens/Legislatives';
import { Medias } from './screens/Medias';
import { NewGame } from './screens/NewGame';
import { NotFound, RouteError } from './screens/NotFound';
import { Parametres } from './screens/Parametres';
import { Polls } from './screens/Polls';
import { Programme } from './screens/Programme';
import { GAME_SCREENS } from './screens/registry';
import { Results } from './screens/Results';
import { Saves } from './screens/Saves';

// La carte (MapLibre, ~1 Mo) n'est chargée qu'à l'ouverture de son écran.
const LazyMapScreen = lazy(() =>
  import('./screens/MapScreen').then((m) => ({ default: m.MapScreen })),
);
function MapScreen() {
  return (
    <Suspense fallback={<p>Chargement de la carte…</p>}>
      <LazyMapScreen />
    </Suspense>
  );
}
// Débat télévisé en direct (phase 10) : hors du menu, ouvert depuis le tableau de bord.
const LazyDebat = lazy(() => import('./screens/Debat').then((m) => ({ default: m.Debat })));
function Debat() {
  return (
    <Suspense fallback={<p>Ouverture du plateau…</p>}>
      <LazyDebat />
    </Suspense>
  );
}
// Soirée électorale (direct du dépouillement) : hors du menu, ouverte après chaque tour.
const LazySoiree = lazy(() => import('./screens/Soiree').then((m) => ({ default: m.Soiree })));
function Soiree() {
  return (
    <Suspense fallback={<p>Ouverture de la soirée électorale…</p>}>
      <LazySoiree />
    </Suspense>
  );
}

const IMPLEMENTED: Record<string, ComponentType> = {
  'tableau-de-bord': Dashboard,
  carte: MapScreen,
  candidats: Candidates,
  medias: Medias,
  programme: Programme,
  finances: Finances,
  gouvernement: Government,
  parlement: Parliament,
  economie: Economy,
  crises: Crises,
  legislatives: Legislatives,
  bilan: Bilan,
  sondages: Polls,
  resultats: Results,
  journal: Journal,
  sauvegardes: Saves,
};

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Home /> },
      { path: 'nouvelle-partie', element: <NewGame /> },
      { path: 'parametres', element: <Parametres /> },
      {
        path: 'parties/:gameId',
        element: <GameLayout />,
        children: [
          { index: true, element: <Navigate to="tableau-de-bord" replace /> },
          ...GAME_SCREENS.map((screen) => {
            const Screen = IMPLEMENTED[screen.path];
            return {
              path: screen.path,
              element: screen.available && Screen ? <Screen /> : <Unavailable screen={screen} />,
            };
          }),
          { path: 'soiree/:tour', element: <Soiree /> },
          { path: 'debat/:debatId', element: <Debat /> },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
];
