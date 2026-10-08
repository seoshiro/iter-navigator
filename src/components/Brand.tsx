import { ru } from '../i18n/ru';

// An open architectural frame crossed by a route; the wordmark uses authored paths.
export function Brand() {
  return <a href="#" className="brand" aria-label={`${ru.brand}, начало страницы`}>
    <svg className="brand-symbol" viewBox="0 0 40 40" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path className="brand-opening" d="M10 32V7H30V32" />
      <path className="brand-route" d="M3 31H17V23H36" />
    </svg>
    <span className="brand-name"><svg className="brand-wordmark" viewBox="0 0 96 34" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M3 4H17M10 4V28M3 28H17M29 6V22Q29 28 35 28H38M23 12H39M48 20H67C67 10 48 9 48 20C48 31 65 31 67 26M77 28V13M77 20C77 15 83 11 89 14" />
    </svg><small>УЧЕБНЫЙ НАВИГАТОР</small></span>
  </a>;
}
