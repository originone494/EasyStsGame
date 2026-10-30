import type { BattleState } from '../game/model';
import { activeAdaptation, turnsUntilWeatherChange } from '../game/weather';
import { weatherLabels } from '../content/weather';

export function weatherPanel(s: BattleState): string {
  const label = weatherLabels[s.weather.current];
  const { points } = activeAdaptation(s);
  const remaining = turnsUntilWeatherChange(s);
  return `<section class="weather-status weather-${s.weather.current}" role="status" aria-label="天气" data-weather="${s.weather.current}"><span class="weather-icon" aria-hidden="true">${label.icon}</span><div><div class="weather-heading"><strong class="weather-name">${label.name}</strong><span class="weather-countdown" title="包含当前回合，完成剩余回合后切换">${remaining}回合后切换</span></div><span class="weather-bonus">${label.name}适应 ${points} · 卡牌直伤 +${points}%</span></div></section>`;
}
