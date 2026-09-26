import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {installStandaloneFetchInterceptor} from './services/standaloneBackend.ts';
import App from './App.tsx';
import './index.css';

installStandaloneFetchInterceptor();

if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
