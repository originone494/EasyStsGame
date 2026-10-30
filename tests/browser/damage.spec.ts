import { expect, test, type Page } from '@playwright/test';

async function log(page: Page) {
  return JSON.parse((await page.locator('.event-inspector pre').textContent())!);
}

test('基础10乘1.2与1.3得到16，详情展示公式与实际扣血', async ({ page }) => {
  await page.goto('/?scenario=damageFormula&debug=events');
  await page.locator('.hand .card-debugFormula').click(); await page.locator('[data-target="1"]').click();
  await expect(page.locator('[data-target="1"] .hp-label')).toContainText('14/30');
  const record = await log(page);
  const damage = record.events.find((event: { type: string }) => event.type === 'DAMAGE_RESOLVED');
  expect(damage.damage).toMatchObject({ base: 10, multipliers: [1.2, 1.3], resolved: 16, hpLost: 16, kind: 'card' });
  expect(record.queue).toEqual([]);
});

test('三段伤害各自向上取整，三条伤害事件和三个独立批次', async ({ page }) => {
  await page.goto('/?scenario=damageMulti&debug=events');
  await page.locator('.hand .card-debugMulti').click(); await page.locator('[data-target="1"]').click();
  await expect(page.locator('[data-target="1"] .hp-label')).toContainText('24/30');
  const record = await log(page);
  const facts = record.events.filter((event: { type: string }) => event.type === 'DAMAGE_RESOLVED');
  expect(facts.map((event: { value: number }) => event.value)).toEqual([2, 2, 2]);
  expect(facts.map((event: { batchId: number }) => event.batchId)).toEqual([1, 2, 3]);
});

test('群体同步击杀完成直接治疗和两次死亡触发再胜利，可重开', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?scenario=damageWave&debug=events');
  await page.locator('.hand .card-debugWave').focus();
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '战斗胜利' })).toBeVisible();
  await expect(page.getByText(/剩余生命 15\/20/)).toBeVisible();
  const record = await log(page);
  expect(record.events.slice(1, 7).map((event: { type: string; target: { id: number } }) => [event.type, event.target.id])).toEqual([
    ['DAMAGE_RESOLVED', 1], ['DAMAGE_RESOLVED', 3], ['HP_LOST', 1], ['HP_LOST', 3], ['ENEMY_DIED', 1], ['ENEMY_DIED', 3],
  ]);
  expect(record.events.slice(1, 7).every((event: { batchId: number }) => event.batchId === 1)).toBe(true);
  expect(record.queue).toEqual([]);
  await page.screenshot({ path: 'test-results/damage-wave-victory.png', fullPage: true });
  await page.getByRole('button', { name: '再战一次' }).click();
  await expect(page.locator('.enemy')).toHaveCount(2);
  await expect(page.locator('.health-track')).toHaveAttribute('aria-valuenow', '7');
  expect(errors).toEqual([]);
});

test('群体只杀死部分目标时战斗继续，存活敌人已扣血且每只死亡分别触发', async ({ page }) => {
  await page.goto('/?scenario=damagePartial&debug=events');
  await page.locator('.hand .card-debugWave').focus();
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  await expect(page.locator('.enemy')).toHaveCount(1);
  await expect(page.locator('[data-target="2"] .hp-label')).toContainText('6/10');
  await expect(page.locator('.health-track')).toHaveAttribute('aria-valuenow', '15');
  await expect(page.getByRole('heading', { name: '战斗胜利' })).toHaveCount(0);
  const record = await log(page);
  expect(record.status).toBe('playing'); expect(record.phase).toBe('player');
  expect(record.listeners[0].totalTriggers).toBe(2);
});

test('card专属倍率只影响直接卡牌伤害，不混入遗物和间接伤害', async ({ page }) => {
  await page.goto('/?scenario=damageKinds&debug=events');
  await page.locator('.hand .card-strike').click(); await page.locator('[data-target="1"]').click();
  await expect(page.locator('[data-target="1"] .hp-label')).toContainText('14/30');
  const record = await log(page);
  expect(record.events.filter((event: { type: string }) => event.type === 'DAMAGE_RESOLVED')
    .map((event: { value: number; damage: { kind: string } }) => [event.value, event.damage.kind])).toEqual([[8, 'card'], [4, 'relic'], [4, 'indirect']]);
  expect(record.queue).toEqual([]);
});
