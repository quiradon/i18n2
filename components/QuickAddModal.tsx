import React, { useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import { useI18n } from '../services/i18n';

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceLangName: string;
  targetCount: number;
  defaultKeyName?: string;
  onQuickAdd: (
    keyName: string,
    sourceValue: string,
    onProgress?: (done: number, total: number) => void
  ) => Promise<{ ok: boolean; error?: string }>;
}

const QuickAddModal: React.FC<QuickAddModalProps> = ({
  isOpen,
  onClose,
  sourceLangName,
  targetCount,
  defaultKeyName,
  onQuickAdd
}) => {
  const t = useI18n();
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    setNewKeyName(defaultKeyName?.trim() || '');
  }, [isOpen, defaultKeyName]);

  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setProgress(null);
    setIsSubmitting(true);

    const result = await onQuickAdd(newKeyName.trim(), newKeyValue, (done, total) => {
      setProgress({ done, total });
    });

    if (result.ok) {
      setNewKeyName('');
      setNewKeyValue('');
      setIsSubmitting(false);
      setProgress(null);
      onClose();
      return;
    }

    setIsSubmitting(false);
    setError(result.error || t('errors.addKeyFailed'));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden animate-fade-in border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('quickAdd.title')}</h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('quickAdd.key.label')}
              </label>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm"
                placeholder="module.feature.key"
                autoFocus
                disabled={isSubmitting}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t('quickAdd.key.help')}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('quickAdd.content.label', { source: sourceLangName })}
              </label>
              <textarea
                value={newKeyValue}
                onChange={(e) => setNewKeyValue(e.target.value)}
                className="w-full min-h-[140px] p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm resize-y"
                placeholder={t('createKey.placeholder')}
                disabled={isSubmitting}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t('quickAdd.targets', { count: targetCount })}
              </p>
            </div>

            {progress && (
              <div className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 px-3 py-2 text-xs text-indigo-700 dark:text-indigo-200">
                {t('quickAdd.progress', { done: progress.done, total: progress.total })}
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-xs text-rose-700 dark:text-rose-200">
                {error}
              </div>
            )}
          </div>

          <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium transition-colors"
              disabled={isSubmitting}
            >
              {t('createKey.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !newKeyName.trim()}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 shadow-sm"
            >
              {isSubmitting ? t('quickAdd.submitting') : t('quickAdd.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuickAddModal;
