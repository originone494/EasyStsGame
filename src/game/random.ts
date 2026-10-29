export function nextRandom(seed: number): number { return (Math.imul(seed, 1664525) + 1013904223) >>> 0; }
export function shuffle<T>(values: T[], seed: number): { values: T[]; seed: number } {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) { seed = nextRandom(seed); const j = Math.floor(seed / 4294967296 * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return { values: result, seed };
}
