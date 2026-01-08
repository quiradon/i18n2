import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TranslationKey, TranslationValue, Language } from '../types';
import { useI18n } from '../services/i18n';

interface DashboardProps {
  keys: TranslationKey[];
  values: Record<string, TranslationValue>;
  languages: Language[];
  sourceLangCode: string;
  onNavigateToList: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ keys, values, languages, sourceLangCode, onNavigateToList }) => {
  const t = useI18n();
  const totalKeys = keys.length;
  const estimateTokens = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return Math.ceil(trimmed.length / 4);
  };

  const data = languages.map(lang => {
    let filledCount = 0;
    let missingTokens = 0;
    let totalTokens = 0;
    keys.forEach(key => {
      const value = values[key.id]?.[lang.code] || '';
      const sourceText = values[key.id]?.[sourceLangCode] || '';
      const estimated = estimateTokens(sourceText);
      totalTokens += estimated;
      if (value.trim().length > 0) {
        filledCount++;
      } else {
        missingTokens += estimated;
      }
    });
    const percentage = totalKeys === 0 ? 0 : Math.round((filledCount / totalKeys) * 100);
    return {
      name: lang.name,
      code: lang.code,
      filled: filledCount,
      total: totalKeys,
      percentage: percentage,
      missingTokens,
      totalTokens
    };
  });

  // Calculate overall completeness
  const totalSlots = totalKeys * languages.length;
  const filledSlots = data.reduce((acc, curr) => acc + curr.filled, 0);
  const overallProgress = totalSlots === 0 ? 0 : Math.round((filledSlots / totalSlots) * 100);
  const totalMissingTokens = data.reduce((acc, curr) => acc + curr.missingTokens, 0);
  const formatTokens = (value: number) => value.toLocaleString();
  const renderTooltip = ({ active, payload }: { active?: boolean; payload?: any[] }) => {
    if (!active || !payload || payload.length === 0) return null;
    const entry = payload[0].payload as {
      name: string;
      percentage: number;
      filled: number;
      total: number;
      missingTokens: number;
    };
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs text-gray-700 dark:text-gray-200 shadow-sm">
        <div className="font-semibold text-sm text-gray-900 dark:text-white">{entry.name}</div>
        <div className="mt-1 flex items-center justify-between gap-4">
          <span>{t('dashboard.tooltip.progress')}</span>
          <span className="font-semibold">{entry.percentage}%</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span>{t('dashboard.tooltip.filled')}</span>
          <span className="font-semibold">{entry.filled}/{entry.total}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span>{t('dashboard.tooltip.pendingTokens')}</span>
          <span className="font-semibold">{formatTokens(entry.missingTokens)}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in text-gray-900 dark:text-gray-100">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-white">{t('dashboard.title')}</h1>
        <p className="text-gray-500 dark:text-gray-400">{t('dashboard.subtitle')}</p>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('dashboard.totalKeys')}</h3>
          <p className="text-4xl font-bold text-indigo-600 dark:text-indigo-400 mt-2">{totalKeys}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('dashboard.languages')}</h3>
          <p className="text-4xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">{languages.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('dashboard.progress')}</h3>
          <div className="flex items-end mt-2">
             <p className="text-4xl font-bold text-blue-600 dark:text-blue-400">{overallProgress}%</p>
             <span className="text-gray-400 dark:text-gray-500 mb-1 ml-2">{t('dashboard.completed')}</span>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('dashboard.pendingTokens')}</h3>
          <p className="text-4xl font-bold text-amber-600 dark:text-amber-400 mt-2">{formatTokens(totalMissingTokens)}</p>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 h-96 transition-colors">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">{t('dashboard.progressByLanguage')}</h3>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#374151" opacity={0.2} />
            <XAxis type="number" domain={[0, 100]} hide />
            <YAxis type="category" dataKey="name" width={100} tick={{fontSize: 12, fill: 'currentColor'}} className="text-gray-600 dark:text-gray-300" />
            <Tooltip cursor={{fill: "transparent"}} content={renderTooltip} />
            <Bar dataKey="percentage" name={t('dashboard.completedPercent')} radius={[0, 4, 4, 0]} barSize={30}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.percentage === 100 ? '#10b981' : '#6366f1'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">{t('dashboard.pendingTokensByLanguage')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.map(entry => (
            <div key={entry.code} className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
              <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{entry.name}</div>
              <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                {entry.missingTokens > 0 ? formatTokens(entry.missingTokens) : t('common.ok')}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button 
          onClick={onNavigateToList}
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white font-medium rounded-lg transition-colors shadow-sm"
        >
          {t('dashboard.manageTranslations')}
        </button>
      </div>
    </div>
  );
};

export default Dashboard;






