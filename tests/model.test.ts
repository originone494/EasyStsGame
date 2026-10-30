import { afterEach, describe, expect, it } from 'vitest';
import { cards, getStartingDeck } from '../src/content/cards';
import { enemies } from '../src/content/enemies';
import { encounters, prototype } from '../src/content/encounters';
import { characters } from '../src/content/characters';
import { createBattleCards, createDeck } from '../src/game/deck';
import { createBattle } from '../src/game/state';
import { createScenario, scenarios } from '../src/game/scenarios';
import { act } from '../src/game/actions';
import { battlefield } from '../src/ui/battlefield';

const originalConfig = { ...prototype };
afterEach(() => Object.assign(prototype, originalConfig));

describe('步骤1：永久实例与战斗状态边界', () => {
  it('同名卡有独立ID与升级标记，重建战斗保留标记且不修改配置和输入', () => {
    const deck = createDeck(['strike', 'strike'], 40);
    deck[0].upgraded = true;
    const definition = structuredClone(cards.strike);
    const s = createBattle(0, 0, deck);
    expect(s.deck).toEqual([{ id: 40, key: 'strike', upgraded: true }, { id: 41, key: 'strike', upgraded: false }]);
    expect(s.deck[0]).not.toBe(deck[0]);
    s.deck[1].upgraded = true;
    expect(deck[1].upgraded).toBe(false);
    expect(cards.strike).toEqual(definition);
  });

  it('出牌、洗牌和消耗只改变战斗牌区，下一场恢复已消耗卡并清理临时状态', () => {
    const s = createBattle(0, 157, createDeck(['prepare'], 10));
    s.hand[0].temporary = { testMarker: 2 };
    const n = act(s, { type: 'play', cardId: 10 });
    expect(n.exhaust.map(card => card.id)).toEqual([10]);
    expect(n.deck).toEqual(s.deck);
    const next = createBattle(1, 157, n.deck);
    expect(next.hand).toEqual([{ id: 10, key: 'prepare' }]);
    expect(next.exhaust).toEqual([]);
    expect(next.deck).toEqual(n.deck);
  });

  it('永久牌组移除某个实例后，下一场不会恢复该同名复制品', () => {
    const deck = createDeck(['strike', 'strike', 'step'], 20).filter(card => card.id !== 20);
    const s = createBattle(0, 157, deck);
    expect([...s.hand, ...s.draw].map(card => card.id).sort()).toEqual([21, 22]);
    expect(s.deck).toEqual(deck);
  });

  it('拒绝重复、非法实例ID和不存在的卡牌定义', () => {
    expect(() => createBattleCards([{ id: 0, key: 'strike', upgraded: false }, { id: 0, key: 'step', upgraded: false }])).toThrow('重复');
    expect(() => createDeck(['unknown'])).toThrow('未知卡牌');
    expect(() => createDeck(['strike'], -1)).toThrow('ID');
    expect(() => createBattleCards([{ id: NaN, key: 'strike', upgraded: false }])).toThrow('ID');
    expect(() => createBattleCards([{ id: 1, key: 'unknown', upgraded: false }])).toThrow('未知卡牌');
  });

  it('战场、生命、补牌、种子从配置读取，回合开始及无障碍标签同步变化', () => {
    Object.assign(prototype, { size: 15, maxHp: 31, handSize: 4, seed: 0 });
    const s = createBattle();
    expect(s.size).toBe(15);
    expect(s.player.hp).toBe(31);
    expect(s.player.maxHp).toBe(31);
    expect(s.seed).toBe(0);
    expect(s.hand).toHaveLength(4);
    expect(battlefield(s)).toContain('aria-label="15格战场"');
    const n = act(s, { type: 'endTurn' });
    expect(n.hand).toHaveLength(4);
    expect(n.log.some(line => line.includes('回合 2 开始，补牌至 4 张'))).toBe(true);
  });

  it('角色配置组成5张通用牌加2张角色牌，角色没有独立血条或坐标', () => {
    const s = createBattle();
    expect(getStartingDeck(prototype.character)).toEqual(['strike', 'strike', 'step', 'step', 'push', ...characters.wanderer.startingCards]);
    expect(s.party).toEqual([{ id: 0, key: 'wanderer' }]);
    expect(s.deck).toHaveLength(7);
    expect(new Set(s.deck.map(card => card.id)).size).toBe(7);
  });

  it('全部开发局面中的牌区与永久实例登记一致', () => {
    for (const scenario of scenarios) {
      const s = createScenario(scenario.id);
      const zones = [...s.hand, ...s.draw, ...s.discard, ...s.exhaust, ...s.executing];
      expect(zones.map(card => card.id).sort()).toEqual(s.deck.map(card => card.id).sort());
      expect(new Set(zones.map(card => card.id)).size).toBe(zones.length);
    }
  });

  it('三个布局仍从配置生成且敌人状态不与静态配置共享对象', () => {
    for (let index = 0; index < encounters.length; index++) {
      const s = createBattle(index);
      expect(s.player.position).toBe(encounters[index].player);
      for (const [i, enemy] of s.enemies.entries()) {
        const unit = encounters[index].units[i];
        expect(enemy).toMatchObject({ id: i + 1, kind: unit.kind, position: unit.position, hp: enemies[unit.kind].hp, maxHp: enemies[unit.kind].hp });
        const original = enemies[unit.kind].hp;
        enemy.hp = 0;
        expect(enemies[unit.kind].hp).toBe(original);
      }
    }
  });
});
