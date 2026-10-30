import { expect, test, type Page } from '@playwright/test';

async function record(page: Page) { return JSON.parse((await page.locator('.event-inspector pre').textContent())!); }
async function playWeatherCard(page: Page) {
  await page.locator('.hand .card').click(); await page.locator('[data-target="1"]').click();
}

for (const [scenario, kind, name, points, remainingHp] of [
  ['weatherSun', 'sun', '晴', 40, 986], ['weatherRain', 'rain', '雨', 20, 988], ['weatherWind', 'wind', '风', 60, 984],
] as const) {
  test(`${name}天气展示图标、倒计时和适应，基础10伤害正确结算`, async ({ page }) => {
    await page.goto(`/?scenario=${scenario}&debug=events`);
    await expect(page.getByRole('status', { name: '天气' })).toHaveAttribute('data-weather', kind);
    await expect(page.locator('.weather-icon')).not.toBeEmpty();
    await expect(page.locator('.weather-name')).toHaveText(name);
    await expect(page.locator('.weather-countdown')).toHaveText('3回合后切换');
    await expect(page.locator('.weather-bonus')).toHaveText(`${name}适应 ${points} · 卡牌直伤 +${points}%`);
    await playWeatherCard(page);
    await expect(page.locator('[data-target="1"] .hp-label')).toContainText(`${remainingHp}/1000`);
    const log = await record(page);
    expect(log.events.find((event: { type: string }) => event.type === 'DAMAGE_RESOLVED').damage.percentBonuses).toEqual([points]);
    expect(log.queue).toEqual([]);
  });
}

test('第4、7、10回合先切换天气，倒计时更新并显示切换浮字', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?scenario=weatherCycle&debug=events');
  const names = ['晴', '晴', '晴', '雨', '雨', '雨', '风', '风', '风', '晴'];
  for (let turn = 1; turn <= 10; turn++) {
    await expect(page.locator('.turn-status strong')).toHaveText(String(turn).padStart(2, '0'));
    await expect(page.locator('.weather-name')).toHaveText(names[turn - 1]);
    await expect(page.locator('.weather-countdown')).toHaveText(`${3 - (turn - 1) % 3}回合后切换`);
    if ([4, 7, 10].includes(turn)) await expect(page.locator('.floating-number.weather')).toContainText(names[turn - 1]);
    if (turn < 10) await page.getByRole('button', { name: '结束回合 →' }).click();
  }
  const log = await record(page);
  expect(log.events.filter((event: { type: string }) => event.type === 'WEATHER_CHANGED')
    .map((event: { weatherChange: { turn: number } }) => event.weatherChange.turn)).toEqual([4, 7, 10]);
  expect(log.weather.current).toBe('sun'); expect(log.queue).toEqual([]);
  expect(errors).toEqual([]);
});

test('40点适应和1.2、1.3独立倍率相乘，最终造成22伤害', async ({ page }) => {
  await page.goto('/?scenario=weatherMultipliers&debug=events');
  await playWeatherCard(page);
  await expect(page.locator('[data-target="1"] .hp-label')).toContainText('978/1000');
  const log = await record(page);
  expect(log.events.find((event: { type: string }) => event.type === 'DAMAGE_RESOLVED'))
    .toMatchObject({ value: 22, damage: { multipliers: [1.2, 1.3], percentBonuses: [40] } });
});

test('适应只增加卡牌直伤，遗物和间接伤害仍为10', async ({ page }) => {
  await page.goto('/?scenario=weatherSources&debug=events');
  await playWeatherCard(page);
  await expect(page.locator('[data-target="1"] .hp-label')).toContainText('966/1000');
  const log = await record(page);
  expect(log.events.filter((event: { type: string }) => event.type === 'DAMAGE_RESOLVED')
    .map((event: { value: number; damage: { kind: string } }) => [event.value, event.damage.kind]))
    .toEqual([[14, 'card'], [10, 'relic'], [10, 'indirect']]);
});

test('重开恢复初始天气、属性和倒计时，切换布局退出固定天气局面', async ({ page }) => {
  await page.goto('/?scenario=weatherCycle&debug=events');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '结束回合 →' }).click();
  await expect(page.locator('.weather-name')).toHaveText('雨');
  await page.getByRole('button', { name: '重新开始', exact: true }).click();
  await expect(page.locator('.weather-name')).toHaveText('晴');
  await expect(page.locator('.weather-countdown')).toHaveText('3回合后切换');
  await expect(page.locator('.weather-bonus')).toContainText('晴适应 40');
  expect((await record(page)).events).toEqual([]);
  await page.getByRole('button', { name: '切换测试战斗', exact: true }).click();
  await expect(page.locator('.enemy')).toHaveCount(3);
  await expect(page.locator('.weather-bonus')).toContainText('卡牌直伤 +0%');
});

test('正常入口同种子重开可复现天气与手牌，天气信息不改变旧牌堆查看', async ({ page }) => {
  await page.goto('/?seed=157');
  const weather = await page.locator('.weather-status').getAttribute('data-weather');
  const hand = await page.locator('.hand .card').evaluateAll(elements => elements.map(element => (element as HTMLElement).dataset.card));
  await page.locator('[data-pile="draw"]').click();
  await page.getByRole('button', { name: '关闭牌堆查看' }).click();
  await page.getByRole('button', { name: '重新开始', exact: true }).click();
  expect(await page.locator('.weather-status').getAttribute('data-weather')).toBe(weather);
  expect(await page.locator('.hand .card').evaluateAll(elements => elements.map(element => (element as HTMLElement).dataset.card))).toEqual(hand);
  await expect(page.locator('.event-inspector')).toHaveCount(0);
});

for (const [width, height] of [[640, 720], [1280, 720], [1440, 1000]]) {
  test(`${width}×${height}天气组件完整可见，不遮挡生命、按钮或敌人操作`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/?scenario=weatherSun');
    await expect(page.locator('.weather-status')).toBeInViewport({ ratio: 1 });
    const box = await page.locator('.weather-status').boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    for (const selector of ['.health-track', '.game-header nav', '.hand .card', '[data-target="1"]']) {
      const other = await page.locator(selector).boundingBox();
      const overlaps = box!.x < other!.x + other!.width && box!.x + box!.width > other!.x
        && box!.y < other!.y + other!.height && box!.y + box!.height > other!.y;
      expect(overlaps).toBe(false);
    }
    expect(await page.locator('.battlefield-track').evaluate(element => element.scrollLeft)).toBe(0);
    await page.screenshot({ path: `test-results/weather-${width}.png`, fullPage: true });
    await playWeatherCard(page);
    await expect(page.locator('[data-target="1"] .hp-label')).toContainText('986/1000');
  });
}
