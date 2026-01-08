import { buildToonSystemPrompt, buildToonUserPrompt } from './toonPrompt';

const DEFAULT_OPENAI_MODEL = 'gpt-5-nano-2025-08-07';

type AiOptions = {
  openAiApiKey?: string;
  openAiModel?: string;
  targetLangCode?: string;
  onUsage?: (usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    model: string;
    targetLangCode: string;
  }) => void;
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

export const translateText = async (
  text: string,
  targetLang: string,
  sourceLang: string = 'English',
  context?: string,
  options?: AiOptions
): Promise<string> => {
  if (!options?.openAiApiKey) {
    throw new Error('OpenAI API key missing.');
  }

  return translateWithOpenAi(
    text,
    targetLang,
    sourceLang,
    context,
    options.openAiApiKey,
    options.openAiModel || DEFAULT_OPENAI_MODEL,
    options
  );
};

const translateWithOpenAi = async (
  text: string,
  targetLang: string,
  sourceLang: string,
  context: string | undefined,
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

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKeyValue}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('OpenAI Translation Error:', errorBody);
    throw new Error('Failed to translate text using OpenAI.');
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
