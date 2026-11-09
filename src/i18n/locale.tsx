import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import * as russian from './ru';
import * as kazakh from './kk';
import * as ruGuidance from './guidance-ru';
import * as kkGuidance from './guidance-kk';
import * as ruReports from './report-ru';
import * as kkReports from './report-kk';

export type Locale = 'ru' | 'kk';
export type Language = 'ru-RU' | 'kk-KZ';
export const LOCALE_STORAGE_KEY = 'iter-language-v1';
export const localeLanguage = (locale: Locale): Language => locale === 'kk' ? 'kk-KZ' : 'ru-RU';
export function loadLocale(storage: Pick<Storage, 'getItem'>): { locale: Locale; storageWarning: boolean } {
  try {
    const saved = storage.getItem(LOCALE_STORAGE_KEY);
    if (saved === null || saved === 'ru' || saved === 'kk') return { locale: saved ?? 'ru', storageWarning: false };
  } catch { /* Continue in memory when browser storage is denied. */ }
  return { locale: 'ru', storageWarning: true };
}
interface LocaleContextValue { locale: Locale; language: Language; setLocale: (locale: Locale) => void; storageWarning: boolean }
const LocaleContext = createContext<LocaleContextValue>({ locale: 'ru', language: 'ru-RU', setLocale: () => {}, storageWarning: false });
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(() => {
    try { return loadLocale(window.localStorage); }
    catch { return { locale: 'ru' as Locale, storageWarning: true }; }
  });
  const [locale, changeLocale] = useState<Locale>(initial.locale);
  const [storageWarning, setStorageWarning] = useState(initial.storageWarning);
  const setLocale = useCallback((next: Locale) => {
    if (next !== 'ru' && next !== 'kk') return;
    changeLocale(next);
    document.documentElement.lang = localeLanguage(next);
    try { window.localStorage.setItem(LOCALE_STORAGE_KEY, next); setStorageWarning(false); }
    catch { setStorageWarning(true); }
  }, []);
  useEffect(() => { document.documentElement.lang = localeLanguage(locale); document.title = locale === 'kk' ? 'Iter — қолжетімді бағыттар навигаторы' : 'Iter — навигатор доступных маршрутов'; }, [locale]);
  const value = useMemo(() => ({ locale, language: localeLanguage(locale), setLocale, storageWarning }), [locale, setLocale, storageWarning]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
export const useLocale = () => useContext(LocaleContext);
/** Compatibility aliases let components adopt localization without rewriting their domain APIs. */
export function useI18n() {
  const context = useLocale();
  return useMemo(() => ({ ...context, ...getLocaleStrings(context.locale) }), [context]);
}
export function getLocaleStrings(locale: Locale) {
  if (locale === 'kk') return {
    ru: kazakh.kk, guidanceRu: kkGuidance.guidanceKk, speechRu: kkGuidance.speechKk,
    edgeNames: kazakh.edgeNamesKk, reasonNames: kazakh.reasonNamesKk, nodeLabelRu: kazakh.nodeLabelKk,
    passageLabelRu: kazakh.passageLabelKk, numberRu: kazakh.numberKk, countRu: kazakh.countKk,
    stepTextRu: kkGuidance.stepTextKk, routeOutcomeRu: kkGuidance.routeOutcomeKk, routeSpeechRu: kkGuidance.routeSpeechKk,
    reportRu: kkReports.reportKk, reportKindRu: kkReports.reportKindKk, reportStatusRu: kkReports.reportStatusKk,
    reportErrorRu: kkReports.reportErrorKk, publicReportErrorRu: kkReports.publicReportErrorKk,
  };
  return {
    ru: russian.ru, guidanceRu: ruGuidance.guidanceRu, speechRu: ruGuidance.speechRu,
    edgeNames: russian.edgeNames, reasonNames: russian.reasonNames, nodeLabelRu: (id: string, label: string, _labelKk?: string) => { void _labelKk; return russian.nodeLabelRu(id, label); },
    passageLabelRu: (id: string | null, label: string, _labelKk?: string) => { void _labelKk; return russian.passageLabelRu(id, label); }, numberRu: russian.numberRu, countRu: russian.countRu,
    stepTextRu: ruGuidance.stepTextRu, routeOutcomeRu: ruGuidance.routeOutcomeRu, routeSpeechRu: ruGuidance.routeSpeechRu,
    reportRu: ruReports.reportRu, reportKindRu: ruReports.reportKindRu, reportStatusRu: ruReports.reportStatusRu,
    reportErrorRu: ruReports.reportErrorRu, publicReportErrorRu: ruReports.publicReportErrorRu,
  };
}