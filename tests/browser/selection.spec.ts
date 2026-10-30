import { expect, test, type Page } from '@playwright/test';

const url = '/?mode=run&scenario=rewardRecruitment&seed=157&debug=events';
async function record(page: Page) { return JSON.parse((await page.locator('.run-inspector pre').textContent())!); }
async function win(page: Page, node: string) {
  await page.locator(`[data-map-node="${node}"]`).click();
  await page.locator('.hand .card-debugRoute').click(); await page.keyboard.press('Enter');
  for (let turn = 0; turn < 10 && (await record(page)).runStatus === 'battle'; turn++) {
    await page.getByRole('button', { name: '结束回合 →' }).click();
  }
}
async function recruit(page: Page) {
  await expect(page.locator('.recruitment-screen')).toBeVisible();
  const before = await record(page), key = before.pendingRecruitment.candidates[0];
  await expect(page.locator('[data-action="recruit-pick"]')).toHaveCount(before.pendingRecruitment.candidates.length);
  await page.locator('[data-action="recruit-pick"]').first().click();
  for (let round = 0; round < 3; round++) {
    const state = await record(page);
    expect(state.pendingRecruitment.characterKey).toBe(key); expect(state.pendingRecruitment.round).toBe(round);
    await expect(page.locator('[data-action="reward-skip"], [data-action="run-ack"]')).toHaveCount(0);
    await page.locator('[data-action="recruit-card"]').first().click();
  }
  const after = await record(page);
  expect(after.deck.length).toBe(before.deck.length + 3); expect(after.party.length).toBe(before.party.length + 1);
  expect(after.currentHP).toBe(before.currentHP); expect(after.maxHP).toBe(before.maxHP);
  expect(after.currentFloor).toBe(before.currentFloor + 1);
}

test('普通战可实际三选一，选择前不能继续，所选卡跨战保留且不会重复领取', async ({ page }) => {
  await page.goto(url); await win(page, 'f1-b1');
  const before = await record(page);
  await expect(page.locator('[data-action="reward-pick"]')).toHaveCount(3);
  await expect(page.locator('[data-action="run-ack"]')).toBeDisabled();
  expect(new Set(before.pendingReward.cardSelection.candidates).size).toBe(3);
  const key = before.pendingReward.cardSelection.candidates[0];
  await page.locator('[data-action="reward-pick"]').first().click();
  const selected = await record(page); expect(selected.deck.length).toBe(before.deck.length + 1);
  expect(selected.deck.at(-1).key).toBe(key); expect(selected.pendingReward.cardSelection.status).toBe('picked');
  await expect(page.locator('[data-action="reward-pick"]')).toHaveCount(0);
  await expect(page.locator('[data-action="run-ack"]')).toBeEnabled();
  await page.locator('[data-action="run-ack"]').click();
  await page.locator('[data-map-node="f1-b2"]').click();
  const next = await record(page); expect(next.battle.deck).toEqual(selected.deck); expect(next.rewardHistory).toHaveLength(1);
});

test('选卡可跳过，同种子重建候选稳定，重新开局回到正常内容', async ({ page }) => {
  await page.goto(url); await win(page, 'f1-b1');
  const first = await record(page);
  await page.reload(); await win(page, 'f1-b1');
  expect((await record(page)).pendingReward.cardSelection.candidates).toEqual(first.pendingReward.cardSelection.candidates);
  await page.locator('[data-action="reward-skip"]').click();
  const skipped = await record(page); expect(skipped.deck).toEqual(first.deck); expect(skipped.pendingReward.cardSelection.status).toBe('skipped');
  await page.locator('[data-action="run-ack"]').click();
  await page.getByRole('button', { name: '重新开局', exact: true }).click();
  const normal = await record(page);
  expect(normal.progressionId).toBeNull(); expect(normal.party).toEqual([{ id: 0, key: 'wanderer' }]);
  expect(normal.deck).toHaveLength(7); expect(normal.deck.some((card: { key: string }) => card.key.startsWith('selectionFixture'))).toBe(false);
  expect(page.url()).not.toContain('rewardRecruitment');
});

test('Boss先选旧队伍稀有卡，再招募三轮，两次招募达到3人，最终Boss无奖励或招募', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  for (const floor of [1, 2]) {
    await win(page, `f${floor}-boss`);
    const pending = await record(page);
    await expect(page.locator('.selection-rarity')).toHaveText(['稀有', '稀有', '稀有']);
    expect(pending.pendingReward.cardSelection.candidates.every((key: string) => pending.party.some((member: { key: string }) => key.startsWith(member.key)))).toBe(true);
    await expect(page.locator('[data-earned-relic]')).toHaveCount(1);
    expect(pending.relics.length).toBe(2 * floor);
    await page.locator('[data-action="reward-skip"]').click(); await page.locator('[data-action="run-ack"]').click();
    await recruit(page);
    expect((await record(page)).party.length).toBe(floor + 1);
  }
  const before = await record(page); expect(before.relics).toHaveLength(5);
  await win(page, 'f3-boss');
  await expect(page.getByRole('heading', { name: '通关成功' })).toBeVisible();
  await expect(page.locator('.reward-selection, .recruitment-screen, [data-earned-relic]')).toHaveCount(0);
  const final = await record(page);
  expect(final.runStatus).toBe('won'); expect(final.party).toHaveLength(3); expect(final.gold).toBe(before.gold);
  expect(final.relics).toEqual(before.relics); expect(final.deck).toEqual(before.deck); expect(errors).toEqual([]);
});

for (const [width, height] of [[640, 720], [1440, 1000]]) {
  test(`${width}×${height}选卡与招募卡面清晰，界面可滚动且无横向溢出`, async ({ page }) => {
    await page.setViewportSize({ width, height }); await page.goto(url); await win(page, 'f1-boss');
    await page.screenshot({ path: `test-results/selection-reward-${width}.png`, animations: 'disabled' });
    await expect(page.locator('[data-action="reward-pick"]')).toHaveCount(3);
    const overflow = await page.locator('.result').evaluate(element => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.locator('[data-action="reward-pick"]').last().click(); await page.locator('[data-action="run-ack"]').click();
    await page.screenshot({ path: `test-results/selection-recruit-${width}.png`, animations: 'disabled' });
    const screen = await page.locator('.recruitment-screen').evaluate(element => element.scrollWidth - element.clientWidth);
    expect(screen).toBeLessThanOrEqual(1);
    await page.locator('[data-action="recruit-pick"]').last().click();
    await expect(page.getByRole('heading', { name: /选卡 1\/3/ })).toBeVisible();
    await page.screenshot({ path: `test-results/selection-round-${width}.png`, animations: 'disabled' });
    for (let round = 0; round < 3; round++) await page.locator('[data-action="recruit-card"]').first().click();
    expect((await record(page)).currentFloor).toBe(2);
  });
}
