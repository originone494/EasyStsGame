import { describe, it, expect } from 'vitest';
import { createBattle, type State } from '../src/game/state';
import { act } from '../src/game/actions';
import { createScenario } from '../src/game/scenarios';
import { drawCards } from '../src/game/cards';
import { advanceEnemy, pushEnemy } from '../src/game/movement';
import { enemyOrder } from '../src/game/turn';
function allCards(s: State) { return [...s.hand,...s.draw,...s.discard,...s.exhaust,...s.executing].map(c=>c.id).sort(); }
function fixedHand(s: State, key: string) { const all=[...s.hand,...s.draw]; s.hand=all.filter(c=>c.key===key);s.draw=all.filter(c=>c.key!==key);return s.hand[0].id; }
describe('第一阶段规则验收',()=>{
 it('初始七张牌、三张手牌、合法布局',()=>{for(let i=0;i<3;i++){const s=createBattle(i);expect(allCards(s)).toHaveLength(7);expect(s.hand).toHaveLength(3);expect(new Set([s.player.position,...s.enemies.map(e=>e.position)]).size).toBe(s.enemies.length+1);}});
 it('非法目标不消耗牌，不改变战斗状态',()=>{const s=createBattle();const id=fixedHand(s,'strike');const n=act(s,{type:'play',cardId:id,target:999});expect(n.notice).not.toBe('');expect({...n,notice:''}).toEqual(s);});
 it('越界与被占据禁止移动',()=>{for(const position of [0,8]){const s=createBattle();s.player.position=position;const id=fixedHand(s,'step');const n=act(s,{type:'play',cardId:id,direction:position===0?-1:1});expect(n.notice).not.toBe('');expect(allCards(n)).toEqual(allCards(s));expect(n.player.position).toBe(position);}});
 it('合法移动弃牌且状态输入不变',()=>{const s=createBattle();const id=fixedHand(s,'step');const n=act(s,{type:'play',cardId:id,direction:-1});expect(n.player.position).toBe(5);expect(s.player.position).toBe(6);expect(n.discard[0].id).toBe(id);});
 it('任意距离攻击，无阻挡检查',()=>{const s=createBattle();const id=fixedHand(s,'strike');const n=act(s,{type:'play',cardId:id,target:2});expect(n.enemies[1].hp).toBe(6);});
 it('多段击杀取消剩余段',()=>{const s=createBattle();s.enemies=[{...s.enemies[0],hp:3}];const id=fixedHand(s,'combo');const n=act(s,{type:'play',cardId:id,target:1});expect(n.events.filter(e=>e.type==='damage')).toHaveLength(2);expect(n.status).toBe('won');expect(n.executing).toHaveLength(0);expect(n.discard[0].id).toBe(id);});
 it('最后击杀治疗先于胜利结算',()=>{const s=createScenario('heal');const n=act(s,{type:'play',cardId:0,target:1});expect(n.player.hp).toBe(12);expect(n.status).toBe('won');expect(n.log.findIndex(x=>x.includes('恢复'))).toBeLessThan(n.log.findIndex(x=>x.includes('胜利')));});
 it('整备执行期间不能抽回自己，完成后消耗',()=>{const s=createScenario('empty');const id=s.hand[0].id;const n=act(s,{type:'play',cardId:id});expect(n.hand).toHaveLength(2);expect(n.hand.some(c=>c.id===id)).toBe(false);expect(n.exhaust.map(c=>c.id)).toEqual([id]);expect(allCards(n)).toEqual(allCards(s));});
 it('两个牌堆为空时停止；执行牌不参与洗牌',()=>{const s=createBattle();s.hand=[];s.draw=[];s.discard=[];s.executing=[{id:90,key:'prepare'}];drawCards(s,200);expect(s.hand).toHaveLength(0);expect(s.executing).toHaveLength(1);});
 it('耗尽抽牌堆后继续洗牌抽取',()=>{const s=createBattle();s.hand=[];s.draw=[{id:20,key:'strike'}];s.discard=[{id:21,key:'step'},{id:22,key:'push'}];drawCards(s,3);expect(s.hand).toHaveLength(3);expect(s.draw).toHaveLength(0);expect(s.discard).toHaveLength(0);});
 it('连续二十次洗牌不丢失或复制',()=>{const s=createBattle();const ids=allCards(s);for(let i=0;i<20;i++){s.discard.push(...s.hand);s.hand=[];drawCards(s,7);expect(allCards(s)).toEqual(ids);expect(s.hand).toHaveLength(7);}});
 it('击退碰撞传递剩余量，无额外位移和伤害',()=>{const s=createScenario('chain');pushEnemy(s,1,2);expect(s.enemies.map(e=>e.position)).toEqual([8,11]);expect(s.events.filter(e=>e.type==='collision')).toEqual([{type:'collision',actor:1,target:2,amount:2}]);expect(s.enemies.map(e=>e.hp)).toEqual([6,10]);});
 it('连续碰撞及边界消耗剩余击退',()=>{const s=createBattle();s.enemies=[{...s.enemies[0],position:9},{...s.enemies[1],position:10},{...s.enemies[0],id:3,position:11}];pushEnemy(s,1,7);expect(s.enemies.map(e=>e.position)).toEqual([9,10,12]);expect(s.events.filter(e=>e.type==='collision')).toHaveLength(2);});
 it('向左击退正确',()=>{const s=createBattle();s.enemies[0].position=2;pushEnemy(s,1,3);expect(s.enemies[0].position).toBe(0);});
 it('行动顺序按距离，同距按编号',()=>{const s=createBattle();s.enemies=[{...s.enemies[0],id:8,position:5},{...s.enemies[1],id:2,position:7},{...s.enemies[0],id:1,position:2}];expect(enemyOrder(s)).toEqual([2,8,1]);});
 it('相邻不伤害，尝试踏入才接触并消失',()=>{const s=createBattle();s.enemies=[{...s.enemies[0],position:8}];advanceEnemy(s,1);expect(s.enemies[0].position).toBe(7);expect(s.player.hp).toBe(20);advanceEnemy(s,1);expect(s.enemies).toHaveLength(0);expect(s.player.hp).toBe(17);});
 it('怪物受阻剩余移动作废',()=>{const s=createBattle();s.enemies[0].position=8;s.enemies[1].position=9;s.enemies[1].speed=4;advanceEnemy(s,2);expect(s.enemies[1].position).toBe(9);});
 it('每只怪物完成全部行动后下一只行动',()=>{const s=createBattle();s.enemies[0].position=8;s.enemies[0].speed=2;s.enemies[1].position=9;s.enemies[1].speed=2;const n=act(s,{type:'endTurn'});expect(n.player.hp).toBe(17);expect(n.enemies[0].id).toBe(2);expect(n.enemies[0].position).toBe(7);});
 it('接触致死立即失败，后续怪物停止',()=>{const s=createScenario('lethal');s.enemies.push({...s.enemies[0],id:2,position:8});const n=act(s,{type:'endTurn'});expect(n.status).toBe('lost');expect(n.enemies[0].position).toBe(8);expect(n.turn).toBe(1);});
 it('三个测试战斗可结束，胜败后不能操作，可重建',()=>{for(let i=0;i<3;i++){let s=createBattle(i);for(let n=0;n<20&&s.status==='playing';n++)s=act(s,{type:'endTurn'});expect(['won','lost']).toContain(s.status);expect(act(s,{type:'endTurn'}).turn).toBe(s.turn);expect(createBattle(i).status).toBe('playing');}});
 it('相同种子和操作可复现，跨回合牌总数不变',()=>{function replay(){let s=createBattle(1,123);for(let i=0;i<10&&s.status==='playing';i++){for(const card of [...s.hand]){s=act(s,{type:'play',cardId:card.id,target:s.enemies[0]?.id,direction:-1});expect(allCards(s)).toEqual([0,1,2,3,4,5,6]);}if(s.status==='playing')s=act(s,{type:'endTurn'});}return s;}expect(replay()).toEqual(replay());});
 it('各战斗存在可胜操作路线',()=>{for(let encounter=0;encounter<3;encounter++){let s=createBattle(encounter);for(let turn=0;turn<15&&s.status==='playing';turn++){let played=true;while(played&&s.status==='playing'){played=false;for(const c of [...s.hand]){if(['strike','combo','prepare'].includes(c.key)){const target=[...s.enemies].sort((a,b)=>Math.abs(a.position-s.player.position)-Math.abs(b.position-s.player.position))[0]?.id;s=act(s,{type:'play',cardId:c.id,target});played=true;break;}}}if(s.status==='playing')s=act(s,{type:'endTurn'});}expect(s.status).toBe('won');}});
});
