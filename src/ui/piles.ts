import type { State } from '../game/state';
import { cards } from '../content/cards';
import { cardFace } from './hand';

export const pileNames = { draw: '抽牌堆', discard: '弃牌堆', exhaust: '消耗堆' } as const;
export type Pile = keyof typeof pileNames;
export function isPile(value: string | undefined): value is Pile {
  return value === 'draw' || value === 'discard' || value === 'exhaust';
}

export function pileButton(s: State, pile: Pile) {
  const symbols = { draw: '✧', discard: '◇', exhaust: '✕' };
  return `<button class="deck-pile ${pile}-pile" data-pile="${pile}" aria-label="查看${pileNames[pile]}，${s[pile].length} 张" title="${pileNames[pile]}"><span class="deck-card" aria-hidden="true">${symbols[pile]}</span><b>${s[pile].length}</b></button>`;
}

export function pileBrowser(s: State, pile: Pile) {
  // Viewing a pile never changes its order or consumes gameplay randomness.
  const contents = [...s[pile]];
  if (pile === 'draw') contents.sort((a,b) => cards[a.key].name.localeCompare(cards[b.key].name, 'zh-CN') || a.id-b.id);
  else contents.reverse();
  return `<dialog class="pile-dialog" aria-labelledby="pile-title"><header class="pile-header"><h2 id="pile-title">${pileNames[pile]} <span>${contents.length} 张</span></h2><button data-action="close-pile" aria-label="关闭牌堆查看">✕</button></header><nav class="pile-tabs" aria-label="切换查看的牌堆">${(Object.keys(pileNames) as Pile[]).map(key => `<button data-view-pile="${key}" aria-pressed="${pile===key}">${pileNames[key]} <b>${s[key].length}</b></button>`).join('')}</nav>${pile==='draw'?'<p class="pile-note">按牌名展示，不代表抽取顺序</p>':''}<div class="pile-contents" aria-label="${pileNames[pile]}内的卡牌">${contents.map(card => `<article class="card pile-card" data-instance="${card.id}" aria-label="${cards[card.key].name}">${cardFace(card)}</article>`).join('')||'<p class="pile-empty">此牌堆暂时没有卡牌</p>'}</div></dialog>`;
}
