type OpenAiPricing = {
  prompt: number;
  completion: number;
};

const OPENAI_PRICING_PER_MILLION: Record<string, OpenAiPricing> = {
  'gpt-4o-mini': { prompt: 0.15, completion: 0.6 },
  'gpt-4o': { prompt: 5, completion: 15 },
  'gpt-4.1-mini': { prompt: 0.3, completion: 1.2 },
  'gpt-4.1': { prompt: 5, completion: 15 }
};

export const estimateOpenAiCost = (
  promptTokens: number,
  completionTokens: number,
  model: string
): number | null => {
  const pricing = OPENAI_PRICING_PER_MILLION[model];
  if (!pricing) return null;
  const promptCost = (promptTokens / 1_000_000) * pricing.prompt;
  const completionCost = (completionTokens / 1_000_000) * pricing.completion;
  return promptCost + completionCost;
};

export const formatUsd = (value: number) => {
  if (value === 0) return '$0.00';
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
};

