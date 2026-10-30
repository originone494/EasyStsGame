import type { RunState } from '../game/model';
import type { ProgressionContent } from '../game/selection';
import { cards } from '../content/cards';
import { cardFace } from './hand';
import { runHeader } from './map';

const rarityNames = { common: '普通', uncommon: '罕见', rare: '稀有' };

export function offerCards(keys: readonly string[], action: string, nodeId: string, round?: number): string {
  return `<div class="selection-cards">${keys.map((key, index) => {
    const card = cards[key];
    return `<div class="selection-choice"><button class="card offer-card" data-action="${action}" data-card-key="${key}" data-node-id="${nodeId}" ${round === undefined ? '' : `data-round="${round}"`} aria-label="选择${card.name}">${cardFace({ id: index, key })}</button>${card.rarity ? `<small class="selection-rarity">${rarityNames[card.rarity]}</small>` : ''}</div>`;
  }).join('')}</div>`;
}

export function rewardSelection(run: RunState): string {
  const reward = run.pendingReward, selection = reward?.cardSelection;
  if (!selection) return '';
  const relic = reward.relicKey ? run.relics.find(owned => owned.key === reward.relicKey) : undefined;
  const relicText = relic ? `<p class="selection-earned" data-earned-relic="${relic.key}">获得遗物：${relic.name}</p>` : '';
  if (selection.status !== 'pending') {
    return `${relicText}<p class="selection-earned">${selection.status === 'picked' ? `已获得「${cards[selection.picked!].name}」` : selection.status === 'empty' ? '暂无可获得的卡牌' : '已跳过选卡'}</p>`;
  }
  return `${relicText}<section class="reward-selection" aria-label="卡牌奖励"><h3>选择一张卡牌</h3>${offerCards(selection.candidates, 'reward-pick', reward.nodeId)}${reward.outcome.cardOffer?.canSkip ? `<button class="skip-card" data-action="reward-skip" data-node-id="${reward.nodeId}">跳过选卡</button>` : ''}</section>`;
}

export function recruitmentScreen(run: RunState, content: ProgressionContent): string {
  const recruitment = run.pendingRecruitment!;
  const title = recruitment.characterKey ? `${content.characters[recruitment.characterKey].name} · 选卡 ${recruitment.round + 1}/3` : '选择新同伴';
  const body = recruitment.characterKey
    ? offerCards(recruitment.cardCandidates, 'recruit-card', recruitment.nodeId, recruitment.round)
    : `<div class="recruitment-characters">${recruitment.candidates.map(key => {
      const character = content.characters[key], relic = content.relics[character.relicKey!];
      return `<button class="recruit-choice" data-action="recruit-pick" data-character-key="${key}" data-node-id="${recruitment.nodeId}"><img src="/art/player.png" alt=""><h2>${character.name}</h2><p>${character.description ?? ''}</p><div class="recruit-relic"><b>${relic.listener.name}</b><span>${relic.description}</span></div></button>`;
    }).join('')}</div>`;
  return `<section class="run-screen recruitment-screen" aria-label="角色招募">${runHeader(run, '招募')}<div class="recruitment-content"><h1>${title}</h1>${body}${recruitment.pickedCards.length ? `<p class="recruited-cards">已选：${recruitment.pickedCards.map(key => cards[key].name).join('、')}</p>` : ''}</div></section>`;
}
