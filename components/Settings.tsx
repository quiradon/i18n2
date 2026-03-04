import React, { useMemo, useState } from 'react';
import { Info, Globe, Bot, RefreshCw } from 'lucide-react';
import { Language, TokenUsageReport, TranslationKey, TranslationValue } from '../types';
import type { AiProvider } from '../types';
import { buildToonPrompt, estimateTokenCount } from '../services/toonPrompt';
import { estimateOpenAiCost, formatUsd } from '../services/openAiPricing';
import { fetchAvailableModels } from '../services/geminiService';
import { useI18n } from '../services/i18n';
import { APP_VERSION } from '../appVersion';

const OPENAI_DEFAULT_MODELS = [
  'gpt-5-nano-2025-08-07',
  'gpt-5-mini-2025-08-07',
  'gpt-4.1-nano-2025-04-14',
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-5-mini',
  'gpt-4.1-mini',
  'gpt-4.1'
];

const PROVIDER_LABELS: Record<AiProvider, string> = {
  openai: 'OpenAI',
  groq: 'Groq',
  deepseek: 'DeepSeek'
};

const DEEPSEEK_DEFAULT_MODELS = [
  'deepseek-chat',
  'deepseek-reasoner'
];

const GROQ_DEFAULT_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'llama-3.1-70b-versatile',
  'gemma2-9b-it',
  'mixtral-8x7b-32768'
];

interface SettingsProps {
  allLanguages: Language[];
  keys: TranslationKey[];
  values: Record<string, TranslationValue>;
  sourceLangCode: string;
  aiProvider: AiProvider;
  openAiApiKey: string;
  openAiModel: string;
  groqApiKey: string;
  groqModel: string;
  deepseekApiKey: string;
  deepseekModel: string;
  tokenReport: TokenUsageReport;
  mcpPreferredPort: number;
  fixInputText: boolean;
  onSetSourceLanguage: (code: string) => void;
  onUpdateAiProvider: (value: AiProvider) => void;
  onUpdateOpenAiApiKey: (value: string) => void;
  onUpdateOpenAiModel: (value: string) => void;
  onUpdateGroqApiKey: (value: string) => void;
  onUpdateGroqModel: (value: string) => void;
  onUpdateDeepseekApiKey: (value: string) => void;
  onUpdateDeepseekModel: (value: string) => void;
  onUpdateMcpPreferredPort: (port: number) => void;
  onUpdateFixInputText: (value: boolean) => void;
  onAddLanguage: (code: string, name?: string) => void;
}

const Settings: React.FC<SettingsProps> = ({
  allLanguages,
  keys,
  values,
  sourceLangCode,
  onSetSourceLanguage,
  aiProvider,
  openAiApiKey,
  openAiModel,
  groqApiKey,
  groqModel,
  deepseekApiKey,
  deepseekModel,
  tokenReport,
  mcpPreferredPort,
  fixInputText,
  onUpdateAiProvider,
  onUpdateOpenAiApiKey,
  onUpdateOpenAiModel,
  onUpdateGroqApiKey,
  onUpdateGroqModel,
  onUpdateDeepseekApiKey,
  onUpdateDeepseekModel,
  onUpdateMcpPreferredPort,
  onUpdateFixInputText,
  onAddLanguage
}) => {
  const t = useI18n();
  const [openAiModels, setOpenAiModels] = useState<string[]>(OPENAI_DEFAULT_MODELS);
  const [groqModels, setGroqModels] = useState<string[]>(GROQ_DEFAULT_MODELS);
  const [deepseekModels, setDeepseekModels] = useState<string[]>(DEEPSEEK_DEFAULT_MODELS);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchModelsError, setFetchModelsError] = useState<string | null>(null);

  const handleRefreshModels = async () => {
    const activeKey = aiProvider === 'groq' ? groqApiKey : aiProvider === 'deepseek' ? deepseekApiKey : openAiApiKey;
    if (!activeKey) {
      setFetchModelsError(t('settings.ai.models.errorNoKey'));
      return;
    }
    setFetchingModels(true);
    setFetchModelsError(null);
    try {
      const models = await fetchAvailableModels(aiProvider, activeKey);
      if (aiProvider === 'groq') {
        setGroqModels(models.length > 0 ? models : GROQ_DEFAULT_MODELS);
      } else if (aiProvider === 'deepseek') {
        setDeepseekModels(models.length > 0 ? models : DEEPSEEK_DEFAULT_MODELS);
      } else {
        setOpenAiModels(models.length > 0 ? models : OPENAI_DEFAULT_MODELS);
      }
    } catch {
      setFetchModelsError(t('settings.ai.models.errorFetch'));
    } finally {
      setFetchingModels(false);
    }
  };

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

  const activeModel = aiProvider === 'groq' ? groqModel : aiProvider === 'deepseek' ? deepseekModel : openAiModel;

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
    const cost = estimateOpenAiCost(promptTokens, completionTokens, activeModel);

    return {
      promptTokens,
      completionTokens,
      totalTokens,
      missingCount,
      cost
    };
  }, [allLanguages, keys, activeModel, sourceLangCode, values]);

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
              {t('settings.ai.provider.label')}
            </label>
            <div className="flex gap-3 flex-wrap">
              {(['openai', 'groq', 'deepseek'] as AiProvider[]).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onUpdateAiProvider(p)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    aiProvider === p
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {PROVIDER_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          {aiProvider === 'openai' && (
            <>
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
                <div className="flex items-center gap-3 mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('settings.ai.model.label')}
                  </label>
                  <button
                    type="button"
                    onClick={handleRefreshModels}
                    disabled={fetchingModels}
                    className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 disabled:opacity-50"
                    title={t('settings.ai.models.refresh')}
                  >
                    <RefreshCw className={`w-3 h-3 ${fetchingModels ? 'animate-spin' : ''}`} />
                    {t('settings.ai.models.refresh')}
                  </button>
                </div>
                {fetchModelsError && (
                  <p className="text-xs text-red-500 mb-2">{fetchModelsError}</p>
                )}
                <div className="relative max-w-sm">
                  <select
                    value={openAiModel}
                    onChange={(e) => onUpdateOpenAiModel(e.target.value)}
                    className="w-full appearance-none rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {openAiModels.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                    {!openAiModels.includes(openAiModel) && openAiModel && (
                      <option value={openAiModel}>{openAiModel}</option>
                    )}
                  </select>
                </div>
              </div>
            </>
          )}

          {aiProvider === 'groq' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('settings.ai.groq.apiKey.label')}
                </label>
                <input
                  type="password"
                  value={groqApiKey}
                  onChange={(e) => onUpdateGroqApiKey(e.target.value)}
                  placeholder="gsk_..."
                  className="w-full max-w-lg rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  {t('settings.ai.groq.apiKey.help')}
                </p>
              </div>
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('settings.ai.model.label')}
                  </label>
                  <button
                    type="button"
                    onClick={handleRefreshModels}
                    disabled={fetchingModels}
                    className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 disabled:opacity-50"
                    title={t('settings.ai.models.refresh')}
                  >
                    <RefreshCw className={`w-3 h-3 ${fetchingModels ? 'animate-spin' : ''}`} />
                    {t('settings.ai.models.refresh')}
                  </button>
                </div>
                {fetchModelsError && (
                  <p className="text-xs text-red-500 mb-2">{fetchModelsError}</p>
                )}
                <div className="relative max-w-sm">
                  <select
                    value={groqModel}
                    onChange={(e) => onUpdateGroqModel(e.target.value)}
                    className="w-full appearance-none rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {groqModels.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                    {!groqModels.includes(groqModel) && groqModel && (
                      <option value={groqModel}>{groqModel}</option>
                    )}
                  </select>
                </div>
              </div>
            </>
          )}

          {aiProvider === 'deepseek' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('settings.ai.deepseek.apiKey.label')}
                </label>
                <input
                  type="password"
                  value={deepseekApiKey}
                  onChange={(e) => onUpdateDeepseekApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full max-w-lg rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  {t('settings.ai.deepseek.apiKey.help')}
                </p>
              </div>
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('settings.ai.model.label')}
                  </label>
                  <button
                    type="button"
                    onClick={handleRefreshModels}
                    disabled={fetchingModels}
                    className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 disabled:opacity-50"
                    title={t('settings.ai.models.refresh')}
                  >
                    <RefreshCw className={`w-3 h-3 ${fetchingModels ? 'animate-spin' : ''}`} />
                    {t('settings.ai.models.refresh')}
                  </button>
                </div>
                {fetchModelsError && (
                  <p className="text-xs text-red-500 mb-2">{fetchModelsError}</p>
                )}
                <div className="relative max-w-sm">
                  <select
                    value={deepseekModel}
                    onChange={(e) => onUpdateDeepseekModel(e.target.value)}
                    className="w-full appearance-none rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {deepseekModels.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                    {!deepseekModels.includes(deepseekModel) && deepseekModel && (
                      <option value={deepseekModel}>{deepseekModel}</option>
                    )}
                  </select>
                </div>
              </div>
            </>
          )}

          <div>
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('settings.ai.fixInputText.label')}
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('settings.ai.fixInputText.help')}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={fixInputText}
                onClick={() => onUpdateFixInputText(!fixInputText)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                  fixInputText ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    fixInputText ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Bot className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            {t('settings.mcp.title')}
          </h3>
        </div>
        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('settings.mcp.port.label')}
            </label>
            <input
              type="number"
              min={0}
              max={65535}
              value={mcpPreferredPort}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                onUpdateMcpPreferredPort(isNaN(val) ? 0 : Math.max(0, Math.min(65535, val)));
              }}
              className="w-full max-w-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {t('settings.mcp.port.help')}
            </p>
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
              <span>{t('settings.tokens.estimate.model')} <span className="font-semibold text-gray-900 dark:text-white">{activeModel}</span></span>
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
