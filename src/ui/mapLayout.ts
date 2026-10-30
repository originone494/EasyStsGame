import type { MapNode } from '../game/model';
import { nextRandom } from '../game/random';

export interface MapLayout {
  minHeight: number;
  points: { x: number; y: number }[];
}

// Best-candidate sampling spreads points across the paper without visible rows.
// Coordinates describe the usable area; CSS preserves edge/label clearance and
// reserves a separate band above it for the Boss. This RNG belongs to layout only.
export function scatterMapNodes(nodes: MapNode[], seed: number, columns: 2 | 3 | 4): MapLayout {
  const width = { 2: 280, 3: 500, 4: 720 }[columns] - 112;
  const rows = Math.ceil((nodes.length - 1) / columns);
  for (let attempt = 0; attempt < 8; attempt++) {
    const minHeight = 220 + (rows + attempt) * 170, height = minHeight - 245;
    let rng = (seed ^ Math.imul(columns, 0x73636174)) >>> 0;
    const random = () => { rng = nextRandom(rng); return rng / 4294967296; };
    const camp = { x: .56 + random() * .12, y: random() * .025 };
    const occupied: { x: number; y: number }[] = nodes.some(node => 'beforeBoss' in node && node.beforeBoss) ? [camp] : [];
    const points: MapLayout['points'] = [];
    for (const node of nodes) {
      if (node.kind === 'boss') { points.push({ x: .5, y: 0 }); continue; }
      if ('beforeBoss' in node && node.beforeBoss) {
        points.push(camp); continue;
      }
      let best: { x: number; y: number } | undefined, bestScore = -1;
      for (let candidate = 0; candidate < 256; candidate++) {
        const point = { x: random(), y: random() };
        let score = Infinity;
        for (const other of occupied) {
          const dx = Math.abs(point.x - other.x) * width, dy = Math.abs(point.y - other.y) * height;
          // Leave room for the entire icon and its caption, not just its centre.
          if (dx < 116 && dy < 124) { score = -1; break; }
          score = Math.min(score, dx * dx + dy * dy);
        }
        if (score > bestScore) { best = point; bestScore = score; }
      }
      if (!best) break;
      occupied.push(best); points.push(best);
    }
    if (points.length === nodes.length) return { minHeight, points };
  }
  throw new Error('地图空间不足以散布节点。');
}

export function mapPositionStyle(layout: MapLayout, index: number, boss: boolean, suffix = ''): string {
  const point = layout.points[index];
  const left = `calc(${(point.x * 100).toFixed(3)}% + ${((.5 - point.x) * 112).toFixed(3)}px)`;
  // Every non-Boss node is below the Boss, including the nearby extra campfire.
  const top = boss ? '70px' : `calc(${(point.y * 100).toFixed(3)}% + ${(180 - point.y * 245).toFixed(3)}px)`;
  return `--node-left${suffix}:${left};--node-top${suffix}:${top}`;
}
