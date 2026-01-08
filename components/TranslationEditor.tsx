import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { TranslationKey, TranslationValue, Language } from '../types';
import { ArrowLeft, Save, Sparkles, Layers, Bold, Italic, Link as LinkIcon, List, AlertTriangle } from 'lucide-react';
import { translateText } from '../services/geminiService';
import { buildToonPrompt, estimateTokenCount } from '../services/toonPrompt';
import { estimateOpenAiCost, formatUsd } from '../services/openAiPricing';
import { useI18n } from '../services/i18n';

interface TranslationEditorProps {
  keyData: TranslationKey;
  allValues: TranslationValue;
  targetLang: string;
  sourceLang: string;
  languages: Language[];
  openAiApiKey: string;
  openAiModel: string;
  onRecordTokenUsage: (usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    model: string;
    targetLangCode: string;
  }) => void;
  onSave: (keyId: string, langCode: string, value: string, options?: { stay?: boolean }) => void;
  onChangeTarget: (nextLang: string, currentValue: string) => void;
  onCancel: () => void;
}

const TranslationEditor: React.FC<TranslationEditorProps> = ({ 
  keyData, 
  allValues, 
  targetLang,
  sourceLang,
  languages,
  openAiApiKey,
  openAiModel,
  onRecordTokenUsage,
  onSave,
  onChangeTarget,
  onCancel 
}) => {
  const t = useI18n();
  const sourceText = allValues[sourceLang] || '';
  const initialValue = allValues[targetLang] || '';
  
  const [value, setValue] = useState(initialValue);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isBulkTranslating, setIsBulkTranslating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const targetLangObj = languages.find(l => l.code === targetLang);
  const sourceLangObj = languages.find(l => l.code === sourceLang);
  const sourceLangName = sourceLangObj?.name || sourceLang;
  const targetLabel = `${targetLangObj?.flag ? `${targetLangObj?.flag} ` : ''}${targetLangObj?.name || targetLang}`;
  const hasTargetLang = languages.some(l => l.code === targetLang);
  const selectableLanguages = hasTargetLang
    ? languages
    : [...languages, { code: targetLang, name: targetLang, flag: '' }];
  const languageStatuses = selectableLanguages.map(lang => {
    const rawValue = lang.code === targetLang ? value : (allValues[lang.code] || '');
    const hasValue = rawValue.trim().length > 0;
    return { ...lang, hasValue };
  });
  const okCount = languageStatuses.filter(lang => lang.hasValue).length;
  const missingTargets = languageStatuses.filter(
    lang => lang.code !== sourceLang && !lang.hasValue
  );
  const sourceTokens = estimateTokenCount(sourceText);
  const missingPromptTokens = sourceText.trim().length
    ? missingTargets.reduce((acc, lang) => {
        const targetName = lang.name || lang.code;
        const prompt = buildToonPrompt(sourceText, targetName, sourceLangName, keyData.key);
        return acc + estimateTokenCount(prompt);
      }, 0)
    : 0;
  const missingCompletionTokens = sourceText.trim().length
    ? missingTargets.length * sourceTokens
    : 0;
  const missingTotalTokens = missingPromptTokens + missingCompletionTokens;
  const missingCost = estimateOpenAiCost(
    missingPromptTokens,
    missingCompletionTokens,
    openAiModel
  );
  const formatNumber = (value: number) => value.toLocaleString();
  const isBusy = isTranslating || isBulkTranslating;

  useEffect(() => {
    // Reset when mounting new key
    setValue(allValues[targetLang] || '');
    setError(null);
  }, [keyData.id, targetLang, allValues]);

  const handleTargetChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onChangeTarget(event.target.value, value);
  };

  const handleAiTranslate = async () => {
    if (!sourceText) return;
    if (!openAiApiKey) {
      setError(t('errors.openAiKeyMissing'));
      return;
    }
    
    setIsTranslating(true);
    setError(null);
    try {
      const translated = await translateText(
        sourceText, 
        targetLangObj?.name || targetLang,
        sourceLangObj?.name || sourceLang,
        keyData.key,
        {
          openAiApiKey,
          openAiModel,
          targetLangCode: targetLang,
          onUsage: onRecordTokenUsage
        }
      );
      setValue(translated);
    } catch (err) {
      setError(t('editor.error.ai'));
    } finally {
      setIsTranslating(false);
    }
  };

  const handleTranslateMissing = async () => {
    if (!sourceText) return;
    if (missingTargets.length === 0) return;
    if (!openAiApiKey) {
      setError(t('errors.openAiKeyMissing'));
      return;
    }

    setIsBulkTranslating(true);
    setBulkProgress({ done: 0, total: missingTargets.length });
    setError(null);

    try {
      for (let index = 0; index < missingTargets.length; index += 1) {
        const lang = missingTargets[index];
        const translated = await translateText(
          sourceText,
          lang.name || lang.code,
          sourceLangObj?.name || sourceLang,
          keyData.key,
          {
            openAiApiKey,
            openAiModel,
            targetLangCode: lang.code,
            onUsage: onRecordTokenUsage
          }
        );

        if (lang.code === targetLang) {
          setValue(translated);
        }

        onSave(keyData.id, lang.code, translated, { stay: true });
        setBulkProgress({ done: index + 1, total: missingTargets.length });
      }
    } catch (err) {
      setError(t('editor.error.ai'));
    } finally {
      setIsBulkTranslating(false);
      setBulkProgress(null);
    }
  };

  const insertMarkdown = (syntax: string) => {
    setValue(prev => prev + syntax);
  };

  return (
    <div className="flex flex-col h-full animate-fade-in text-gray-900 dark:text-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button 
            onClick={onCancel}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-500 dark:text-gray-400"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <span className="font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-base border border-gray-200 dark:border-gray-700">{keyData.key}</span>
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2 mt-1">
              {t('editor.translatingFromTo', { source: sourceLangName, target: targetLabel })}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg font-medium transition-colors"
          >
            {t('editor.cancel')}
          </button>
          <button 
            onClick={() => onSave(keyData.id, targetLang, value)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 dark:hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm"
          >
            <Save className="w-4 h-4" /> {t('editor.save')}
          </button>
        </div>
      </div>

      <div className="mb-6 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {t('editor.language')}
            </span>
            <select
              value={targetLang}
              onChange={handleTargetChange}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200 py-1.5 pl-3 pr-3 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {selectableLanguages.map(lang => (
                <option key={lang.code} value={lang.code}>
                  {lang.flag ? `${lang.flag} ` : ''}{lang.name || lang.code}
                </option>
              ))}
            </select>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {t('editor.source')}: <span className="font-medium text-gray-700 dark:text-gray-200">{sourceLangName}</span>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {t('editor.okCount', { done: okCount, total: languageStatuses.length })}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {languageStatuses.map(lang => {
            const isTarget = lang.code === targetLang;
            return (
              <button
                key={lang.code}
                type="button"
                title={lang.hasValue ? t('editor.status.ok') : t('editor.status.missing')}
                aria-label={t('editor.changeLanguage', { language: lang.name || lang.code })}
                onClick={() => onChangeTarget(lang.code, value)}
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs transition-colors ${
                  lang.hasValue
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800/40'
                    : 'bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'
                } ${
                  isTarget
                    ? 'ring-1 ring-indigo-400 dark:ring-indigo-300 cursor-default'
                    : 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${lang.hasValue ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-500'}`} />
                <span className="max-w-[140px] truncate">
                  {lang.flag ? `${lang.flag} ` : ''}{lang.name || lang.code}
                </span>
                <span className="text-[10px] uppercase tracking-wide">{lang.hasValue ? t('editor.status.ok') : t('editor.status.missing')}</span>
              </button>
            );
          })}
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-xs text-gray-600 dark:text-gray-300">
          <div className="font-semibold text-gray-800 dark:text-gray-100">{t('editor.estimation.title')}</div>
          {sourceText.trim().length === 0 ? (
            <div className="mt-1 text-gray-500 dark:text-gray-400">{t('editor.estimation.noSource')}</div>
          ) : missingTargets.length === 0 ? (
            <div className="mt-1 text-gray-500 dark:text-gray-400">{t('editor.estimation.noneMissing')}</div>
          ) : (
            <div className="mt-1 flex flex-wrap gap-3">
              <span>{t('editor.estimation.missing', { count: missingTargets.length })}</span>
              <span>{t('editor.estimation.tokens', { count: formatNumber(missingTotalTokens) })}</span>
              <span>{t('editor.estimation.prompt', { count: formatNumber(missingPromptTokens) })}</span>
              <span>{t('editor.estimation.completion', { count: formatNumber(missingCompletionTokens) })}</span>
              <span>{t('editor.estimation.cost', { value: missingCost === null ? t('editor.estimation.noTable') : formatUsd(missingCost) })}</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Content - Split View */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
        
        {/* Left Column: Source & Editor */}
        <div className="flex flex-col gap-4 min-h-0">
          
          {/* Source Panel */}
          <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex-shrink-0 transition-colors">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              {t('editor.original', { source: sourceLangName })}
            </h3>
            <div className="text-gray-800 dark:text-gray-200 text-sm whitespace-pre-wrap font-sans">
              {sourceText || <span className="text-gray-400 dark:text-gray-600 italic">{t('editor.original.empty')}</span>}
            </div>
          </div>

          {/* Editor Panel */}
          <div className="flex-1 flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500 dark:focus-within:ring-indigo-400 transition-all">
            {/* Toolbar */}
            <div className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 p-2 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button onClick={() => insertMarkdown('**bold**')} className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors" title={t('editor.toolbar.bold')}><Bold className="w-4 h-4" /></button>
                <button onClick={() => insertMarkdown('*italic*')} className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors" title={t('editor.toolbar.italic')}><Italic className="w-4 h-4" /></button>
                <button onClick={() => insertMarkdown('[text](url)')} className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors" title={t('editor.toolbar.link')}><LinkIcon className="w-4 h-4" /></button>
                <button onClick={() => insertMarkdown('\n- list item')} className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors" title={t('editor.toolbar.list')}><List className="w-4 h-4" /></button>
              </div>
              <button 
                onClick={handleAiTranslate}
                disabled={isBusy || !sourceText}
                className={`text-xs flex items-center gap-1 px-2 py-1 rounded border transition-colors ${
                  isTranslating 
                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800 cursor-wait' 
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-purple-50 dark:hover:bg-purple-900/30 hover:text-purple-700 dark:hover:text-purple-300 hover:border-purple-200 dark:hover:border-purple-800'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                {isTranslating ? t('editor.autoTranslating') : t('editor.autoTranslate')}
              </button>
              <button
                onClick={handleTranslateMissing}
                disabled={isBusy || !sourceText || missingTargets.length === 0}
                className={`text-xs flex items-center gap-1 px-2 py-1 rounded border transition-colors ${
                  isBulkTranslating
                    ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 cursor-wait'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-700 dark:hover:text-indigo-300 hover:border-indigo-200 dark:hover:border-indigo-800'
                }`}
              >
                <Layers className="w-3 h-3" />
                {isBulkTranslating && bulkProgress
                  ? t('editor.translateMissingProgress', { done: bulkProgress.done, total: bulkProgress.total })
                  : t('editor.translateMissing', { count: missingTargets.length })}
              </button>
            </div>
            
            {error && (
               <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs px-3 py-2 flex items-center gap-2 border-b border-red-100 dark:border-red-900/30">
                 <AlertTriangle className="w-3 h-3" /> {error}
               </div>
            )}

            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t('editor.placeholder')}
              className="flex-1 w-full p-4 resize-none outline-none font-mono text-sm bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600"
            />
            
            <div className="bg-gray-50 dark:bg-gray-900 px-3 py-1 text-xs text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-700 text-right">
              {t('editor.characters', { count: value.length })}
            </div>
          </div>
        </div>

        {/* Right Column: Preview */}
        <div className="flex flex-col min-h-0">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm h-full overflow-hidden flex flex-col transition-colors">
             <h3 className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
               {t('editor.preview')}
             </h3>
             <div className="p-6 overflow-y-auto custom-scrollbar flex-1 prose prose-sm max-w-none prose-indigo dark:prose-invert">
                {value ? (
                  <ReactMarkdown>{value}</ReactMarkdown>
                ) : (
                  <p className="text-gray-400 dark:text-gray-600 italic">{t('editor.preview.empty')}</p>
                )}
             </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default TranslationEditor;
