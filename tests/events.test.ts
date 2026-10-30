import { describe, expect, it } from 'vitest';
import { createBattle } from '../src/game/state';
import { createScenario } from '../src/game/scenarios';
import { createDeck } from '../src/game/deck';
import { act, type Action } from '../src/game/actions';
import { finishBattle, playerRef, recordEvent, withEventContext } from '../src/game/events';
import { processEvents } from '../src/game/eventQueue';
import { registerListener, setListenerActive } from '../src/game/listeners';
import { damageEnemy, damagePlayer, losePlayerHp } from '../src/game/resolution';
import { cards } from '../src/content/cards';
import type { BattleState, EventType, ListenerDefinition, TriggerEffect } from '../src/game/model';

function relic(key: string, listensTo: EventType[], effects: TriggerEffect[], extra: Partial<ListenerDefinition> = {}): ListenerDefinition {
  return { key, name: key, kind: 'relic', listensTo, effects, limit: { scope: 'unlimited' }, allowChain: false, ...extra } as ListenerDefinition;
}
function fixture() {
  const s = createBattle();
  s.player.hp = 5;
  s.eventHistory = []; s.eventTrace = []; s.events = []; s.nextEventId = 1;
  return s;
}
const triggers = (s: BattleState) => s.eventTrace.filter(row => row.kind === 'trigger').map(row => row.message);

describe('步骤2：事件FIFO与触发系统', () => {
  it('直接动作只入队，出队前不触发；记录来源、目标、顺序、父事件及实际生命损失', () => {
    const s = fixture();
    registerListener(s, relic('healer', ['DAMAGE_RESOLVED'], [{ type: 'heal', amount: 2 }]));
    withEventContext(s, { source: { kind: 'card', id: 99, key: 'strike' }, parentId: null, allowChain: true }, () => damageEnemy(s, 1, 2));
    expect(s.player.hp).toBe(5);
    expect(s.eventQueue.map(event => event.type)).toEqual(['DAMAGE_RESOLVED', 'HP_LOST']);
    expect(s.eventHistory[0]).toMatchObject({ id: 1, sequence: 1, source: { kind: 'card', id: 99 }, target: { kind: 'enemy', id: 1 }, value: 2, parentId: null });
    expect(s.eventHistory[1]).toMatchObject({ value: 2, parentId: 1 });
    processEvents(s);
    expect(s.player.hp).toBe(7);
    expect(s.eventQueue).toEqual([]);
  });

  it('0伤害仍生成伤害事件，直接生命损失只生成HP_LOST，过量伤害不放大实际损失', () => {
    const s = fixture();
    damageEnemy(s, 1, 0);
    expect(s.eventHistory.map(event => event.type)).toEqual(['DAMAGE_RESOLVED']);
    losePlayerHp(s, 1);
    expect(s.eventHistory.at(-1)).toMatchObject({ type: 'HP_LOST', target: playerRef, value: 1 });
    damageEnemy(s, 1, 90);
    expect(s.eventHistory.slice(-3).map(event => [event.type, event.value])).toEqual([['DAMAGE_RESOLVED', 90], ['HP_LOST', 6], ['ENEMY_DIED', 0]]);
  });

  it('最后击杀先完成直接治疗，再响应死亡遗物和后续触发链，最后判胜', () => {
    const s = createScenario('events');
    const n = act(s, { type: 'play', cardId: 0, target: 1 });
    expect(n.player.hp).toBe(16);
    expect(n.status).toBe('won'); expect(n.phase).toBe('finished');
    expect(n.finishReason).toBe('last-kill'); expect(n.eventQueue).toEqual([]);
    expect(n.eventHistory.filter(event => event.type === 'HEALED').map(event => event.value)).toEqual([5, 3, 1]);
    expect(triggers(n)).toEqual(['余烬（测试）', '回响（测试）']);
    expect(n.eventTrace.at(-1)?.kind).toBe('finish');
    expect(s.player.hp).toBe(7); expect(s.listeners.every(item => item.totalTriggers === 0)).toBe(true);
  });

  it('同事件按登记顺序执行，响应产生的事件进入已有事件之后并保持父子关系', () => {
    const s = fixture();
    const a = registerListener(s, relic('first', ['CARD_PLAYED'], [{ type: 'heal', amount: 1 }], { allowChain: true }));
    registerListener(s, relic('second', ['CARD_PLAYED'], [{ type: 'heal', amount: 2 }], { allowChain: true }));
    registerListener(s, relic('child', ['HEALED'], [{ type: 'heal', amount: 1 }]));
    recordEvent(s, 'CARD_PLAYED'); recordEvent(s, 'CARD_EXHAUSTED');
    processEvents(s);
    expect(triggers(s)).toEqual(['first', 'second', 'child', 'child']);
    expect(s.eventTrace.filter(row => row.kind === 'dequeue').map(row => row.eventId)).toEqual(s.eventHistory.map(event => event.id));
    expect(s.eventHistory[2]).toMatchObject({ type: 'HEALED', parentId: 1, source: { kind: 'relic', id: a } });
    const secondTriggerIndex = s.eventTrace.findIndex(row => row.kind === 'trigger' && row.message === 'second');
    const childDequeueIndex = s.eventTrace.findIndex(row => row.kind === 'dequeue' && row.eventId === 3);
    expect(childDequeueIndex).toBeGreaterThan(secondTriggerIndex);
  });

  it('快照在出队时读取全部直接效果后的状态；不使用入队时旧状态', () => {
    const s = createScenario('heal');
    registerListener(s, relic('snapshot', ['DAMAGE_RESOLVED'], [{ type: 'heal', amount: { missingHp: 1 } }]));
    const n = act(s, { type: 'play', cardId: 0, target: 1 });
    expect(n.eventTrace.find(row => row.kind === 'snapshot')?.values).toEqual([8]);
    expect(n.player.hp).toBe(20);
  });

  it('前序遗物治疗不改变后序已锁定的资格和已损生命数值', () => {
    const s = fixture();
    registerListener(s, relic('heal', ['CARD_PLAYED'], [{ type: 'heal', amount: 5 }]));
    registerListener(s, relic('locked', ['CARD_PLAYED'], [{ type: 'damage', target: 'eventTarget', amount: { missingHp: 1 } }], { condition: { type: 'missingHpAtLeast', value: 15 } }));
    s.enemies[0].hp = 30; s.enemies[0].maxHp = 30;
    recordEvent(s, 'CARD_PLAYED', { target: { kind: 'enemy', id: 1 } }); processEvents(s);
    expect(s.player.hp).toBe(10); expect(s.enemies[0].hp).toBe(15);
    expect(triggers(s)).toEqual(['heal', 'locked']);
  });

  it('前序治疗不能使出队时不合格的后序遗物临时获得资格', () => {
    const s = fixture();
    registerListener(s, relic('damage', ['CARD_PLAYED'], [{ type: 'loseHp', amount: 2 }]));
    registerListener(s, relic('ineligible', ['CARD_PLAYED'], [{ type: 'heal', amount: 10 }], { condition: { type: 'missingHpAtLeast', value: 17 } }));
    recordEvent(s, 'CARD_PLAYED'); processEvents(s);
    expect(s.player.hp).toBe(3); expect(triggers(s)).toEqual(['damage']);
  });

  it('自动目标延迟选择，目标相关数值读执行时生命并在最终结果向上取整', () => {
    const s = fixture();
    s.enemies[0].hp = 3;
    registerListener(s, relic('kill-nearest', ['CARD_PLAYED'], [{ type: 'damage', target: 'nearest', amount: 4 }]));
    registerListener(s, relic('half-new-target', ['CARD_PLAYED'], [{ type: 'damage', target: 'nearest', amount: { targetHp: 0.5 } }]));
    recordEvent(s, 'CARD_PLAYED'); processEvents(s);
    expect(s.enemies.map(enemy => [enemy.id, enemy.hp])).toEqual([[2, 5]]);
  });

  it('混合公式冻结非目标部分、执行时读取目标生命，只在最终结果取整', () => {
    const s = fixture();
    s.enemies[1].hp = 31; s.enemies[1].maxHp = 31;
    registerListener(s, relic('first', ['CARD_PLAYED'], [{ type: 'heal', amount: 5 }, { type: 'damage', target: 'eventTarget', amount: 10 }]));
    registerListener(s, relic('mixed', ['CARD_PLAYED'], [{ type: 'damage', target: 'eventTarget', amount: { missingHp: 0.1, targetHp: 0.5 } }]));
    recordEvent(s, 'CARD_PLAYED', { target: { kind: 'enemy', id: 2 } }); processEvents(s);
    expect(s.enemies.find(enemy => enemy.id === 2)?.hp).toBe(9); // 31-10-ceil(15*.1+21*.5)
  });

  it('目标已死跳过依赖目标的动作，保留独立治疗且继续死亡收尾', () => {
    const n = act(createScenario('eventTarget'), { type: 'play', cardId: 0, target: 1 });
    expect(n.status).toBe('won'); expect(n.player.hp).toBe(9);
    expect(n.eventTrace.some(row => row.kind === 'skip')).toBe(true);
    expect(n.eventHistory.filter(event => event.type === 'DAMAGE_RESOLVED')).toHaveLength(2); // zero + first relic
  });

  it('卡牌生命代价致死取消后续治疗、所有已排队触发和后续操作', () => {
    const n = act(createScenario('eventLethal'), { type: 'play', cardId: 0 });
    expect(n.status).toBe('lost'); expect(n.player.hp).toBe(0);
    expect(n.eventHistory.map(event => event.type)).toEqual(['CARD_PLAYED', 'HP_LOST']);
    expect(triggers(n)).toEqual([]); expect(n.eventQueue).toEqual([]);
    expect(n.eventTrace.filter(row => row.kind === 'cancel')).toHaveLength(2);
    expect(act(n, { type: 'endTurn' }).turn).toBe(1);
  });

  it('最后击杀收尾内触发致死也立即失败，后序遗物和独立治疗不执行', () => {
    const s = createScenario('heal');
    registerListener(s, relic('fatal', ['ENEMY_DIED'], [{ type: 'loseHp', amount: 20 }, { type: 'heal', amount: 20 }]));
    registerListener(s, relic('too-late', ['ENEMY_DIED'], [{ type: 'heal', amount: 20 }]));
    const n = act(s, { type: 'play', cardId: 0, target: 1 });
    expect(n.status).toBe('lost'); expect(n.finishReason).toBe('player-death');
    expect(triggers(n)).toEqual(['fatal']); expect(n.player.hp).toBe(0);
    expect(n.eventQueue).toEqual([]);
  });

  it('最后怪物接触消失立即终止，不触发接触治疗或死亡遗物', () => {
    const s = fixture(); s.player.hp = 10; s.enemies = [{ ...s.enemies[0], position: 7 }];
    registerListener(s, relic('late-contact', ['ENEMY_CONTACT', 'HP_LOST', 'ENEMY_DIED'], [{ type: 'heal', amount: 10 }]));
    const n = act(s, { type: 'endTurn' });
    expect(n.status).toBe('won'); expect(n.finishReason).toBe('last-contact'); expect(n.player.hp).toBe(7);
    expect(triggers(n)).toEqual([]); expect(n.eventHistory.some(event => event.type === 'ENEMY_DIED')).toBe(false);
    expect(n.eventQueue).toEqual([]);
  });

  it('接触致死优先于最后怪物消失胜利；后续怪物不行动', () => {
    const s = createScenario('lethal');
    registerListener(s, relic('rescue', ['ENEMY_CONTACT'], [{ type: 'heal', amount: 10 }]));
    const n = act(s, { type: 'endTurn' });
    expect(n.status).toBe('lost'); expect(n.finishReason).toBe('player-death'); expect(triggers(n)).toEqual([]);
  });

  it('每只怪物的事件队列在下一只行动前处理，后续怪物读取被触发改变的状态', () => {
    const s = fixture(); s.player.hp = 10;
    s.enemies = [{ ...s.enemies[0], position: 7 }, { ...s.enemies[1], position: 8 }];
    registerListener(s, relic('contact-kill-next', ['ENEMY_CONTACT'], [{ type: 'damage', target: 'nearest', amount: 20 }]));
    const n = act(s, { type: 'endTurn' });
    expect(n.status).toBe('won'); expect(n.finishReason).toBe('last-kill'); expect(n.player.hp).toBe(7);
    expect(n.eventHistory.filter(event => event.type === 'ENEMY_CONTACT')).toHaveLength(1);
  });

  it('回合开始触发在补牌之前，可提前抽牌且不弃置超过目标数的手牌', () => {
    const definition = relic('turn-draw', ['TURN_STARTED'], [{ type: 'draw', amount: 4 }]);
    const s = createBattle(0, 157, createDeck(['strike', 'strike', 'step', 'step', 'push', 'combo', 'prepare']), [definition]);
    expect(s.hand).toHaveLength(4);
    expect(s.eventHistory[0].type).toBe('TURN_STARTED');
    expect(s.eventHistory.filter(event => event.type === 'CARD_DRAWN')).toHaveLength(4);
    expect(s.eventHistory.filter(event => event.type === 'CARD_DRAWN').every(event => event.source.kind === 'relic')).toBe(true);
  });

  it('每回合和每战次数独立，跨回合只恢复回合次数', () => {
    let s = fixture();
    registerListener(s, relic('per-turn', ['DAMAGE_RESOLVED'], [{ type: 'heal', amount: 1 }], { limit: { scope: 'turn', count: 1 } }));
    registerListener(s, relic('per-battle', ['DAMAGE_RESOLVED'], [{ type: 'heal', amount: 1 }], { limit: { scope: 'battle', count: 1 } }));
    recordEvent(s, 'DAMAGE_RESOLVED'); recordEvent(s, 'DAMAGE_RESOLVED'); processEvents(s);
    expect(s.listeners.map(listener => listener.totalTriggers)).toEqual([1, 1]);
    s = act(s, { type: 'endTurn' });
    recordEvent(s, 'DAMAGE_RESOLVED'); processEvents(s);
    expect(s.listeners.map(listener => listener.totalTriggers)).toEqual([2, 1]);
  });

  it('allowChain=false仍记录事件但不触发监听，true允许有终点的连锁', () => {
    for (const allowChain of [false, true]) {
      const s = fixture();
      registerListener(s, relic('parent', ['CARD_PLAYED'], [{ type: 'heal', amount: 1 }], { allowChain }));
      registerListener(s, relic('child', ['HEALED'], [{ type: 'heal', amount: 1 }]));
      recordEvent(s, 'CARD_PLAYED'); processEvents(s);
      expect(triggers(s)).toEqual(allowChain ? ['parent', 'child'] : ['parent']);
      expect(s.eventHistory.some(event => event.type === 'HEALED')).toBe(true);
    }
  });

  it('没有隐藏全局连锁截断：配置允许的160次自动触发全部完成', () => {
    const s = fixture();
    registerListener(s, relic('bounded-loop', ['HEALED'], [{ type: 'heal', amount: 0 }], { allowChain: true, limit: { scope: 'battle', count: 160 } }));
    recordEvent(s, 'HEALED'); processEvents(s);
    expect(s.listeners[0].totalTriggers).toBe(160);
    expect(s.eventQueue).toEqual([]); expect(s.status).toBe('playing');
  });

  it('遗物与临时监听按生效登记顺序混排，停用和回合到期生效', () => {
    let s = fixture();
    const a = registerListener(s, relic('first-relic', ['CARD_PLAYED'], []));
    const temporary: ListenerDefinition = { key: 'temporary', name: 'temporary', kind: 'temporary', snapshot: 'eventStart', listensTo: ['CARD_PLAYED'], effects: [], limit: { scope: 'unlimited' }, allowChain: false, duration: 'turn' };
    registerListener(s, temporary);
    registerListener(s, relic('last-relic', ['CARD_PLAYED'], []));
    recordEvent(s, 'CARD_PLAYED'); processEvents(s);
    expect(triggers(s)).toEqual(['first-relic', 'temporary', 'last-relic']);
    setListenerActive(s, a, false);
    s = act(s, { type: 'endTurn' }); s.eventTrace = [];
    recordEvent(s, 'CARD_PLAYED'); processEvents(s);
    expect(triggers(s)).toEqual(['last-relic']);
  });

  it('响应中新增监听不插入当前事件快照，从后续出队事件起生效', () => {
    const s = fixture();
    const temporary: ListenerDefinition = { key: 'new', name: 'new', kind: 'temporary', snapshot: 'eventStart',
      listensTo: ['CARD_PLAYED', 'HEALED'], effects: [{ type: 'heal', amount: 2 }], limit: { scope: 'unlimited' }, allowChain: false };
    registerListener(s, relic('parent', ['CARD_PLAYED'], [{ type: 'listen', listener: temporary }, { type: 'heal', amount: 1 }], { allowChain: true }));
    recordEvent(s, 'CARD_PLAYED'); processEvents(s);
    expect(triggers(s)).toEqual(['parent', 'new']);
    expect(s.player.hp).toBe(8);
  });

  it('卡牌可在直接效果中登记临时监听，随后按统一队列处理并保持可克隆', () => {
    cards.testListeningCard = { name: '临时监听测试', kind: '测试', description: '测试', target: 'none', effects: [
      { type: 'listen', listener: { key: 'card-temp', name: 'card-temp', kind: 'temporary', snapshot: 'eventStart', duration: 'turn',
        listensTo: ['HP_LOST'], effects: [{ type: 'heal', amount: 1 }], limit: { scope: 'turn', count: 1 }, allowChain: false } },
      { type: 'loseHp', amount: 2 },
    ] };
    try {
      const s = createBattle(0, 157, createDeck(['testListeningCard']));
      const n = act(s, { type: 'play', cardId: 0 });
      expect(n.player.hp).toBe(19); expect(triggers(n)).toEqual(['card-temp']);
      expect(structuredClone(n)).toEqual(n);
    } finally { delete cards.testListeningCard; }
  });

  it('临时监听必须显式指定快照策略，execution策略可在自身执行时重判', () => {
    for (const snapshot of ['eventStart', 'execution'] as const) {
      const s = fixture();
      registerListener(s, relic('heal', ['CARD_PLAYED'], [{ type: 'heal', amount: 5 }]));
      registerListener(s, { key: 'temp', name: 'temp', kind: 'temporary', snapshot, listensTo: ['CARD_PLAYED'],
        condition: { type: 'missingHpAtLeast', value: 15 }, effects: [{ type: 'heal', amount: 1 }], limit: { scope: 'unlimited' }, allowChain: false });
      recordEvent(s, 'CARD_PLAYED'); processEvents(s);
      expect(triggers(s)).toEqual(snapshot === 'eventStart' ? ['heal', 'temp'] : ['heal']);
    }
  });

  it('拒绝未指定快照策略的临时监听及无效次数配置', () => {
    const s = fixture();
    const missingPolicy = { key: 'bad', name: 'bad', kind: 'temporary', listensTo: [], effects: [], limit: { scope: 'unlimited' }, allowChain: false };
    expect(() => registerListener(s, missingPolicy as ListenerDefinition)).toThrow('快照策略');
    expect(() => registerListener(s, relic('bad-limit', [], [], { limit: { scope: 'turn', count: 0 } }))).toThrow('正整数');
    expect(s.listeners).toEqual([]);
  });

  it('临时监听重新生效时重排登记时间，遗物重新生效保持获得顺序', () => {
    const s = fixture();
    const first = registerListener(s, relic('first', ['CARD_PLAYED'], []));
    const temporary = registerListener(s, { key: 'temp', name: 'temp', kind: 'temporary', snapshot: 'eventStart',
      listensTo: ['CARD_PLAYED'], effects: [], limit: { scope: 'unlimited' }, allowChain: false });
    registerListener(s, relic('last', ['CARD_PLAYED'], []));
    setListenerActive(s, first, false); setListenerActive(s, first, true);
    setListenerActive(s, temporary, false); setListenerActive(s, temporary, true);
    recordEvent(s, 'CARD_PLAYED'); processEvents(s);
    expect(triggers(s)).toEqual(['first', 'last', 'temp']);
  });

  it('出牌、碰撞、移动、抽牌和消耗均接入统一队列并保留实际参与者', () => {
    const chain = createScenario('chain');
    const pushed = act(chain, { type: 'play', cardId: chain.hand[0].id, target: 1 });
    expect(pushed.eventHistory.find(event => event.type === 'COLLISION')).toMatchObject({ source: { kind: 'card', key: 'push' }, actor: { kind: 'enemy', id: 1 }, target: { kind: 'enemy', id: 2 }, value: 2 });
    expect(pushed.eventHistory.filter(event => event.type === 'UNIT_MOVED').map(event => event.value)).toEqual([1, 1]);
    const empty = createScenario('empty');
    const drawn = act(empty, { type: 'play', cardId: empty.hand[0].id });
    expect(drawn.eventHistory.map(event => event.type)).toEqual(['CARD_PLAYED', 'CARD_DRAWN', 'CARD_DRAWN', 'CARD_EXHAUSTED']);
    expect(drawn.eventQueue).toEqual([]);
  });

  it('同事件锁定后不因前序停用遗物重判资格，下一事件开始失效', () => {
    const s = fixture();
    registerListener(s, relic('disable', ['CARD_PLAYED'], [{ type: 'setListenerActive', listenerId: 2, active: false }]));
    registerListener(s, relic('locked-active', ['CARD_PLAYED'], [{ type: 'heal', amount: 1 }]));
    recordEvent(s, 'CARD_PLAYED'); recordEvent(s, 'CARD_PLAYED'); processEvents(s);
    expect(triggers(s)).toEqual(['disable', 'locked-active', 'disable']);
  });

  it('随机自动目标使用战斗随机状态，同种子动作回放和JSON恢复得到相同事件与结果', () => {
    function initial() {
      const s = createBattle(1, 123);
      registerListener(s, relic('random', ['CARD_PLAYED'], [{ type: 'damage', target: 'random', amount: 1 }]));
      return s;
    }
    const actions: Action[] = [{ type: 'play', cardId: initial().hand[0].id, target: 1, direction: -1 }, { type: 'endTurn' }];
    const replay = (s: BattleState) => actions.reduce((state, action) => act(state, action), s);
    expect(replay(initial())).toEqual(replay(initial()));
    const saved = initial();
    recordEvent(saved, 'CARD_PLAYED');
    const restored: BattleState = JSON.parse(JSON.stringify(saved));
    processEvents(saved); processEvents(restored);
    expect(saved).toEqual(restored);
  });

  it('统一终止入口保留已发生事实、取消队列，Boss接触终止不需要扣队伍生命', () => {
    const s = fixture();
    registerListener(s, relic('late', ['CARD_PLAYED'], [{ type: 'heal', amount: 10 }]));
    recordEvent(s, 'CARD_PLAYED'); finishBattle(s, 'won', 'boss-contact'); processEvents(s);
    expect(s.player.hp).toBe(5); expect(s.eventHistory).toHaveLength(1); expect(s.eventQueue).toEqual([]);
    expect(triggers(s)).toEqual([]); expect(s.finishReason).toBe('boss-contact');
  });

  it('伤害致死后不会继续生成治疗或触发事件', () => {
    const s = fixture(); damagePlayer(s, 8);
    const count = s.eventHistory.length;
    recordEvent(s, 'HEALED'); processEvents(s);
    expect(s.status).toBe('lost'); expect(s.eventHistory).toHaveLength(count);
  });
});
