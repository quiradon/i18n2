export const TRANSLATION_CONCURRENCY = 5;

export const runWithConcurrency = async <T,>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> => {
  let index = 0;
  const worker = async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      await fn(items[current]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
};
