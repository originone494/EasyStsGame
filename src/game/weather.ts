import { weatherLabels, weatherRules } from '../content/weather';
import type { AdaptationAttributes, BattleState, WeatherKind, WeatherState } from './model';
import { nextRandom } from './random';
import { recordEvent, withEventContext } from './events';

export function createAttributes(input: Partial<AdaptationAttributes> = {}): AdaptationAttributes {
  const attributes = { ...weatherRules.defaultAttributes, ...input };
  for (const key of ['sunAdaptation', 'rainAdaptation', 'windAdaptation'] as const) {
    if (!Number.isSafeInteger(attributes[key]) || attributes[key] < 0) throw new Error('适应属性必须为非负安全整数。');
  }
  return attributes;
}

export function setAttributes(s: BattleState, input: Partial<AdaptationAttributes>) {
  // Validate the entire update before changing any attribute.
  s.attributes = createAttributes({ ...s.attributes, ...input });
}

export function createWeather(seed: number, encounter: number, initial?: WeatherKind): WeatherState {
  const cycle = [...weatherRules.cycle];
  if (cycle.length !== 3 || new Set(cycle).size !== 3 || cycle.some(kind => !Object.hasOwn(weatherLabels, kind))
    || !Number.isSafeInteger(weatherRules.turnsPerWeather) || weatherRules.turnsPerWeather < 1) throw new Error('天气循环配置无效。');
  const weights = cycle.map(kind => weatherRules.initialWeights[kind]);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (weights.some(weight => !Number.isFinite(weight) || weight < 0) || !Number.isFinite(total) || total <= 0) throw new Error('初始天气权重无效。');
  if (initial !== undefined && !cycle.includes(initial)) throw new Error('初始天气无效。');
  // A separate deterministic channel leaves all existing deck RNG unchanged.
  const rng = nextRandom((seed ^ Math.imul(encounter + 1, 0x9e3779b1) ^ 0x77656174) >>> 0);
  let roll = rng / 4294967296 * total;
  let selected = cycle[cycle.length - 1];
  for (let i = 0; i < cycle.length; i++) {
    if (roll < weights[i]) { selected = cycle[i]; break; }
    roll -= weights[i];
  }
  const current = initial ?? selected;
  return { initial: current, current, cycle, turnsPerWeather: weatherRules.turnsPerWeather, rng, lastUpdatedTurn: 0 };
}

export function updateWeatherForTurn(s: BattleState) {
  if (s.status !== 'playing') return;
  if (!Number.isSafeInteger(s.turn) || s.turn < 1) throw new Error('天气回合编号无效。');
  const weather = s.weather;
  const index = Math.floor((s.turn - 1) / weather.turnsPerWeather);
  const next = weather.cycle[(weather.cycle.indexOf(weather.initial) + index) % weather.cycle.length];
  weather.lastUpdatedTurn = s.turn;
  if (next === weather.current) return;
  const from = weather.current;
  weather.current = next;
  withEventContext(s, { source: { kind: 'system', id: 'weather' }, parentId: null, allowChain: true },
    () => recordEvent(s, 'WEATHER_CHANGED', { weatherChange: { from, to: next, turn: s.turn } }));
  s.log.push(`天气切换：${weatherLabels[from].name} → ${weatherLabels[next].name}。`);
}

export function turnsUntilWeatherChange(s: BattleState): number {
  return s.weather.turnsPerWeather - (s.turn - 1) % s.weather.turnsPerWeather;
}

export function activeAdaptation(s: BattleState) {
  const label = weatherLabels[s.weather.current];
  return { weather: s.weather.current, attribute: label.attribute, points: s.attributes[label.attribute] };
}
