import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ViewState, EditorState, TranslationKey, TranslationValue, Language, TokenUsageReport, TokenUsageDelta, TranslateAllEstimate } from './types';
import { MOCK_KEYS, MOCK_VALUES, LANGUAGES } from './constants';
import { APP_VERSION } from './appVersion';
import Dashboard from './components/Dashboard';
import TranslationList from './components/TranslationList';
import TranslationEditor from './components/TranslationEditor';
import Settings from './components/Settings';
import { translateText } from './services/geminiService';
import { I18nProvider, createTranslator } from './services/i18n';
import { buildToonPrompt, estimateTokenCount } from './services/toonPrompt';
import { estimateOpenAiCost } from './services/openAiPricing';
import { LayoutDashboard, Globe, Settings as SettingsIcon, Menu, ChevronLeft, ChevronRight } from 'lucide-react';

const getVsCodeApi = () => {
  if (typeof window === 'undefined') return null;
  const acquire = (window as any).acquireVsCodeApi;
  return typeof acquire === 'function' ? acquire() : null;
};

const LANGUAGE_NAME_MAP: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  pt: 'Portuguese',
  'pt-br': 'Portuguese',
  'pt-pt': 'Portuguese',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  ja: 'Japanese',
  zh: 'Chinese',
  'zh-cn': 'Chinese',
  'zh-tw': 'Chinese',
  zn: 'Chinese',
  ko: 'Korean',
  ru: 'Russian'
};

const normalizeLanguageCode = (code: string) => {
  const lower = code.toLowerCase();
  if (lower === 'zn' || lower.startsWith('zh')) return 'zh';
  if (lower.startsWith('pt')) return 'pt';
  return lower;
};

const EMPTY_TOKEN_REPORT: TokenUsageReport = {
  totalTokens: 0,
  promptTokens: 0,
  completionTokens: 0,
  requests: 0,
  perModel: {},
  perLanguage: {},
  lastUpdated: null
};

const applyTokenUsage = (report: TokenUsageReport, usage: TokenUsageDelta): TokenUsageReport => {
  const perModel = { ...report.perModel };
  const perLanguage = { ...report.perLanguage };
  perModel[usage.model] = (perModel[usage.model] || 0) + usage.totalTokens;
  perLanguage[usage.targetLangCode] = (perLanguage[usage.targetLangCode] || 0) + usage.totalTokens;

  return {
    totalTokens: report.totalTokens + usage.totalTokens,
    promptTokens: report.promptTokens + usage.promptTokens,
    completionTokens: report.completionTokens + usage.completionTokens,
    requests: report.requests + 1,
    perModel,
    perLanguage,
    lastUpdated: new Date().toISOString()
  };
};

type TranslateAllJob = {
  keyId: string;
  keyName: string;
  sourceText: string;
  targetLangCode: string;
  targetLangName: string;
  sourceLangName: string;
};

const collectTranslateAllJobs = (
  keys: TranslationKey[],
  values: Record<string, TranslationValue>,
  languages: Language[],
  sourceLangCode: string
): TranslateAllJob[] => {
  const sourceLang = languages.find(lang => lang.code === sourceLangCode);
  const sourceLangName = sourceLang?.name || sourceLangCode;
  const targets = languages.filter(lang => lang.code !== sourceLangCode);
  if (targets.length === 0) return [];

  const jobs: TranslateAllJob[] = [];
  for (const key of keys) {
    const sourceText = values[key.id]?.[sourceLangCode] || '';
    if (!sourceText.trim()) continue;
    for (const target of targets) {
      const existing = values[key.id]?.[target.code] || '';
      if (existing.trim()) continue;
      jobs.push({
        keyId: key.id,
        keyName: key.key,
        sourceText,
        targetLangCode: target.code,
        targetLangName: target.name || target.code,
        sourceLangName
      });
    }
  }

  return jobs;
};

const sleep = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

const App: React.FC = () => {
  const vscodeApi = useMemo(() => getVsCodeApi(), []);
  const saveTimers = useRef<Record<string, number>>({});
  // Global State
  const [keys, setKeys] = useState<TranslationKey[]>(vscodeApi ? [] : MOCK_KEYS);
  const [values, setValues] = useState<Record<string, TranslationValue>>(vscodeApi ? {} : MOCK_VALUES);
  const [languages, setLanguages] = useState<Language[]>(vscodeApi ? [] : LANGUAGES);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusCode, setStatusCode] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [locale, setLocale] = useState(() => {
    if (typeof window === 'undefined') return 'en';
    return navigator.language || 'en';
  });
  const t = useMemo(() => createTranslator(locale), [locale]);
  
  // Language Settings State
  const [activeLangCodes, setActiveLangCodes] = useState<string[]>(
    vscodeApi ? [] : LANGUAGES.map(lang => lang.code)
  );
  const [sourceLangCode, setSourceLangCode] = useState<string>('en');
  const [openAiApiKey, setOpenAiApiKey] = useState<string>('');
  const [openAiModel, setOpenAiModel] = useState<string>('gpt-5-nano-2025-08-07');
  const [tokenReport, setTokenReport] = useState<TokenUsageReport>(EMPTY_TOKEN_REPORT);
  const [i18nFolderName, setI18nFolderName] = useState<string>('i18n');

  // Computed
  const activeLanguages = languages.filter(l => activeLangCodes.includes(l.code));
  const translateAllEstimate = useMemo<TranslateAllEstimate>(() => {
    const jobs = collectTranslateAllJobs(keys, values, activeLanguages, sourceLangCode);
    if (jobs.length === 0) {
      return {
        missingCount: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cost: estimateOpenAiCost(0, 0, openAiModel)
      };
    }

    let promptTokens = 0;
    let completionTokens = 0;
    const sourceTokenCache = new Map<string, number>();

    for (const job of jobs) {
      const prompt = buildToonPrompt(job.sourceText, job.targetLangName, job.sourceLangName, job.keyName);
      promptTokens += estimateTokenCount(prompt);

      let sourceTokens = sourceTokenCache.get(job.keyId);
      if (sourceTokens === undefined) {
        sourceTokens = estimateTokenCount(job.sourceText);
        sourceTokenCache.set(job.keyId, sourceTokens);
      }
      completionTokens += sourceTokens;
    }

    const totalTokens = promptTokens + completionTokens;
    return {
      missingCount: jobs.length,
      promptTokens,
      completionTokens,
      totalTokens,
      cost: estimateOpenAiCost(promptTokens, completionTokens, openAiModel)
    };
  }, [keys, values, activeLanguages, sourceLangCode, openAiModel]);
  
  // Navigation State
  const [currentView, setCurrentView] = useState<ViewState>('dashboard');
  const [editorState, setEditorState] = useState<EditorState>({ keyId: null, targetLang: '' });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [listSearchTerm, setListSearchTerm] = useState('');
  const [listSearchMode, setListSearchMode] = useState<'key' | 'content' | 'all'>('key');
  const [listCompletionSort, setListCompletionSort] = useState<'none' | 'asc' | 'desc'>('none');
  const [listSelectedLang, setListSelectedLang] = useState('');
  const [listViewMode, setListViewMode] = useState<'single' | 'grid'>('single');
  const [listQuickEditMode, setListQuickEditMode] = useState(false);
  const [listCurrentPage, setListCurrentPage] = useState(1);

  // Handlers
  const handleEdit = (keyId: string, langCode: string) => {
    setEditorState({ keyId, targetLang: langCode });
    setCurrentView('editor');
  };

  const scheduleSave = (keyId: string, langCode: string, newValue: string) => {
    if (!vscodeApi) return;
    const timerKey = `${keyId}:${langCode}`;
    if (saveTimers.current[timerKey]) {
      window.clearTimeout(saveTimers.current[timerKey]);
    }
    saveTimers.current[timerKey] = window.setTimeout(() => {
      vscodeApi?.postMessage({ type: 'updateValue', key: keyId, lang: langCode, value: newValue });
      delete saveTimers.current[timerKey];
    }, 400);
  };

  const handleSave = (
    keyId: string,
    langCode: string,
    newValue: string,
    options?: { stay?: boolean }
  ) => {
    setValues(prev => ({
      ...prev,
      [keyId]: {
        ...prev[keyId],
        [langCode]: newValue
      }
    }));
    vscodeApi?.postMessage({ type: 'updateValue', key: keyId, lang: langCode, value: newValue });
    // Note: If saving from editor view, we switch back. 
    // If saving inline from list, we don't change view.
    if (currentView === 'editor' && !options?.stay) {
      setCurrentView('list');
    }
  };

  const handleInlineUpdate = (keyId: string, langCode: string, newValue: string) => {
    setValues(prev => ({
      ...prev,
      [keyId]: {
        ...prev[keyId],
        [langCode]: newValue
      }
    }));
    scheduleSave(keyId, langCode, newValue);
  };

  const handleEditorTargetChange = (nextLang: string, currentValue: string) => {
    if (!editorState.keyId) return;
    if (nextLang === editorState.targetLang) return;
    handleSave(editorState.keyId, editorState.targetLang, currentValue, { stay: true });
    setEditorState({ keyId: editorState.keyId, targetLang: nextLang });
  };

  const handleInitializeI18n = () => {
    vscodeApi?.postMessage({ type: 'initI18n' });
  };

  const addKeyInternal = (
    keyName: string,
    initialValue: string,
    options?: { silent?: boolean }
  ) => {
    if (keys.some(k => k.key === keyName)) {
      if (!options?.silent) {
        alert(t('errors.keyExists'));
      }
      return false;
    }
    const newKey: TranslationKey = {
      id: keyName,
      key: keyName,
      tags: []
    };
    setKeys(prev => [...prev, newKey]);
    
    // Initialize with the source language value
    setValues(prev => ({
      ...prev,
      [keyName]: {
        ...(prev[keyName] || {}),
        [sourceLangCode]: initialValue
      }
    }));
    vscodeApi?.postMessage({ type: 'addKey', key: keyName, sourceLang: sourceLangCode, value: initialValue });
    return true;
  };

  const handleAddKey = (keyName: string, initialValue: string) => {
    addKeyInternal(keyName, initialValue);
  };

  const handleDeleteKey = (keyId: string) => {
    setKeys(prev => prev.filter(key => key.id !== keyId));
    setValues(prev => {
      if (!prev[keyId]) return prev;
      const next = { ...prev };
      delete next[keyId];
      return next;
    });

    if (editorState.keyId === keyId) {
      setEditorState({ keyId: null, targetLang: '' });
      setCurrentView('list');
    }

    vscodeApi?.postMessage({ type: 'deleteKey', key: keyId });
  };

  const handleQuickAdd = async (
    keyName: string,
    sourceValue: string,
    onProgress?: (done: number, total: number) => void
  ): Promise<{ ok: boolean; error?: string }> => {
    const trimmedKey = keyName.trim();
    if (!trimmedKey) {
      return { ok: false, error: t('errors.keyRequired') };
    }

    const targets = activeLanguages.filter(lang => lang.code !== sourceLangCode);
    if (targets.length > 0 && !openAiApiKey) {
      return { ok: false, error: t('errors.openAiKeyMissing') };
    }

    if (!addKeyInternal(trimmedKey, sourceValue, { silent: true })) {
      return { ok: false, error: t('errors.keyExists') };
    }

    if (!sourceValue.trim() || targets.length === 0) {
      return { ok: true };
    }

    const sourceName = activeLanguages.find(lang => lang.code === sourceLangCode)?.name || sourceLangCode;
    let done = 0;
    onProgress?.(done, targets.length);

    for (const lang of targets) {
      try {
        const translated = await translateText(
          sourceValue,
          lang.name || lang.code,
          sourceName,
          trimmedKey,
          {
            openAiApiKey,
            openAiModel,
            targetLangCode: lang.code,
            onUsage: handleRecordTokenUsage
          }
        );
        handleSave(trimmedKey, lang.code, translated, { stay: true });
      } catch (error) {
        return { ok: false, error: t('errors.translationFailed') };
      } finally {
        done += 1;
        onProgress?.(done, targets.length);
      }
    }

    return { ok: true };
  };

  const handleTranslateAll = async (
    onProgress?: (done: number, total: number) => void
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!openAiApiKey) {
      return { ok: false, error: t('errors.openAiKeyMissing') };
    }

    const jobs = collectTranslateAllJobs(keys, values, activeLanguages, sourceLangCode);
    if (jobs.length === 0) {
      return { ok: false, error: t('translateAll.noMissing') };
    }

    let done = 0;
    onProgress?.(done, jobs.length);

    for (let index = 0; index < jobs.length; index += 1) {
      const job = jobs[index];
      try {
        const translated = await translateText(
          job.sourceText,
          job.targetLangName,
          job.sourceLangName,
          job.keyName,
          {
            openAiApiKey,
            openAiModel,
            targetLangCode: job.targetLangCode,
            onUsage: handleRecordTokenUsage
          }
        );

        handleSave(job.keyId, job.targetLangCode, translated, { stay: true });
      } catch (error) {
        return { ok: false, error: t('errors.translationFailed') };
      } finally {
        done += 1;
        onProgress?.(done, jobs.length);
      }

      if (index < jobs.length - 1) {
        await sleep(300);
      }
    }

    return { ok: true };
  };

  const handleAddLanguage = (code: string, name?: string) => {
    if (vscodeApi) {
      vscodeApi.postMessage({ type: 'addLanguage', lang: code });
      return;
    }

    const normalized = normalizeLanguageCode(code);
    const displayName =
      name ||
      LANGUAGE_NAME_MAP[code] ||
      LANGUAGE_NAME_MAP[code.toLowerCase()] ||
      LANGUAGE_NAME_MAP[normalized] ||
      code;

    setLanguages(prev => {
      if (prev.some(lang => lang.code === code)) return prev;
      return [...prev, { code, name: displayName, flag: '' }];
    });
    setActiveLangCodes(prev => (prev.includes(code) ? prev : [...prev, code]));
  };

  useEffect(() => {
    if (vscodeApi || typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      setIsDarkMode(event.matches);
    };

    setIsDarkMode(mediaQuery.matches);
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, [vscodeApi]);

  useEffect(() => {
    if (!vscodeApi) return;

    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (!message || typeof message !== 'object') return;

      if (message.type === 'init' && message.payload) {
        const payload = message.payload as {
          languages: Language[];
          keys: TranslationKey[];
          values: Record<string, TranslationValue>;
          sourceLangCode?: string;
          openaiApiKey?: string;
          openaiModel?: string;
          tokenReport?: TokenUsageReport;
          locale?: string;
          i18nFolder?: string;
          status?: string;
          error?: string;
        };

        setLanguages(payload.languages || []);
        setKeys(payload.keys || []);
        setValues(payload.values || {});

        const codes = (payload.languages || []).map(lang => lang.code);
        setActiveLangCodes(codes);
        setSourceLangCode(payload.sourceLangCode || codes[0] || 'en');
        setOpenAiApiKey(payload.openaiApiKey || '');
        setOpenAiModel(payload.openaiModel || 'gpt-5-nano-2025-08-07');
        setTokenReport(payload.tokenReport || EMPTY_TOKEN_REPORT);
        setLocale(payload.locale || (typeof navigator !== 'undefined' ? navigator.language : 'en'));
        setI18nFolderName(payload.i18nFolder || 'i18n');
        setStatusMessage(payload.error || null);
        setStatusCode(payload.status || null);
      }

      if (message.type === 'theme') {
        setIsDarkMode(Boolean(message.isDark));
      }

      if (message.type === 'tokenReport' && message.payload) {
        setTokenReport(message.payload as TokenUsageReport);
      }
    };

    window.addEventListener('message', handleMessage);
    vscodeApi.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', handleMessage);
  }, [vscodeApi]);

  const handleSetSourceLanguage = (code: string) => {
    setSourceLangCode(code);
    // Ensure new source is active
    if (!activeLangCodes.includes(code)) {
      setActiveLangCodes(prev => [...prev, code]);
    }
    vscodeApi?.postMessage({ type: 'updateConfig', key: 'sourceLanguage', value: code, scope: 'workspace' });
  };

  const handleOpenAiApiKeyChange = (value: string) => {
    setOpenAiApiKey(value);
    vscodeApi?.postMessage({ type: 'updateConfig', key: 'openaiApiKey', value, scope: 'global' });
  };

  const handleOpenAiModelChange = (value: string) => {
    setOpenAiModel(value);
    vscodeApi?.postMessage({ type: 'updateConfig', key: 'openaiModel', value, scope: 'workspace' });
  };

  const handleRecordTokenUsage = (usage: TokenUsageDelta) => {
    setTokenReport(prev => applyTokenUsage(prev, usage));
    vscodeApi?.postMessage({ type: 'recordTokenUsage', usage });
  };

  const statusText = useMemo(() => {
    if (!statusCode) return statusMessage;
    if (statusCode === 'missingWorkspace') {
      return t('app.status.missingWorkspace');
    }
    if (statusCode === 'missingFolder') {
      return t('app.status.missingFolder', { folder: i18nFolderName });
    }
    if (statusCode === 'emptyFolder') {
      return t('app.status.emptyFolder');
    }
    return statusMessage;
  }, [statusCode, statusMessage, t, i18nFolderName]);

  const NavItem = ({ view, icon: Icon, label }: { view: ViewState, icon: any, label: string }) => (
    <button
      onClick={() => {
        setCurrentView(view);
        setSidebarOpen(false);
      }}
      title={label}
      className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-4'} py-3 rounded-lg text-sm font-medium transition-colors ${
        currentView === view 
          ? 'bg-indigo-50 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300' 
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
      }`}
    >
      <Icon className="w-5 h-5" />
      {!isSidebarCollapsed && label}
    </button>
  );

  return (
    <I18nProvider locale={locale}>
      <div className={isDarkMode ? 'dark' : ''}>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden transition-colors duration-200">
        
        {/* Sidebar */}
        <aside className={`
          fixed inset-y-0 left-0 z-50 ${isSidebarCollapsed ? 'w-20' : 'w-64'} bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transform transition-transform duration-200 ease-in-out
          md:relative md:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          <div className="h-full flex flex-col">
            <div className={`border-b border-gray-100 dark:border-gray-700 ${isSidebarCollapsed ? 'p-4' : 'p-6'}`}>
              <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'} gap-3 text-indigo-600 dark:text-indigo-400`}>
                <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-2'}`}>
                  <Globe className="w-8 h-8" />
                  {!isSidebarCollapsed && (
                    <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">{t('app.brand')}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setIsSidebarCollapsed(prev => !prev)}
                  className="rounded-lg border border-gray-200 dark:border-gray-700 p-1 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 bg-white dark:bg-gray-800"
                  title={isSidebarCollapsed ? t('app.sidebar.expand') : t('app.sidebar.collapse')}
                >
                  {isSidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <nav className={`flex-1 space-y-2 ${isSidebarCollapsed ? 'p-2' : 'p-4'}`}>
              <NavItem view="dashboard" icon={LayoutDashboard} label={t('nav.dashboard')} />
              <NavItem view="list" icon={Globe} label={t('nav.translations')} />
              <NavItem view="settings" icon={SettingsIcon} label={t('nav.settings')} />
            </nav>

            <div className="p-4 border-t border-gray-100 dark:border-gray-700">
              <div className="px-4 text-xs text-gray-400 dark:text-gray-500" title={`v${APP_VERSION}`}>
                {!isSidebarCollapsed && `v${APP_VERSION}`}
              </div>
            </div>
          </div>
        </aside>

        {/* Mobile Overlay */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Mobile Header */}
          <div className="md:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 flex items-center transition-colors">
            <button onClick={() => setSidebarOpen(true)} className="text-gray-600 dark:text-gray-400">
              <Menu className="w-6 h-6" />
            </button>
            <span className="ml-3 font-semibold text-gray-900 dark:text-white">{t('app.mobileTitle')}</span>
          </div>

          <div className="flex-1 overflow-auto p-3 md:p-4">
            <div className="max-w-none w-full mx-auto h-full">
              {statusText && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-4 py-3 text-sm flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <span>{statusText}</span>
                  {(statusCode === 'missingFolder' || statusCode === 'emptyFolder') && (
                    <button
                      onClick={handleInitializeI18n}
                      className="inline-flex items-center justify-center rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
                    >
                      {t('app.createI18n')}
                    </button>
                  )}
                </div>
              )}
              
              {currentView === 'dashboard' && (
                <Dashboard 
                  keys={keys} 
                  values={values} 
                  languages={activeLanguages} 
                  sourceLangCode={sourceLangCode}
                  onNavigateToList={() => setCurrentView('list')}
                />
              )}

              {currentView === 'list' && (
                <TranslationList 
                  keys={keys} 
                  values={values} 
                  languages={activeLanguages}
                  sourceLangCode={sourceLangCode}
                  searchTerm={listSearchTerm}
                  onSearchTermChange={setListSearchTerm}
                  searchMode={listSearchMode}
                  onSearchModeChange={setListSearchMode}
                  completionSort={listCompletionSort}
                  onCompletionSortChange={setListCompletionSort}
                  selectedLang={listSelectedLang}
                  onSelectedLangChange={setListSelectedLang}
                  viewMode={listViewMode}
                  onViewModeChange={setListViewMode}
                  isQuickEditMode={listQuickEditMode}
                  onQuickEditModeChange={setListQuickEditMode}
                  currentPage={listCurrentPage}
                  onCurrentPageChange={setListCurrentPage}
                  openAiModel={openAiModel}
                  hasOpenAiKey={Boolean(openAiApiKey)}
                  translateAllEstimate={translateAllEstimate}
                  onTranslateAll={handleTranslateAll}
                  onEdit={handleEdit}
                  onAddKey={handleAddKey}
                  onDeleteKey={handleDeleteKey}
                  onUpdateValue={handleInlineUpdate}
                  onQuickAdd={handleQuickAdd}
                />
              )}

              {currentView === 'editor' && editorState.keyId && (
                <TranslationEditor
                  keyData={keys.find(k => k.id === editorState.keyId)!}
                  allValues={values[editorState.keyId] || {}}
                  targetLang={editorState.targetLang}
                  sourceLang={sourceLangCode}
                  languages={activeLanguages}
                  openAiApiKey={openAiApiKey}
                  openAiModel={openAiModel}
                  onRecordTokenUsage={handleRecordTokenUsage}
                  onSave={handleSave}
                  onChangeTarget={handleEditorTargetChange}
                  onCancel={() => setCurrentView('list')}
                />
              )}

              {currentView === 'settings' && (
                <Settings 
                  allLanguages={languages}
                  keys={keys}
                  values={values}
                  sourceLangCode={sourceLangCode}
                  openAiApiKey={openAiApiKey}
                  openAiModel={openAiModel}
                  tokenReport={tokenReport}
                  onSetSourceLanguage={handleSetSourceLanguage}
                  onUpdateOpenAiApiKey={handleOpenAiApiKeyChange}
                  onUpdateOpenAiModel={handleOpenAiModelChange}
                  onAddLanguage={handleAddLanguage}
                />
              )}

            </div>
          </div>
        </main>
      </div>
      </div>
    </I18nProvider>
  );
};

export default App;









