import type { State, Card } from '../game/state';
import { cards } from '../content/cards';
export function hand(s:State, selected?:number) {
 return `<div class="hand">${s.hand.map((c,i)=>{return `<button class="card card-${c.key} ${selected===c.id?'selected':''}" data-card="${c.id}" aria-pressed="false" style="--tilt:${(i-(s.hand.length-1)/2)*4}deg;--fan-drop:${Math.abs(i-(s.hand.length-1)/2)*5}px" ${s.status!=='playing'?'disabled':''}>${cardFace(c)}</button>`;}).join('')||'<div class="empty-hand" aria-label="暂无手牌"></div>'}</div>`;
}

export function cardFace(c: Card) {
 const d=cards[c.key];
 const keywords=[...new Set([...(d.exhaust?['消耗']:[]),...d.keywords??[]])];
 return `<span class="card-top"><span class="card-cost" title="免费">0</span><small>${d.kind}</small></span><div class="card-art"><img src="/art/card-${d.art ?? c.key}.png" alt=""></div><h3>${d.name}</h3><p class="card-description">${keywords.length?`<span class="card-keywords">【${keywords.join('/')}】</span>`:''}<span class="card-effect">${d.description}</span></p>`;
}
