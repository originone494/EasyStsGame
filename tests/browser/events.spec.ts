import { expect, test } from '@playwright/test';

test('最后击杀完成直接治疗和两级遗物连锁，日志可查且重开清空', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?scenario=events&debug=events');
  await page.locator('.hand .card-debugHeal').click();
  await page.locator('[data-target="1"]').click();
  await expect(page.getByRole('heading', { name: '战斗胜利' })).toBeVisible();
  await expect(page.getByText(/剩余生命 16\/20/)).toBeVisible();
  await page.locator('.event-inspector summary').click();
  await expect(page.locator('.event-inspector pre')).toBeVisible();
  const log = JSON.parse(await page.locator('.event-inspector pre').innerText());
  expect(log.queue).toEqual([]);
  expect(log.finishReason).toBe('last-kill');
  expect(log.events.filter((event: { type: string }) => event.type === 'HEALED').map((event: { value: number }) => event.value)).toEqual([5, 3, 1]);
  expect(log.trace.filter((row: { kind: string }) => row.kind === 'trigger').map((row: { message: string }) => row.message)).toEqual(['余烬（测试）', '回响（测试）']);
  await page.screenshot({ path: 'test-results/events-victory.png', fullPage: true });
  await page.locator('.event-inspector summary').click();
  await page.getByRole('button', { name: '再战一次' }).click();
  await expect(page.locator('.health-track')).toHaveAttribute('aria-valuenow', '7');
  await expect(page.locator('.hand .card')).toHaveCount(1);
  expect(JSON.parse((await page.locator('.event-inspector pre').textContent())!).events).toEqual([]);
  expect(errors).toEqual([]);
});

test('零伤害入队，前序治疗不改变后序遗物的已损生命快照', async ({ page }) => {
  await page.goto('/?scenario=snapshots&debug=events');
  expect(await page.locator('.card-debugZero img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.locator('.hand .card-debugZero').click();
  await page.locator('[data-target="2"]').click();
  await expect(page.locator('.health-track')).toHaveAttribute('aria-valuenow', '10');
  await expect(page.locator('[data-target="2"] .hp-label')).toContainText('15/30');
  const log = JSON.parse((await page.locator('.event-inspector pre').textContent())!);
  expect(log.events.filter((event: { type: string }) => event.type === 'DAMAGE_RESOLVED').map((event: { value: number }) => event.value)).toEqual([0, 15]);
  expect(log.trace.find((row: { kind: string; listenerId: number }) => row.kind === 'snapshot' && row.listenerId === 2).values).toEqual([15]);
  expect(log.queue).toEqual([]);
});

test('生命代价致死立即失败，卡牌和遗物的后续治疗均取消', async ({ page }) => {
  await page.goto('/?scenario=eventLethal&debug=events');
  await page.locator('.hand .card-debugCost').focus();
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '战斗失败' })).toBeVisible();
  await expect(page.getByText(/剩余生命 0\/20/)).toBeVisible();
  const log = JSON.parse((await page.locator('.event-inspector pre').textContent())!);
  expect(log.events.map((event: { type: string }) => event.type)).toEqual(['CARD_PLAYED', 'HP_LOST']);
  expect(log.trace.filter((row: { kind: string }) => row.kind === 'trigger')).toEqual([]);
  expect(log.trace.filter((row: { kind: string }) => row.kind === 'cancel')).toHaveLength(2);
  expect(log.queue).toEqual([]);
});

test('前序遗物杀死目标后，后序攻击跳过但独立治疗继续', async ({ page }) => {
  await page.goto('/?scenario=eventTarget&debug=events');
  await page.locator('.hand .card-debugZero').click();
  await page.locator('[data-target="1"]').click();
  await expect(page.getByRole('heading', { name: '战斗胜利' })).toBeVisible();
  await expect(page.getByText(/剩余生命 9\/20/)).toBeVisible();
  const log = JSON.parse((await page.locator('.event-inspector pre').textContent())!);
  expect(log.trace.some((row: { kind: string }) => row.kind === 'skip')).toBe(true);
  expect(log.events.filter((event: { type: string }) => event.type === 'DAMAGE_RESOLVED')).toHaveLength(2);
});

test('普通战斗界面不显示开发事件日志或测试卡', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.event-inspector')).toHaveCount(0);
  await expect(page.locator('.hand .card-debugZero, .hand .card-debugCost, .hand .card-debugHeal')).toHaveCount(0);
});
