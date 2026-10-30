import type { CardInstance, CharacterDefinition, CharacterInstance, ListenerDefinition, Rarity, RelicDefinition } from './model';
import { canAcquireCard, generateCardOffer, rarities, remainingCardCapacity, selectionSeed, weightedIndex, type CardCatalog, type RarityWeights } from './offers';

export interface ProgressionContent {
  id: string;
  initialCharacter: string;
  cards: CardCatalog;
  characters: Readonly<Record<string, CharacterDefinition>>;
  relics: Readonly<Record<string, RelicDefinition>>;
  rules: {
    cardWeights: RarityWeights;
    characterWeights: Record<string, number>;
    relicFallbackWeights: RarityWeights;
    recruitmentShortage: 'exclude' | 'skipEmptyRounds';
  };
}

export function validateProgressionContent(content: ProgressionContent) {
  if (!content.id || !content.characters[content.initialCharacter]) throw new Error('初始角色配置无效。');
  for (const weights of [content.rules.cardWeights, content.rules.relicFallbackWeights]) weightedIndex(rarities.map(rarity => weights[rarity]), 0);
  for (const weight of Object.values(content.rules.characterWeights)) if (!Number.isFinite(weight) || weight < 0) throw new Error('角色权重无效。');
  const names = new Set<string>();
  for (const [key, character] of Object.entries(content.characters)) {
    const pool = character.cardPool;
    if (!pool || new Set(pool).size !== 36 || pool.length !== 36 || character.startingCards.length !== 2
      || character.startingCards.some(card => !pool.includes(card))) throw new Error('角色必须配置36种专属卡及2张初始角色牌。');
    for (const cardKey of pool) {
      const card = content.cards[cardKey];
      if (!card || card.source !== 'character' || card.character !== key || !card.rarity || !rarities.includes(card.rarity)
        || names.has(card.name)) throw new Error('角色卡池来源、稀有度或不同名配置无效。');
      names.add(card.name); canAcquireCard(content.cards, [], cardKey);
    }
    fixedRelic(content, key);
  }
  for (const [key, relic] of Object.entries(content.relics)) {
    if (relic.listener.kind !== 'relic' || relic.listener.key !== key || !rarities.includes(relic.rarity)) throw new Error('遗物配置无效。');
  }
}

export function characterPool(content: ProgressionContent, keys: readonly string[]): string[] {
  return [...new Set(keys.flatMap(key => content.characters[key]?.cardPool ?? []))]
    .filter(key => content.cards[key]?.source === 'character' && keys.includes(content.cards[key].character ?? ''));
}

export function cardCandidates(content: ProgressionContent, party: readonly CharacterInstance[], deck: readonly CardInstance[],
  seed: number, rareOnly = false): string[] {
  return generateCardOffer(content.cards, characterPool(content, party.map(member => member.key)), deck,
    seed, content.rules.cardWeights, rareOnly);
}

export function recruitmentCandidates(content: ProgressionContent, party: readonly CharacterInstance[], deck: readonly CardInstance[], seed: number): string[] {
  if (party.length >= 3) return [];
  let available = Object.keys(content.characters).filter(key => content.characters[key].recruitable !== false
    && (content.rules.characterWeights[key] ?? 1) > 0
    && !party.some(member => member.key === key)
    && (content.rules.recruitmentShortage !== 'exclude' || remainingCardCapacity(content.cards,
      characterPool(content, [key]).filter(card => content.cards[card].rarity && content.rules.cardWeights[content.cards[card].rarity!] > 0), deck) >= 3));
  const result: string[] = [];
  while (result.length < 3 && available.length) {
    const draw = weightedIndex(available.map(key => content.rules.characterWeights[key] ?? 1), seed); seed = draw.seed;
    const key = available[draw.index]; result.push(key); available = available.filter(other => other !== key);
  }
  return result;
}

export function relicCandidate(content: ProgressionContent, owned: readonly ListenerDefinition[], rarity: Rarity, seed: number): string | null {
  const available = Object.keys(content.relics).filter(key => !content.relics[key].character && !owned.some(relic => relic.key === key));
  const preferred = available.filter(key => content.relics[key].rarity === rarity);
  if (preferred.length) return preferred[weightedIndex(preferred.map(() => 1), seed).index];
  const tiers = rarities.filter(tier => available.some(key => content.relics[key].rarity === tier) && content.rules.relicFallbackWeights[tier] > 0);
  if (!tiers.length) return null;
  const tier = weightedIndex(tiers.map(value => content.rules.relicFallbackWeights[value]), seed);
  const keys = available.filter(key => content.relics[key].rarity === tiers[tier.index]);
  return keys[weightedIndex(keys.map(() => 1), tier.seed).index];
}

export function fixedRelic(content: ProgressionContent, character: string): ListenerDefinition {
  const key = content.characters[character]?.relicKey;
  const relic = key ? content.relics[key] : undefined;
  if (!relic || relic.character !== character || relic.listener.kind !== 'relic' || relic.listener.key !== key) throw new Error('角色固定遗物配置不完整。');
  return structuredClone(relic.listener);
}

export function acquireCard(content: ProgressionContent, deck: CardInstance[], key: string, nextId: number): number {
  if (!canAcquireCard(content.cards, deck, key)) throw new Error('该卡已达到持有上限。');
  const id = Math.max(nextId, ...deck.map(card => card.id + 1));
  if (!Number.isSafeInteger(id) || id < 0 || !Number.isSafeInteger(id + 1)) throw new Error('卡牌实例ID超出范围。');
  deck.push({ id, key, upgraded: false }); return id + 1;
}

export const offerSeed = (seed: number, purpose: string) => selectionSeed(seed, purpose);
