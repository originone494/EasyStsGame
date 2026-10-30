import type { ProgressionContent } from '../game/selection';

// User-approved adjustable test values, not final balance. Missing role keys
// use equal weight 1. Recruitment preserves shared HP/max HP; an exhausted
// general-relic pool awards nothing, as implemented by the progression engine.
export const approvedProgressionTestRules: Pick<ProgressionContent['rules'],
  'cardWeights' | 'characterWeights' | 'relicFallbackWeights'> = {
  cardWeights: { common: 1, uncommon: 1, rare: 1 },
  characterWeights: {},
  relicFallbackWeights: { common: 1, uncommon: 1, rare: 1 },
};

// Formal roles/cards/relics are supplied by the user. Enable the live catalogue
// after importing the user's Excel designs and checking their actual pools.
export const liveProgression: ProgressionContent | null = null;
