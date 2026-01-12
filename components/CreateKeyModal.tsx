import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { X, Bold, Italic, Link as LinkIcon, List as ListIcon } from 'lucide-react';
import { useI18n } from '../services/i18n';

interface CreateKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (keyName: string, initialValue: string) => void;
  sourceLangName: string;
  defaultKeyName?: string;
}

const CreateKeyModal: React.FC<CreateKeyModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  sourceLangName,
  defaultKeyName
}) => {
  const t = useI18n();
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');

  React.useEffect(() => {
    if (!isOpen) return;
    setNewKeyName(defaultKeyName?.trim() || '');
  }, [isOpen, defaultKeyName]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newKeyName.trim()) {
      onCreate(newKeyName.trim(), newKeyValue);
      setNewKeyName('');
      setNewKeyValue('');
      onClose();
    }
  };

  const insertMarkdown = (syntax: string) => {
    setNewKeyValue(prev => prev + syntax);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-4xl flex flex-col max-h-[90vh] overflow-hidden animate-fade-in border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('createKey.title')}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">

            {/* Key Name Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('createKey.key.label')}
              </label>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm"
                placeholder="module.feature.key"
                autoFocus
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t('createKey.key.help')}
              </p>
            </div>

            {/* Content Editor */}
            <div className="flex-1 flex flex-col">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('createKey.content.label', { source: sourceLangName })}
              </label>

              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 h-64 md:h-80">
                {/* Editor Side */}
                <div className="flex flex-col border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500 dark:focus-within:ring-indigo-400">
                  <div className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 p-2 flex items-center gap-1">
                    <button type="button" onClick={() => insertMarkdown('**bold**')} className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors" title={t('editor.toolbar.bold')}><Bold className="w-3 h-3" /></button>
                    <button type="button" onClick={() => insertMarkdown('*italic*')} className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors" title={t('editor.toolbar.italic')}><Italic className="w-3 h-3" /></button>
                    <button type="button" onClick={() => insertMarkdown('[text](url)')} className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors" title={t('editor.toolbar.link')}><LinkIcon className="w-3 h-3" /></button>
                    <button type="button" onClick={() => insertMarkdown('\n- list item')} className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors" title={t('editor.toolbar.list')}><ListIcon className="w-3 h-3" /></button>
                  </div>
                  <textarea
                    value={newKeyValue}
                    onChange={(e) => setNewKeyValue(e.target.value)}
                    className="flex-1 w-full p-3 resize-none outline-none font-mono text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400"
                    placeholder={t('createKey.placeholder')}
                  />
                </div>

                {/* Preview Side */}
                <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-800 flex flex-col">
                  <div className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 p-2 text-xs font-semibold text-gray-500 dark:text-gray-400 text-center uppercase">
                    {t('createKey.preview.title')}
                  </div>
                  {/* Added text-gray-900 dark:text-gray-100 to ensure visibility if prose fails */}
                  <div className="p-4 overflow-y-auto flex-1 prose prose-sm max-w-none prose-indigo dark:prose-invert text-gray-900 dark:text-gray-100">
                    {newKeyValue ? (
                      <ReactMarkdown>{newKeyValue}</ReactMarkdown>
                    ) : (
                      <p className="text-gray-400 dark:text-gray-600 italic text-center mt-8">{t('createKey.preview.empty')}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium transition-colors"
            >
              {t('createKey.cancel')}
            </button>
            <button
              type="submit"
              disabled={!newKeyName.trim()}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 shadow-sm"
            >
              {t('createKey.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateKeyModal;
