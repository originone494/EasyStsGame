import type { CharacterDefinition } from '../game/model';

// Prototype character only; the formal roster and fixed relic are not designed yet.
export const characters: Record<string, CharacterDefinition> = {
  wanderer: { name: '行者', startingCards: ['combo', 'prepare'] },
};
