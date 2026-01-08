import React, { createContext, useContext, useMemo } from 'react';

type Dictionary = Record<string, string>;

export type Translator = (key: string, vars?: Record<string, string | number>) => string;

const normalizeLocale = (value: string) => value.toLowerCase().replace('_', '-');

const loadDictionaries = (): Record<string, Dictionary> => {
  const modules = import.meta.glob('../ui-i18n/*.json', { eager: true }) as Record<
    string,
    { default: Dictionary }
  >;
  const dictionaries: Record<string, Dictionary> = {};

  for (const [path, mod] of Object.entries(modules)) {
    const match = path.match(/\/([^/]+)\.json$/);
    if (!match) continue;
    const normalized = normalizeLocale(match[1]);
    dictionaries[normalized] = mod.default;
    const base = normalized.split('-')[0];
    if (!dictionaries[base]) {
      dictionaries[base] = mod.default;
    }
  }

  return dictionaries;
};

const dictionaries = loadDictionaries();

const interpolate = (value: string, vars?: Record<string, string | number>) => {
  if (!vars) return value;
  return Object.keys(vars).reduce((acc, key) => {
    const pattern = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    return acc.replace(pattern, String(vars[key]));
  }, value);
};

export const createTranslator = (locale: string): Translator => {
  const normalized = normalizeLocale(locale);
  const base = normalized.split('-')[0];
  const fallback = dictionaries.en || Object.values(dictionaries)[0] || {};
  const dictionary = dictionaries[normalized] || dictionaries[base] || fallback;

  return (key, vars) => {
    const template = dictionary[key] || fallback[key] || key;
    return interpolate(template, vars);
  };
};

const I18nContext = createContext<Translator>(() => '');

export const I18nProvider: React.FC<{ locale: string; children: React.ReactNode }> = ({ locale, children }) => {
  const t = useMemo(() => createTranslator(locale), [locale]);
  return React.createElement(I18nContext.Provider, { value: t }, children);
};

export const useI18n = () => useContext(I18nContext);
