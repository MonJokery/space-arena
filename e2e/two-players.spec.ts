import { test, expect, chromium } from '@playwright/test';
test('two browsers: movement and chat', async () => {
  const browserA = await chromium.launch(); const browserB = await chromium.launch();
  const a = await browserA.newContext(); const b = await browserB.newContext();
  try {
    const one = await a.newPage(), two = await b.newPage();
    await Promise.all([one.goto('/'), two.goto('/')]);
    await Promise.all([one.locator('#start-load').click(), two.locator('#start-load').click()]);
    await expect(one.locator('#lobby-screen')).toBeVisible({ timeout: 30000 });
    await expect(two.locator('#lobby-screen')).toBeVisible({ timeout: 30000 });
    await one.locator('#player-name').fill('Alpha');
    await two.locator('#player-name').fill('Beta');
    await one.locator('#join').click();
    await two.locator('#join').click();
    await expect(one.locator('#game-screen')).toBeVisible();
    await expect(two.locator('#game-screen')).toBeVisible();
    await expect.poll(async () => Number(await two.locator('#entities').textContent())).toBeGreaterThan(1);
    const before = await two.evaluate(() => Reflect.get(window, '__arenaDebug')()?.entities.find((e: { id:number }) => e.id===1)?.y ?? 0);
    await one.keyboard.down('w');
    await one.waitForTimeout(800);
    await one.keyboard.up('w');
    await expect.poll(async () => {
      const after = await two.evaluate(() => Reflect.get(window, '__arenaDebug')()?.entities.find((e: { id:number }) => e.id===1)?.y ?? 0);
      return Math.abs(after-before);
    }).toBeGreaterThan(2);
    await one.locator('#chat-input').fill('Перевірка чату');
    await one.locator('#chat-form button').click();
    await expect(two.locator('#chat-messages')).toContainText('Перевірка чату');
  } finally { await a.close(); await b.close(); await browserA.close(); await browserB.close(); }
});
