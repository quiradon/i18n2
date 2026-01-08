export interface TranslationKey {
  id: string;
  key: string; // e.g., 'welcome_message'
  tags: string[];
}

export interface TranslationValue {
  [langCode: string]: string;
}

export interface Language {
  code: string;
  name: string;
  flag: string;
}

export interface TokenUsageReport {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  requests: number;
  perModel: Record<string, number>;
  perLanguage: Record<string, number>;
  lastUpdated: string | null;
}

export interface TokenUsageDelta {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
  targetLangCode: string;
}

export interface TranslateAllEstimate {
  missingCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number | null;
}

export type ViewState = 'dashboard' | 'list' | 'editor' | 'settings';

export interface EditorState {
  keyId: string | null;
  targetLang: string;
}

export enum AppStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SAVING = 'SAVING',
  ERROR = 'ERROR'
}
