import React from 'react';
import { TranslationKey, TranslationValue, Language } from '../types';
import { Edit, AlertTriangle } from 'lucide-react';
import { useI18n } from '../services/i18n';

interface WrongTranslationOccurrence {
  keyId: string;
  keyName: string;
  lang1: string;
  lang2: string;
  value: string;
}

interface OccurrencesTabProps {
  keys: TranslationKey[];
  values: Record<string, TranslationValue>;
  languages: Language[];
  sourceLangCode: string;
  unusedKeys: string[] | null;
  scanningUnusedKeys: boolean;
  onScanUnusedKeys: () => void;
  onEdit: (keyId: string, langCode: string) => void;
}

const OccurrencesTab: React.FC<OccurrencesTabProps> = ({
  keys,
  values,
  languages,
  sourceLangCode,
  unusedKeys,
  scanningUnusedKeys,
  onScanUnusedKeys,
  onEdit,
}) => {
  const t = useI18n();

  const wrongTranslations = React.useMemo<WrongTranslationOccurrence[]>(() => {
    const results: WrongTranslationOccurrence[] = [];
    for (const key of keys) {
      const keyValues = values[key.id] || {};
      const langCodes = languages.map(l => l.code).filter(code => {
        const v = keyValues[code];
        return v && v.trim().length > 0;
      });
      let found = false;
      for (let i = 0; i < langCodes.length && !found; i++) {
        for (let j = i + 1; j < langCodes.length && !found; j++) {
          const code1 = langCodes[i];
          const code2 = langCodes[j];
          if (keyValues[code1].trim() === keyValues[code2].trim()) {
            results.push({
              keyId: key.id,
              keyName: key.key,
              lang1: code1,
              lang2: code2,
              value: keyValues[code1],
            });
            found = true;
          }
        }
      }
    }
    return results;
  }, [keys, values, languages]);

  const getLangName = (code: string) => {
    const lang = languages.find(l => l.code === code);
    return lang ? (lang.flag ? `${lang.flag} ${lang.name}` : lang.name) : code;
  };

  return (
    <div className="space-y-6 animate-fade-in text-gray-900 dark:text-gray-100">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-white">{t('occurrences.title')}</h1>
        <p className="text-gray-500 dark:text-gray-400">{t('occurrences.subtitle')}</p>
      </header>

      {/* Unused Keys Section */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white">{t('occurrences.unusedKeys.title')}</h3>
          <button
            onClick={onScanUnusedKeys}
            disabled={scanningUnusedKeys}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white transition-colors"
          >
            {scanningUnusedKeys ? t('occurrences.unusedKeys.scanning') : t('occurrences.unusedKeys.scan')}
          </button>
        </div>
        {unusedKeys === null ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('occurrences.unusedKeys.prompt')}</p>
        ) : unusedKeys.length === 0 ? (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">{t('occurrences.unusedKeys.none')}</p>
        ) : (
          <>
            <p className="text-sm text-amber-600 dark:text-amber-400 mb-3">
              {t('occurrences.unusedKeys.found', { count: String(unusedKeys.length) })}
            </p>
            <ul className="space-y-1 max-h-64 overflow-y-auto">
              {unusedKeys.map(keyName => {
                const keyObj = keys.find(k => k.key === keyName);
                return (
                  <li
                    key={keyName}
                    className="flex items-center justify-between px-2 py-1 rounded bg-gray-50 dark:bg-gray-900 group"
                  >
                    <span className="font-mono text-xs text-gray-700 dark:text-gray-300">{keyName}</span>
                    {keyObj && (
                      <button
                        onClick={() => onEdit(keyObj.id, sourceLangCode)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 flex items-center gap-1 text-xs"
                        title={t('occurrences.edit')}
                      >
                        <Edit className="w-3 h-3" /> {t('occurrences.edit')}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {/* Wrong Translation Section */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white">{t('occurrences.wrongTranslation.title')}</h3>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">{t('occurrences.wrongTranslation.description')}</p>
        {wrongTranslations.length === 0 ? (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">{t('occurrences.wrongTranslation.none')}</p>
        ) : (
          <>
            <p className="text-sm text-amber-600 dark:text-amber-400 mb-3">
              {t('occurrences.wrongTranslation.found', { count: String(wrongTranslations.length) })}
            </p>
            <ul className="space-y-2 max-h-96 overflow-y-auto">
              {wrongTranslations.map((occ, idx) => (
                <li
                  key={`${occ.keyId}-${idx}`}
                  className="flex items-start justify-between gap-3 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{occ.keyName}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      <span className="font-medium">{getLangName(occ.lang1)}</span>
                      {' = '}
                      <span className="font-medium">{getLangName(occ.lang2)}</span>
                      {': '}
                      <span className="italic line-clamp-1" title={occ.value}>"{occ.value}"</span>
                    </div>
                  </div>
                  <button
                    onClick={() => onEdit(occ.keyId, occ.lang1)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 flex items-center gap-1 text-xs"
                    title={t('occurrences.edit')}
                  >
                    <Edit className="w-3 h-3" /> {t('occurrences.edit')}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
};

export default OccurrencesTab;
