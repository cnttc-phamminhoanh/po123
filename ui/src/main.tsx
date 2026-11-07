import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';

import { I18nProvider } from './i18n';
import PoSummaryPage from './page';
import './styles/index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});

const container: HTMLElement | null = document.getElementById('root');
if (!container) {
  throw new Error('#root container not found');
}

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <div className="app-shell">
          <PoSummaryPage />
        </div>
        <Toaster position="top-center" />
      </I18nProvider>
    </QueryClientProvider>
  </StrictMode>,
);
