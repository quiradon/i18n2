import React, { useEffect, useRef, useState } from 'react';
import { TranslationKey, TranslationValue, Language } from '../types';
import { Search, Plus, Columns, List, Keyboard, ChevronDown, Sparkles } from 'lucide-react';
import CreateKeyModal from './CreateKeyModal';
import QuickAddModal from './QuickAddModal';
import TranslateAllModal from './TranslateAllModal';
import TranslationTable from './TranslationTable';
import { useI18n } from '../services/i18n';
import { TranslateAllEstimate } from '../types';

interface TranslationListProps {
  keys: TranslationKey[];
  values: Record<string, TranslationValue>;
  languages: Language[];
  sourceLangCode: string;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  searchMode: 'key' | 'content' | 'all';
  onSearchModeChange: (value: 'key' | 'content' | 'all') => void;
  completionSort: 'none' | 'asc' | 'desc';
  onCompletionSortChange: (value: 'none' | 'asc' | 'desc') => void;
  selectedLang: string;
  onSelectedLangChange: (value: string) => void;
  viewMode: 'single' | 'grid';
  onViewModeChange: (value: 'single' | 'grid') => void;
  isQuickEditMode: boolean;
  onQuickEditModeChange: (value: boolean) => void;
  currentPage: number;
  onCurrentPageChange: (value: number) => void;
  openAiModel: string;
  hasOpenAiKey: boolean;
  translateAllEstimate: TranslateAllEstimate;
  onTranslateAll: (
    onProgress?: (done: number, total: number) => void
  ) => Promise<{ ok: boolean; error?: string }>;
  onEdit: (keyId: string, langCode: string) => void;
  onAddKey: (keyName: string, initialValue: string) => void;
  onUpdateValue: (keyId: string, langCode: string, newValue: string) => void;
  onQuickAdd: (
    keyName: string,
    sourceValue: string,
    onProgress?: (done: number, total: number) => void
  ) => Promise<{ ok: boolean; error?: string }>;
}

const TranslationList: React.FC<TranslationListProps> = ({ 
  keys, 
  values, 
  languages, 
  sourceLangCode,
  searchTerm,
  onSearchTermChange,
  searchMode,
  onSearchModeChange,
  completionSort,
  onCompletionSortChange,
  selectedLang,
  onSelectedLangChange,
  viewMode,
  onViewModeChange,
  isQuickEditMode,
  onQuickEditModeChange,
  currentPage,
  onCurrentPageChange,
  openAiModel,
  hasOpenAiKey,
  translateAllEstimate,
  onTranslateAll,
  onEdit,
  onAddKey,
  onUpdateValue,
  onQuickAdd
}) => {
  const t = useI18n();
  const PAGE_SIZE = 100;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isTranslateAllOpen, setIsTranslateAllOpen] = useState(false);
  const filterRef = useRef({ searchTerm, searchMode, completionSort });

  // Default selected lang logic
  const availableTargets = languages.filter(l => l.code !== sourceLangCode);
  const targetCount = availableTargets.length;
  const selectableLanguages = languages;
  const effectiveSelectedLang = selectedLang && languages.some(l => l.code === selectedLang) 
    ? selectedLang 
    : (availableTargets.length > 0 ? availableTargets[0].code : sourceLangCode);

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const targetLangCodes = languages
    .filter(lang => lang.code !== sourceLangCode)
    .map(lang => lang.code);

  const getCompletionPercent = (keyId: string) => {
    if (targetLangCodes.length === 0) return 100;
    const translatedCount = targetLangCodes.reduce((acc, code) => {
      const currentValue = values[keyId]?.[code] || '';
      return currentValue.trim().length > 0 ? acc + 1 : acc;
    }, 0);
    return Math.round((translatedCount / targetLangCodes.length) * 100);
  };

  const matchesSearch = (key: TranslationKey) => {
    if (!normalizedSearch) return true;
    const keyMatch = key.key.toLowerCase().includes(normalizedSearch);
    if (searchMode === 'key') return keyMatch;

    const contentMatch = languages.some(lang => {
      const value = values[key.id]?.[lang.code] || '';
      return value.toLowerCase().includes(normalizedSearch);
    });

    if (searchMode === 'content') return contentMatch;
    return keyMatch || contentMatch;
  };

  const filteredKeys = keys.filter(matchesSearch);
  const sortedKeys = [...filteredKeys].sort((a, b) => {
    if (completionSort === 'none') return 0;
    const delta = getCompletionPercent(a.id) - getCompletionPercent(b.id);
    if (delta !== 0) return completionSort === 'asc' ? delta : -delta;
    return a.key.localeCompare(b.key);
  });

  const totalPages = Math.max(1, Math.ceil(sortedKeys.length / PAGE_SIZE));
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;
  const pagedKeys = sortedKeys.slice(startIndex, endIndex);

  const sourceLangName = languages.find(l => l.code === sourceLangCode)?.name || sourceLangCode;

  useEffect(() => {
    const prev = filterRef.current;
    const hasChanged =
      prev.searchTerm !== searchTerm ||
      prev.searchMode !== searchMode ||
      prev.completionSort !== completionSort;

    if (hasChanged && currentPage !== 1) {
      onCurrentPageChange(1);
    }

    filterRef.current = { searchTerm, searchMode, completionSort };
  }, [searchTerm, searchMode, completionSort, currentPage, onCurrentPageChange]);

  useEffect(() => {
    if (currentPage > totalPages) {
      onCurrentPageChange(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <div className="space-y-4 h-full flex flex-col text-gray-900 dark:text-gray-100">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
             <h1 className="text-3xl font-bold text-gray-800 dark:text-white">{t('translations.title')}</h1>
             <p className="text-gray-500 dark:text-gray-400">{t('translations.subtitle')}</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" /> {t('translations.newKey')}
            </button>
            <button
              onClick={() => setIsQuickAddOpen(true)}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 rounded-lg font-medium transition-colors shadow-sm hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
            >
              <Plus className="w-4 h-4" /> {t('translations.quickAdd')}
            </button>
            <button
              onClick={() => setIsTranslateAllOpen(true)}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-700 rounded-lg font-medium transition-colors shadow-sm hover:bg-indigo-100 dark:hover:bg-indigo-900/40"
            >
              <Sparkles className="w-4 h-4" /> {t('translations.translateAll')}
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-white dark:bg-gray-800 p-2 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 transition-colors">
          
            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
             <div className="relative flex-1 lg:flex-none">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                </div>
                <input
                  type="text"
                  placeholder={t('translations.search.placeholder')}
                  className="pl-9 pr-4 py-2 w-full lg:w-64 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  value={searchTerm}
                  onChange={(e) => onSearchTermChange(e.target.value)}
                />
             </div>
             <div className="relative">
               <select
                 value={searchMode}
                 onChange={(e) => onSearchModeChange(e.target.value as 'key' | 'content' | 'all')}
                 className="appearance-none bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 py-2 pl-3 pr-8 rounded-lg leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm cursor-pointer"
               >
                 <option value="key">{t('translations.search.mode.key')}</option>
                 <option value="content">{t('translations.search.mode.content')}</option>
                 <option value="all">{t('translations.search.mode.all')}</option>
               </select>
               <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500 dark:text-gray-400">
                 <ChevronDown className="h-4 w-4" />
               </div>
             </div>
          </div>

            <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto justify-end">
            
            {/* View Mode Toggles */}
            <div className="flex items-center bg-gray-100 dark:bg-gray-700/50 rounded-lg p-1 border border-gray-200 dark:border-gray-600">
              <button
                onClick={() => onViewModeChange('single')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'single'
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                <List className="w-4 h-4" /> {t('translations.view.list')}
              </button>
              <button
                onClick={() => onViewModeChange('grid')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                <Columns className="w-4 h-4" /> {t('translations.view.grid')}
              </button>
            </div>

            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 hidden sm:block"></div>

            <div className="relative">
              <select
                value={completionSort}
                onChange={(e) => onCompletionSortChange(e.target.value as 'none' | 'asc' | 'desc')}
                className="appearance-none bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 py-2 pl-3 pr-8 rounded-lg leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm cursor-pointer"
              >
                <option value="none">{t('translations.sort.none')}</option>
                <option value="asc">{t('translations.sort.asc')}</option>
                <option value="desc">{t('translations.sort.desc')}</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500 dark:text-gray-400">
                <ChevronDown className="h-4 w-4" />
              </div>
            </div>

            {/* View Specific Controls */}
            {viewMode === 'single' ? (
              <div className="relative">
                <select
                  value={effectiveSelectedLang}
                  onChange={(e) => onSelectedLangChange(e.target.value)}
                  className="appearance-none bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 py-2 pl-4 pr-10 rounded-lg leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm cursor-pointer"
                >
                  {selectableLanguages.map(lang => (
                    <option key={lang.code} value={lang.code}>
                      {lang.flag} {lang.name}
                    </option>
                  ))}
                  {selectableLanguages.length === 0 && <option disabled>{t('translations.noLanguages')}</option>}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500 dark:text-gray-400">
                  <ChevronDown className="h-4 w-4" />
                </div>
              </div>
            ) : (
              <button
                onClick={() => onQuickEditModeChange(!isQuickEditMode)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                  isQuickEditMode
                    ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >
                <Keyboard className="w-4 h-4" />
                {isQuickEditMode ? t('translations.quickEdit.exit') : t('translations.quickEdit.enter')}
              </button>
            )}
          </div>
        </div>
      </header>

      <TranslationTable 
        keys={pagedKeys}
        values={values}
        languages={languages}
        sourceLangCode={sourceLangCode}
        sourceLangName={sourceLangName}
        effectiveSelectedLang={effectiveSelectedLang}
        availableTargets={availableTargets}
        viewMode={viewMode}
        isQuickEditMode={isQuickEditMode}
        onEdit={onEdit}
        onUpdateValue={onUpdateValue}
      />

      {sortedKeys.length > PAGE_SIZE && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm">
          <div className="text-gray-500 dark:text-gray-400">
            {t('translations.pagination.showing', { start: sortedKeys.length === 0 ? 0 : startIndex + 1, end: Math.min(endIndex, sortedKeys.length), total: sortedKeys.length })}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onCurrentPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              {t('translations.pagination.previous')}
            </button>
            <span className="text-gray-500 dark:text-gray-400">
              {t('translations.pagination.page', { current: currentPage, total: totalPages })}
            </span>
            <button
              onClick={() => onCurrentPageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              {t('translations.pagination.next')}
            </button>
          </div>
        </div>
      )}

      <CreateKeyModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreate={onAddKey}
        sourceLangName={sourceLangName}
      />
      <QuickAddModal
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        onQuickAdd={onQuickAdd}
        sourceLangName={sourceLangName}
        targetCount={targetCount}
      />
      <TranslateAllModal
        isOpen={isTranslateAllOpen}
        onClose={() => setIsTranslateAllOpen(false)}
        estimate={translateAllEstimate}
        openAiModel={openAiModel}
        hasApiKey={hasOpenAiKey}
        onConfirm={onTranslateAll}
      />
    </div>
  );
};

export default TranslationList;





