import React, { useState } from 'react';
import { TranslationKey, TranslationValue, Language } from '../types';
import { Edit, Copy, Check, Trash2 } from 'lucide-react';
import { useI18n } from '../services/i18n';
import DeleteKeyModal from './DeleteKeyModal';

interface TranslationTableProps {
  keys: TranslationKey[];
  values: Record<string, TranslationValue>;
  languages: Language[];
  sourceLangCode: string;
  sourceLangName: string;
  effectiveSelectedLang: string;
  availableTargets: Language[];
  viewMode: 'single' | 'grid';
  isQuickEditMode: boolean;
  onEdit: (keyId: string, langCode: string) => void;
  onDeleteKey: (keyId: string) => void;
  onUpdateValue: (keyId: string, langCode: string, newValue: string) => void;
}

const TranslationTable: React.FC<TranslationTableProps> = ({
  keys,
  values,
  languages,
  sourceLangCode,
  sourceLangName,
  effectiveSelectedLang,
  availableTargets,
  viewMode,
  isQuickEditMode,
  onEdit,
  onDeleteKey,
  onUpdateValue
}) => {
  const t = useI18n();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<{ id: string; label: string } | null>(null);
  const targetLangCodes = languages
    .filter(lang => lang.code !== sourceLangCode)
    .map(lang => lang.code);

  const getProgressBadgeClass = (percent: number) => {
    if (percent >= 100) {
      return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-800/40';
    }
    if (percent >= 75) {
      return 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-200 dark:border-teal-800/40';
    }
    if (percent >= 50) {
      return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-800/40';
    }
    if (percent >= 25) {
      return 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-200 dark:border-orange-800/40';
    }
    return 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-200 dark:border-rose-800/40';
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(text);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleDelete = (keyId: string, keyLabel: string) => {
    setKeyToDelete({ id: keyId, label: keyLabel });
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = () => {
    if (keyToDelete) {
      onDeleteKey(keyToDelete.id);
      setKeyToDelete(null);
    }
  };

  const renderCellContent = (keyId: string, langCode: string, value: string) => {
    if (isQuickEditMode) {
      return (
        <textarea
          value={value}
          onChange={(e) => onUpdateValue(keyId, langCode, e.target.value)}
          className="w-full min-w-[150px] p-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none resize-y"
          rows={2}
        />
      );
    }
    return (
      <div className={`text-sm line-clamp-3 font-sans ${value ? 'text-gray-900 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500 italic'}`}>
        {value || t('table.notTranslated')}
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex-1 overflow-hidden flex flex-col transition-colors">
      <div className="relative overflow-auto custom-scrollbar flex-1">
        <table className="min-w-full border-separate border-spacing-0 divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 z-10">
            <tr>
              <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[200px] sticky left-0 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] z-30">
                {t('table.key')}
              </th>
              <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[250px]">
                {t('table.source', { source: sourceLangName })}
              </th>

              {viewMode === 'single' ? (
                <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[250px]">
                  {languages.find(l => l.code === effectiveSelectedLang)?.name}
                </th>
              ) : (
                availableTargets.map(lang => (
                  <th key={lang.code} scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[250px]">
                    {lang.flag} {lang.name}
                  </th>
                ))
              )}

              <th scope="col" className="relative px-4 py-2.5 min-w-[140px]">
                <span className="sr-only">{t('table.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {keys.map((key) => {
              const baseValue = values[key.id]?.[sourceLangCode] || '';
              const translatedCount = targetLangCodes.reduce((acc, code) => {
                const currentValue = values[key.id]?.[code] || '';
                return currentValue.trim().length > 0 ? acc + 1 : acc;
              }, 0);
              const totalTargets = targetLangCodes.length;
              const progressPercent = totalTargets === 0
                ? 100
                : Math.round((translatedCount / totalTargets) * 100);
              const progressClass = getProgressBadgeClass(progressPercent);

              return (
                <tr key={key.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group">
                  {/* Key Column */}
                  <td className="px-4 py-3 sticky left-0 bg-white dark:bg-gray-800 group-hover:bg-gray-50 dark:group-hover:bg-gray-700/50 border-r border-gray-200 dark:border-gray-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] z-20 align-top">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-medium text-indigo-600 dark:text-indigo-400 break-all">{key.key}</span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${progressClass}`}
                          title={t('table.progress', { done: translatedCount, total: totalTargets })}
                        >
                          {progressPercent}%
                        </span>
                        <button
                          onClick={() => handleCopy(key.key)}
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1 shrink-0"
                          title={t('table.copyKey')}
                        >
                          {copiedKey === key.key ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <div className="mt-2 flex gap-1 flex-wrap">
                        {key.tags.map(tag => (
                          <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </td>

                  {/* Source Language Column */}
                  <td className="px-4 py-3 align-top">
                    <div className="text-sm text-gray-600 dark:text-gray-400 line-clamp-4 font-sans whitespace-pre-wrap" title={baseValue}>
                      {baseValue || <span className="text-gray-300 dark:text-gray-600 italic">{t('table.empty')}</span>}
                    </div>
                  </td>

                  {/* Target Language Column(s) */}
                  {viewMode === 'single' ? (
                    <td className="px-4 py-3 align-top">
                      {renderCellContent(key.id, effectiveSelectedLang, values[key.id]?.[effectiveSelectedLang] || '')}
                    </td>
                  ) : (
                    availableTargets.map(lang => (
                      <td key={lang.code} className="px-4 py-3 align-top">
                        {renderCellContent(key.id, lang.code, values[key.id]?.[lang.code] || '')}
                      </td>
                    ))
                  )}

                  {/* Actions Column */}
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium align-top">
                    <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all">
                      {!isQuickEditMode && (
                        <button
                          onClick={() => onEdit(
                            key.id,
                            viewMode === 'single' ? effectiveSelectedLang : (availableTargets[0]?.code || sourceLangCode)
                          )}
                          className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 flex items-center gap-1"
                        >
                          <Edit className="w-4 h-4" /> {t('table.details')}
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(key.id, key.key)}
                        className="text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 flex items-center gap-1"
                        title={t('table.delete')}
                      >
                        <Trash2 className="w-4 h-4" /> {t('table.delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {keys.length === 0 && (
              <tr>
                <td colSpan={viewMode === 'single' ? 4 : availableTargets.length + 3} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                  {t('table.noKeys')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <DeleteKeyModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setKeyToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        keyName={keyToDelete?.label || ''}
      />
    </div>
  );
};

export default TranslationTable;

