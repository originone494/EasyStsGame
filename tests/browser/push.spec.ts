import { expect, test, type Page } from '@playwright/test';

async function play(page: Page, scenario: string) {
  await page.goto(`/?scenario=${scenario}&debug=events`);
  await page.locator('.hand .card').focus();
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
}
async function log(page: Page) { return JSON.parse((await page.locator('.event-inspector pre').textContent())!); }
async function positions(page: Page) {
  return page.locator('.enemy').evaluateAll(elements => elements.map(element => [
    Number((element as HTMLElement).dataset.target), Number(element.closest('.cell')!.querySelector('.coordinate')!.textContent),
  ]).sort((a, b) => a[0] - b[0]));
}

test('同向目标累加剩余位移，边界消除超出部分且不伤血', async ({ page }) => {
  await play(page, 'pushTogether');
  expect(await positions(page)).toEqual([[1, 8], [2, 12]]);
  await expect(page.locator('.health-track')).toHaveAttribute('aria-valuenow', '20');
  await expect(page.locator('[data-target="1"] .hp-label')).toContainText('6/6');
  await expect(page.locator('[data-target="2"] .hp-label')).toContainText('10/10');
  const record = await log(page);
  expect(record.pushes[0]).toMatchObject({ initial: 4, moved: 3, boundaryLost: 1, remaining: 0 });
  expect(record.events.filter((event: { type: string }) => event.type === 'COLLISION')).toHaveLength(1);
  expect(record.queue).toEqual([]);
});

test('双侧敌人同拍向外移动，无重叠或额外碰撞', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await play(page, 'pushSplit');
  expect(await positions(page)).toEqual([[1, 1], [2, 11]]);
  const record = await log(page);
  expect(record.pushes[0]).toMatchObject({ initial: 4, moved: 4, canceled: 0, boundaryLost: 0 });
  expect(record.events.filter((event: { type: string }) => event.type === 'COLLISION')).toEqual([]);
  await page.screenshot({ path: 'test-results/push-split.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('反向争格抵消等量，净余继续传递，不穿越敌人', async ({ page }) => {
  await play(page, 'pushOpposed');
  expect(await positions(page)).toEqual([[1, 6], [2, 8]]);
  const record = await log(page);
  expect(record.pushes[0]).toMatchObject({ initial: 4, moved: 2, canceled: 2 });
  expect(record.events.filter((event: { type: string }) => event.type === 'COLLISION')
    .map((event: { push: { mode: string; tick: number }; value: number }) => [event.push.mode, event.push.tick, event.value]))
    .toEqual([['converge', 1, 4], ['transfer', 2, 1]]);
  expect(record.phase).toBe('player');
});

test('等量争格双方停止且正常交还操作，没有重叠和虚假移动', async ({ page }) => {
  await play(page, 'pushClash');
  expect(await positions(page)).toEqual([[1, 5], [2, 7]]);
  const record = await log(page);
  expect(record.pushes[0]).toMatchObject({ initial: 4, moved: 0, canceled: 4 });
  expect(record.events.filter((event: { type: string }) => event.type === 'UNIT_MOVED')).toEqual([]);
  await expect(page.getByRole('button', { name: '结束回合 →' })).toBeEnabled();
});

test('同位置碰撞按参与者编号排序，每个碰撞分别触发一次', async ({ page }) => {
  await play(page, 'pushSandwich');
  expect(await positions(page)).toEqual([[1, 4], [2, 5], [3, 6]]);
  await expect(page.locator('.health-track')).toHaveAttribute('aria-valuenow', '9');
  const record = await log(page);
  expect(record.listeners[0].totalTriggers).toBe(2);
  expect(record.events.filter((event: { type: string }) => event.type === 'COLLISION')
    .map((event: { actor: { id: number }; target: { id: number }; push: { position: number } }) => [event.push.position, event.actor.id, event.target.id]))
    .toEqual([[5, 1, 2], [5, 3, 2]]);
  expect(record.events.some((event: { type: string }) => event.type === 'DAMAGE_RESOLVED')).toBe(false);
});

test('多级同向传递合并同拍接触，正确累加自己的剩余量', async ({ page }) => {
  await play(page, 'pushChain');
  expect(await positions(page)).toEqual([[1, 8], [2, 9], [3, 12]]);
  const record = await log(page);
  expect(record.pushes[0]).toMatchObject({ initial: 3, moved: 2, boundaryLost: 1 });
  expect(record.events.filter((event: { type: string }) => event.type === 'COLLISION')
    .map((event: { actor: { id: number }; target: { id: number }; value: number }) => [event.actor.id, event.target.id, event.value]))
    .toEqual([[1, 2, 2], [2, 3, 3]]);
});

test('两侧边界阻挡不伪造怪物碰撞，重新开始会清空位移账本', async ({ page }) => {
  await play(page, 'pushLimits');
  expect(await positions(page)).toEqual([[1, 0], [2, 12]]);
  const record = await log(page);
  expect(record.pushes[0]).toMatchObject({ initial: 4, moved: 0, boundaryLost: 4 });
  expect(record.events.map((event: { type: string }) => event.type)).toEqual(['CARD_PLAYED']);
  await page.getByRole('button', { name: '重新开始', exact: true }).click();
  expect((await log(page)).pushes).toEqual([]);
  await expect(page.locator('.hand .card')).toHaveCount(1);
});
