import { test, expect } from '@playwright/test';

test.describe('S1 Token Smoke — T1 globals.css 重写', () => {
  test('T1-1: --bg 在 :root 下为 #0A0A0B（dark 默认）', async ({ page }) => {
    await page.goto('/');
    const value = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    );
    expect(value.toLowerCase()).toBe('#0a0a0b');
  });

  test('T1-2: --primary 在 :root 下为 #1E40AF（lumen 覆盖 shadcn 默认）', async ({ page }) => {
    await page.goto('/');
    const value = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
    );
    expect(value.toLowerCase()).toBe('#1e40af');
  });

  test('T1-3: --lumen-radius-lg 在 :root 下为 24px', async ({ page }) => {
    await page.goto('/');
    const value = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--lumen-radius-lg').trim(),
    );
    expect(value).toBe('24px');
  });

  test('T1-4: body backgroundColor 为 rgb(10, 10, 11)（验证 bg-bg 解析链路）', async ({ page }) => {
    await page.goto('/');
    const bg = await page.$eval('body', (el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe('rgb(10, 10, 11)');
  });

  test('T1-5: --border 在 :root 下为 lumen 值 #27272A（非 shadcn 默认）', async ({ page }) => {
    await page.goto('/');
    const value = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--border').trim(),
    );
    expect(value.toLowerCase()).toBe('#27272a');
  });

  test('T1-6: --lumen-shadow-sm 在 :root 可读', async ({ page }) => {
    await page.goto('/');
    const value = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--lumen-shadow-sm').trim(),
    );
    expect(value).toContain('0px 1px 2px');
  });
});

test.describe('S1 Token Smoke — T2 dark mode + JetBrains Mono', () => {
  test('T2-1: <html> 具有 data-theme="dark" 属性', async ({ page }) => {
    await page.goto('/');
    const themeAttr = await page.$eval('html', (el) => el.getAttribute('data-theme'));
    expect(themeAttr).toBe('dark');
  });

  test('T2-2: dark 模式下 --bg 为 #0A0A0B', async ({ page }) => {
    await page.goto('/');
    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    );
    expect(bg.toLowerCase()).toBe('#0a0a0b');
  });

  test('T2-3: light 模式下 --bg 为 #FAFAFA', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    );
    expect(bg.toLowerCase()).toBe('#fafafa');
  });

  test('T2-4: JetBrains Mono 变量已挂载在 <html>', async ({ page }) => {
    await page.goto('/');
    const val = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--font-jetbrains-mono').trim(),
    );
    expect(val.length).toBeGreaterThan(0);
  });

  test('T2-5: .dark 类不触发 dark 模式（策略迁移验证）', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
      document.documentElement.classList.add('dark');
    });
    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    );
    expect(bg.toLowerCase()).toBe('#fafafa');
  });
});

test.describe('S1 Token Smoke — T3 烟囱验证页', () => {
  test('T3-1: /token-test 页面可访问（200 OK）', async ({ page }) => {
    const response = await page.goto('/token-test');
    expect(response?.status()).toBe(200);
  });

  test('T3-2: bg-swatch 背景色为 --bg 值 rgb(10, 10, 11)', async ({ page }) => {
    await page.goto('/token-test');
    const bg = await page.$eval('[data-testid="swatch-bg"]', (el) =>
      getComputedStyle(el).backgroundColor,
    );
    expect(bg).toBe('rgb(10, 10, 11)');
  });

  test('T3-3: primary-swatch 背景色为 --primary 值 rgb(30, 64, 175)', async ({ page }) => {
    await page.goto('/token-test');
    const bg = await page.$eval('[data-testid="swatch-primary"]', (el) =>
      getComputedStyle(el).backgroundColor,
    );
    expect(bg).toBe('rgb(30, 64, 175)');
  });

  test('T3-4: radius-lg-swatch border-radius 为 24px', async ({ page }) => {
    await page.goto('/token-test');
    const radius = await page.$eval('[data-testid="radius-lg"]', (el) =>
      getComputedStyle(el).borderRadius,
    );
    expect(radius).toBe('24px');
  });

  test('T3-5: font-mono-sample 字体族包含 JetBrains Mono', async ({ page }) => {
    await page.goto('/token-test');
    const fontFamily = await page.$eval('[data-testid="font-mono-sample"]', (el) =>
      getComputedStyle(el).fontFamily,
    );
    expect(fontFamily.toLowerCase()).toContain('jetbrains mono');
  });

  test('T3-6: 主题切换按钮 click 后 --bg 变为 #FAFAFA（light）', async ({ page }) => {
    await page.goto('/token-test');
    await page.click('[data-testid="theme-toggle"]');
    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    );
    expect(bg.toLowerCase()).toBe('#fafafa');
  });

  test('T3-7: 截图对比（视觉回归 baseline）', async ({ page }) => {
    await page.goto('/token-test');
    await expect(page).toHaveScreenshot('token-smoke-dark.png', {
      maxDiffPixelRatio: 0.02,
      mask: [
        page.locator('[data-testid="font-sans-sample"]'),
        page.locator('[data-testid="font-mono-sample"]'),
      ],
    });
  });

  test('T3-8: shadcn 组件在 lumen tokens 下不白屏（N5 修订）', async ({ page }) => {
    await page.goto('/token-test');

    const buttonBg = await page.$eval('[data-testid="shadcn-button-default"]', (el) =>
      getComputedStyle(el).backgroundColor,
    );
    expect(buttonBg).toBe('rgb(30, 64, 175)');

    const secondaryBg = await page.$eval('[data-testid="shadcn-button-secondary"]', (el) =>
      getComputedStyle(el).backgroundColor,
    );
    expect(secondaryBg).not.toBe('rgba(0, 0, 0, 0)');
    expect(secondaryBg).not.toBe('transparent');

    const cardBg = await page.$eval('[data-testid="shadcn-card"]', (el) =>
      getComputedStyle(el).backgroundColor,
    );
    expect(cardBg).not.toBe('rgba(0, 0, 0, 0)');

    const inputBorder = await page.$eval('[data-testid="shadcn-input"]', (el) =>
      getComputedStyle(el).borderColor,
    );
    expect(inputBorder).not.toBe('rgb(255, 255, 255)');
  });
});
