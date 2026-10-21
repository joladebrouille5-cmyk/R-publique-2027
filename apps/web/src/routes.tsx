import { lazy, Suspense, type ComponentType } from 'react';
import { Navigate, type RouteObject } from 'react-router';
import { AppLayout } from './components/AppLayout';
import { Unavailable } from './components/Unavailable';
import { Candidates } from './screens/Candidates';
import { Dashboard } from './screens/Dashboard';
import { Finances } from './screens/Finances';
import { GameLayout } from './screens/GameLayout';
import { Home } from './screens/Home';
import { Journal } from './screens/Journal';
import { Medias } from './screens/Medias';
import { NewGame } from './screens/NewGame';
import { NotFound, RouteError } from './screens/NotFound';
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

const IMPLEMENTED: Record<string, ComponentType> = {
  'tableau-de-bord': Dashboard,
  carte: MapScreen,
  candidats: Candidates,
  medias: Medias,
  programme: Programme,
  finances: Finances,
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
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
];
