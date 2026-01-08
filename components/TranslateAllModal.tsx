import React, { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { TranslateAllEstimate } from '../types';
import { formatUsd } from '../services/openAiPricing';
import { useI18n } from '../services/i18n';

interface TranslateAllModalProps {
  isOpen: boolean;
  onClose: () => void;
  estimate: TranslateAllEstimate;
  openAiModel: string;
  hasApiKey: boolean;
  onConfirm: (
    onProgress?: (done: number, total: number) => void
  ) => Promise<{ ok: boolean; error?: string }>;
}

const TranslateAllModal: React.FC<TranslateAllModalProps> = ({
  isOpen,
  onClose,
  estimate,
  openAiModel,
  hasApiKey,
  onConfirm
}) => {
  const t = useI18n();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setIsSubmitting(false);
    setProgress(null);
    setError(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const formatNumber = (value: number) => value.toLocaleString();
  const canTranslate = estimate.missingCount > 0 && hasApiKey && !isSubmitting;
  const costLabel =
    estimate.cost === null ? t('editor.estimation.noTable') : formatUsd(estimate.cost);

  const handleConfirm = async () => {
    if (!hasApiKey) {
      setError(t('errors.openAiKeyMissing'));
      return;
    }
    if (estimate.missingCount === 0) {
      setError(t('translateAll.noMissing'));
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setProgress({ done: 0, total: estimate.missingCount });

    const result = await onConfirm((done, total) => {
      setProgress({ done, total });
    });

    if (result.ok) {
      setIsSubmitting(false);
      setProgress(null);
      onClose();
      return;
    }

    setIsSubmitting(false);
    setError(result.error || t('errors.translationFailed'));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden animate-fade-in border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('translateAll.title')}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('translateAll.subtitle')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-50"
            disabled={isSubmitting}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
              <div className="text-xs text-gray-500 dark:text-gray-400">{t('translateAll.summary.model')}</div>
              <div className="font-semibold text-gray-900 dark:text-white">{openAiModel}</div>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
              <div className="text-xs text-gray-500 dark:text-gray-400">{t('translateAll.summary.missing')}</div>
              <div className="font-semibold text-gray-900 dark:text-white">{formatNumber(estimate.missingCount)}</div>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
              <div className="text-xs text-gray-500 dark:text-gray-400">{t('translateAll.summary.tokens')}</div>
              <div className="font-semibold text-gray-900 dark:text-white">{formatNumber(estimate.totalTokens)}</div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400">
                P {formatNumber(estimate.promptTokens)} / C {formatNumber(estimate.completionTokens)}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
              <div className="text-xs text-gray-500 dark:text-gray-400">{t('translateAll.summary.cost')}</div>
              <div className="font-semibold text-gray-900 dark:text-white">{costLabel}</div>
            </div>
          </div>

          {!hasApiKey && (
            <div className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-xs text-rose-700 dark:text-rose-200">
              {t('errors.openAiKeyMissing')}
            </div>
          )}

          {estimate.missingCount === 0 && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-200">
              {t('translateAll.noMissing')}
            </div>
          )}

          {progress && (
            <div className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 px-3 py-2 text-xs text-indigo-700 dark:text-indigo-200">
              {t('translateAll.progress', { done: progress.done, total: progress.total })}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-xs text-rose-700 dark:text-rose-200">
              {error}
            </div>
          )}

          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('translateAll.note')}
          </p>
        </div>

        <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium transition-colors disabled:opacity-50"
            disabled={isSubmitting}
          >
            {t('translateAll.cancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canTranslate}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 shadow-sm"
          >
            {isSubmitting ? t('translateAll.confirming') : t('translateAll.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TranslateAllModal;
