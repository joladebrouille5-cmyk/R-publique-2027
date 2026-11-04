import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { browserSound } from './audio/navigateur';
import { setSoundFactory } from './audio/systeme';
import './index.css';
import { routes } from './routes';

/**
 * Monte l'application dans `element`. Partagé par l'entrée web (API HTTP) et par l'application
 * mobile (moteur local), qui installe son transport avant l'appel.
 */
export function mountApp(element: HTMLElement): void {
  // Son (phase 19) : système du navigateur, muet tant que le joueur n'a fait aucun geste.
  setSoundFactory(browserSound);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
  });
  const router = createBrowserRouter(routes);
  createRoot(element).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );
}
