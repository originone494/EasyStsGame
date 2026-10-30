import { afterEach, describe, expect, it } from 'vitest';
import { createBattle } from '../src/game/state';
import { createScenario } from '../src/game/scenarios';
import { act } from '../src/game/actions';
import { createAttributes, createWeather, setAttributes, activeAdaptation, turnsUntilWeatherChange, updateWeatherForTurn } from '../src/game/weather';
import { damageEnemy, damageEnemies, damagePlayer, losePlayerHp } from '../src/game/resolution';
import { calculateDamage } from '../src/game/damage';
import { registerListener } from '../src/game/listeners';
import { finishBattle, withEventContext } from '../src/game/events';
import { weatherRules } from '../src/content/weather';
import { startingDeck, cards } from '../src/content/cards';
import { createDeck } from '../src/game/deck';
import { shuffle, nextRandom } from '../src/game/random';
import type { WeatherKind } from '../src/game/model';

const originalRules = structuredClone(weatherRules);
afterEach(() => Object.assign(weatherRules, structuredClone(originalRules)));
const damageFacts = (s: ReturnType<typeof createBattle>) => s.eventHistory.filter(event => event.type === 'DAMAGE_RESOLVED');

describe('步骤5：晴雨风周期与初始化', () => {
  it('第1～3回合保持初始天气，第4、7、10回合依次切换且倒计时正确', () => {
    let s = createScenario('weatherCycle');
    const weather: string[] = [], countdown: number[] = [];
    for (let turn = 1; turn <= 10; turn++) {
      weather.push(s.weather.current); countdown.push(turnsUntilWeatherChange(s));
      if (turn < 10) s = act(s, { type: 'endTurn' });
    }
    expect(weather).toEqual(['sun', 'sun', 'sun', 'rain', 'rain', 'rain', 'wind', 'wind', 'wind', 'sun']);
    expect(countdown).toEqual([3, 2, 1, 3, 2, 1, 3, 2, 1, 3]);
    expect(s.eventHistory.filter(event => event.type === 'WEATHER_CHANGED').map(event => event.weatherChange?.turn)).toEqual([4, 7, 10]);
  });

  it('初始雨或风仍按同一循环推进，不在第4回合强制回到固定天气', () => {
    for (const [scenario, expected] of [['weatherRain', 'wind'], ['weatherWind', 'sun']] as const) {
      let s = createScenario(scenario);
      for (let i = 0; i < 3; i++) s = act(s, { type: 'endTurn' });
      expect(s.weather.current).toBe(expected);
    }
  });

  it('切换及其触发链先于TURN_STARTED与补牌，天气条件读取新天气', () => {
    const s = createScenario('weatherCycle'); s.turn = 3; s.player.hp = 5;
    registerListener(s, { key: 'change', name: 'change', kind: 'relic', listensTo: ['WEATHER_CHANGED'],
      effects: [{ type: 'heal', amount: 2 }], limit: { scope: 'unlimited' }, allowChain: false });
    registerListener(s, { key: 'rain-start', name: 'rain-start', kind: 'relic', listensTo: ['TURN_STARTED'], condition: { type: 'weather', weather: 'rain' },
      effects: [{ type: 'heal', amount: 3 }], limit: { scope: 'unlimited' }, allowChain: false });
    const n = act(s, { type: 'endTurn' });
    expect(n.player.hp).toBe(10);
    expect(n.eventHistory.map(event => event.type)).toEqual(['WEATHER_CHANGED', 'HEALED', 'TURN_STARTED', 'HEALED', 'CARD_DRAWN']);
    expect(n.eventHistory[0]).toMatchObject({ source: { kind: 'system', id: 'weather' }, weatherChange: { from: 'sun', to: 'rain', turn: 4 } });
    expect(n.eventHistory[1].parentId).toBe(n.eventHistory[0].id);
  });

  it('天气切换响应致死立即失败，不再开始回合效果或补牌', () => {
    const s = createScenario('weatherCycle'); s.turn = 3; s.player.hp = 1;
    registerListener(s, { key: 'fatal', name: 'fatal', kind: 'relic', listensTo: ['WEATHER_CHANGED'],
      effects: [{ type: 'loseHp', amount: 1 }], limit: { scope: 'unlimited' }, allowChain: true });
    const n = act(s, { type: 'endTurn' });
    expect(n.status).toBe('lost'); expect(n.weather.current).toBe('rain');
    expect(n.eventHistory.map(event => event.type)).toEqual(['WEATHER_CHANGED', 'HP_LOST']);
    expect(n.hand).toEqual([]); expect(n.eventQueue).toEqual([]);
  });

  it('初始化在第一回合监听前生效，不伪造初始切换事件', () => {
    const s = createBattle(0, 157, undefined, [{ key: 'rain-opening', name: 'rain-opening', kind: 'relic', listensTo: ['TURN_STARTED'],
      condition: { type: 'weather', weather: 'rain' }, effects: [], limit: { scope: 'unlimited' }, allowChain: false }], { initialWeather: 'rain' });
    expect(s.listeners[0].totalTriggers).toBe(1);
    expect(s.eventHistory[0].type).toBe('TURN_STARTED');
    expect(s.eventHistory.some(event => event.type === 'WEATHER_CHANGED')).toBe(false);
  });

  it('同回合重复更新不重复切换或重复生成事件', () => {
    const s = createScenario('weatherCycle'); s.turn = 4;
    updateWeatherForTurn(s); updateWeatherForTurn(s);
    expect(s.weather.current).toBe('rain');
    expect(s.eventHistory.filter(event => event.type === 'WEATHER_CHANGED')).toHaveLength(1);
  });

  it('战斗终止后天气不再推进或记录新事件', () => {
    const s = createScenario('weatherCycle'); finishBattle(s, 'won', 'last-kill');
    s.turn = 4; const before = structuredClone(s); updateWeatherForTurn(s);
    expect(s).toEqual(before);
  });

  it('相同种子与布局可复现天气，固定种子样本覆盖三种初始天气', () => {
    const found = new Set<WeatherKind>();
    let seed = 157;
    for (let i = 0; i < 100; i++) {
      seed = nextRandom(seed);
      const a = createWeather(seed, i % 3), b = createWeather(seed, i % 3);
      expect(a).toEqual(b); found.add(a.current);
    }
    expect(found).toEqual(new Set(['sun', 'rain', 'wind']));
  });

  it('天气随机流不改变旧种子的初始牌序或洗牌随机状态', () => {
    for (const seed of [0, 1, 123, 157, 4294967295]) {
      const old = shuffle(startingDeck.map((key, id) => ({ key, id })), seed >>> 0);
      for (let encounter = 0; encounter < 3; encounter++) {
        const s = createBattle(encounter, seed);
        expect([...s.hand, ...s.draw]).toEqual(old.values);
        expect(s.rng).toBe(old.seed);
      }
    }
  });

  it('自然循环不消费额外随机数，单张牌局面可重复回放', () => {
    const initial = createScenario('weatherCycle'); let s = initial;
    for (let i = 0; i < 9; i++) s = act(s, { type: 'endTurn' });
    expect(s.weather.rng).toBe(initial.weather.rng); expect(s.rng).toBe(initial.rng);
    let replay = createScenario('weatherCycle');
    for (let i = 0; i < 9; i++) replay = act(replay, { type: 'endTurn' });
    expect(s).toEqual(replay);
  });

  it('初始权重可配置，零权重天气不会被抽取', () => {
    weatherRules.initialWeights = { sun: 0, rain: 5, wind: 0 };
    for (const seed of [0, 1, 123, 157]) expect(createWeather(seed, 0).current).toBe('rain');
  });

  it('拒绝无效天气、权重和周期，不静默采用损坏配置', () => {
    expect(() => createWeather(0, 0, 'night' as WeatherKind)).toThrow('初始天气');
    weatherRules.initialWeights = { sun: 0, rain: 0, wind: 0 };
    expect(() => createWeather(0, 0)).toThrow('权重');
    weatherRules.initialWeights = { sun: -1, rain: 1, wind: 1 };
    expect(() => createWeather(0, 0)).toThrow('权重');
    weatherRules.initialWeights = { sun: 1, rain: 1, wind: 1 };
    weatherRules.turnsPerWeather = 0;
    expect(() => createWeather(0, 0)).toThrow('循环配置');
  });

  it('战斗复制周期配置，修改全局配置不会改变已经创建的天气时钟', () => {
    const s = createScenario('weatherCycle');
    weatherRules.turnsPerWeather = 2; weatherRules.cycle.reverse();
    s.turn = 3; updateWeatherForTurn(s); expect(s.weather.current).toBe('sun');
    s.turn = 4; updateWeatherForTurn(s); expect(s.weather.current).toBe('rain');
  });

  it('JSON恢复保留天气、适应和周期，跨切换边界的结果完全一致', () => {
    let s = createScenario('weatherCycle');
    s = act(act(s, { type: 'endTurn' }), { type: 'endTurn' });
    const restored = JSON.parse(JSON.stringify(s));
    expect(act(s, { type: 'endTurn' })).toEqual(act(restored, { type: 'endTurn' }));
  });
});

describe('步骤5：独立适应属性与伤害隔离', () => {
  it('正常开局三项适应均为0，旧伤害结果保持不变', () => {
    const s = createBattle();
    expect(s.attributes).toEqual({ sunAdaptation: 0, rainAdaptation: 0, windAdaptation: 0 });
    damageEnemy(s, 1, 4, { kind: 'card' }); expect(damageFacts(s)[0].value).toBe(4);
  });

  it('晴40、雨20、风60分别使基础10变为14、12、16，仅当前属性生效', () => {
    for (const [scenario, expected] of [['weatherSun', 14], ['weatherRain', 12], ['weatherWind', 16]] as const) {
      const s = createScenario(scenario);
      const n = act(s, { type: 'play', cardId: 0, target: 1 });
      expect(damageFacts(n)[0].value).toBe(expected);
      expect(activeAdaptation(n).points).toBe(Number(scenario === 'weatherSun' ? 40 : scenario === 'weatherRain' ? 20 : 60));
    }
  });

  it('100点作为一个+100%倍率，只翻倍而不按100个1.01相乘', () => {
    const s = createScenario('weatherSun'); setAttributes(s, { sunAdaptation: 100 });
    damageEnemy(s, 1, 10, { kind: 'card' }); expect(damageFacts(s)[0].value).toBe(20);
  });

  it('适应与1.2、1.3独立相乘，只最终取整得到22而非逐步取整23', () => {
    const n = act(createScenario('weatherMultipliers'), { type: 'play', cardId: 0, target: 1 });
    expect(damageFacts(n)[0]).toMatchObject({ value: 22, damage: { multipliers: [1.2, 1.3], percentBonuses: [40] } });
  });

  it('固定修正在天气倍率之前计算，其他独立百分比仍相乘', () => {
    const s = createScenario('weatherSun');
    damageEnemy(s, 1, 10, { kind: 'card', flat: [2], multipliers: [1.2], percentBonuses: [10] });
    expect(damageFacts(s)[0].value).toBe(23); // ceil(12 * 1.2 * 1.1 * 1.4)
  });

  it('百分比点数计算保持十进制精度，50基础加14%恰好57', () => {
    expect(calculateDamage(50, { percentBonuses: [14] })).toBe(57);
    const s = createScenario('weatherSun'); setAttributes(s, { sunAdaptation: 14 });
    damageEnemy(s, 1, 50, { kind: 'card' }); expect(damageFacts(s)[0].value).toBe(57);
  });

  it('天气适应不混入遗物及临时监听的间接伤害', () => {
    const n = act(createScenario('weatherSources'), { type: 'play', cardId: 0, target: 1 });
    expect(damageFacts(n).map(event => [event.value, event.damage?.kind])).toEqual([[14, 'card'], [10, 'relic'], [10, 'indirect']]);
  });

  it('卡牌来源的显式间接伤害也不享受适应，接触与直接生命损失保持原值', () => {
    const s = createScenario('weatherSun');
    withEventContext(s, { source: { kind: 'card', id: 0, key: 'push' }, parentId: null, allowChain: true },
      () => damageEnemy(s, 1, 10, { kind: 'indirect' }));
    damagePlayer(s, 3, { kind: 'contact' }); losePlayerHp(s, 2);
    expect(damageFacts(s).map(event => event.value)).toEqual([10, 3]);
    expect(s.player.hp).toBe(15);
  });

  it('群体卡牌与多段各自应用当前适应，每目标每段最终取整', () => {
    cards.testWeatherWave = { name: '测试', kind: '测试', description: '测试', target: 'none',
      effects: [{ type: 'damageAll', amount: 2, hits: 3, multipliers: [1.2] }] };
    try {
      const s = createBattle(0, 157, createDeck(['testWeatherWave']), [], { initialWeather: 'sun', attributes: { sunAdaptation: 40 } });
      const n = act(s, { type: 'play', cardId: 0 });
      expect(damageFacts(n).map(event => event.value)).toEqual([4, 4, 4, 4, 4]);
      expect(damageFacts(n).map(event => event.batchId)).toEqual([1, 1, 2, 2, 3]);
      expect(n.status).toBe('won');
    } finally { delete cards.testWeatherWave; }
  });

  it('群体逐目标修正仍独立，天气不会把第一个目标结果复用给其他目标', () => {
    const s = createScenario('weatherSun');
    s.enemies.push({ ...s.enemies[0], id: 2, position: 9 });
    s.damageModifiers = [{ id: 'target-two', target: { kind: 'enemy', id: 2 }, flat: [2] }];
    const results = damageEnemies(s, [1, 2], 10, { kind: 'card' });
    expect(results.map(result => [result.target.id, result.resolved])).toEqual([[2, 17], [1, 14]]);
  });

  it('属性更新立即用于后续伤害，不需要重新开始；未生效属性不影响当前天气', () => {
    const s = createScenario('weatherSun');
    setAttributes(s, { sunAdaptation: 0, rainAdaptation: 50 });
    damageEnemy(s, 1, 10, { kind: 'card' });
    s.turn = 4; updateWeatherForTurn(s); damageEnemy(s, 1, 10, { kind: 'card' });
    expect(damageFacts(s).map(event => event.value)).toEqual([10, 15]);
    expect(s.attributes.windAdaptation).toBe(60);
  });

  it('0伤害仍为0，过量伤害的实际生命损失仍封顶，属性不改变事件分类', () => {
    const s = createScenario('weatherSun'); s.enemies[0].hp = 3;
    damageEnemy(s, 1, 0, { kind: 'card' }); damageEnemy(s, 1, 10, { kind: 'card' });
    expect(damageFacts(s).map(event => event.value)).toEqual([0, 14]);
    expect(s.eventHistory.filter(event => event.type === 'HP_LOST').map(event => event.value)).toEqual([3]);
  });

  it('属性输入校验为非负安全整数，非法组合更新完全不写入', () => {
    expect(() => createAttributes({ sunAdaptation: -1 })).toThrow('安全整数');
    expect(() => createAttributes({ rainAdaptation: 0.5 })).toThrow('安全整数');
    expect(() => createAttributes({ windAdaptation: Infinity })).toThrow('安全整数');
    const s = createScenario('weatherSun'); const before = { ...s.attributes };
    expect(() => setAttributes(s, { sunAdaptation: 50, rainAdaptation: -1 })).toThrow('安全整数');
    expect(s.attributes).toEqual(before);
  });

  it('初始化属性与输入配置不共享对象，不在步骤5虚构楼层上限', () => {
    const input = { sunAdaptation: 500 };
    const s = createBattle(0, 157, undefined, [], { initialWeather: 'sun', attributes: input });
    input.sunAdaptation = 1;
    expect(s.attributes.sunAdaptation).toBe(500);
    damageEnemy(s, 1, 10, { kind: 'card' }); expect(damageFacts(s)[0].value).toBe(60);
  });
});
