import './style.css';
import { createBattle, type State } from './game/state';
import { act, type Action } from './game/actions';
import { createScenario, scenarios } from './game/scenarios';
import { encounters, prototype } from './content/encounters';
import { CardInteraction } from './ui/cardInteraction';
import { battlefield } from './ui/battlefield';
import { hand } from './ui/hand';
import { pileButton, pileBrowser, isPile, type Pile } from './ui/piles';
import { panels, result } from './ui/panels';
import { enemyOrder } from './game/turn';
// Fixed test entries remain available via URL, with no developer text in the game HUD.
const query = new URLSearchParams(location.search);
const seedValue = Number(query.get('seed') ?? prototype.seed);
const seed = Number.isInteger(seedValue) && seedValue >= 0 && seedValue <= 4294967295 ? seedValue : prototype.seed;
const encounterValue = Number(query.get('encounter') ?? 0);
const encounter = Number.isInteger(encounterValue) && encounterValue >= 0 && encounterValue < encounters.length ? encounterValue : 0;
const scenario = query.get('scenario');
let state = scenario && scenarios.some(s => s.id === scenario) ? createScenario(scenario, seed) : createBattle(encounter, seed);
let interaction: CardInteraction | undefined;
let viewingPile: Pile | undefined;
let feedback: {position:number;text:string;tone:string}[]=[];
const app=document.querySelector<HTMLDivElement>('#app')!;
function reset(next=false) { state=state.scenario&&!next?createScenario(state.scenario,state.seed):createBattle((state.encounter+(next?1:0))%encounters.length,state.seed); feedback=[]; render(); }
function perform(action:Action) {
 const previous:State=state;state=act(state,action);feedback=[];
 for(const e of state.events.slice(previous.events.length)){
  const position=e.target===undefined?previous.player.position:(previous.enemies.find(u=>u.id===e.target)?.position??state.enemies.find(u=>u.id===e.target)?.position??0);
  if(e.type==='damage')feedback.push({position,text:`−${e.amount}`,tone:'damage'});
  if(e.type==='heal')feedback.push({position:state.player.position,text:`+${e.amount}`,tone:'healing'});
  if(e.type==='collision')feedback.push({position,text:'碰撞',tone:'collision'});
 }
 for(const unit of state.enemies){const old=previous.enemies.find(u=>u.id===unit.id);if(old&&old.position!==unit.position)feedback.push({position:unit.position,text:`${unit.position>old.position?'→':'←'} ${Math.abs(unit.position-old.position)}格`,tone:'movement'});}
 if(state.player.position!==previous.player.position)feedback.push({position:state.player.position,text:`${state.player.position>previous.player.position?'→':'←'} 移步`,tone:'movement'});
 render();
}
function render() {
 interaction?.cancel();
 app.innerHTML=`<div class="game-shell"><header class="game-header" ${state.status!=='playing'||viewingPile?'inert aria-hidden="true"':''}><div class="brand"><span class="brand-emblem">✧</span><div>简单尖塔</div></div><div class="stats">${panels(state)}</div><nav><button data-action="restart" title="重新开始当前战斗">重新开始</button><button data-action="next">切换测试战斗</button></nav></header><main ${state.status!=='playing'||viewingPile?'inert aria-hidden="true"':''}><section class="arena"><div class="initiative" aria-label="怪物行动顺序">${enemyOrder(state).map((id,i)=>`<span><b>${i+1}</b> #${id}</span>`).join('<i>›</i>')}</div><div class="scene-motes"><i></i><i></i><i></i><i></i><i></i></div><div class="battlefield-track">${battlefield(state)}</div><div class="combat-feedback" aria-hidden="true">${feedback.map((f,i)=>`<span class="floating-number ${f.tone}" style="left:${(f.position+.5)/state.size*100}%;--delay:${i*.12}s">${f.text}</span>`).join('')}</div><div class="hand-overlay" aria-label="悬浮手牌">${pileButton(state,'draw')}${hand(state)}${pileButton(state,'discard')}${pileButton(state,'exhaust')}<div class="action-bar"><div class="action-buttons"><button class="end-turn" data-action="end" ${state.status!=='playing'?'disabled':''}>结束回合 →</button></div></div></div></section></main>${result(state)}${viewingPile?pileBrowser(state,viewingPile):''}</div>`;
 if(viewingPile){
  const dialog=app.querySelector<HTMLDialogElement>('.pile-dialog')!;
  dialog.showModal();
  dialog.querySelector<HTMLButtonElement>(`[data-view-pile="${viewingPile}"]`)?.focus();
 }
}
interaction = new CardInteraction(app, {
 state: () => state,
 play: perform,
 notice: message => { state = { ...state, notice: message }; render(); },
});
function closePile() {
 const previous=viewingPile;viewingPile=undefined;render();
 if(previous)app.querySelector<HTMLButtonElement>(`[data-pile="${previous}"]`)?.focus();
}
app.addEventListener('cancel',event=>{if((event.target as HTMLElement).matches('.pile-dialog')){event.preventDefault();closePile();}},true);
app.addEventListener('click',event=>{
 if(event.target instanceof HTMLDialogElement){
  const r=event.target.getBoundingClientRect();
  if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closePile();
  return;
 }
 const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button'); if(!button||button.disabled)return;
 const pile=button.dataset.pile??button.dataset.viewPile;
 if(isPile(pile)&&state.status==='playing'){viewingPile=pile;render();return;}
 switch(button.dataset.action){
 case 'close-pile':closePile();return;
 case 'restart':reset();return;case 'next':reset(true);return;
 case 'end':interaction?.cancel();perform({type:'endTurn'});return;
 }
});
render();
