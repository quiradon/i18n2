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
