import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as net from 'net';
import * as vscode from 'vscode';

let extensionContext: vscode.ExtensionContext | null = null;
let activePanel: vscode.WebviewPanel | null = null;
let mcpHttpServer: http.Server | null = null;
let mcpPort = 0;

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
  i18nDirPath: string;
  extensionPath: string;
  mcpPort: number;
  status: 'ok' | 'missingWorkspace' | 'missingFolder' | 'emptyFolder';
  error?: string;
};

type WebviewMessage =
  | { type: 'ready' }
  | { type: 'updateValue'; key: string; lang: string; value: string }
  | { type: 'addKey'; key: string; sourceLang: string; value: string }
  | { type: 'deleteKey'; key: string }
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

  mcpHttpServer = startMcpHttpServer();

  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.text = '$(globe) Kraken i18n';
  statusBarItem.tooltip = 'Open Kraken i18n';
  statusBarItem.command = COMMAND_ID;
  statusBarItem.show();

  const command = vscode.commands.registerCommand(COMMAND_ID, () => {
    if (activePanel) {
      activePanel.reveal(vscode.ViewColumn.One);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'polyglotManager',
      'Kraken i18n',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
      }
    );

    activePanel = panel;

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
    panel.onDidDispose(() => {
      themeListener.dispose();
      activePanel = null;
    });
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
        case 'deleteKey': {
          await deleteTranslationKey(message.key);
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

export function deactivate() {
  mcpHttpServer?.close();
  mcpHttpServer = null;
}

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
  const extensionPath = extensionContext?.extensionUri.fsPath ?? '';

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
      i18nDirPath: '',
      extensionPath,
      mcpPort,
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
      i18nDirPath: '',
      extensionPath,
      mcpPort,
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
      i18nDirPath: i18nDir,
      extensionPath,
      mcpPort,
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
    i18nDirPath: i18nDir,
    extensionPath,
    mcpPort,
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

async function deleteTranslationKey(key: string) {
  const i18nDir = getOrCreateI18nDir();
  if (!i18nDir) return;

  const files = fs.readdirSync(i18nDir).filter(file => file.endsWith('.json'));
  for (const file of files) {
    const filePath = path.join(i18nDir, file);
    const json = readJsonFile(filePath);
    const removed = removeNestedValue(json, key);
    if (removed) {
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

function removeNestedValue(target: Record<string, unknown>, key: string): boolean {
  const parts = key.split('.');
  if (parts.length === 0) return false;

  const removeBySegments = (current: Record<string, unknown>, startIndex: number): boolean => {
    let removed = false;
    for (let endIndex = startIndex; endIndex < parts.length; endIndex += 1) {
      const joinedKey = parts.slice(startIndex, endIndex + 1).join('.');
      if (!Object.prototype.hasOwnProperty.call(current, joinedKey)) {
        continue;
      }

      if (endIndex === parts.length - 1) {
        delete current[joinedKey];
        removed = true;
        continue;
      }

      const next = current[joinedKey];
      if (!next || typeof next !== 'object' || Array.isArray(next)) {
        continue;
      }

      const removedChild = removeBySegments(next as Record<string, unknown>, endIndex + 1);
      if (removedChild) {
        removed = true;
        if (Object.keys(next as Record<string, unknown>).length === 0) {
          delete current[joinedKey];
        }
      }
    }

    return removed;
  };

  return removeBySegments(target, 0);
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

// ---------------------------------------------------------------------------
// MCP HTTP Server (integrated – uses extension settings directly)
// ---------------------------------------------------------------------------

const MCP_LANGUAGE_NAME_MAP: Record<string, string> = {
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
  ko: 'Korean',
  ru: 'Russian'
};

const MCP_TOOLS = [
  {
    name: 'quick_add',
    description:
      'Add a new i18n translation key. Provide the key name and source text; ' +
      'the server writes the value for the source language and auto-translates ' +
      'every other configured language using OpenAI. ' +
      'Uses the Kraken i18n VS Code extension settings (API key, model, i18n folder).',
    inputSchema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Translation key in dot notation (e.g. "home.button.save")'
        },
        content: {
          type: 'string',
          description: 'Source text for the key'
        },
        source_lang: {
          type: 'string',
          description:
            'BCP-47 language code of the source text (e.g. "en", "pt-br"). ' +
            "Defaults to the extension's configured source language."
        }
      },
      required: ['key', 'content']
    }
  }
];

function startMcpHttpServer(): http.Server {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    const url = req.url ?? '';
    if (!url.startsWith('/mcp')) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found. Use POST /mcp' }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let rpcReq: Record<string, unknown>;
      try {
        rpcReq = JSON.parse(body) as Record<string, unknown>;
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
        );
        return;
      }

      handleMcpRpc(rpcReq)
        .then(result => {
          if (result === null) {
            res.writeHead(202);
            res.end();
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          }
        })
        .catch(err => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id: (rpcReq.id as string | number | null) ?? null,
              error: { code: -32603, message: String(err) }
            })
          );
        });
    });
  });

  server.listen(0, '127.0.0.1', () => {
    const addr = server.address() as net.AddressInfo;
    mcpPort = addr.port;
    if (activePanel) {
      activePanel.webview.postMessage({ type: 'mcpPort', port: mcpPort });
    }
  });

  return server;
}

async function handleMcpRpc(
  req: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const id = (req.id as string | number | null) ?? null;
  const method = req.method as string;

  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          serverInfo: { name: 'kraken-i18n', version: '2.0.0' },
          capabilities: { tools: {} }
        }
      };

    case 'notifications/initialized':
      return null;

    case 'tools/list':
      return { jsonrpc: '2.0', id, result: { tools: MCP_TOOLS } };

    case 'tools/call': {
      const params = req.params as { name?: string; arguments?: Record<string, unknown> } | undefined;
      const toolName = params?.name;
      const args = params?.arguments ?? {};

      if (toolName !== 'quick_add') {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Unknown tool: ${toolName}` }
        };
      }

      const key = typeof args.key === 'string' ? args.key.trim() : '';
      const content = typeof args.content === 'string' ? args.content : '';
      const sourceLangOverride =
        typeof args.source_lang === 'string' ? args.source_lang : undefined;

      if (!key) {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: 'Error: "key" argument is required.' }],
            isError: true
          }
        };
      }

      const result = await mcpQuickAdd(key, content, sourceLangOverride);
      const summary = result.ok
        ? `Success: key "${key}" added and translated to ${Object.keys(result.results).length} language(s).\n` +
          Object.entries(result.results)
            .map(([lang, val]) => `  ${lang}: ${val}`)
            .join('\n')
        : `Error: ${result.error}\n` +
          (Object.keys(result.results).length > 0
            ? 'Partial results:\n' +
              Object.entries(result.results)
                .map(([lang, val]) => `  ${lang}: ${val}`)
                .join('\n')
            : '');

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: summary }],
          isError: !result.ok
        }
      };
    }

    default:
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` }
      };
  }
}

async function mcpQuickAdd(
  key: string,
  content: string,
  sourceLangOverride?: string
): Promise<{ ok: boolean; results: Record<string, string>; error?: string }> {
  const i18nDir = resolveI18nDir();
  const openaiApiKey = getOpenAiApiKey();
  const openaiModel = getOpenAiModel();
  const effectiveSourceLang = sourceLangOverride ?? getSourceLanguagePreference();

  if (!i18nDir || !fs.existsSync(i18nDir)) {
    return {
      ok: false,
      results: {},
      error: 'i18n directory not found. Configure the i18n folder in Kraken i18n settings.'
    };
  }
  if (!openaiApiKey) {
    return {
      ok: false,
      results: {},
      error: 'OpenAI API key not configured. Set it in Kraken i18n extension settings.'
    };
  }

  const files = fs.readdirSync(i18nDir).filter(f => f.endsWith('.json'));
  if (files.length === 0) {
    return { ok: false, results: {}, error: 'No JSON files found in the i18n directory.' };
  }

  const langCodes = files.map(f => path.basename(f, '.json'));

  // Check if key already exists in source file
  const sourceFilePath = path.join(i18nDir, `${effectiveSourceLang}.json`);
  const sourceJson = readJsonFile(sourceFilePath);
  if (getNestedValue(sourceJson, key) !== undefined) {
    return { ok: false, results: {}, error: `Key "${key}" already exists.` };
  }

  // Write source language
  await addTranslationKey(key, effectiveSourceLang, content);

  const results: Record<string, string> = { [effectiveSourceLang]: content };
  const errors: string[] = [];

  const sourceLangName =
    MCP_LANGUAGE_NAME_MAP[effectiveSourceLang.toLowerCase()] ?? effectiveSourceLang;
  const targets = langCodes.filter(code => code !== effectiveSourceLang);

  await Promise.all(
    targets.map(async targetCode => {
      const targetLangName = MCP_LANGUAGE_NAME_MAP[targetCode.toLowerCase()] ?? targetCode;
      try {
        const translated = await mcpTranslateText(
          content,
          targetLangName,
          sourceLangName,
          key,
          openaiApiKey,
          openaiModel
        );
        await updateTranslationValue(targetCode, key, translated);
        results[targetCode] = translated;
      } catch (e: unknown) {
        errors.push(`${targetCode}: ${e instanceof Error ? e.message : String(e)}`);
      }
    })
  );

  if (errors.length > 0) {
    return {
      ok: false,
      results,
      error: `Translation failed for some languages – ${errors.join('; ')}`
    };
  }
  return { ok: true, results };
}

function mcpNormalizeOutput(raw: string): string {
  let text = raw.trim();
  if (!text) return text;
  const unwrap = (pattern: RegExp) => {
    const match = text.match(pattern);
    if (!match) return false;
    text = match[1].trim();
    return true;
  };
  let changed = true;
  let guard = 0;
  while (changed && guard < 4) {
    guard += 1;
    changed = false;
    if (unwrap(/^```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)\s*```$/)) { changed = true; continue; }
    if (unwrap(/^(?:"""|''')\s*([\s\S]*?)\s*(?:"""|''')$/)) { changed = true; continue; }
    if (unwrap(/^"([\s\S]*)"$/)) { changed = true; continue; }
    if (unwrap(/^'([\s\S]*)'$/)) { changed = true; }
  }
  return text;
}

async function mcpTranslateText(
  text: string,
  targetLang: string,
  sourceLang: string,
  context: string,
  apiKey: string,
  model: string
): Promise<string> {
  const contextLine = context ? `CTX:${context}` : 'CTX:-';
  const systemPrompt = [
    'TOON/1',
    `SRC:${sourceLang}`,
    `TGT:${targetLang}`,
    'RULES:KEEP_MD,KEEP_VARS,NO_QUOTES,NO_FENCES,NO_LABELS,NO_ECHO,NO_PREFIX',
    'OUT:TEXT_ONLY',
    'VARS:{{x}},{x},%{x},%s,%d,{0},${x}',
    contextLine
  ].join('\n');

  const payload: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `"""${text}"""` }
    ]
  };
  if (!model.startsWith('gpt-5')) {
    payload.temperature = 0.2;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data?.choices?.[0]?.message?.content;
  return typeof content === 'string' ? mcpNormalizeOutput(content) : '';
}
