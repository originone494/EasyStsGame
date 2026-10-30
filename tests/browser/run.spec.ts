import { expect, test, type Page } from '@playwright/test';

async function record(page: Page) { return JSON.parse((await page.locator('.run-inspector pre').textContent())!); }
async function enter(page: Page) { await page.locator('[data-action="run-enter"]').click(); }
async function routeCard(page: Page) { await page.locator('.hand .card-debugRoute').click(); await page.keyboard.press('Enter'); }

test('原战斗可开始冒险，地图精简后点击当前节点进入，未来节点不能跳关', async ({ page }) => {
  await page.goto('/?seed=157&debug=events');
  await page.getByRole('button', { name: '开始冒险' }).click();
  await expect(page.locator('.run-screen')).toHaveAttribute('aria-label', '线性地图');
  await expect(page.locator('.map-screen h1, .floor-tabs, .map-direction, .node-detail, .map-legend')).toHaveCount(0);
  const before = await record(page); expect(before.mapNodes).toHaveLength(40); expect(before.deck).toHaveLength(7);
  await expect(page.locator('.map-node')).toHaveCount(16);
  const future = page.locator('[data-map-node="f1-boss"]');
  await expect(future).toHaveAttribute('aria-disabled', 'true');
  await future.click({ force: true });
  expect(await record(page)).toEqual(before);
  await expect(page.locator('.map-node[aria-current="step"]')).toHaveAttribute('data-map-node', 'f1-b1');
  await enter(page); await expect(page.getByRole('button', { name: '结束回合 →' })).toBeVisible();
  await expect(page.getByRole('button', { name: '重新开始', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '切换测试战斗' })).toHaveCount(0);
});

test('战斗中查看地图并返回，不改变牌区、生命或随机流', async ({ page }) => {
  await page.goto('/?mode=run&seed=157&debug=events'); await enter(page);
  const before = await record(page);
  await page.getByRole('button', { name: '查看地图' }).click();
  await page.locator('[data-map-node="f1-boss"]').click({ force: true });
  await expect(page.getByRole('button', { name: '返回战斗' })).toBeVisible();
  expect(await record(page)).toEqual(before);
  await page.getByRole('button', { name: '返回战斗' }).click();
  expect(await record(page)).toEqual(before);
  await page.locator('[data-pile="draw"]').click(); await expect(page.locator('.pile-card')).toHaveCount(4);
  await page.getByRole('button', { name: '关闭牌堆查看' }).click();
  expect(await record(page)).toEqual(before);
});

test('完成首战后确认结果只推进一次，已完成节点只能查看', async ({ page }) => {
  await page.goto('/?mode=run&scenario=runRoute&debug=events'); await enter(page); await routeCard(page);
  await expect(page.getByRole('heading', { name: '战斗胜利' })).toBeVisible();
  const pending = await record(page); expect(pending.runStatus).toBe('reward'); expect(pending.gold).toBe(20);
  await expect(page.getByRole('button', { name: '再战一次' })).toHaveCount(0);
  await page.getByRole('button', { name: '返回地图' }).click();
  const after = await record(page); expect(after.gold).toBe(20); expect(after.currentNodeIndex).toBe(1);
  expect(after.rewardHistory).toHaveLength(1);
  await page.locator('[data-map-node="f1-b1"]').click({ force: true });
  await expect(page.locator('[data-map-node="f1-b1"]')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('[data-map-node="f1-b1"]')).not.toHaveAttribute('data-action', 'run-enter');
  expect(await record(page)).toEqual(after);
});

test('普通单局战斗失败结束本局，重新开局清空资产并恢复七张正式牌组', async ({ page }) => {
  await page.goto('/?mode=run&seed=157&debug=events'); await enter(page);
  for (let i = 0; i < 20 && !(await page.getByRole('dialog').count()); i++) await page.getByRole('button', { name: '结束回合 →' }).click();
  // Some all-contact layouts can survive. Keep entering subsequent battles
  // without attacking until the shared health pool is exhausted.
  for (let i = 0; i < 25 && (await record(page)).runStatus !== 'lost'; i++) {
    const run = await record(page);
    if (run.runStatus === 'reward') await page.locator('[data-action="run-ack"]').click();
    else if (run.runStatus === 'map') await enter(page);
    else if (run.runStatus === 'safe') await page.getByRole('button', { name: '继续前进' }).click();
    else await page.getByRole('button', { name: '结束回合 →' }).click();
  }
  await expect(page.getByRole('heading', { name: '本局失败' })).toBeVisible();
  await expect(page.getByRole('button', { name: '再战一次' })).toHaveCount(0);
  const old = await record(page); await page.getByRole('button', { name: '重新开局', exact: true }).click();
  const next = await record(page); expect(next.runId).not.toBe(old.runId); expect(next.currentNodeIndex).toBe(0);
  expect(next.gold).toBe(0); expect(next.currentHP).toBe(20); expect(next.deck).toHaveLength(7);
  expect(next.completedNodes).toEqual([]); expect(next.scenario).toBe('');
});

test('真实界面依次走完40节点22战，跨层保留资产且最终无奖励', async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?mode=run&scenario=runRoute&seed=157&debug=events');
  let battles = 0, safe = 0; const floors: number[] = [];
  for (let i = 0; i < 40; i++) {
    const before = await record(page), node = before.mapNodes[before.currentNodeIndex];
    await enter(page);
    if (['shop', 'campfire', 'event'].includes(node.kind)) {
      safe++;
      await expect(page.locator('.safe-screen')).toBeVisible();
      const entered = await record(page); expect(entered.gold).toBe(before.gold); expect(entered.currentHP).toBe(before.currentHP);
      await page.getByRole('button', { name: '查看地图' }).click();
      await page.getByRole('button', { name: '返回当前节点' }).click();
      await page.getByRole('button', { name: '继续前进' }).click();
    } else {
      battles++; if (node.battleIndex === 1) floors.push(node.floor);
      const entered = await record(page);
      expect(entered.battle.gold).toBe(before.gold); expect(entered.battle.attributes).toEqual(before.attributes);
      expect(entered.battle.player.hp).toBe(before.currentHP); expect(entered.battle.rewardConfig.attributeCap).toBe([50, 100, 200][node.floor - 1]);
      await routeCard(page);
      for (let turn = 0; turn < 7 && !(await page.getByRole('dialog').count()); turn++) await page.getByRole('button', { name: '结束回合 →' }).click();
      const finished = await record(page);
      if (node.kind === 'boss' && node.floor === 3) {
        await expect(page.getByRole('heading', { name: '通关成功' })).toBeVisible();
        expect(finished.gold).toBe(before.gold); expect(finished.attributes).toEqual(before.attributes);
        expect(finished.pendingReward).toBeNull(); await expect(page.locator('.reward-summary')).toHaveCount(0);
      } else {
        const gold = finished.gold; await page.locator('[data-action="run-ack"]').click();
        expect((await record(page)).gold).toBe(gold);
      }
    }
  }
  const completed = await record(page);
  expect(battles).toBe(22); expect(safe).toBe(18); expect(floors).toEqual([1, 2, 3]);
  expect(completed.runStatus).toBe('won'); expect(completed.completedNodes).toHaveLength(40);
  expect(completed.rewardHistory).toHaveLength(21); expect(completed.currentFloor).toBe(3); expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/run-complete.png', animations: 'disabled' });
});

test('从独立测试局面开始冒险不会携带调试卡或已有测试属性', async ({ page }) => {
  await page.goto('/?scenario=weatherSun&debug=events');
  await page.getByRole('button', { name: '开始冒险' }).click();
  const run = await record(page); expect(run.scenario).toBe(''); expect(run.deck).toHaveLength(7);
  expect(run.deck.some((card: { key: string }) => card.key.startsWith('debug'))).toBe(false);
  expect(run.attributes).toEqual({ sunAdaptation: 0, rainAdaptation: 0, windAdaptation: 0 });
  await page.getByRole('button', { name: '返回试战' }).click();
  await expect(page.locator('.hand .card')).toHaveCount(3); expect(page.url()).not.toContain('mode=run');
});

for (const [width, height] of [[640, 720], [800, 600], [1440, 1000]]) {
  test(`${width}×${height}地图铺满可用宽度，可滚动并直接进入当前节点`, async ({ page }) => {
    await page.setViewportSize({ width, height }); await page.goto('/?mode=run&seed=157');
    await expect(page.locator('.run-header')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('.floor-tabs, .node-detail')).toHaveCount(0);
    await page.locator('[data-map-node="f1-boss"]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-map-node="f1-boss"]')).toBeInViewport({ ratio: 1 });
    await page.locator('[data-map-node="f1-boss"]').click({ force: true });
    await page.locator('[data-action="run-enter"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/run-map-${width}.png`, animations: 'disabled' });
    const route = (await page.locator('.map-scroll').boundingBox())!;
    expect(route.width).toBeGreaterThan(width * .9);
    const horizontal = await page.locator('.run-screen').evaluate(element => element.scrollWidth - element.clientWidth);
    expect(horizontal).toBeLessThanOrEqual(1);
    await enter(page); await expect(page.getByRole('button', { name: '结束回合 →' })).toBeVisible();
    expect(await page.locator('.battlefield-track').evaluate(element => element.scrollLeft)).toBe(0);
  });
}
