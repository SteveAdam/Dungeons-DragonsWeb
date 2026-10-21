import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
// Self-hosted fonts (no CDN): Cinzel for headings and labels, IM Fell English for body text.
import '@fontsource/cinzel/400.css';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/im-fell-english/400.css';
import '@fontsource/im-fell-english/400-italic.css';
import './styles/tokens.css';
import './styles/base.css';
// Applies the saved display settings to <html> before the first render.
import './state/displaySettings';
import App from './App';
import { AuthProvider } from './auth/AuthProvider';
import { createQueryClient } from './lib/queryClient';

const queryClient = createQueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
