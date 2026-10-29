import type { State } from '../game/state';
import { cards } from '../content/cards';
export function hand(s:State, selected?:number) {
 return `<div class="hand">${s.hand.map((c,i)=>{const d=cards[c.key];return `<button class="card card-${c.key} ${selected===c.id?'selected':''}" data-card="${c.id}" aria-pressed="false" style="--tilt:${(i-(s.hand.length-1)/2)*4}deg;--fan-drop:${Math.abs(i-(s.hand.length-1)/2)*5}px" ${s.status!=='playing'?'disabled':''}><span class="card-top"><span class="card-cost" title="免费">0</span><small>${d.kind}</small><span class="card-mark">◇</span></span><div class="card-art"><img src="/art/card-${c.key}.png" alt=""></div><h3>${d.name}</h3><p>${d.description}</p><footer>${d.exhaust?'消耗 · 本场移除':'免费 · 可连续使用'}<span>✦</span></footer></button>`;}).join('')||'<div class="empty-hand" aria-label="暂无手牌"></div>'}</div>`;
}
