import { expect, test, type Page } from '@playwright/test';

async function record(page: Page) { return JSON.parse((await page.locator('.event-inspector pre').textContent())!); }
async function end(page: Page) { await page.getByRole('button', { name: '结束回合 →' }).click(); }
async function play(page: Page, key: string, target = 1) {
  await page.locator(`.hand .card-${key}`).click(); await page.locator(`[data-target="${target}"]`).click();
}

for (const [scenario, damage, title, gold] of [
  ['boss99', 99, '挑战失败', 0], ['boss100', 100, '挑战成功', 100], ['boss600', 600, '挑战成功', 500],
] as const) {
  test(`${damage}%接触：${title}，金币${gold}，队伍生命不变`, async ({ page }) => {
    await page.goto(`/?scenario=${scenario}&debug=events`);
    await expect(page.getByRole('status', { name: 'Boss输出' }).locator('b')).toHaveText(`${damage}%`);
    await expect(page.locator('.enemy.boss .intent')).toHaveAttribute('title', /接触时立即结算/);
    await expect(page.locator('.enemy.boss .intent span')).toHaveText('结算');
    await end(page);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.locator('.result-score strong')).toHaveText(`${damage}%`);
    await expect(page.getByText(/剩余生命 20\/20/)).toBeVisible();
    const state = await record(page);
    expect(state.boss.hasContactedPlayer).toBe(true); expect(state.boss.accumulatedDamage).toBe(damage);
    expect(state.gold).toBe(gold); expect(state.queue).toEqual([]);
    expect(state.events.some((event: { type: string }) => ['DAMAGE_RESOLVED', 'HP_LOST'].includes(event.type))).toBe(false);
    await expect(page.getByRole('button', { name: '再战一次' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '继续战斗' })).toHaveCount(0);
    if (damage === 600) {
      await expect(page.locator('.reward-ratio')).toHaveText('奖励比例 500% · 已达5倍上限');
      await expect(page.locator('.reward-attribute')).toHaveCount(3);
      await expect(page.locator('.reward-attribute b')).toHaveText(['+5', '+5', '+5']);
      await expect(page.locator('.reward-attribute small')).toHaveText(Array(3).fill('已达上限100，45点溢出'));
    }
    await page.getByRole('button', { name: '重新开局', exact: true }).click();
    expect((await record(page)).boss).toBeNull(); expect((await record(page)).gold).toBe(0);
    expect((await record(page)).attributes).toEqual({ sunAdaptation: 0, rainAdaptation: 0, windAdaptation: 0 });
    await expect(page.locator('.hand .card')).toHaveCount(3);
    expect(page.url()).not.toMatch(/scenario=|battle=|floor=/);
  });
}

test('110%后仍能选择0生命Boss并攻击，接触才结算120%奖励', async ({ page }) => {
  await page.goto('/?scenario=boss110&debug=events');
  await expect(page.locator('.boss-threshold')).toContainText('已达标');
  await play(page, 'debugScoreKill');
  await expect(page.locator('.score-status b')).toHaveText('120%');
  await expect(page.locator('.enemy.boss .hp-label')).toContainText('120/100');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const active = await record(page);
  expect(active.boss.accumulatedDamage).toBe(120); expect(active.reward).toBeNull();
  expect(active.events.filter((event: { type: string }) => event.type === 'HP_LOST' || event.type === 'ENEMY_DIED')).toEqual([]);
  for (let i = 0; i < 3; i++) await end(page);
  await expect(page.getByRole('heading', { name: '挑战成功' })).toBeVisible();
  await expect(page.locator('.reward-gold b')).toHaveText('+120');
  await expect(page.locator('.reward-attribute b')).toHaveText(['+12', '+12', '+12']);
});

test('三段攻击跨100%后不中断，生命减少只记录1点且没有Boss死亡', async ({ page }) => {
  await page.goto('/?scenario=bossMulti&debug=events');
  await play(page, 'combo');
  await expect(page.locator('.score-status b')).toHaveText('105%');
  await expect(page.locator('.enemy.boss')).toHaveCount(1);
  const state = await record(page);
  expect(state.events.filter((event: { type: string }) => event.type === 'DAMAGE_RESOLVED')
    .map((event: { damage: { hpLost: number } }) => event.damage.hpLost)).toEqual([1, 0, 0]);
  expect(state.events.filter((event: { type: string }) => event.type === 'HP_LOST').map((event: { value: number }) => event.value)).toEqual([1]);
  expect(state.events.some((event: { type: string }) => event.type === 'ENEMY_DIED')).toBe(false);
});

test('完整击退2格后Boss在第3回合接触，期间战斗继续', async ({ page }) => {
  await page.goto('/?scenario=bossPush&debug=events');
  await play(page, 'push');
  await expect(page.locator('.cell').nth(9).locator('.enemy.boss')).toBeVisible();
  for (let i = 0; i < 2; i++) { await end(page); await expect(page.getByRole('dialog')).toHaveCount(0); }
  await expect(page.locator('.cell').nth(7).locator('.enemy.boss')).toBeVisible();
  await end(page);
  await expect(page.getByRole('heading', { name: '挑战成功' })).toBeVisible();
  await expect(page.locator('.result-stats')).toContainText('3 回合');
});

test('群伤杀死全部小怪后继续挑战，只把Boss自身伤害计入输出', async ({ page }) => {
  await page.goto('/?scenario=bossMixed&debug=events');
  await page.locator('.card-debugWave').click(); await page.keyboard.press('Enter');
  await expect(page.locator('.enemy')).toHaveCount(1);
  await expect(page.locator('.score-status b')).toHaveText('4%');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const state = await record(page);
  expect(state.events.filter((event: { type: string }) => event.type === 'ENEMY_DIED').map((event: { target: { id: number } }) => event.target.id)).toEqual([2]);
  await end(page); await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('小怪接触消失不结束Boss战，生命正常扣除且输出评分不变', async ({ page }) => {
  await page.goto('/?scenario=bossMinionContact&debug=events'); await end(page);
  await expect(page.getByRole('progressbar', { name: '生命' })).toHaveAttribute('aria-valuenow', '18');
  await expect(page.locator('.enemy')).toHaveCount(1); await expect(page.locator('.score-status b')).toHaveText('110%');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('第三层600%接触直接通关，不展示或发放任何奖励', async ({ page }) => {
  await page.goto('/?scenario=bossFinal&debug=events'); await end(page);
  await expect(page.getByRole('heading', { name: '通关成功' })).toBeVisible();
  await expect(page.locator('.result-score strong')).toHaveText('600%');
  await expect(page.locator('.reward-summary, .reward-none')).toHaveCount(0);
  const state = await record(page);
  expect(state.gold).toBe(0); expect(state.reward).toMatchObject({ eligible: false, cardOffer: null, relicOffer: null });
  await expect(page.getByRole('button', { name: '继续战斗' })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/boss-final.png', animations: 'disabled' });
});

test('Boss接触前生命代价致死，已达标仍失败且后续治疗取消', async ({ page }) => {
  await page.goto('/?scenario=bossLethal&debug=events');
  await page.locator('.card-debugCost').click(); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '挑战失败' })).toBeVisible();
  await expect(page.locator('.reward-none')).toHaveText('队伍生命归零，本次挑战结束');
  const state = await record(page);
  expect(state.boss.hasContactedPlayer).toBe(false); expect(state.gold).toBe(0);
  expect(state.events.some((event: { type: string }) => event.type === 'HEALED')).toBe(false);
});

test('七张普通牌组可独立进入指定楼层Boss，仍可查看牌堆且无测试卡', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?battle=boss&floor=2&seed=157&debug=events');
  await expect(page.locator('.enemy.boss')).toHaveCount(1); await expect(page.locator('.score-status b')).toHaveText('0%');
  expect((await record(page)).rewardConfig.floor).toBe(2);
  expect(await page.locator('.hand').innerText()).not.toContain('测试');
  await page.locator('[data-pile="draw"]').click(); await expect(page.locator('.pile-card')).toHaveCount(4);
  await page.getByRole('button', { name: '关闭牌堆查看' }).click();
  await play(page, 'strike'); await expect(page.locator('.score-status b')).toHaveText('4%');
  await page.getByRole('button', { name: '重新开局', exact: true }).click();
  expect((await record(page)).boss).toBeNull(); expect(errors).toEqual([]);
});

for (const [width, height] of [[640, 720], [800, 600], [1440, 1000]]) {
  test(`${width}×${height}Boss输出与操作可见，三项奖励结果可滚动查看`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/?scenario=boss600');
    for (const selector of ['.score-status', '.health-track', '.weather-status', '.enemy.boss', '.game-header nav']) {
      await expect(page.locator(selector)).toBeInViewport({ ratio: 1 });
    }
    await page.screenshot({ path: `test-results/boss-active-${width}.png`, animations: 'disabled' });
    await end(page);
    await expect(page.getByRole('heading', { name: '挑战成功' })).toBeVisible();
    await page.locator('.reward-attribute').last().scrollIntoViewIfNeeded();
    await expect(page.locator('.reward-attribute').last()).toBeInViewport({ ratio: 1 });
    await page.getByRole('button', { name: '重新开局', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/boss-rewards-${width}.png`, animations: 'disabled' });
    await page.getByRole('button', { name: '重新开局', exact: true }).click();
    await expect(page.locator('.enemy')).toHaveCount(2);
    expect(await page.locator('.battlefield-track').evaluate(element => element.scrollLeft)).toBe(0);
  });
}
