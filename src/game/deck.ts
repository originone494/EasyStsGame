import { cards } from '../content/cards';
import type { BattleCardState, CardInstance } from './model';

export function createDeck(keys: readonly string[], firstId = 0): CardInstance[] {
  if (!Number.isSafeInteger(firstId) || firstId < 0) throw new Error('卡牌实例起始 ID 必须为非负安全整数。');
  return keys.map((key, index) => {
    if (!Object.hasOwn(cards, key)) throw new Error(`未知卡牌：${key}`);
    const id = firstId + index;
    if (!Number.isSafeInteger(id)) throw new Error('卡牌实例 ID 超出安全整数范围。');
    return { id, key, upgraded: false };
  });
}

// Every battle gets fresh temporary objects while permanent IDs remain stable.
export function createBattleCards(deck: readonly CardInstance[]): BattleCardState[] {
  const ids = new Set<number>();
  return deck.map(card => {
    if (!Number.isSafeInteger(card.id) || card.id < 0 || ids.has(card.id)) throw new Error('卡牌实例 ID 无效或重复。');
    if (!Object.hasOwn(cards, card.key)) throw new Error(`未知卡牌：${card.key}`);
    ids.add(card.id);
    return { id: card.id, key: card.key };
  });
}
