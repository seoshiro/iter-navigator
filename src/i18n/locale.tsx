import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import * as russian from './ru';
import * as kazakh from './kk';
import * as english from './en';
import * as ruGuidance from './guidance-ru';
import * as kkGuidance from './guidance-kk';
import * as enGuidance from './guidance-en';
import * as ruReports from './report-ru';
import * as kkReports from './report-kk';
import * as enReports from './report-en';

export type Locale = 'ru' | 'kk' | 'en';
export type Language = 'ru-RU' | 'kk-KZ' | 'en-US';
export const LOCALE_STORAGE_KEY = 'iter-language-v1';
export const SUPPORTED_LOCALES: readonly Locale[] = ['ru', 'kk', 'en'];
export const localeLanguage = (locale: Locale): Language => ({ ru: 'ru-RU', kk: 'kk-KZ', en: 'en-US' } as const)[locale];
export const localeTitle = (locale: Locale): string => ({ ru: 'Iter — навигатор доступных маршрутов', kk: 'Iter — қолжетімді бағыттар навигаторы', en: 'Iter — Accessible route navigator' })[locale];
export function loadLocale(storage: Pick<Storage, 'getItem'>, storageKey = LOCALE_STORAGE_KEY, supportedLocales: readonly Locale[] = SUPPORTED_LOCALES): { locale: Locale; storageWarning: boolean } {
  const fallback = supportedLocales.includes('ru') ? 'ru' : supportedLocales[0] ?? 'ru';
  try {
    const saved = storage.getItem(storageKey);
    if (saved === null) return { locale: fallback, storageWarning: false };
    if (SUPPORTED_LOCALES.includes(saved as Locale)) return { locale: supportedLocales.includes(saved as Locale) ? saved as Locale : fallback, storageWarning: false };
  } catch { /* Continue in memory when browser storage is denied. */ }
  return { locale: fallback, storageWarning: true };
}
interface LocaleContextValue { locale: Locale; language: Language; setLocale: (locale: Locale) => void; storageWarning: boolean }
const LocaleContext = createContext<LocaleContextValue>({ locale: 'ru', language: 'ru-RU', setLocale: () => {}, storageWarning: false });
export function LanguageProvider({ children, storageKey = LOCALE_STORAGE_KEY, supportedLocales = SUPPORTED_LOCALES }: { children: ReactNode; storageKey?: string; supportedLocales?: readonly Locale[] }) {
  const [initial] = useState(() => {
    try { return loadLocale(window.localStorage, storageKey, supportedLocales); }
    catch { return { locale: 'ru' as Locale, storageWarning: true }; }
  });
  const [locale, changeLocale] = useState<Locale>(initial.locale);
  const [storageWarning, setStorageWarning] = useState(initial.storageWarning);
  const setLocale = useCallback((next: Locale) => {
    if (!SUPPORTED_LOCALES.includes(next) || !supportedLocales.includes(next)) return;
    changeLocale(next);
    document.documentElement.lang = localeLanguage(next);
    try { window.localStorage.setItem(storageKey, next); setStorageWarning(false); }
    catch { setStorageWarning(true); }
  }, [storageKey, supportedLocales]);
  useEffect(() => { document.documentElement.lang = localeLanguage(locale); document.title = localeTitle(locale); }, [locale]);
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
  if (locale === 'en') return {
    ru: english.en, guidanceRu: enGuidance.guidanceEn, speechRu: enGuidance.speechEn,
    edgeNames: english.edgeNamesEn, reasonNames: english.reasonNamesEn, nodeLabelRu: english.nodeLabelEn,
    passageLabelRu: english.passageLabelEn, numberRu: english.numberEn, countRu: english.countEn,
    nodeSearchText: english.nodeSearchText, closureGroupLabel: english.closureGroupLabelEn,
    stepTextRu: enGuidance.stepTextEn, routeOutcomeRu: enGuidance.routeOutcomeEn, routeSpeechRu: enGuidance.routeSpeechEn,
    reportRu: enReports.reportEn, reportKindRu: enReports.reportKindEn, reportStatusRu: enReports.reportStatusEn,
    reportErrorRu: enReports.reportErrorEn, publicReportErrorRu: enReports.publicReportErrorEn,
  };
  if (locale === 'kk') return {
    ru: kazakh.kk, guidanceRu: kkGuidance.guidanceKk, speechRu: kkGuidance.speechKk,
    edgeNames: kazakh.edgeNamesKk, reasonNames: kazakh.reasonNamesKk, nodeLabelRu: kazakh.nodeLabelKk,
    passageLabelRu: kazakh.passageLabelKk, numberRu: kazakh.numberKk, countRu: kazakh.countKk,
    nodeSearchText: english.nodeSearchText, closureGroupLabel: (_id: string, label: string, labelKk?: string) => { void _id; return labelKk ?? kazakh.modelTextKk(label); },
    stepTextRu: kkGuidance.stepTextKk, routeOutcomeRu: kkGuidance.routeOutcomeKk, routeSpeechRu: kkGuidance.routeSpeechKk,
    reportRu: kkReports.reportKk, reportKindRu: kkReports.reportKindKk, reportStatusRu: kkReports.reportStatusKk,
    reportErrorRu: kkReports.reportErrorKk, publicReportErrorRu: kkReports.publicReportErrorKk,
  };
  return {
    ru: russian.ru, guidanceRu: ruGuidance.guidanceRu, speechRu: ruGuidance.speechRu,
    edgeNames: russian.edgeNames, reasonNames: russian.reasonNames, nodeLabelRu: (id: string, label: string, _labelKk?: string) => { void _labelKk; return russian.nodeLabelRu(id, label); },
    passageLabelRu: (id: string | null, label: string, _labelKk?: string) => { void _labelKk; return russian.passageLabelRu(id, label); }, numberRu: russian.numberRu, countRu: russian.countRu,
    nodeSearchText: english.nodeSearchText, closureGroupLabel: (_id: string, label: string, _labelKk?: string) => { void _id; void _labelKk; return label; },
    stepTextRu: ruGuidance.stepTextRu, routeOutcomeRu: ruGuidance.routeOutcomeRu, routeSpeechRu: ruGuidance.routeSpeechRu,
    reportRu: ruReports.reportRu, reportKindRu: ruReports.reportKindRu, reportStatusRu: ruReports.reportStatusRu,
    reportErrorRu: ruReports.reportErrorRu, publicReportErrorRu: ruReports.publicReportErrorRu,
  };
}
