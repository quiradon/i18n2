import { buildToonSystemPrompt, buildToonUserPrompt } from './toonPrompt';
import type { AiProvider } from '../types';

const DEFAULT_OPENAI_MODEL = 'gpt-5-nano-2025-08-07';
const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

const FIX_SYSTEM_PROMPT =
  'You are a text proofreader. Fix spelling mistakes, missing accents, and grammar errors in the text. ' +
  'Do NOT translate. Do NOT change meaning. Return ONLY the corrected text, no explanations, no quotes, no fences.';

type AiOptions = {
  provider?: AiProvider;
  openAiApiKey?: string;
  openAiModel?: string;
  groqApiKey?: string;
  groqModel?: string;
  deepseekApiKey?: string;
  deepseekModel?: string;
  targetLangCode?: string;
  onUsage?: (usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    model: string;
    targetLangCode: string;
  }) => void;
};

type ProviderConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

const resolveProviderConfig = (options?: AiOptions): ProviderConfig => {
  const provider = options?.provider ?? 'openai';
  if (provider === 'groq') {
    return {
      baseUrl: GROQ_BASE_URL,
      apiKey: options?.groqApiKey ?? '',
      model: options?.groqModel || DEFAULT_GROQ_MODEL
    };
  }
  if (provider === 'deepseek') {
    return {
      baseUrl: DEEPSEEK_BASE_URL,
      apiKey: options?.deepseekApiKey ?? '',
      model: options?.deepseekModel || DEFAULT_DEEPSEEK_MODEL
    };
  }
  return {
    baseUrl: OPENAI_BASE_URL,
    apiKey: options?.openAiApiKey ?? '',
    model: options?.openAiModel || DEFAULT_OPENAI_MODEL
  };
};

export const fetchAvailableModels = async (
  provider: AiProvider,
  apiKey: string
): Promise<string[]> => {
  let baseUrl: string;
  if (provider === 'groq') {
    baseUrl = GROQ_BASE_URL;
  } else if (provider === 'deepseek') {
    baseUrl = DEEPSEEK_BASE_URL;
  } else {
    baseUrl = OPENAI_BASE_URL;
  }
  const response = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`Fetch models error (${provider}):`, errorBody);
    throw new Error(`Failed to fetch models for ${provider}.`);
  }
  const data = await response.json();
  const ids: string[] = (data.data as Array<{ id: string }> | undefined)?.map(m => m.id) ?? [];
  return ids.sort();
};

const normalizeTranslationOutput = (raw: string): string => {
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

    if (unwrap(/^```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)\s*```$/)) {
      changed = true;
      continue;
    }

    if (unwrap(/^(?:"""|''')\s*([\s\S]*?)\s*(?:"""|''')$/)) {
      changed = true;
      continue;
    }

    if (unwrap(/^"([\s\S]*)"$/)) {
      changed = true;
      continue;
    }

    if (unwrap(/^'([\s\S]*)'$/)) {
      changed = true;
    }
  }

  return text;
};

export const fixText = async (
  text: string,
  options?: AiOptions
): Promise<string> => {
  const { baseUrl, apiKey, model } = resolveProviderConfig(options);
  if (!apiKey) {
    throw new Error('AI provider API key missing.');
  }

  const payload: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: FIX_SYSTEM_PROMPT },
      { role: 'user', content: `"""${text}"""` }
    ]
  };

  if (!model.startsWith('gpt-5')) {
    payload.temperature = 0.1;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Fix Text Error:', errorBody);
    throw new Error('Failed to fix text using AI.');
  }

  const data = await response.json();
  const usage = data?.usage;
  if (usage && options?.onUsage) {
    const promptTokens = Number(usage.prompt_tokens) || 0;
    const completionTokens = Number(usage.completion_tokens) || 0;
    const totalTokens = Number(usage.total_tokens) || 0;
    const modelName = typeof data?.model === 'string' ? data.model : model;
    const targetLangCode = options.targetLangCode || 'fix';
    options.onUsage({ promptTokens, completionTokens, totalTokens, model: modelName, targetLangCode });
  }
  const content = data?.choices?.[0]?.message?.content;
  return typeof content === 'string' ? normalizeTranslationOutput(content) : text;
};

export const translateText = async (
  text: string,
  targetLang: string,
  sourceLang: string = 'English',
  context?: string,
  options?: AiOptions
): Promise<string> => {
  const { baseUrl, apiKey, model } = resolveProviderConfig(options);
  if (!apiKey) {
    throw new Error('AI provider API key missing.');
  }

  return translateWithProvider(
    text,
    targetLang,
    sourceLang,
    context,
    baseUrl,
    apiKey,
    model,
    options
  );
};

const translateWithProvider = async (
  text: string,
  targetLang: string,
  sourceLang: string,
  context: string | undefined,
  baseUrl: string,
  apiKeyValue: string,
  model: string,
  options?: AiOptions
): Promise<string> => {
  const systemPrompt = buildToonSystemPrompt(targetLang, sourceLang, context);
  const userPrompt = buildToonUserPrompt(text);

  const payload: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  };

  if (!model.startsWith('gpt-5')) {
    payload.temperature = 0.2;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKeyValue}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Translation Error:', errorBody);
    throw new Error('Failed to translate text using AI.');
  }

  const data = await response.json();
  const usage = data?.usage;
  if (usage && options?.onUsage) {
    const promptTokens = Number(usage.prompt_tokens) || 0;
    const completionTokens = Number(usage.completion_tokens) || 0;
    const totalTokens = Number(usage.total_tokens) || 0;
    const modelName = typeof data?.model === 'string' ? data.model : model;
    const targetLangCode = options.targetLangCode || targetLang;
    options.onUsage({
      promptTokens,
      completionTokens,
      totalTokens,
      model: modelName,
      targetLangCode
    });
  }
  const content = data?.choices?.[0]?.message?.content;
  return typeof content === 'string' ? normalizeTranslationOutput(content) : '';
};
