import type { MapNode, RunState } from '../game/model';
import { currentNode } from '../game/run';
import { floorBattleCounts, isBattleNode } from '../game/map';
import { weatherLabels } from '../content/weather';
import { characters } from '../content/characters';

export const nodeLabels = { battle: '普通战', elite: '精英战', boss: 'Boss', shop: '商店', campfire: '火堆', event: '？' };
const nodeIcons = { battle: '⚔', elite: '◆', boss: '♛', shop: '◇', campfire: '♨', event: '？' };

function rewardText(node: MapNode): string {
  if (!isBattleNode(node)) return node.beforeBoss ? 'Boss前休整' : node.kind === 'event' ? '进入后揭晓' : '安全节点';
  if (node.kind === 'boss' && node.floor === 3) return '最终挑战 · 成功即通关';
  const config = node.rewardConfig;
  const attributes = Object.values(weatherLabels).filter(label => config.baseAttributes[label.attribute] > 0)
    .map(label => `${label.name}适应 ${config.baseAttributes[label.attribute]}`).join(' · ');
  return `基准 ${config.baseGold}金币 · ${attributes}`;
}

function overview(run: RunState) {
  return `<div class="run-overview"><span>生命 <b>${run.currentHP} / ${run.maxHP}</b></span><span>金币 <b>${run.gold}</b></span><span>牌组 <b>${run.deck.length}</b></span><span>遗物 <b>${run.relics.length}</b></span><span>队伍 ${run.party.map(member => characters[member.key]?.name ?? member.key).join('、')}</span><div class="run-attributes">${Object.values(weatherLabels).map(label => `<span>${label.icon} ${label.name}适应 <b>${run.attributes[label.attribute]}</b></span>`).join('')}</div></div>`;
}

function header(run: RunState, title: string) {
  const battles = run.completedNodes.filter(id => isBattleNode(run.mapNodes.find(node => node.id === id)!)).length;
  return `<header class="run-header"><div><span class="run-kicker">简单尖塔</span><h1>${title}</h1><p>第${run.currentFloor}层 · 已完成 ${battles} / 22 战</p></div><nav><button data-action="new-run">重新开局</button><button data-action="exit-run">返回试战</button></nav></header>${overview(run)}`;
}

export function runMap(run: RunState, floor: number, selectedId?: string): string {
  const current = currentNode(run), nodes = run.mapNodes.filter(node => node.floor === floor);
  const selected = nodes.find(node => node.id === selectedId) ?? nodes.find(node => node.id === current.id) ?? nodes[0];
  const done = run.completedNodes.includes(selected.id), here = selected.id === current.id;
  const action = run.runStatus === 'map' && here && !done ? `<button class="primary" data-action="run-enter" data-node-id="${selected.id}">进入${nodeLabels[selected.kind]}</button>`
    : run.runStatus !== 'map' ? `<button data-action="run-return">${run.runStatus==='battle'?'返回战斗':run.runStatus==='safe'?'返回当前节点':'返回结算'}</button>`
    : `<p class="node-lock">${done?'此节点已完成':'尚未到达此节点'}</p><button data-action="map-current">回到当前节点</button>`;
  return `<section class="run-screen" aria-label="线性地图">${header(run, '三层旅程')}<nav class="floor-tabs" aria-label="查看楼层">${[1, 2, 3].map(value => `<button data-map-floor="${value}" aria-pressed="${floor===value}">第${value}层 <small>${floorBattleCounts[value-1]}战 · ${run.mapNodes.filter(node=>node.floor===value&&!isBattleNode(node)).length}节点</small></button>`).join('')}</nav><div class="map-layout"><ol class="map-route" aria-label="第${floor}层路线">${nodes.map(node => {
    const complete = run.completedNodes.includes(node.id), active = node.id === current.id;
    return `<li class="map-stop ${complete?'complete':active?'current':'future'}"><button class="map-node ${selected.id===node.id?'selected':''}" data-map-node="${node.id}" ${active?'aria-current="step"':''} aria-label="${isBattleNode(node)?`第${node.battleIndex}战 `:''}${nodeLabels[node.kind]} ${complete?'已完成':active?'当前节点':'未到达'}"><span class="node-icon">${complete?'✓':nodeIcons[node.kind]}</span><span><b>${nodeLabels[node.kind]}${isBattleNode(node)?` · ${node.battleIndex}/${floorBattleCounts[floor-1]}`:''}</b><small>${rewardText(node)}</small></span><em>${complete?'已完成':active?'当前':'查看'}</em></button></li>`;
  }).join('')}</ol><aside class="node-detail" aria-label="节点详情"><span class="run-kicker">第${selected.floor}层${isBattleNode(selected)?` · 第${selected.battleIndex}战`:''}</span><h2>${nodeIcons[selected.kind]} ${nodeLabels[selected.kind]}</h2><p>${rewardText(selected)}</p>${isBattleNode(selected)?`<p>${selected.kind==='boss'?'接触时按累计输出结算':'评分越高，金币与适应奖励越高'}。<br>本层每项适应上限 ${selected.rewardConfig.attributeCap}。</p>`:''}${action}</aside></div></section>`;
}

export function safeNodeScreen(run: RunState): string {
  const node = currentNode(run);
  const copy = { shop: '商人暂未带来可以出售的货物。', campfire: '篝火安静地燃烧着。', event: '林间风声渐歇，旅途没有发生额外变化。' };
  const text = isBattleNode(node) ? '' : copy[node.kind];
  return `<section class="run-screen safe-screen" aria-label="安全节点">${header(run, node.kind==='event'?'林间空地':nodeLabels[node.kind])}<div class="safe-scene"><span class="safe-icon">${nodeIcons[node.kind]}</span><h2>${node.kind==='event'?'林间空地':nodeLabels[node.kind]}</h2><p>${text}</p><div><button data-action="run-map">查看地图</button><button class="primary" data-action="safe-leave" data-node-id="${node.id}">继续前进</button></div></div></section>`;
}

export function runInspector(run: RunState) {
  const escaped = JSON.stringify(run, null, 2).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return `<details class="run-inspector"><summary>单局记录</summary><pre>${escaped}</pre></details>`;
}
