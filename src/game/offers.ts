import type { CardDefinition, CardInstance, Rarity } from './model';
import { nextRandom } from './random';

export type RarityWeights = Record<Rarity, number>;
export const rarities: Rarity[] = ['common', 'uncommon', 'rare'];
export type CardCatalog = Readonly<Record<string, CardDefinition>>;

export function weightedIndex(weights: readonly number[], seed: number): { index: number; seed: number } {
  if (weights.some(weight => !Number.isFinite(weight) || weight < 0)) throw new Error('抽取权重必须为非负有限数。');
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!Number.isFinite(total) || total <= 0) throw new Error('可用抽取权重必须大于0。');
  const nextSeed = nextRandom(seed);
  let draw = nextSeed / 4294967296 * total;
  const index = weights.findIndex(weight => { draw -= weight; return draw < 0; });
  return { index, seed: nextSeed };
}

export function ownedCardCount(catalog: CardCatalog, deck: readonly CardInstance[], key: string): number {
  const name = catalog[key]?.name;
  return deck.filter(card => catalog[card.key]?.name === name).length;
}

export function canAcquireCard(catalog: CardCatalog, deck: readonly CardInstance[], key: string): boolean {
  const card = catalog[key];
  if (!card) return false;
  if (card.maxOwned === undefined) return true;
  if (!Number.isSafeInteger(card.maxOwned) || card.maxOwned < 1) throw new Error('卡牌持有上限必须为正整数。');
  return ownedCardCount(catalog, deck, key) < card.maxOwned;
}

export function generateCardOffer(catalog: CardCatalog, pool: readonly string[], deck: readonly CardInstance[],
  seed: number, weights: RarityWeights, rareOnly = false): string[] {
  // Source/rarity checks remain here even if a caller mistakenly includes a
  // basic, colorless or development card in a role's content list.
  for (const rarity of rarities) if (!Number.isFinite(weights[rarity]) || weights[rarity] < 0) throw new Error('卡牌稀有度权重无效。');
  let available = [...new Set(pool)].filter(key => catalog[key]?.source === 'character' && catalog[key].rarity
    && (!rareOnly || catalog[key].rarity === 'rare') && canAcquireCard(catalog, deck, key));
  const result: string[] = [];
  while (result.length < 3 && available.length) {
    const tiers = rarities.filter(rarity => available.some(key => catalog[key].rarity === rarity) && (rareOnly || weights[rarity] > 0));
    if (!tiers.length) break;
    const tier = weightedIndex(tiers.map(rarity => rareOnly ? 1 : weights[rarity]), seed); seed = tier.seed;
    const keys = available.filter(key => catalog[key].rarity === tiers[tier.index]);
    const draw = weightedIndex(keys.map(() => 1), seed); seed = draw.seed;
    const key = keys[draw.index]; result.push(key);
    available = available.filter(other => catalog[other].name !== catalog[key].name);
  }
  return result;
}

export function remainingCardCapacity(catalog: CardCatalog, pool: readonly string[], deck: readonly CardInstance[]): number {
  const names = new Set<string>();
  let total = 0;
  for (const key of pool) {
    const card = catalog[key];
    if (!card || card.source !== 'character' || names.has(card.name) || !canAcquireCard(catalog, deck, key)) continue;
    names.add(card.name);
    if (card.maxOwned === undefined) return Infinity;
    total += card.maxOwned - ownedCardCount(catalog, deck, key);
  }
  return total;
}

export function selectionSeed(seed: number, tag: string): number {
  let result = seed >>> 0;
  for (let index = 0; index < tag.length; index++) result = Math.imul(result ^ tag.charCodeAt(index), 16777619) >>> 0;
  return nextRandom(result);
}
