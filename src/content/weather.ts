import type { AdaptationAttributes, WeatherKind } from '../game/model';

export const weatherLabels: Record<WeatherKind, { name: string; icon: string; attribute: keyof AdaptationAttributes }> = {
  sun: { name: '晴', icon: '☀', attribute: 'sunAdaptation' },
  rain: { name: '雨', icon: '☂', attribute: 'rainAdaptation' },
  wind: { name: '风', icon: '≋', attribute: 'windAdaptation' },
};
// Equal weights are a configurable development default, not final balance.
export const weatherRules = {
  cycle: ['sun', 'rain', 'wind'] as WeatherKind[], turnsPerWeather: 3,
  initialWeights: { sun: 1, rain: 1, wind: 1 } as Record<WeatherKind, number>,
  defaultAttributes: { sunAdaptation: 0, rainAdaptation: 0, windAdaptation: 0 } as AdaptationAttributes,
};
