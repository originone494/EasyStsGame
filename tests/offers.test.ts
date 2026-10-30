import { describe, expect, it } from 'vitest';
import type { CardDefinition, CardInstance } from '../src/game/model';
import { canAcquireCard, generateCardOffer, remainingCardCapacity, selectionSeed, weightedIndex } from '../src/game/offers';

const definition = (name: string, options: Partial<CardDefinition> = {}): CardDefinition => ({
  name, kind: '角色 · 攻击', description: '', target: 'enemy', effects: [], source: 'character', rarity: 'common', ...options,
});
const catalog = {
  a: definition('甲', { maxOwned: 1 }), b: definition('乙'), c: definition('丙', { rarity: 'uncommon' }),
  d: definition('丁', { rarity: 'rare' }), e: definition('戊', { rarity: 'rare' }), f: definition('己', { rarity: 'rare' }),
  alias: definition('甲', { maxOwned: 1 }), basic: definition('基础', { source: 'basic' }),
  colorless: definition('无色', { source: 'colorless' }), debug: definition('调试', { source: 'development' }),
};
const pool = Object.keys(catalog), equal = { common: 1, uncommon: 1, rare: 1 };

describe('统一奖励候选生成器', () => {
  it('1000个种子的候选同轮不同名，不混入通用、无色或调试卡，原数据不变', () => {
    const before = structuredClone(catalog);
    for (let seed = 0; seed < 1000; seed++) {
      const offer = generateCardOffer(catalog, pool, [], seed, equal);
      expect(offer).toHaveLength(3); expect(new Set(offer.map(key => catalog[key as keyof typeof catalog].name)).size).toBe(3);
      expect(offer.every(key => !['basic', 'colorless', 'debug'].includes(key))).toBe(true);
    }
    expect(catalog).toEqual(before);
  });
  it('不同复制品和升级版按同名累计上限，候选每轮按当前牌组过滤', () => {
    const deck: CardInstance[] = [{ id: 42, key: 'a', upgraded: true }];
    expect(canAcquireCard(catalog, deck, 'a')).toBe(false); expect(canAcquireCard(catalog, deck, 'alias')).toBe(false);
    expect(generateCardOffer(catalog, ['a', 'alias', 'b'], deck, 0, equal)).toEqual(['b']);
    expect(canAcquireCard(catalog, [], 'a')).toBe(true);
  });
  it('合法池不足3张不重复凑数；全空返回空数组', () => {
    expect(generateCardOffer(catalog, ['a', 'alias'], [], 7, equal)).toHaveLength(1);
    expect(generateCardOffer(catalog, ['basic', 'missing'], [], 7, equal)).toEqual([]);
  });
  it('Boss仅抽稀有卡；指定稀有度权重时不混入其他档，耗尽档自动排除', () => {
    expect(generateCardOffer(catalog, pool, [], 7, equal, true).sort()).toEqual(['d', 'e', 'f']);
    expect(generateCardOffer(catalog, ['b', 'c', 'd'], [], 7, { common: 0, uncommon: 1, rare: 0 })).toEqual(['c']);
    expect(generateCardOffer(catalog, ['b'], [], 7, equal)).toEqual(['b']);
  });
  it('同种子重复查看完全复现，跨轮可重复，同名总获取容量按持有数计算', () => {
    expect(generateCardOffer(catalog, pool, [], 157, equal)).toEqual(generateCardOffer(catalog, pool, [], 157, equal));
    expect(generateCardOffer(catalog, ['a'], [], 10, equal)).toEqual(['a']);
    expect(generateCardOffer(catalog, ['a'], [], 11, equal)).toEqual(['a']);
    expect(remainingCardCapacity(catalog, ['a', 'alias'], [])).toBe(1);
    expect(remainingCardCapacity(catalog, ['b'], [])).toBe(Infinity);
    expect(selectionSeed(157, 'cards')).not.toBe(selectionSeed(157, 'relics'));
  });
  it('非法上限和权重立即拒绝，不悄悄使用默认数值', () => {
    expect(() => weightedIndex([0, 0], 1)).toThrow('权重');
    expect(() => weightedIndex([-1, 1], 1)).toThrow('权重');
    expect(() => generateCardOffer(catalog, pool, [], 1, { ...equal, rare: NaN })).toThrow('权重');
    expect(() => canAcquireCard({ bad: definition('坏', { maxOwned: 0 }) }, [], 'bad')).toThrow('上限');
  });
});
