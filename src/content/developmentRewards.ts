// Isolated integration fixtures. Installed only by the rewardRecruitment URL
// or explicit tests; these definitions never enter the normal game's pools.
import { cards } from './cards';
import { characters } from './characters';
import { approvedProgressionTestRules } from './progression';
import type { CardDefinition, CharacterDefinition, RelicDefinition, Rarity } from '../game/model';
import type { ProgressionContent } from '../game/selection';

const fixtureCards: Record<string, CardDefinition> = {};
const fixtureCharacters: Record<string, CharacterDefinition> = {};
const fixtureRelics: Record<string, RelicDefinition> = {};
for (let role = 0; role < 4; role++) {
  const key = `selectionFixture${role}`, name = `验收角色${['甲', '乙', '丙', '丁'][role]}`;
  const pool = Array.from({ length: 36 }, (_, index) => {
    const cardKey = `${key}Card${index}`, rarity: Rarity = index < 22 ? 'common' : index < 33 ? 'uncommon' : 'rare';
    const type = index % 6;
    const options: Pick<CardDefinition, 'target' | 'effects' | 'description' | 'art' | 'exhaust'>[] = [
      { target: 'enemy', effects: [{ type: 'damage', amount: 4 }], description: '造成4点基础伤害。', art: 'strike' },
      { target: 'none', effects: [{ type: 'damageAll', amount: 2 }], description: '对所有敌人造成2点基础伤害。', art: 'combo' },
      { target: 'enemy', effects: [{ type: 'push', amount: 2 }], description: '将目标击退2格。', art: 'push' },
      { target: 'none', effects: [{ type: 'draw', amount: 1 }], description: '抽1张牌。', art: 'prepare', exhaust: true },
      { target: 'enemy', effects: [{ type: 'damage', amount: 2, hits: 2 }], description: '造成2次2点基础伤害。', art: 'combo' },
      { target: 'none', effects: [{ type: 'heal', amount: 1 }], description: '恢复1点生命。', art: 'debugHeal', exhaust: true },
    ];
    fixtureCards[cardKey] = { name: `${name}·${String(index + 1).padStart(2, '0')}`, kind: `${name} · ${type < 2 || type === 4 ? '攻击' : '技能'}`,
      ...options[type], source: 'character', character: key, rarity, ...(index % 7 === 0 ? { maxOwned: 1 } : {}) };
    return cardKey;
  });
  const relicKey = `${key}Relic`;
  fixtureCharacters[key] = { name, description: '用于验证招募与卡池解锁的隔离角色。', startingCards: pool.slice(0, 2), cardPool: pool, relicKey, recruitable: true };
  fixtureRelics[relicKey] = { rarity: 'common', character: key, description: '每场战斗第一次击杀敌人后，恢复1点生命。',
    listener: { key: relicKey, name: `${name}信物`, kind: 'relic', listensTo: ['ENEMY_DIED'], effects: [{ type: 'heal', amount: 1 }],
      limit: { scope: 'battle', count: 1 }, allowChain: false } };
}
for (const [rarity, count] of [['common', 2], ['uncommon', 2], ['rare', 1]] as const) for (let index = 0; index < count; index++) {
  const key = `selectionFixtureRelic${rarity}${index}`;
  fixtureRelics[key] = { rarity, description: '每场战斗第一次击杀敌人后，恢复1点生命。', listener: {
    key, name: `验收遗物·${{common:'普通',uncommon:'罕见',rare:'稀有'}[rarity]}${index + 1}`, kind: 'relic', listensTo: ['ENEMY_DIED'], effects: [{ type: 'heal', amount: 1 }],
    limit: { scope: 'battle', count: 1 }, allowChain: false,
  } };
}

export const developmentProgression: ProgressionContent = {
  id: 'selection-fixture-v1', initialCharacter: 'selectionFixture0', cards: fixtureCards, characters: fixtureCharacters, relics: fixtureRelics,
  // Weights are approved test values. Shortage handling remains fixture-only.
  rules: { ...structuredClone(approvedProgressionTestRules), recruitmentShortage: 'exclude' },
};

export function installDevelopmentRewards() {
  for (const [key, definition] of Object.entries(fixtureCards)) cards[key] = { ...structuredClone(definition), source: 'development' };
  for (const [key, definition] of Object.entries(fixtureCharacters)) characters[key] = { ...structuredClone(definition), recruitable: false };
  return developmentProgression;
}

export function removeDevelopmentRewards() {
  for (const key of Object.keys(fixtureCards)) delete cards[key];
  for (const key of Object.keys(fixtureCharacters)) delete characters[key];
}
