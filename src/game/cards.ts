import { cards } from '../content/cards';
import type { State, Card } from './state';
import { shuffle } from './random';
import { damageEnemy, damageEnemies, healPlayer, losePlayerHp } from './resolution';
import { recordEvent } from './events';
import { registerListener } from './listeners';
import { movePlayer, pushEnemy } from './movement';
export function drawCards(s: State, amount: number) {
  for (let i = 0; i < amount; i++) {
    if (s.status !== 'playing') break;
    if (!s.draw.length && s.discard.length) { const result = shuffle(s.discard, s.rng); s.rng = result.seed; s.draw = result.values; s.discard = []; s.log.push('抽牌堆为空，将弃牌堆洗入。'); }
    const card = s.draw.shift(); if (!card) { s.log.push('抽牌堆与弃牌堆均为空，停止抽牌。'); break; }
    s.hand.push(card); recordEvent(s, 'CARD_DRAWN', { target: { kind: 'card', id: card.id, key: card.key }, value: 1 }, { type: 'draw' }); s.log.push(`抽到「${cards[card.key].name}」。`);
  }
}
export function executeCard(s: State, card: Card, target?: number, direction?: number) {
  const definition = cards[card.key];
  for (const effect of definition.effects) {
    if (s.status !== 'playing') break;
    switch (effect.type) {
      case 'damage': for (let i = 0; i < (effect.hits ?? 1); i++) {
        if (s.status !== 'playing' || !s.enemies.some(e => e.id === target)) break;
        damageEnemy(s, target!, effect.amount, { kind: 'card', flat: effect.flat, multipliers: effect.multipliers });
      } break;
      case 'damageAll': for (let i = 0; i < (effect.hits ?? 1); i++) {
        if (s.status !== 'playing' || !s.enemies.length) break;
        damageEnemies(s, s.enemies.map(enemy => enemy.id), effect.amount, { kind: 'card', flat: effect.flat, multipliers: effect.multipliers });
      } break;
      case 'draw': drawCards(s, effect.amount); break;
      case 'move': movePlayer(s, direction!, effect.amount); break;
      case 'push': pushEnemy(s, target!, effect.amount); break;
      case 'heal': healPlayer(s, effect.amount); break;
      case 'loseHp': losePlayerHp(s, effect.amount); break;
      case 'listen': registerListener(s, effect.listener); break;
    }
  }
}
