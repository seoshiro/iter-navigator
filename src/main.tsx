import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { LanguageProvider } from './i18n/locale';
import './styles.css';

const Presentation = lazy(() => import('./presentation/Presentation'));
const isPresentation = /^\/presentation\/?$/.test(window.location.pathname);
createRoot(document.getElementById('root')!).render(<StrictMode><LanguageProvider storageKey={isPresentation ? 'iter-presentation-language-v1' : undefined} supportedLocales={isPresentation ? ['ru', 'kk'] : undefined}>{isPresentation ? <Suspense fallback={<div role="status" style={{ padding: '10vh 8vw', fontSize: '2rem' }}>ITER</div>}><Presentation /></Suspense> : <App />}</LanguageProvider></StrictMode>);
