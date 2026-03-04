import React, { useState } from 'react';
import { Bot, Copy, Check, Wifi } from 'lucide-react';
import { useI18n } from '../services/i18n';

interface McpTabProps {
  mcpPort: number;
  sourceLangCode: string;
}

const McpTab: React.FC<McpTabProps> = ({ mcpPort, sourceLangCode }) => {
  const t = useI18n();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const isReady = mcpPort > 0;
  const mcpUrl = isReady ? `http://127.0.0.1:${mcpPort}/mcp` : t('mcp.notReady');

  const claudeConfig = JSON.stringify(
    {
      mcpServers: {
        'kraken-i18n': {
          url: isReady ? `http://127.0.0.1:${mcpPort}/mcp` : 'http://127.0.0.1:<port>/mcp'
        }
      }
    },
    null,
    2
  );

  const cursorConfig = JSON.stringify(
    {
      mcpServers: {
        'kraken-i18n': {
          url: isReady ? `http://127.0.0.1:${mcpPort}/mcp` : 'http://127.0.0.1:<port>/mcp'
        }
      }
    },
    null,
    2
  );

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const CopyButton: React.FC<{ text: string; id: string }> = ({ text, id }) => (
    <button
      onClick={() => copyToClipboard(text, id)}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shrink-0"
      title={t('mcp.copy')}
    >
      {copiedId === id ? (
        <>
          <Check className="w-3.5 h-3.5" />
          {t('mcp.copied')}
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" />
          {t('mcp.copy')}
        </>
      )}
    </button>
  );

  const CodeBlock: React.FC<{ text: string; id: string; label?: string }> = ({ text, id, label }) => (
    <div>
      {label && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            {label}
          </span>
          <CopyButton text={text} id={id} />
        </div>
      )}
      {!label && (
        <div className="flex justify-end mb-2">
          <CopyButton text={text} id={id} />
        </div>
      )}
      <pre className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-xs font-mono text-gray-800 dark:text-gray-200 overflow-x-auto whitespace-pre select-all">
        {text}
      </pre>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in text-gray-900 dark:text-gray-100 max-w-4xl mx-auto pb-12">
      <header className="mb-8 border-b border-gray-200 dark:border-gray-700 pb-6">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Bot className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
          {t('mcp.title')}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-2">{t('mcp.subtitle')}</p>
      </header>

      {/* Server status */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Wifi className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            {t('mcp.server.title')}
          </h3>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                isReady ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'
              }`}
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {isReady ? t('mcp.server.running', { port: String(mcpPort) }) : t('mcp.server.starting')}
            </span>
          </div>
          {isReady && (
            <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-100 dark:border-gray-700 px-4 py-3">
              <span className="font-mono text-sm text-gray-900 dark:text-gray-100 truncate">
                {mcpUrl}
              </span>
              <CopyButton text={mcpUrl} id="mcp-url" />
            </div>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('mcp.server.note')}</p>
        </div>
      </div>

      {/* What this does */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <h3 className="text-lg font-semibold">{t('mcp.about.title')}</h3>
        </div>
        <div className="p-6 space-y-3 text-sm text-gray-700 dark:text-gray-300">
          <p>{t('mcp.about.description')}</p>
          <p className="font-medium">{t('mcp.about.tool')}</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              <span className="font-mono text-indigo-600 dark:text-indigo-400">key</span>
              {' – '}{t('mcp.about.param.key')}
            </li>
            <li>
              <span className="font-mono text-indigo-600 dark:text-indigo-400">content</span>
              {' – '}{t('mcp.about.param.content')}
            </li>
            <li>
              <span className="font-mono text-indigo-600 dark:text-indigo-400">source_lang</span>
              {' – '}{t('mcp.about.param.sourceLang', { default: sourceLangCode })}
            </li>
          </ul>
        </div>
      </div>

      {/* Claude Desktop config */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <h3 className="text-lg font-semibold">{t('mcp.config.claude.title')}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('mcp.config.claude.path')}
          </p>
        </div>
        <div className="p-6 space-y-3">
          <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5 font-mono">
            <p>macOS: <span className="select-all">~/Library/Application Support/Claude/claude_desktop_config.json</span></p>
            <p>Windows: <span className="select-all">%APPDATA%\Claude\claude_desktop_config.json</span></p>
          </div>
          <CodeBlock text={claudeConfig} id="claude-config" label="JSON" />
        </div>
      </div>

      {/* Cursor config */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <h3 className="text-lg font-semibold">{t('mcp.config.cursor.title')}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('mcp.config.cursor.path')}
          </p>
        </div>
        <div className="p-6 space-y-3">
          <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
            <p>~/.cursor/mcp.json</p>
          </div>
          <CodeBlock text={cursorConfig} id="cursor-config" label="JSON" />
        </div>
      </div>

      {/* Usage example */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <h3 className="text-lg font-semibold">{t('mcp.example.title')}</h3>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">{t('mcp.example.description')}</p>
          <CodeBlock
            text={t('mcp.example.text', { lang: sourceLangCode })}
            id="example-prompt"
            label={t('mcp.example.prompt')}
          />
        </div>
      </div>
    </div>
  );
};

export default McpTab;
