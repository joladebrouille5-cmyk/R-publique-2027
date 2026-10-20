import type { ComponentType } from 'react';
import { Navigate, type RouteObject } from 'react-router';
import { AppLayout } from './components/AppLayout';
import { Unavailable } from './components/Unavailable';
import { Dashboard } from './screens/Dashboard';
import { GameLayout } from './screens/GameLayout';
import { Home } from './screens/Home';
import { Journal } from './screens/Journal';
import { NewGame } from './screens/NewGame';
import { NotFound, RouteError } from './screens/NotFound';
import { GAME_SCREENS } from './screens/registry';
import { Saves } from './screens/Saves';

const IMPLEMENTED: Record<string, ComponentType> = {
  'tableau-de-bord': Dashboard,
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
