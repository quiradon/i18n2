import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

let extensionContext: vscode.ExtensionContext | null = null;

type LanguageInfo = {
  code: string;
  name: string;
  flag: string;
};

type TranslationKey = {
  id: string;
  key: string;
  tags: string[];
};

type TranslationValue = {
  [langCode: string]: string;
};

type TokenUsageReport = {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  requests: number;
  perModel: Record<string, number>;
  perLanguage: Record<string, number>;
  lastUpdated: string | null;
};

type InitPayload = {
  languages: LanguageInfo[];
  keys: TranslationKey[];
  values: Record<string, TranslationValue>;
  sourceLangCode: string;
  openaiApiKey: string;
  openaiModel: string;
  tokenReport: TokenUsageReport;
  locale: string;
  i18nFolder: string;
  status: 'ok' | 'missingWorkspace' | 'missingFolder' | 'emptyFolder';
  error?: string;
};

type WebviewMessage =
  | { type: 'ready' }
  | { type: 'updateValue'; key: string; lang: string; value: string }
  | { type: 'addKey'; key: string; sourceLang: string; value: string }
  | { type: 'addLanguage'; lang: string }
  | { type: 'initI18n' }
  | { type: 'refresh' }
  | {
      type: 'recordTokenUsage';
      usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        model: string;
        targetLangCode: string;
      };
    }
  | {
      type: 'updateConfig';
      key: 'sourceLanguage' | 'openaiApiKey' | 'openaiModel';
      value: string;
      scope?: 'global' | 'workspace';
    };

const COMMAND_ID = 'polyglotManager.open';

export function activate(context: vscode.ExtensionContext) {
  extensionContext = context;
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.text = '$(globe) Kraken i18n';
  statusBarItem.tooltip = 'Open Kraken i18n';
  statusBarItem.command = COMMAND_ID;
  statusBarItem.show();

  const command = vscode.commands.registerCommand(COMMAND_ID, () => {
    const panel = vscode.window.createWebviewPanel(
      'polyglotManager',
      'Kraken i18n',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
      }
    );

    panel.webview.html = getWebviewHtml(context, panel.webview);

    const updateTheme = () => {
      const kind = vscode.window.activeColorTheme.kind;
      const isDark =
        kind === vscode.ColorThemeKind.Dark ||
        kind === vscode.ColorThemeKind.HighContrast;
      panel.webview.postMessage({ type: 'theme', isDark });
    };

    updateTheme();
    const themeListener = vscode.window.onDidChangeActiveColorTheme(updateTheme);
    panel.onDidDispose(() => themeListener.dispose());
    const configListener = vscode.workspace.onDidChangeConfiguration(async event => {
      if (!event.affectsConfiguration('polyglotManager')) return;
      const payload = await readI18nData();
      panel.webview.postMessage({ type: 'init', payload });
    });
    panel.onDidDispose(() => configListener.dispose());

    panel.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
      switch (message.type) {
        case 'ready': {
          const payload = await readI18nData();
          panel.webview.postMessage({ type: 'init', payload });
          break;
        }
        case 'refresh': {
          const payload = await readI18nData();
          panel.webview.postMessage({ type: 'init', payload });
          break;
        }
        case 'initI18n': {
          await initializeI18n();
          const payload = await readI18nData();
          panel.webview.postMessage({ type: 'init', payload });
          break;
        }
        case 'updateValue': {
          await updateTranslationValue(message.lang, message.key, message.value);
          break;
        }
        case 'addKey': {
          await addTranslationKey(message.key, message.sourceLang, message.value);
          break;
        }
        case 'addLanguage': {
          await addLanguageFile(message.lang);
          const payload = await readI18nData();
          panel.webview.postMessage({ type: 'init', payload });
          break;
        }
        case 'recordTokenUsage': {
          const report = await updateTokenReport(message.usage);
          panel.webview.postMessage({ type: 'tokenReport', payload: report });
          break;
        }
        case 'updateConfig': {
          const config = vscode.workspace.getConfiguration('polyglotManager');
          const target =
            message.scope === 'workspace'
              ? vscode.ConfigurationTarget.Workspace
              : vscode.ConfigurationTarget.Global;
          await config.update(message.key, message.value, target);
          break;
        }
        default:
          break;
      }
    });
  });

  context.subscriptions.push(command, statusBarItem);
}

export function deactivate() {}

function getWorkspaceRoot(): string | null {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder?.uri.fsPath ?? null;
}

function getI18nFolderName(): string {
  const config = vscode.workspace.getConfiguration('polyglotManager');
  return config.get<string>('i18nFolder', 'i18n');
}

function getSourceLanguagePreference(): string {
  const config = vscode.workspace.getConfiguration('polyglotManager');
  return config.get<string>('sourceLanguage', 'en');
}

function getOpenAiApiKey(): string {
  const config = vscode.workspace.getConfiguration('polyglotManager');
  return config.get<string>('openaiApiKey', '');
}

function getOpenAiModel(): string {
  const config = vscode.workspace.getConfiguration('polyglotManager');
  return config.get<string>('openaiModel', 'gpt-5-nano-2025-08-07');
}

function getDefaultTokenReport(): TokenUsageReport {
  return {
    totalTokens: 0,
    promptTokens: 0,
    completionTokens: 0,
    requests: 0,
    perModel: {},
    perLanguage: {},
    lastUpdated: null
  };
}

function getTokenReport(): TokenUsageReport {
  const stored = extensionContext?.workspaceState.get<TokenUsageReport>('tokenReport');
  if (!stored) return getDefaultTokenReport();
  return {
    ...getDefaultTokenReport(),
    ...stored,
    perModel: stored.perModel || {},
    perLanguage: stored.perLanguage || {}
  };
}

async function updateTokenReport(usage: {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
  targetLangCode: string;
}): Promise<TokenUsageReport> {
  const report = getTokenReport();
  report.totalTokens += usage.totalTokens;
  report.promptTokens += usage.promptTokens;
  report.completionTokens += usage.completionTokens;
  report.requests += 1;
  report.perModel[usage.model] = (report.perModel[usage.model] || 0) + usage.totalTokens;
  report.perLanguage[usage.targetLangCode] =
    (report.perLanguage[usage.targetLangCode] || 0) + usage.totalTokens;
  report.lastUpdated = new Date().toISOString();

  await extensionContext?.workspaceState.update('tokenReport', report);
  return report;
}

function resolveI18nDir(): string | null {
  const root = getWorkspaceRoot();
  if (!root) return null;

  const configured = getI18nFolderName();
  if (path.isAbsolute(configured) && fs.existsSync(configured)) {
    return configured;
  }

  const direct = path.join(root, configured);
  if (fs.existsSync(direct)) {
    return direct;
  }

  const folderName = path.basename(configured);
  return findFolderByName(root, folderName);
}

function getOrCreateI18nDir(): string | null {
  const root = getWorkspaceRoot();
  if (!root) return null;

  const existing = resolveI18nDir();
  if (existing) return existing;

  const configured = getI18nFolderName();
  const target = path.isAbsolute(configured) ? configured : path.join(root, configured);
  fs.mkdirSync(target, { recursive: true });
  return target;
}

function findFolderByName(root: string, folderName: string): string | null {
  const target = folderName.toLowerCase();
  const skip = new Set([
    'node_modules',
    'dist',
    'out',
    'coverage',
    '.git',
    '.vscode',
    '.vscode-test',
    'media'
  ]);
  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
  const maxDepth = 6;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      const lower = name.toLowerCase();
      const fullPath = path.join(current.dir, name);

      if (lower === target) {
        return fullPath;
      }

      if (skip.has(lower) || name.startsWith('.')) {
        continue;
      }

      if (current.depth < maxDepth) {
        queue.push({ dir: fullPath, depth: current.depth + 1 });
      }
    }
  }

  return null;
}

async function readI18nData(): Promise<InitPayload> {
  const root = getWorkspaceRoot();
  const i18nDir = resolveI18nDir();
  const i18nFolder = getI18nFolderName();
  const sourcePreference = getSourceLanguagePreference();
  const openaiApiKey = getOpenAiApiKey();
  const openaiModel = getOpenAiModel();
  const tokenReport = getTokenReport();
  const locale = vscode.env.language;

  if (!root) {
    return {
      languages: [],
      keys: [],
      values: {},
      sourceLangCode: sourcePreference,
      openaiApiKey,
      openaiModel,
      tokenReport,
      locale,
      i18nFolder,
      status: 'missingWorkspace',
      error: 'Nenhuma pasta de trabalho aberta.'
    };
  }

  if (!i18nDir || !fs.existsSync(i18nDir)) {
    return {
      languages: [],
      keys: [],
      values: {},
      sourceLangCode: sourcePreference,
      openaiApiKey,
      openaiModel,
      tokenReport,
      locale,
      i18nFolder,
      status: 'missingFolder',
      error: `Pasta nao encontrada: ${i18nFolder}`
    };
  }

  const files = fs.readdirSync(i18nDir).filter(file => file.endsWith('.json'));
  if (files.length === 0) {
    return {
      languages: [],
      keys: [],
      values: {},
      sourceLangCode: sourcePreference,
      openaiApiKey,
      openaiModel,
      tokenReport,
      locale,
      i18nFolder,
      status: 'emptyFolder',
      error: 'Nenhum arquivo JSON encontrado em i18n.'
    };
  }

  const languageCodes = files
    .map(file => path.basename(file, '.json'))
    .sort(compareLanguageCodes);

  const languages = languageCodes.map(code => getLanguageInfo(code));

  const perLangValues: Record<string, Record<string, string>> = {};
  const allKeys = new Set<string>();

  for (const code of languageCodes) {
    const filePath = path.join(i18nDir, `${code}.json`);
    const json = readJsonFile(filePath);
    const flattened = flattenObject(json);
    perLangValues[code] = flattened;
    Object.keys(flattened).forEach(key => allKeys.add(key));
  }

  const keyList = Array.from(allKeys).sort((a, b) => a.localeCompare(b));
  const keys: TranslationKey[] = keyList.map(key => ({
    id: key,
    key,
    tags: []
  }));

  const values: Record<string, TranslationValue> = {};
  for (const key of keyList) {
    values[key] = {};
    for (const code of languageCodes) {
      values[key][code] = perLangValues[code]?.[key] ?? '';
    }
  }

  const sourceLangCode = languageCodes.includes(sourcePreference)
    ? sourcePreference
    : languageCodes[0] ?? sourcePreference;

  return {
    languages,
    keys,
    values,
    sourceLangCode,
    openaiApiKey,
    openaiModel,
    tokenReport,
    locale,
    i18nFolder,
    status: 'ok'
  };
}

async function initializeI18n() {
  const i18nDir = getOrCreateI18nDir();
  if (!i18nDir) return;

  const sourceLang = getSourceLanguagePreference();
  const existing = fs.readdirSync(i18nDir).filter(file => file.endsWith('.json'));
  if (existing.length > 0) return;

  const seed = {
    app: {
      title: 'App Title'
    }
  };
  const filePath = path.join(i18nDir, `${sourceLang}.json`);
  writeJsonFile(filePath, seed);
}

async function updateTranslationValue(langCode: string, key: string, value: string) {
  const i18nDir = getOrCreateI18nDir();
  if (!i18nDir) return;

  const filePath = path.join(i18nDir, `${langCode}.json`);
  const json = readJsonFile(filePath);
  setNestedValue(json, key, value);
  writeJsonFile(filePath, json);
}

async function addTranslationKey(key: string, sourceLang: string, value: string) {
  const i18nDir = getOrCreateI18nDir();
  if (!i18nDir) return;

  const files = fs.readdirSync(i18nDir).filter(file => file.endsWith('.json'));
  const codes = files.map(file => path.basename(file, '.json'));

  const targetCodes = codes.includes(sourceLang)
    ? codes
    : [...codes, sourceLang];

  for (const code of targetCodes) {
    const filePath = path.join(i18nDir, `${code}.json`);
    const json = readJsonFile(filePath);
    if (getNestedValue(json, key) === undefined) {
      setNestedValue(json, key, code === sourceLang ? value : '');
      writeJsonFile(filePath, json);
    }
  }
}

async function addLanguageFile(langCode: string) {
  const i18nDir = getOrCreateI18nDir();
  if (!i18nDir) return;

  const filePath = path.join(i18nDir, `${langCode}.json`);
  if (fs.existsSync(filePath)) return;
  writeJsonFile(filePath, {});
}

function readJsonFile(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeJsonFile(filePath: string, data: Record<string, unknown>) {
  const json = JSON.stringify(data, null, 2) + '\n';
  fs.writeFileSync(filePath, json, 'utf8');
}

function flattenObject(
  value: Record<string, unknown>,
  prefix = '',
  out: Record<string, string> = {}
): Record<string, string> {
  if (typeof value !== 'object' || value === null) return out;
  for (const [key, entry] of Object.entries(value)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof entry === 'string') {
      out[fullKey] = entry;
      continue;
    }
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      flattenObject(entry as Record<string, unknown>, fullKey, out);
    }
  }
  return out;
}

function setNestedValue(target: Record<string, unknown>, key: string, value: string) {
  const parts = key.split('.');
  let current: Record<string, unknown> = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const next = current[part];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

function getNestedValue(target: Record<string, unknown>, key: string): unknown {
  const parts = key.split('.');
  let current: unknown = target;
  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined;
    const next = (current as Record<string, unknown>)[part];
    if (next === undefined) return undefined;
    current = next;
  }
  return current;
}

function getLanguageInfo(code: string): LanguageInfo {
  const map: Record<string, string> = {
    en: 'English',
    es: 'Spanish',
    pt: 'Portuguese',
    fr: 'French',
    de: 'German',
    it: 'Italian',
    ja: 'Japanese',
    zh: 'Chinese',
    ru: 'Russian',
    ko: 'Korean'
  };
  const normalized = normalizeLanguageCode(code);

  return {
    code,
    name: map[normalized] ?? code,
    flag: ''
  };
}

const POPULAR_LANGUAGE_ORDER = [
  'en',
  'es',
  'pt',
  'fr',
  'de',
  'it',
  'ja',
  'zh',
  'ru',
  'ko'
];

function normalizeLanguageCode(code: string): string {
  const lower = code.toLowerCase();
  if (lower === 'zn' || lower.startsWith('zh')) return 'zh';
  if (lower.startsWith('pt')) return 'pt';
  return lower;
}

function compareLanguageCodes(a: string, b: string): number {
  const aKey = normalizeLanguageCode(a);
  const bKey = normalizeLanguageCode(b);
  const aRank = POPULAR_LANGUAGE_ORDER.indexOf(aKey);
  const bRank = POPULAR_LANGUAGE_ORDER.indexOf(bKey);

  if (aRank !== -1 && bRank !== -1) {
    if (aRank !== bRank) return aRank - bRank;
    return a.localeCompare(b);
  }
  if (aRank !== -1) return -1;
  if (bRank !== -1) return 1;

  if (aKey !== bKey) return aKey.localeCompare(bKey);
  return a.localeCompare(b);
}

function getWebviewHtml(context: vscode.ExtensionContext, webview: vscode.Webview): string {
  const indexPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'index.html');

  if (!fs.existsSync(indexPath.fsPath)) {
    return buildFallbackHtml(webview);
  }

  const rawHtml = fs.readFileSync(indexPath.fsPath, 'utf8');
  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} data: https:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource}`,
    `script-src ${webview.cspSource}`,
    `connect-src https:`
  ].join('; ');

  const withCsp = rawHtml.replace(
    '<head>',
    `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`
  );

  return withCsp.replace(
    /(src|href)="([^"]+)"/g,
    (_match, attr, value) => {
      if (value.startsWith('http') || value.startsWith('data:') || value.startsWith('#')) {
        return `${attr}="${value}"`;
      }
      const cleanValue = value.startsWith('/') ? value.slice(1) : value;
      const resourceUri = webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'media', cleanValue)
      );
      return `${attr}="${resourceUri}"`;
    }
  );
}

function buildFallbackHtml(webview: vscode.Webview): string {
  const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline';`;
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Kraken i18n</title>
    <style>
      body { font-family: sans-serif; padding: 24px; }
      code { background: #f1f1f1; padding: 2px 4px; border-radius: 4px; }
    </style>
  </head>
  <body>
    <h1>Kraken i18n</h1>
    <p>Webview assets not found. Build the webview with <code>npm run build:webview</code>.</p>
  </body>
</html>`;
}
