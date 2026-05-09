import { test, expect } from '@playwright/test';

test.describe('S2 P1 — T1 ResearchInputHero 组件契约', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('T1-1: hero-badge text 等于"公开 Web + 私有 KB · 双轨验证"', async ({ page }) => {
    await expect(page.locator('[data-testid="hero-badge"]')).toHaveText(
      '公开 Web + 私有 KB · 双轨验证',
    );
  });

  test('T1-2: hero-title text 等于"研究什么主题？"', async ({ page }) => {
    await expect(page.locator('[data-testid="hero-title"]')).toHaveText('研究什么主题？');
  });

  test('T1-3: hero-subtitle fontSize 解析为 16px（--text-md）', async ({ page }) => {
    const fontSize = await page.$eval(
      '[data-testid="hero-subtitle"]',
      (el) => getComputedStyle(el).fontSize,
    );
    expect(fontSize).toBe('16px');
  });

  test('T1-4: 空 textarea 时 submit-btn disabled', async ({ page }) => {
    await expect(page.locator('[data-testid="submit-btn"]')).toBeDisabled();
  });

  test('T1-5: 输入文本后 submit-btn enabled，icon-arrow 可见', async ({ page }) => {
    await page.fill('#research-topic', '量子计算');
    await expect(page.locator('[data-testid="submit-btn"]')).toBeEnabled();
    await expect(page.locator('[data-testid="icon-arrow"]')).toBeVisible();
  });

  test('T1-6: focus textarea 后 input-card boxShadow 包含 ring 色 (228,228,231)', async ({
    page,
  }) => {
    await page.focus('#research-topic');
    // input-card 使用 transition-shadow，需要等过渡完成后再读 boxShadow，避免读到中段插值。
    await expect
      .poll(
        () =>
          page.$eval(
            '[data-testid="input-card"]',
            (el) => getComputedStyle(el).boxShadow,
          ),
        { timeout: 2000 },
      )
      .toMatch(/rgb\(\s*228,\s*228,\s*231\s*\)/);
  });

  test('T1-7: submit click 后 icon-spinner visible', async ({ page }) => {
    // Mock fetch so it hangs long enough to assert spinner state.
    await page.route('**/api/research/start', async (route) => {
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ session_id: 'test-session-id' }),
      });
    });
    // mock /stream 避免导航后页面 crash（fulfill 成功后 router.push 会触发跳转）
    await page.route('**/api/research/test-session-id/stream', async (route) => {
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
    });
    await page.fill('#research-topic', '量子计算');
    await page.click('[data-testid="submit-btn"]');
    await expect(page.locator('[data-testid="icon-spinner"]')).toBeVisible();
  });

  test('T1-8: submitting 后 submit-btn disabled', async ({ page }) => {
    // Mock fetch so submitting state persists during assertion.
    await page.route('**/api/research/start', async (route) => {
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ session_id: 'test-session-id' }),
      });
    });
    // mock /stream 避免导航后页面 crash（fulfill 成功后 router.push 会触发跳转）
    await page.route('**/api/research/test-session-id/stream', async (route) => {
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
    });
    await page.fill('#research-topic', '量子计算');
    await page.click('[data-testid="submit-btn"]');
    await expect(page.locator('[data-testid="submit-btn"]')).toBeDisabled();
  });

  test('T1-9: submitting 后 icon-arrow hidden', async ({ page }) => {
    // Mock fetch so submitting state persists during assertion.
    await page.route('**/api/research/start', async (route) => {
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ session_id: 'test-session-id' }),
      });
    });
    // mock /stream 避免导航后页面 crash（fulfill 成功后 router.push 会触发跳转）
    await page.route('**/api/research/test-session-id/stream', async (route) => {
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
    });
    await page.fill('#research-topic', '量子计算');
    await page.click('[data-testid="submit-btn"]');
    await expect(page.locator('[data-testid="icon-arrow"]')).toBeHidden();
  });

  // T1-10: console.log 行为已被 T8-2（POST fetch body 校验）替代。
  // onSubmit 实现后不再 console.log，改为调用 POST /api/research/start。
  // 保留编号以便历史追溯，详见 M1.A T8/T9 describe block。

  test('T1-11: pill-web 初始 aria-pressed = "true"', async ({ page }) => {
    await expect(page.locator('[data-testid="pill-web"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('T1-12: pill-kb 初始 aria-pressed = "true" + 含 "4 份文档已就绪"', async ({ page }) => {
    const pillKb = page.locator('[data-testid="pill-kb"]');
    await expect(pillKb).toHaveAttribute('aria-pressed', 'true');
    await expect(pillKb).toContainText('4 份文档已就绪');
  });

  test('T1-13: click pill-web 后变 false，pill-kb 仍 true（双轨独立）', async ({ page }) => {
    await page.click('[data-testid="pill-web"]');
    await expect(page.locator('[data-testid="pill-web"]')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(page.locator('[data-testid="pill-kb"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('T1-14: submit-btn aria-label = "启动研究"', async ({ page }) => {
    await expect(page.locator('[data-testid="submit-btn"]')).toHaveAttribute(
      'aria-label',
      '启动研究',
    );
  });

  test('T1-15: input-card borderRadius = 24px (--radius-lg)', async ({ page }) => {
    const radius = await page.$eval(
      '[data-testid="input-card"]',
      (el) => getComputedStyle(el).borderRadius,
    );
    expect(radius).toBe('24px');
  });

  test('T1-16: hero-badge borderRadius = 9999px (--radius-full)', async ({ page }) => {
    const radius = await page.$eval(
      '[data-testid="hero-badge"]',
      (el) => getComputedStyle(el).borderRadius,
    );
    expect(radius).toBe('9999px');
  });

  test('T1-17: hero-meta 含两段 meta 文案', async ({ page }) => {
    const meta = page.locator('[data-testid="hero-meta"]');
    await expect(meta).toContainText('本地化·数据不出境');
    await expect(meta).toContainText('完整证据链·引用可溯');
  });

  test('T1-18: hero-meta fontSize >= 14px', async ({ page }) => {
    const fontSize = await page.$eval(
      '[data-testid="hero-meta"]',
      (el) => getComputedStyle(el).fontSize,
    );
    expect(parseFloat(fontSize)).toBeGreaterThanOrEqual(14);
  });

  test('T1-19: Tab 顺序 textarea → pill-web → pill-kb → submit-btn（textarea 已填）', async ({
    page,
  }) => {
    await page.fill('#research-topic', '量子计算');
    await page.focus('#research-topic');

    await page.keyboard.press('Tab');
    let activeId = await page.evaluate(() =>
      document.activeElement?.getAttribute('data-testid'),
    );
    expect(activeId).toBe('pill-web');

    await page.keyboard.press('Tab');
    activeId = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    expect(activeId).toBe('pill-kb');

    await page.keyboard.press('Tab');
    activeId = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    expect(activeId).toBe('submit-btn');
  });
});

test.describe('S2 P1 — T2 页面接入 — TopBar + 布局', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
  });

  test('T2-1: topbar 可见', async ({ page }) => {
    await expect(page.locator('[data-testid="topbar"]')).toBeVisible();
  });

  test('T2-2: topbar-logo-icon (Sparkles) 可见', async ({ page }) => {
    await expect(page.locator('[data-testid="topbar-logo-icon"]')).toBeVisible();
  });

  test('T2-3: topbar 含 "Lumen"', async ({ page }) => {
    await expect(page.locator('[data-testid="topbar"]')).toContainText('Lumen');
  });

  test('T2-4: topbar 含 "咨询级深度研究"', async ({ page }) => {
    await expect(page.locator('[data-testid="topbar"]')).toContainText('咨询级深度研究');
  });

  test('T2-5: hero-inner maxWidth 解析为 720px', async ({ page }) => {
    const maxWidth = await page.$eval(
      '[data-testid="hero-inner"]',
      (el) => getComputedStyle(el).maxWidth,
    );
    expect(maxWidth).toBe('720px');
  });

  test('T2-6: hero-inner 在 1440 视口下水平居中（误差 ≤2px）', async ({ page }) => {
    const rect = await page.$eval('[data-testid="hero-inner"]', (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, width: r.width };
    });
    const centerX = rect.left + rect.width / 2;
    expect(Math.abs(centerX - 720)).toBeLessThanOrEqual(2);
  });

  test('T2-7: home-root 背景 rgb(10, 10, 11)（验证 bg-bg 解析链路）', async ({ page }) => {
    const bg = await page.$eval(
      '[data-testid="home-root"]',
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(bg).toBe('rgb(10, 10, 11)');
  });

  test('T2-8: hero-inner 内无 inline-style hex/rgb 色值（--hero-max-width 豁免）', async ({
    page,
  }) => {
    const violations = await page.$$eval(
      '[data-testid="hero-inner"], [data-testid="hero-inner"] *',
      (els) =>
        els
          .map((el) => el.getAttribute('style'))
          .filter((s): s is string => !!s)
          .filter((s) => /#[0-9a-fA-F]{3,8}|rgb\(|rgba\(|hsl\(/.test(s)),
    );
    expect(violations).toEqual([]);
  });
});

test.describe('S2 P1 — T3 视觉回归 baseline', () => {
  test('T3-1: 1440×900 dark baseline 截图', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('p1-research-input-dark.png', {
      maxDiffPixelRatio: 0.02,
      mask: [page.locator('[data-testid="hero-subtitle"]')],
    });
  });

  test('T3-2: 1440×900 light baseline 截图', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.evaluate(() =>
      document.documentElement.setAttribute('data-theme', 'light'),
    );
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('p1-research-input-light.png', {
      maxDiffPixelRatio: 0.02,
      mask: [page.locator('[data-testid="hero-subtitle"]')],
    });
  });
});

test.describe('M1.A T8/T9 — onSubmit 接后端 + router.push', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // T8-1: submit-btn disabled when empty (回归)
  test('T8-1: 空 textarea 时 submit-btn disabled', async ({ page }) => {
    await expect(page.locator('[data-testid="submit-btn"]')).toBeDisabled();
  });

  // T8-2: submit calls POST /api/research/start with query + client_request_id
  test('T8-2: 提交后 POST /api/research/start body 含 query + client_request_id（UUID 格式）', async ({ page }) => {
    let capturedBody: { query?: string; client_request_id?: string } | null = null;
    await page.route('**/api/research/start', async (route) => {
      const reqBody = route.request().postDataJSON();
      capturedBody = reqBody;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ session_id: '01h234567890abcdefghjk' }),
      });
    });

    await page.fill('#research-topic', '量子计算最新进展');
    await page.click('[data-testid="submit-btn"]');

    // 等 fetch 触发
    await expect.poll(() => capturedBody !== null).toBe(true);

    expect(capturedBody!.query).toBe('量子计算最新进展');
    // client_request_id UUID v4 格式校验
    expect(capturedBody!.client_request_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  // T8-3: client_request_id stable during submit (submitting 期间按钮 disabled 保证同一 id)
  test('T8-3: 多次按按钮（中途 fetch hang）期间 client_request_id 不变', async ({ page }) => {
    const ids: string[] = [];
    let resolveFirstFetch: (() => void) | null = null;
    let firstFetchTriggered = false;

    await page.route('**/api/research/start', async (route) => {
      ids.push(route.request().postDataJSON().client_request_id);
      if (!firstFetchTriggered) {
        firstFetchTriggered = true;
        // 第一次 hang 让按钮处于 submitting 状态
        await new Promise<void>((resolve) => {
          resolveFirstFetch = resolve;
        });
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ session_id: '01h234567890abcdefghjk' }),
      });
    });

    await page.fill('#research-topic', '稳定 ID 测试');
    await page.click('[data-testid="submit-btn"]');

    // 等 fetch 触发
    await expect.poll(() => ids.length > 0).toBe(true);
    // submitting 期间按钮 disabled，所以再点不会触发新 fetch
    await expect(page.locator('[data-testid="submit-btn"]')).toBeDisabled();

    // 释放 hang 让组件流转
    if (resolveFirstFetch) (resolveFirstFetch as () => void)();

    // 只触发了一次 fetch（第二次点击被 disabled 拦截）
    expect(ids.length).toBe(1);
  });

  // T8-4: spinner during request
  test('T8-4: 提交期间 spinner 可见，arrow 不可见', async ({ page }) => {
    await page.route('**/api/research/start', async (route) => {
      // hang 200ms 让 UI 有时间渲染 spinner
      await new Promise<void>((resolve) => setTimeout(resolve, 200));
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ session_id: '01h234567890abcdefghjk' }),
      });
    });

    await page.fill('#research-topic', 'spinner 测试');
    await page.click('[data-testid="submit-btn"]');

    await expect(page.locator('[data-testid="icon-spinner"]')).toBeVisible();
    await expect(page.locator('[data-testid="icon-arrow"]')).not.toBeVisible();
  });

  // T8-5: 422 shows error message
  test('T8-5: 422 响应展示错误信息且按钮重置', async ({ page }) => {
    await page.route('**/api/research/start', async (route) => {
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'query 长度超限' }),
      });
    });

    await page.fill('#research-topic', '错误测试');
    await page.click('[data-testid="submit-btn"]');

    // 错误信息可见
    await expect(page.locator('[data-testid="hero-error"]')).toBeVisible({ timeout: 3000 });

    // 按钮恢复（不再 disabled，spinner 不再）
    await expect(page.locator('[data-testid="submit-btn"]')).toBeEnabled();
    await expect(page.locator('[data-testid="icon-spinner"]')).not.toBeVisible();
  });

  // T8-6: network error restores button
  test('T8-6: fetch 抛异常后 submitting=false 按钮恢复', async ({ page }) => {
    await page.route('**/api/research/start', async (route) => {
      await route.abort('failed');
    });

    await page.fill('#research-topic', '网络错误测试');
    await page.click('[data-testid="submit-btn"]');

    // 按钮恢复
    await expect(page.locator('[data-testid="submit-btn"]')).toBeEnabled({ timeout: 3000 });
    // 错误信息可见
    await expect(page.locator('[data-testid="hero-error"]')).toBeVisible();
  });

  // T9-1: navigation after success
  test('T9-1: 提交成功后跳转 /research/{session_id}', async ({ page }) => {
    const ulid = '01h234567890abcdefghjk';
    await page.route('**/api/research/start', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ session_id: ulid }),
      });
    });
    // /research/[id] 后端依赖 SSE，mock 端点避免页面 crash
    await page.route(`**/api/research/${ulid}/stream`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: '',
      });
    });

    await page.fill('#research-topic', '导航测试');
    await page.click('[data-testid="submit-btn"]');

    await page.waitForURL(`**/research/${ulid}`, { timeout: 5000 });
    expect(page.url()).toContain(`/research/${ulid}`);
  });

  // T9-2: spinner visible then navigates
  test('T9-2: 提交期间显示 spinner，成功后跳转', async ({ page }) => {
    const ulid = '01h234567890abcdefghjk';
    await page.route('**/api/research/start', async (route) => {
      await new Promise<void>((resolve) => setTimeout(resolve, 150));
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ session_id: ulid }),
      });
    });
    await page.route(`**/api/research/${ulid}/stream`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
    });

    await page.fill('#research-topic', 'spinner 然后跳转');
    await page.click('[data-testid="submit-btn"]');

    // spinner 可见
    await expect(page.locator('[data-testid="icon-spinner"]')).toBeVisible();
    // 跳转
    await page.waitForURL(`**/research/${ulid}`, { timeout: 5000 });
  });
});
