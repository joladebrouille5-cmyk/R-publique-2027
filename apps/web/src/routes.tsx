import { lazy, Suspense } from 'react';
import { Navigate, type RouteObject } from 'react-router';
import { AppLayout } from './components/AppLayout';
import { Dashboard } from './screens/Dashboard';
import { Plateau } from './screens/Plateau';
import { Espace } from './screens/Espace';
import { GameLayout } from './screens/GameLayout';
import { Home } from './screens/Home';
import { NewGame } from './screens/NewGame';
import { NotFound, RouteError } from './screens/NotFound';
import { Parametres } from './screens/Parametres';
import { GAME_SCREENS } from './screens/registry';
import { HUBS, screenHref } from './screens/shell/navigation';

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
          { index: true, element: <Navigate to="plateau" replace /> },
          { path: 'plateau', element: <Plateau /> },
          // Phase 12 : cinq espaces ; chaque écran du registre est une section de l'un d'eux.
          { path: 'tableau-de-bord', element: <Dashboard /> },
          { path: 'carte', element: <MapScreen /> },
          ...HUBS.filter((hub) => hub.sections.length > 0 && hub.path !== 'plateau').map((hub) => ({
            path: hub.path,
            element: <Espace key={hub.path} hub={hub} />,
          })),
          // Anciennes adresses d'écran : l'espace, avec la section dépliée.
          ...GAME_SCREENS.filter((screen) => !HUBS.some((hub) => hub.path === screen.path)).map(
            (screen) => ({
              path: screen.path,
              element: <Navigate to={`../${screenHref(screen.path)}`} replace />,
            }),
          ),
          { path: 'soiree/:tour', element: <Soiree /> },
          { path: 'debat/:debatId', element: <Debat /> },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
];
