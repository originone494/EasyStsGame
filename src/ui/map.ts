import type { MapNode, RunState } from '../game/model';
import { currentNode } from '../game/run';
import { floorBattleCounts, isBattleNode } from '../game/map';
import { weatherLabels } from '../content/weather';
import { characters } from '../content/characters';
import { mapIcon, mapLandscape } from './mapArt';

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
  const step = 108, height = (nodes.length - 1) * step + 240;
  const offsets = [45, 63, 37, 56, 29, 48, 67, 41, 60, 34];
  const points = nodes.map((node, index) => ({ x: node.kind === 'boss' ? 50 : offsets[(index + floor - 1) % offsets.length], y: height - 120 - index * step }));
  const paths = nodes.slice(0, -1).map((node, index) => {
    const a = points[index], b = points[index + 1];
    const complete = run.completedNodes.includes(node.id);
    return `<path class="map-link ${complete?'traveled':''}" d="M${a.x*6} ${a.y} C${a.x*6} ${a.y-52} ${b.x*6} ${b.y+52} ${b.x*6} ${b.y}"/>`;
  }).join('');
  return `<section class="run-screen map-screen" aria-label="线性地图">${header(run, '三层旅程')}<nav class="floor-tabs" aria-label="查看楼层">${[1, 2, 3].map(value => `<button data-map-floor="${value}" aria-pressed="${floor===value}">第${value}层 <small>${floorBattleCounts[value-1]}战 · ${run.mapNodes.filter(node=>node.floor===value&&!isBattleNode(node)).length}节点</small></button>`).join('')}<span class="map-direction">沿古道向上前行 ↑</span></nav><div class="map-layout"><div class="map-scroll" data-map-floor-view="${floor}" tabindex="0" aria-label="可滚动路线图"><div class="map-parchment" style="height:${height}px">${mapLandscape()}<div class="map-destination">${floor===3?'最后的守望':'林冠之上'}<span>第${floor}层 · Boss挑战</span></div><svg class="map-connections" viewBox="0 0 600 ${height}" preserveAspectRatio="none" aria-hidden="true">${paths}</svg><ol class="map-route" aria-label="第${floor}层路线">${nodes.map((node, index) => {
    const complete = run.completedNodes.includes(node.id), active = node.id === current.id;
    const attribute = isBattleNode(node) && node.kind !== 'boss' ? Object.values(weatherLabels).filter(label => node.rewardConfig.baseAttributes[label.attribute] > 0)
      .map(label => `${label.name}+${node.rewardConfig.baseAttributes[label.attribute]}`).join(' ') : '';
    return `<li class="map-stop ${complete?'complete':active?'current':'future'} kind-${node.kind}" style="left:${points[index].x}%;top:${points[index].y}px"><button class="map-node ${selected.id===node.id?'selected':''}" data-map-node="${node.id}" ${active?'aria-current="step"':''} aria-label="${isBattleNode(node)?`第${node.battleIndex}战 `:''}${nodeLabels[node.kind]} ${complete?'已完成':active?'当前节点':'未到达'}" title="${nodeLabels[node.kind]} · ${rewardText(node)}">${mapIcon(node.kind)}${complete?'<span class="node-complete" aria-hidden="true">✓</span>':''}</button><span class="node-caption" aria-hidden="true">${nodeLabels[node.kind]}${attribute?`<small>${attribute}</small>`:''}</span>${active?'<span class="map-current-marker" aria-hidden="true">当前位置</span>':''}</li>`;
  }).join('')}</ol><div class="map-origin">${mapIcon('campfire')}<span>旅程由此开始</span></div></div></div><aside class="node-detail" aria-label="节点详情"><div class="node-detail-main"><span class="node-state-label">${done?'足迹已留下':here?'当前位置':'前方的旅途'}</span><div class="detail-glyph">${mapIcon(selected.kind)}</div><span class="run-kicker">第${selected.floor}层${isBattleNode(selected)?` · 第${selected.battleIndex}战`:''}</span><h2>${nodeLabels[selected.kind]}</h2><p class="node-reward-preview">${rewardText(selected)}</p>${isBattleNode(selected)?`<p>${selected.kind==='boss'?'接触时按累计输出结算':'评分越高，金币与适应奖励越高'}。<br>本层每项适应上限 ${selected.rewardConfig.attributeCap}。</p>`:''}${action}</div><div class="map-legend" aria-label="地图图例"><h3>沿途标记</h3><div>${(Object.keys(nodeLabels) as MapNode['kind'][]).map(kind=>`<span>${mapIcon(kind)}${nodeLabels[kind]}</span>`).join('')}</div><p>○ 当前　✓ 已通过　· 未到达</p></div></aside></div></section>`;
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
