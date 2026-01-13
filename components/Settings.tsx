import React, { useMemo } from 'react';
import { Info, Globe } from 'lucide-react';
import { Language, TokenUsageReport, TranslationKey, TranslationValue } from '../types';
import { buildToonPrompt, estimateTokenCount } from '../services/toonPrompt';
import { estimateOpenAiCost, formatUsd } from '../services/openAiPricing';
import { useI18n } from '../services/i18n';
import { APP_VERSION } from '../appVersion';

interface SettingsProps {
  allLanguages: Language[];
  keys: TranslationKey[];
  values: Record<string, TranslationValue>;
  sourceLangCode: string;
  openAiApiKey: string;
  openAiModel: string;
  tokenReport: TokenUsageReport;
  onSetSourceLanguage: (code: string) => void;
  onUpdateOpenAiApiKey: (value: string) => void;
  onUpdateOpenAiModel: (value: string) => void;
  onAddLanguage: (code: string, name?: string) => void;
}

const Settings: React.FC<SettingsProps> = ({
  allLanguages,
  keys,
  values,
  sourceLangCode,
  onSetSourceLanguage,
  openAiApiKey,
  openAiModel,
  tokenReport,
  onUpdateOpenAiApiKey,
  onUpdateOpenAiModel,
  onAddLanguage
}) => {
  const t = useI18n();

  const normalizeLanguageCode = (code: string) => {
    const lower = code.toLowerCase();
    if (lower === 'zn' || lower.startsWith('zh')) return 'zh';
    if (lower.startsWith('pt')) return 'pt';
    return lower;
  };

  const suggestedLanguages = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'it', name: 'Italian' },
    { code: 'ja', name: 'Japanese' },
    { code: 'zh', name: 'Chinese' },
    { code: 'ru', name: 'Russian' },
    { code: 'ko', name: 'Korean' }
  ];
  const availableSuggestions = suggestedLanguages.filter(lang => {
    const target = normalizeLanguageCode(lang.code);
    return !allLanguages.some(existing => normalizeLanguageCode(existing.code) === target);
  });
  const formatNumber = (value: number) => value.toLocaleString();
  const formatDate = (value: string | null) => {
    if (!value) return t('settings.tokens.never');
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? t('settings.tokens.never') : parsed.toLocaleString();
  };

  const pendingEstimate = useMemo(() => {
    const sourceName = allLanguages.find(lang => lang.code === sourceLangCode)?.name || sourceLangCode;
    let promptTokens = 0;
    let completionTokens = 0;
    let missingCount = 0;

    keys.forEach(key => {
      const sourceText = values[key.id]?.[sourceLangCode] || '';
      if (!sourceText.trim()) return;
      const completion = estimateTokenCount(sourceText);

      allLanguages.forEach(lang => {
        if (lang.code === sourceLangCode) return;
        const current = values[key.id]?.[lang.code] || '';
        if (current.trim().length > 0) return;

        const targetName = lang.name || lang.code;
        const prompt = buildToonPrompt(sourceText, targetName, sourceName, key.key);
        promptTokens += estimateTokenCount(prompt);
        completionTokens += completion;
        missingCount += 1;
      });
    });

    const totalTokens = promptTokens + completionTokens;
    const cost = estimateOpenAiCost(promptTokens, completionTokens, openAiModel);

    return {
      promptTokens,
      completionTokens,
      totalTokens,
      missingCount,
      cost
    };
  }, [allLanguages, keys, openAiModel, sourceLangCode, values]);

  const modelEntries = useMemo(
    () => Object.entries(tokenReport.perModel || {}).sort((a, b) => b[1] - a[1]),
    [tokenReport.perModel]
  );

  const languageEntries = useMemo(
    () => Object.entries(tokenReport.perLanguage || {}).sort((a, b) => b[1] - a[1]),
    [tokenReport.perLanguage]
  );

  return (
    <div className="space-y-6 animate-fade-in text-gray-900 dark:text-gray-100 max-w-4xl mx-auto pb-12">
      <header className="mb-8 border-b border-gray-200 dark:border-gray-700 pb-6">
        <h1 className="text-3xl font-bold">{t('settings.title')}</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-2">{t('settings.subtitle')}</p>
      </header>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Globe className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            {t('settings.languages.title')}
          </h3>
        </div>

        <div className="p-6 space-y-8">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('settings.languages.reference.label')}
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              {t('settings.languages.reference.help')}
            </p>
            <div className="relative max-w-sm">
              <select
                value={sourceLangCode}
                onChange={(e) => onSetSourceLanguage(e.target.value)}
                className="w-full appearance-none rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {allLanguages.map(lang => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name} ({lang.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <hr className="border-gray-100 dark:border-gray-700" />

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('settings.languages.active.label')}
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              {t('settings.languages.active.help')}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {allLanguages.map(lang => {
                const isSource = sourceLangCode === lang.code;

                return (
                  <div key={lang.code} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    <span className="flex items-center gap-3">
                      <span className="text-xl">{lang.flag}</span>
                      <span className="text-gray-900 dark:text-white">
                        {lang.name}
                        {isSource && (
                          <span className="ml-2 text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 px-1.5 py-0.5 rounded">
                            {t('settings.languages.active.badge.source')}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded">
                      {t('settings.languages.active.badge.active')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <h3 className="text-lg font-semibold">{t('settings.ai.title')}</h3>
        </div>
        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('settings.ai.apiKey.label')}
            </label>
            <input
              type="password"
              value={openAiApiKey}
              onChange={(e) => onUpdateOpenAiApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full max-w-lg rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {t('settings.ai.apiKey.help')}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('settings.ai.model.label')}
            </label>
            <div className="relative max-w-sm">
              <select
                value={openAiModel}
                onChange={(e) => onUpdateOpenAiModel(e.target.value)}
                className="w-full appearance-none rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="gpt-5-nano-2025-08-07">gpt-5-nano-2025-08-07</option>
                <option value="gpt-5-mini-2025-08-07">gpt-5-mini-2025-08-07</option>
                <option value="gpt-4.1-nano-2025-04-14">gpt-4.1-nano-2025-04-14</option>
                <option value="gpt-4o-mini">gpt-4o-mini</option>
                <option value="gpt-4o">gpt-4o</option>
                <option value="gpt-5-mini">gpt-5-mini</option>
                <option value="gpt-4.1-mini">gpt-4.1-mini</option>
                <option value="gpt-4.1">gpt-4.1</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <h3 className="text-lg font-semibold">{t('settings.tokens.title')}</h3>
        </div>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('settings.tokens.total')}</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{formatNumber(tokenReport.totalTokens)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('settings.tokens.prompt')}</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{formatNumber(tokenReport.promptTokens)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('settings.tokens.completion')}</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{formatNumber(tokenReport.completionTokens)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('settings.tokens.requests')}</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{formatNumber(tokenReport.requests)}</p>
            </div>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {t('settings.tokens.updated')} <span className="text-gray-700 dark:text-gray-200">{formatDate(tokenReport.lastUpdated)}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">{t('settings.tokens.byModel')}</p>
              {modelEntries.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('settings.tokens.noData')}</p>
              ) : (
                <div className="space-y-2">
                  {modelEntries.map(([model, count]) => (
                    <div key={model} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 dark:text-gray-200">{model}</span>
                      <span className="font-medium text-gray-900 dark:text-white">{formatNumber(count)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">{t('settings.tokens.byLanguage')}</p>
              {languageEntries.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('settings.tokens.noData')}</p>
              ) : (
                <div className="space-y-2">
                  {languageEntries.map(([lang, count]) => (
                    <div key={lang} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 dark:text-gray-200">{lang}</span>
                      <span className="font-medium text-gray-900 dark:text-white">{formatNumber(count)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">{t('settings.tokens.estimate.title')}</p>
            <div className="flex flex-col gap-1 text-xs text-gray-600 dark:text-gray-300">
              <span>{t('settings.tokens.estimate.model')} <span className="font-semibold text-gray-900 dark:text-white">{openAiModel}</span></span>
              <span>{t('settings.tokens.estimate.missing')} <span className="font-semibold text-gray-900 dark:text-white">{formatNumber(pendingEstimate.missingCount)}</span></span>
              <span>{t('settings.tokens.estimate.tokens')} <span className="font-semibold text-gray-900 dark:text-white">{formatNumber(pendingEstimate.totalTokens)}</span> (P {formatNumber(pendingEstimate.promptTokens)} / C {formatNumber(pendingEstimate.completionTokens)})</span>
              <span>{t('settings.tokens.estimate.cost')} <span className="font-semibold text-gray-900 dark:text-white">{pendingEstimate.cost === null ? t('editor.estimation.noTable') : formatUsd(pendingEstimate.cost)}</span></span>
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('settings.tokens.estimate.note')}
          </p>
        </div>
      </div>

      {availableSuggestions.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <h3 className="text-lg font-semibold">{t('settings.suggestions.title')}</h3>
          </div>
          <div className="p-6 space-y-3">
            {availableSuggestions.map(lang => (
              <div
                key={lang.code}
                className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3"
              >
                <div>
                  <p className="font-medium">{lang.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{lang.code}</p>
                </div>
                <button
                  onClick={() => onAddLanguage(lang.code, lang.name)}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
                >
                  {t('settings.suggestions.add')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Info className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            {t('settings.about.title')}
          </h3>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{t('settings.about.version')}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {t('settings.about.status')}
              </p>
            </div>
            <span className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-full text-xs font-mono font-medium">
              v{APP_VERSION}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
