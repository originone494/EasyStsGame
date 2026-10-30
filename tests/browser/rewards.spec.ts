import { expect, test, type Page } from '@playwright/test';

async function record(page: Page) { return JSON.parse((await page.locator('.event-inspector pre').textContent())!); }
async function finishFixture(page: Page, scenario: string) {
  await page.goto(`/?scenario=${scenario}&debug=events`);
  await expect(page.locator('.score-status b')).toHaveText('0%');
  if (await page.locator('.card-debugScoreKill').count()) {
    await page.locator('.card-debugScoreKill').click(); await page.locator('[data-target="1"]').click();
  }
  if (await page.locator('.card-debugScoreChip').count()) {
    await expect(page.locator('.score-status b')).toHaveText('50%');
    await page.locator('.card-debugScoreChip').click(); await page.locator('[data-target="2"]').click();
    await expect(page.locator('.score-status b')).toHaveText('75%');
  }
  if (!(await page.getByRole('dialog').count())) await page.getByRole('button', { name: '结束回合 →' }).click();
}

for (const [scenario, score, ratio, gold, points] of [
  ['scoreZero', 0, 20, 4, 1], ['scoreHalf', 50, 60, 12, 3],
  ['scoreSeventyFive', 75, 80, 16, 4], ['scoreFull', 100, 100, 20, 5],
] as const) {
  test(`${score}%评分展示${ratio}%奖励，获得${gold}金币及${points}点适应`, async ({ page }) => {
    await finishFixture(page, scenario);
    await expect(page.getByRole('heading', { name: '战斗胜利' })).toBeVisible();
    await expect(page.locator('.result-score strong')).toHaveText(`${score}%`);
    await expect(page.locator('.reward-ratio')).toHaveText(`奖励比例 ${ratio}%`);
    await expect(page.locator('.reward-gold b')).toHaveText(`+${gold}`);
    await expect(page.locator('.reward-attribute b')).toHaveText(`+${points}`);
    expect((await record(page)).gold).toBe(gold);
    await expect(page.getByRole('button', { name: '继续战斗' })).toHaveCount(0);
    await page.getByRole('button', { name: '再战一次' }).click();
    await expect(page.locator('.gold-status b')).toHaveText('0');
    await expect(page.locator('.score-status b')).toHaveText('0%');
  });
}

test('属性上限明确展示实际增长和溢出，金币照常获得', async ({ page }) => {
  await finishFixture(page, 'scoreCap');
  await expect(page.locator('.reward-attribute b')).toHaveText('+1');
  await expect(page.locator('.reward-attribute small')).toHaveText('已达上限50，4点溢出');
  await expect(page.locator('.reward-gold b')).toHaveText('+20');
  expect((await record(page)).attributes.sunAdaptation).toBe(50);
});

test('接触致死显示失败和零奖励，保留重开入口', async ({ page }) => {
  await finishFixture(page, 'scoreDefeat');
  await expect(page.getByRole('heading', { name: '战斗失败' })).toBeVisible();
  await expect(page.getByText('本场未获得奖励')).toBeVisible();
  await expect(page.locator('.reward-summary')).toHaveCount(0);
  expect((await record(page)).gold).toBe(0);
  await page.getByRole('button', { name: '再战一次' }).click();
  await expect(page.getByRole('button', { name: '结束回合 →' })).toBeVisible();
});

async function winNormalBattle(page: Page) {
  for (let turn = 0; turn < 15; turn++) {
    if (await page.getByRole('dialog').count()) break;
    for (let plays = 0; plays < 10; plays++) {
      const card = page.locator('.hand .card').filter({ has: page.locator('h3', { hasText: /^(基础攻击|连击|整备)$/ }) }).first();
      if (!(await card.count())) break;
      const prepare = (await card.locator('h3').innerText()) === '整备';
      await card.click();
      if (prepare) {
        const box = (await page.locator('.arena').boundingBox())!;
        await page.mouse.click(box.width * .27, box.height * .22);
      } else {
        const target = await page.locator('.battlefield').evaluate(element => {
          const cells = [...element.children], player = cells.findIndex(cell => cell.classList.contains('player-cell'));
          return cells.map((cell, index) => ({ button: cell.querySelector<HTMLButtonElement>('[data-target]'), distance: Math.abs(index - player) }))
            .filter(item => item.button).sort((a, b) => a.distance - b.distance)[0]?.button?.dataset.target;
        });
        await page.locator(`[data-target="${target}"]`).click();
      }
      if (await page.getByRole('dialog').count()) break;
    }
    if (await page.getByRole('dialog').count()) break;
    await page.getByRole('button', { name: '结束回合 →' }).click();
  }
  await expect(page.getByRole('heading', { name: '战斗胜利' })).toBeVisible();
}

test('正常胜利继续携带成长，重开恢复本场开局，独立切换恢复初始值', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?seed=157&debug=events');
  await winNormalBattle(page);
  const won = await record(page);
  const wonHp = await page.locator('.health-track').getAttribute('aria-valuenow');
  expect(won.gold).toBeGreaterThan(0); expect(won.attributes.sunAdaptation).toBeGreaterThan(0);
  await page.getByRole('button', { name: '继续战斗' }).click();
  const continued = await record(page);
  expect(continued.gold).toBe(won.gold); expect(continued.attributes).toEqual(won.attributes);
  await expect(page.getByRole('progressbar', { name: '生命' })).toHaveAttribute('aria-valuenow', wonHp!);
  expect(continued.reward).toBeNull();
  await expect(page.locator('.enemy')).toHaveCount(3);
  await expect(page.locator('.gold-status b')).toHaveText(String(won.gold));
  await expect(page.locator('.score-status b')).toHaveText('0%');
  await page.getByRole('button', { name: '结束回合 →' }).click();
  await page.getByRole('button', { name: '重新开始', exact: true }).click();
  expect(await record(page)).toEqual(continued);
  await page.getByRole('button', { name: '切换测试战斗', exact: true }).click();
  const switched = await record(page);
  expect(switched.gold).toBe(0);
  expect(switched.attributes).toEqual({ sunAdaptation: 0, rainAdaptation: 0, windAdaptation: 0 });
  expect(errors).toEqual([]);
});

for (const [width, height] of [[640, 720], [800, 600], [1440, 1000]]) {
  test(`${width}×${height}评分和金币完整可见，奖励与结果按钮可操作`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/?scenario=scoreCap');
    const selectors = ['.gold-status', '.score-status', '.weather-status', '.health-track', '.game-header nav'];
    const boxes = [];
    for (const selector of selectors) {
      await expect(page.locator(selector)).toBeInViewport({ ratio: 1 });
      boxes.push((await page.locator(selector).boundingBox())!);
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      expect(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y).toBe(false);
    }
    await page.locator('.card-debugScoreKill').click(); await page.locator('[data-target="1"]').click();
    await expect(page.locator('.reward-attribute')).toBeInViewport({ ratio: 1 });
    await page.getByRole('button', { name: '再战一次' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/rewards-${width}.png`, fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: '再战一次' }).click();
    await expect(page.locator('.score-status b')).toHaveText('0%');
    expect(await page.locator('.battlefield-track').evaluate(element => element.scrollLeft)).toBe(0);
  });
}
