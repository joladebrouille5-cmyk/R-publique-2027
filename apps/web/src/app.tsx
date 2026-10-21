import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import './index.css';
import { routes } from './routes';

/**
 * Monte l'application dans `element`. Partagé par l'entrée web (API HTTP) et par l'application
 * mobile (moteur local), qui installe son transport avant l'appel.
 */
export function mountApp(element: HTMLElement): void {
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
