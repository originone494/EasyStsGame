import type { BattleState } from '../game/model';
import { summarizeScore } from '../game/scoring';
import { weatherLabels } from '../content/weather';

const percent = (value: number) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(value);

export function scorePanel(s: BattleState): string {
  const score = summarizeScore(s.scoring);
  return `<div class="score-status" role="status" aria-label="战斗评分"><span>评分 <b>${percent(score.percent)}%</b></span><small>${score.hpLost} / ${score.maxHp}</small></div>`;
}

export function rewardPanel(s: BattleState): string {
  const score = s.reward?.score ?? summarizeScore(s.scoring);
  const reward = s.reward;
  const summary = `<div class="result-score">评分 <strong>${percent(score.percent)}%</strong><small>有效扣血 ${score.hpLost} / ${score.maxHp}</small></div>`;
  if (!reward?.eligible) return `${summary}<div class="reward-none">本场未获得奖励</div>`;
  const attributes = Object.values(weatherLabels).map(label => {
    const key = label.attribute;
    if (!reward.scaledAttributes[key]) return '';
    const overflow = reward.overflowAttributes[key];
    return `<div class="reward-attribute" data-reward-attribute="${key}">${label.icon} ${label.name}适应 <b>+${reward.gainedAttributes[key]}</b>${overflow ? `<small>已达上限${s.rewardConfig.attributeCap}，${overflow}点溢出</small>` : ''}</div>`;
  }).join('');
  return `${summary}<div class="reward-summary"><div class="reward-ratio">奖励比例 ${percent(reward.rewardRatio * 100)}%</div><div class="reward-gold">金币 <b>+${reward.gold}</b><small>余额 ${s.gold}</small></div>${attributes}</div>`;
}
