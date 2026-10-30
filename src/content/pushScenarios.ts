// Fixed development fixtures, not formal encounters or new starter cards.
interface PushFixture {
  name: string; player: number; card: string;
  units: { id: number; kind: string; position: number }[];
  hp?: number; collisionHeal?: boolean;
}
export const pushFixtures: Record<string, PushFixture> = {
  pushTogether: { name: '同向剩余量累加', player: 6, card: 'debugPushAll', units: [{ id: 1, kind: 'crawler', position: 8 }, { id: 2, kind: 'brute', position: 9 }] },
  pushSplit: { name: '双侧同步向外击退', player: 6, card: 'debugPushAll', units: [{ id: 1, kind: 'crawler', position: 3 }, { id: 2, kind: 'brute', position: 9 }] },
  pushOpposed: { name: '反向净余继续', player: 1, card: 'debugPushOpposed', units: [{ id: 1, kind: 'crawler', position: 5 }, { id: 2, kind: 'brute', position: 7 }] },
  pushClash: { name: '等量争格停止', player: 1, card: 'debugPushClash', units: [{ id: 1, kind: 'crawler', position: 5 }, { id: 2, kind: 'brute', position: 7 }] },
  pushSandwich: { name: '同位置碰撞排序', player: 1, card: 'debugPushSandwich', hp: 7, collisionHeal: true,
    units: [{ id: 1, kind: 'crawler', position: 4 }, { id: 2, kind: 'brute', position: 5 }, { id: 3, kind: 'crawler', position: 6 }] },
  pushChain: { name: '连续传递合并接触', player: 6, card: 'debugPushChain', units: [{ id: 1, kind: 'crawler', position: 8 }, { id: 2, kind: 'brute', position: 9 }, { id: 3, kind: 'crawler', position: 10 }] },
  pushLimits: { name: '双侧边界消除位移', player: 6, card: 'debugPushAll', units: [{ id: 1, kind: 'crawler', position: 0 }, { id: 2, kind: 'brute', position: 12 }] },
};
