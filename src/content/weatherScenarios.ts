import type { AdaptationAttributes, WeatherKind } from '../game/model';

interface WeatherFixture { name: string; initial: WeatherKind; card: string; attributes: AdaptationAttributes; sourceDemo?: boolean }
const attributes: AdaptationAttributes = { sunAdaptation: 40, rainAdaptation: 20, windAdaptation: 60 };
// Stationary, high-HP targets let the natural cycle be inspected over ten turns.
export const weatherFixtures: Record<string, WeatherFixture> = {
  weatherSun: { name: '晴适应伤害', initial: 'sun', card: 'debugWeather', attributes },
  weatherRain: { name: '雨适应伤害', initial: 'rain', card: 'debugWeather', attributes },
  weatherWind: { name: '风适应伤害', initial: 'wind', card: 'debugWeather', attributes },
  weatherCycle: { name: '完整天气循环', initial: 'sun', card: 'debugWeather', attributes },
  weatherMultipliers: { name: '天气与独立倍率', initial: 'sun', card: 'debugFormula', attributes },
  weatherSources: { name: '适应增伤来源隔离', initial: 'sun', card: 'debugWeather', attributes, sourceDemo: true },
};
