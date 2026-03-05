export const estimateTokenCount = (text: string): number => {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.ceil(trimmed.length / 4);
};

export const buildToonSystemPrompt = (
  targetLang: string,
  sourceLang: string,
  context?: string
): string => {
  const contextLine = context ? `CTX:${context}` : 'CTX:-';
  return [
    'TOON/1',
    `SRC:${sourceLang}`,
    `TGT:${targetLang}`,
    'RULES:KEEP_MD,KEEP_VARS,NO_QUOTES,NO_FENCES,NO_LABELS,NO_ECHO,NO_PREFIX',
    'OUT:TEXT_ONLY',
    'VARS:{{x}},{x},%{x},%s,%d,{0},${x}',
    contextLine
  ].join('\n');
};

export const buildToonUserPrompt = (text: string): string => {
  return `"""${text}"""`;
};

export const buildToonPrompt = (
  text: string,
  targetLang: string,
  sourceLang: string,
  context?: string
): string => {
  return [
    buildToonSystemPrompt(targetLang, sourceLang, context),
    buildToonUserPrompt(text)
  ].join('\n');
};

/**
 * Build the system prompt for a single API call that translates one source text
 * into multiple languages at once.
 */
export const buildBatchSystemPrompt = (
  sourceLang: string,
  context?: string
): string => {
  const contextLine = context ? `CTX:${context}` : 'CTX:-';
  return [
    'TOON/1',
    `SRC:${sourceLang}`,
    'RULES:KEEP_MD,KEEP_VARS,NO_FENCES,NO_ECHO',
    'VARS:{{x}},{x},%{x},%s,%d,{0},${x}',
    'OUT:[code]translation[/code] for every requested language, nothing else',
    contextLine
  ].join('\n');
};

export type BatchTarget = { code: string; name: string };

/**
 * Build the user prompt listing the text and the target languages.
 */
export const buildBatchUserPrompt = (text: string, targets: BatchTarget[]): string => {
  const langList = targets.map(t => `${t.code}=${t.name}`).join(',');
  return `"""${text}"""\nLANGS:${langList}`;
};

/**
 * Parse a batch response that uses the [code]...[/code] format.
 * Returns a map of langCode -> translation.
 */
export const parseBatchResponse = (raw: string, targets: BatchTarget[]): Map<string, string> => {
  const result = new Map<string, string>();
  const validCodes = new Set(targets.map(t => t.code));
  const pattern = /\[([a-z][a-z-]*)\]([\s\S]*?)\[\/\1\]/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    const code = match[1].toLowerCase();
    if (validCodes.has(code)) {
      result.set(code, match[2].trim());
    }
  }
  return result;
};

/**
 * Estimate the prompt tokens saved by batching N translations into one call
 * vs N individual calls.  Each individual call pays the full system-prompt
 * overhead; a batch call pays it only once.
 */
export const estimateBatchPromptTokens = (
  text: string,
  targets: BatchTarget[],
  sourceLang: string,
  context?: string
): number => {
  const systemPrompt = buildBatchSystemPrompt(sourceLang, context);
  const userPrompt = buildBatchUserPrompt(text, targets);
  return estimateTokenCount(systemPrompt) + estimateTokenCount(userPrompt);
};
