import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

test.describe('S2 P3 — T2 路由 + P3 容器 + ReportTopBar 骨架', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('T2-1: 访问 /research/demo-001/report 返回 HTTP 200', async ({ page }) => {
    const response = await page.goto('/research/demo-001/report');
    expect(response?.status()).toBe(200);
  });

  test('T2-2: p3-root 可见', async ({ page }) => {
    await page.goto('/research/demo-001/report');
    await expect(page.locator('[data-testid="p3-root"]')).toBeVisible();
  });

  test('T2-3: p3-topbar 高度计算值 === 64px', async ({ page }) => {
    await page.goto('/research/demo-001/report');
    const height = await page.$eval(
      '[data-testid="p3-topbar"]',
      (el) => el.getBoundingClientRect().height,
    );
    expect(height).toBe(64);
  });

  test('T2-4: p3-topbar 含 "Lumen" 文本', async ({ page }) => {
    await page.goto('/research/demo-001/report');
    await expect(page.locator('[data-testid="p3-topbar"]')).toContainText('Lumen');
  });

  test('T2-5: p3-split 三栏容器可见', async ({ page }) => {
    await page.goto('/research/demo-001/report');
    await expect(page.locator('[data-testid="p3-split"]')).toBeVisible();
  });

  test('T2-6: p3-kb-panel 宽度 === 288px', async ({ page }) => {
    await page.goto('/research/demo-001/report');
    const width = await page.$eval(
      '[data-testid="p3-kb-panel"]',
      (el) => el.getBoundingClientRect().width,
    );
    expect(width).toBe(288);
  });

  test('T2-7: p3-canvas 宽度 === 792px (1440 - 288 - 360)', async ({ page }) => {
    await page.goto('/research/demo-001/report');
    const width = await page.$eval(
      '[data-testid="p3-canvas"]',
      (el) => el.getBoundingClientRect().width,
    );
    expect(width).toBe(792);
  });

  test('T2-8: p3-citation-panel-slot 宽度 === 360px', async ({ page }) => {
    await page.goto('/research/demo-001/report');
    const width = await page.$eval(
      '[data-testid="p3-citation-panel-slot"]',
      (el) => el.getBoundingClientRect().width,
    );
    expect(width).toBe(360);
  });

  test('T2-9: p3-root 背景色 === rgb(10, 10, 11) (--bg dark)', async ({ page }) => {
    await page.goto('/research/demo-001/report');
    const bg = await page.$eval(
      '[data-testid="p3-root"]',
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(bg).toBe('rgb(10, 10, 11)');
  });

  test('T2-10: p3-root 子树无 inline-style hex/rgb 色值', async ({ page }) => {
    await page.goto('/research/demo-001/report');
    const violations = await page.$$eval(
      '[data-testid="p3-root"], [data-testid="p3-root"] *',
      (els) =>
        els
          .map((el) => el.getAttribute('style'))
          .filter((s): s is string => !!s)
          .filter((s) => /#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(/.test(s)),
    );
    expect(violations).toEqual([]);
  });

  test('T2-11: 访问 /research/invalid!@#/report 返回 404', async ({ page }) => {
    const response = await page.goto('/research/invalid!@%23/report');
    expect(response?.status()).toBe(404);
  });
});

test.describe('S2 P3 — T3 CitationBadge', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/research/demo-001/report');
  });

  test('T3-1: primary variant 背景色含 "30, 64, 175" (--citation-badge)', async ({ page }) => {
    const bg = await page.$eval(
      '[data-testid="p3-canvas"] [data-testid="citation-badge-c1"]',
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(bg).toContain('30, 64, 175');
  });

  test('T3-2: web-track variant 背景色含 "14, 165, 233" (--track-web-bg)', async ({ page }) => {
    // KbDocumentList 内的 web-track citation badge（kd-2 关联 c2）；
    // canvas 内 inline citation 默认 primary variant，需到 KB 列表场景验证 web-track。
    const bg = await page.$eval(
      '[data-testid="kb-document-list"] [data-testid="citation-badge-c2"]',
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(bg).toContain('14, 165, 233');
  });

  test('T3-3: kb-track variant 背景色含 "139, 92, 246" (--track-kb-bg)', async ({ page }) => {
    // KbDocumentList 内的 kb-track citation badge（kd-6 关联 c4）。
    const bg = await page.$eval(
      '[data-testid="kb-document-list"] [data-testid="citation-badge-c4"]',
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(bg).toContain('139, 92, 246');
  });

  test('T3-4: badge 是 button 元素（native role）且 aria-label 含 "引用"', async ({ page }) => {
    // native <button> 自带 button 角色，无需冗余 role="button" attribute；
    // 用 tagName 检查更准确反映 a11y 真实角色来源。
    const badge = page.locator('[data-testid="p3-canvas"] [data-testid="citation-badge-c1"]');
    const tagName = await badge.evaluate((el) => el.tagName);
    expect(tagName).toBe('BUTTON');
    const label = await badge.getAttribute('aria-label');
    expect(label).toContain('引用');
  });

  test('T3-5: badge 初始 aria-expanded === "false" (c2，c1 默认被 panel 打开)', async ({ page }) => {
    const badge = page.locator('[data-testid="p3-canvas"] [data-testid="citation-badge-c2"]');
    expect(await badge.getAttribute('aria-expanded')).toBe('false');
  });

  test('T3-6: focus badge 后 boxShadow 含 ring 色 (228, 228, 231 dark --ring)', async ({ page }) => {
    // 用 c2 而非 c1：c1 默认被 CitationPanel 打开，base-ui Dialog 接管 focus 导致
    // page.focus 在 c1 上即时丢失，无法稳定读到 ring shadow。c2 不是默认 panel
    // trigger，page.focus 后保持 focus-visible 状态。
    const sel = '[data-testid="p3-canvas"] [data-testid="citation-badge-c2"]';
    await page.focus(sel);
    const shadow = await page.$eval(
      sel,
      (el) => getComputedStyle(el).boxShadow,
    );
    expect(shadow).toMatch(/228,\s*228,\s*231/);
  });

  test('T3-7: hover badge 显示 Tooltip 含来源标题', async ({ page }) => {
    const badge = page.locator('[data-testid="p3-canvas"] [data-testid="citation-badge-c1"]');
    await badge.hover();
    const tooltip = page.locator('[role="tooltip"]').first();
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('Gartner');
  });

  test('T3-8: badge 字号 === 12px', async ({ page }) => {
    const fontSize = await page.$eval(
      '[data-testid="p3-canvas"] [data-testid="citation-badge-c1"]',
      (el) => getComputedStyle(el).fontSize,
    );
    expect(fontSize).toBe('12px');
  });

  test('T3-9: badge fontFamily 含 "JetBrains Mono"', async ({ page }) => {
    const family = await page.$eval(
      '[data-testid="p3-canvas"] [data-testid="citation-badge-c1"]',
      (el) => getComputedStyle(el).fontFamily,
    );
    expect(family).toContain('JetBrains Mono');
  });

  test('T3-10: badge 子树无 inline-style hex/rgb 色值', async ({ page }) => {
    const violations = await page.$$eval(
      '[data-testid^="citation-badge-"], [data-testid^="citation-badge-"] *',
      (els) =>
        els
          .map((el) => el.getAttribute('style'))
          .filter((s): s is string => !!s)
          .filter((s) => /#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(/.test(s)),
    );
    expect(violations).toEqual([]);
  });

  test('T3-11: Enter 键触发 onToggle (aria-expanded 切换；用 c2 因 c1 默认开)', async ({ page }) => {
    const badge = page.locator('[data-testid="p3-canvas"] [data-testid="citation-badge-c2"]');
    await badge.focus();
    expect(await badge.getAttribute('aria-expanded')).toBe('false');
    await badge.press('Enter');
    expect(await badge.getAttribute('aria-expanded')).toBe('true');
  });
});

test.describe('S2 P3 — T4 ConflictBlock', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/research/demo-001/report');
  });

  test('T4-1: conflict-block-C01 可见', async ({ page }) => {
    await expect(
      page.locator('[data-testid="conflict-block-C01"]'),
    ).toBeVisible();
  });

  test('T4-2: conflict-block role="region" 且 aria-labelledby 关联标题元素', async ({ page }) => {
    const block = page.locator('[data-testid="conflict-block-C01"]');
    expect(await block.getAttribute('role')).toBe('region');
    const labelId = await block.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    // header 元素以 labelId 为 id 存在且含冲突标题
    const header = page.locator(`#${labelId}`);
    await expect(header).toContainText('ConflictSubgraph');
  });

  test('T4-3: header 含 triangle-alert 图标且 aria-hidden="true"', async ({ page }) => {
    const icon = page.locator(
      '[data-testid="conflict-block-C01"] svg.lucide-triangle-alert, [data-testid="conflict-block-C01"] svg.lucide-alert-triangle',
    );
    await expect(icon.first()).toBeVisible();
    expect(await icon.first().getAttribute('aria-hidden')).toBe('true');
  });

  test('T4-4: 含 2 个 conflict-col', async ({ page }) => {
    const cols = page.locator(
      '[data-testid="conflict-block-C01"] [data-testid^="conflict-col-"]',
    );
    await expect(cols).toHaveCount(2);
  });

  test('T4-5: footer 含 role="note"', async ({ page }) => {
    const note = page.locator(
      '[data-testid="conflict-block-C01"] [role="note"]',
    );
    await expect(note).toBeVisible();
  });

  test('T4-6: footer 含 lightbulb 图标且 aria-hidden="true"', async ({ page }) => {
    const icon = page.locator(
      '[data-testid="conflict-block-C01"] [role="note"] svg.lucide-lightbulb',
    );
    await expect(icon).toBeVisible();
    expect(await icon.getAttribute('aria-hidden')).toBe('true');
  });

  test('T4-7: 背景色解析含 "255, 132, 0" (--conflict-bg)', async ({ page }) => {
    const bg = await page.$eval(
      '[data-testid="conflict-block-C01"]',
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(bg).toContain('255, 132, 0');
  });

  test('T4-8: borderLeftWidth === "3px"', async ({ page }) => {
    const width = await page.$eval(
      '[data-testid="conflict-block-C01"]',
      (el) => getComputedStyle(el).borderLeftWidth,
    );
    expect(width).toBe('3px');
  });

  test('T4-9: borderRadius === "8px" (--radius-md)', async ({ page }) => {
    const radius = await page.$eval(
      '[data-testid="conflict-block-C01"]',
      (el) => getComputedStyle(el).borderRadius,
    );
    expect(radius).toBe('8px');
  });

  test('T4-10: conflict-block 子树无 inline-style hex/rgb 色值', async ({ page }) => {
    const violations = await page.$$eval(
      '[data-testid="conflict-block-C01"], [data-testid="conflict-block-C01"] *',
      (els) =>
        els
          .map((el) => el.getAttribute('style'))
          .filter((s): s is string => !!s)
          .filter((s) => /#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(/.test(s)),
    );
    expect(violations).toEqual([]);
  });
});

test.describe('S2 P3 — T5 KbDocumentList', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/research/demo-001/report');
  });

  test('T5-1: kb-document-list 可见', async ({ page }) => {
    await expect(
      page.locator('[data-testid="kb-document-list"]'),
    ).toBeVisible();
  });

  test('T5-2: kb-document-list 宽度 === 288px', async ({ page }) => {
    const width = await page.$eval(
      '[data-testid="kb-document-list"]',
      (el) => el.getBoundingClientRect().width,
    );
    expect(width).toBe(288);
  });

  test('T5-3: kb-document-list 内含 role="list" 容器', async ({ page }) => {
    const list = page.locator(
      '[data-testid="kb-document-list"] [role="list"]',
    );
    await expect(list).toHaveCount(1);
  });

  test('T5-4: filter-tabs role="tablist"', async ({ page }) => {
    const tablist = page.locator('[data-testid="filter-tabs"]');
    expect(await tablist.getAttribute('role')).toBe('tablist');
  });

  test('T5-5: tab-all/tab-web/tab-kb 三个 role="tab"', async ({ page }) => {
    for (const tab of ['tab-all', 'tab-web', 'tab-kb']) {
      const el = page.locator(`[data-testid="${tab}"]`);
      await expect(el).toBeVisible();
      expect(await el.getAttribute('role')).toBe('tab');
    }
  });

  test('T5-6: tab-all 默认 aria-selected="true"', async ({ page }) => {
    const all = page.locator('[data-testid="tab-all"]');
    expect(await all.getAttribute('aria-selected')).toBe('true');
  });

  test('T5-7: 切到 tab-web 后 kb-track 项隐藏', async ({ page }) => {
    await page.click('[data-testid="tab-web"]');
    // c4 是 kb track，对应 kd-6 → 切到 web 后 kd-6 应隐藏
    await expect(
      page.locator('[data-testid="kb-item-kd-6"]'),
    ).toHaveCount(0);
    // kd-1 是 web track，应仍可见
    await expect(
      page.locator('[data-testid="kb-item-kd-1"]'),
    ).toBeVisible();
  });

  test('T5-8: 切到 tab-kb 后 web-track 项隐藏', async ({ page }) => {
    await page.click('[data-testid="tab-kb"]');
    await expect(
      page.locator('[data-testid="kb-item-kd-1"]'),
    ).toHaveCount(0);
    await expect(
      page.locator('[data-testid="kb-item-kd-6"]'),
    ).toBeVisible();
  });

  test('T5-9: 每条 kb-item role="listitem"', async ({ page }) => {
    const items = page.locator(
      '[data-testid="kb-document-list"] [data-testid^="kb-item-"]',
    );
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(11);
    for (let i = 0; i < count; i++) {
      expect(await items.nth(i).getAttribute('role')).toBe('listitem');
    }
  });

  test('T5-10: web-item 含 globe 图标 (aria-hidden=true)', async ({ page }) => {
    const icon = page.locator(
      '[data-testid="kb-item-kd-1"] svg.lucide-globe',
    );
    await expect(icon).toHaveCount(1);
    expect(await icon.getAttribute('aria-hidden')).toBe('true');
  });

  test('T5-11: kb-item 含 database 图标 (aria-hidden=true)', async ({ page }) => {
    const icon = page.locator(
      '[data-testid="kb-item-kd-6"] svg.lucide-database',
    );
    await expect(icon).toHaveCount(1);
    expect(await icon.getAttribute('aria-hidden')).toBe('true');
  });

  test('T5-12: ArrowDown 焦点向下移动', async ({ page }) => {
    const first = page.locator('[data-testid="kb-item-kd-1"]');
    await first.focus();
    await page.keyboard.press('ArrowDown');
    const focusedTestid = await page.evaluate(
      () => document.activeElement?.getAttribute('data-testid') ?? '',
    );
    expect(focusedTestid).toBe('kb-item-kd-2');
  });

  test('T5-13: ArrowUp 焦点向上移动', async ({ page }) => {
    const second = page.locator('[data-testid="kb-item-kd-2"]');
    await second.focus();
    await page.keyboard.press('ArrowUp');
    const focusedTestid = await page.evaluate(
      () => document.activeElement?.getAttribute('data-testid') ?? '',
    );
    expect(focusedTestid).toBe('kb-item-kd-1');
  });

  test('T5-14: header 显示文档总数 (11)', async ({ page }) => {
    const header = page.locator('[data-testid="kb-document-list"] header');
    await expect(header).toContainText('11');
  });

  test('T5-15: kb-document-list 子树无 inline-style hex/rgb 色值', async ({ page }) => {
    const violations = await page.$$eval(
      '[data-testid="kb-document-list"], [data-testid="kb-document-list"] *',
      (els) =>
        els
          .map((el) => el.getAttribute('style'))
          .filter((s): s is string => !!s)
          .filter((s) => /#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(/.test(s)),
    );
    expect(violations).toEqual([]);
  });
});

test.describe('S2 P3 — T6 CitationPanel', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/research/demo-001/report');
  });

  test('T6-12: 默认打开第 1 条引用 panel 可见', async ({ page }) => {
    await expect(
      page.locator('[data-testid="citation-panel"]'),
    ).toBeVisible();
  });

  test('T6-1: 点击 canvas badge 后 panel 显示对应引用', async ({ page }) => {
    // 默认已打开 c1，点击 c2 切到 c2
    await page.click('[data-testid="p3-canvas"] [data-testid="citation-badge-c2"]');
    const panel = page.locator('[data-testid="citation-panel"]');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('McKinsey');
  });

  test('T6-2: panel role="dialog" 且 aria-modal="false"', async ({ page }) => {
    const panel = page.locator('[data-testid="citation-panel"]');
    expect(await panel.getAttribute('role')).toBe('dialog');
    expect(await panel.getAttribute('aria-modal')).toBe('false');
  });

  test('T6-3: panel aria-labelledby 关联标题元素', async ({ page }) => {
    const panel = page.locator('[data-testid="citation-panel"]');
    const labelId = await panel.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    const title = page.locator(`#${labelId}`);
    await expect(title).toBeVisible();
  });

  test('T6-4: panel 宽度 === 360px', async ({ page }) => {
    // 先等 panel mount + visible，再读 boundingBox（Playwright locator 自带 retry，
    // 比 expect.poll + page.$eval 更稳，因为 $eval 找不到 selector 立即 throw 不 retry）。
    const panel = page.locator('[data-testid="citation-panel"]');
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box?.width).toBe(360);
  });

  test('T6-5: panel 关闭后从 DOM 消失（closed 状态）', async ({ page }) => {
    await page.click('[data-testid="citation-panel-close"]');
    await expect(
      page.locator('[data-testid="citation-panel"]'),
    ).toHaveCount(0);
  });

  test('T6-6: 点击 close-btn 关闭 panel', async ({ page }) => {
    await page.click('[data-testid="citation-panel-close"]');
    await expect(
      page.locator('[data-testid="citation-panel"]'),
    ).toHaveCount(0);
  });

  test('T6-7: ESC 键关闭 panel', async ({ page }) => {
    await page.keyboard.press('Escape');
    await expect(
      page.locator('[data-testid="citation-panel"]'),
    ).toHaveCount(0);
  });

  test('T6-8: close-btn aria-label === "关闭引用浮窗"', async ({ page }) => {
    const btn = page.locator('[data-testid="citation-panel-close"]');
    expect(await btn.getAttribute('aria-label')).toBe('关闭引用浮窗');
  });

  test('T6-9: 关闭 panel 后焦点返回触发 badge (focus return)', async ({ page }) => {
    // 先点击 c2 让 c2 成为 trigger，然后关闭，焦点应回 c2
    const c2 = page.locator('[data-testid="p3-canvas"] [data-testid="citation-badge-c2"]');
    await c2.click();
    await expect(page.locator('[data-testid="citation-panel"]')).toContainText('McKinsey');
    await page.click('[data-testid="citation-panel-close"]');
    // 等焦点切换完成
    await expect
      .poll(async () =>
        page.evaluate(
          () => document.activeElement?.getAttribute('data-testid') ?? '',
        ),
      )
      .toBe('citation-badge-c2');
  });

  test('T6-10: snippet-body 含 citation-highlight 黄底背景 (FDE68A)', async ({ page }) => {
    await expect(
      page.locator('[data-testid="citation-snippet-body"]'),
    ).toBeVisible();
    const bg = await page.$eval(
      '[data-testid="citation-snippet-body"]',
      (el) => getComputedStyle(el).backgroundColor,
    );
    // dark mode --citation-highlight = #FDE68A → rgb(253, 230, 138)
    expect(bg).toContain('253, 230, 138');
  });

  test('T6-11: panel 打开时主内容仍可滚动 (aria-modal=false)', async ({ page }) => {
    // 验证 body 没被 scroll-locked（aria-modal=false 不 lock 滚动）
    const overflow = await page.evaluate(
      () => getComputedStyle(document.body).overflow,
    );
    expect(overflow).not.toBe('hidden');
  });

  test('T6-13: panel transitionDuration === 240ms (--duration-base)', async ({ page }) => {
    await expect(
      page.locator('[data-testid="citation-panel"]'),
    ).toBeVisible();
    const duration = await page.$eval(
      '[data-testid="citation-panel"]',
      (el) => getComputedStyle(el).transitionDuration,
    );
    expect(duration).toBe('0.24s');
  });

  test('T6-14: panel 子树无 inline-style hex/rgb 色值', async ({ page }) => {
    const violations = await page.$$eval(
      '[data-testid="citation-panel"], [data-testid="citation-panel"] *',
      (els) =>
        els
          .map((el) => el.getAttribute('style'))
          .filter((s): s is string => !!s)
          .filter((s) => /#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(/.test(s)),
    );
    expect(violations).toEqual([]);
  });
});

test.describe('S2 P3 — T7 ReportMarkdownCanvas', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/research/demo-001/report');
  });

  test('T7-1: report-canvas 可见', async ({ page }) => {
    await expect(
      page.locator('[data-testid="report-canvas"]'),
    ).toBeVisible();
  });

  test('T7-2: report-canvas 含报告标题文本', async ({ page }) => {
    await expect(
      page.locator('[data-testid="report-canvas"]'),
    ).toContainText('AI Agent 在企业知识管理中的最佳落地路径');
  });

  test('T7-3: report-canvas 内 citation-badge 数 >= 6', async ({ page }) => {
    const count = await page
      .locator(
        '[data-testid="report-canvas"] [data-testid^="citation-badge-"]',
      )
      .count();
    expect(count).toBeGreaterThanOrEqual(6);
  });

  test('T7-4: report-canvas 内 conflict-block 数 === 1', async ({ page }) => {
    const count = await page
      .locator(
        '[data-testid="report-canvas"] [data-testid^="conflict-block-"]',
      )
      .count();
    expect(count).toBe(1);
  });

  test('T7-5: 点 canvas badge 后 panel 显示对应引用', async ({ page }) => {
    await page.click(
      '[data-testid="report-canvas"] [data-testid="citation-badge-c2"]',
    );
    await expect(
      page.locator('[data-testid="citation-panel"]'),
    ).toContainText('McKinsey');
  });

  test('T7-6: badge aria-expanded 点击后 false → true', async ({ page }) => {
    const c2 = page.locator(
      '[data-testid="report-canvas"] [data-testid="citation-badge-c2"]',
    );
    expect(await c2.getAttribute('aria-expanded')).toBe('false');
    await c2.click();
    expect(await c2.getAttribute('aria-expanded')).toBe('true');
  });

  test('T7-7: report-canvas 字号 >= 14px', async ({ page }) => {
    const fontSize = await page.$eval(
      '[data-testid="report-canvas"]',
      (el) => parseFloat(getComputedStyle(el).fontSize),
    );
    expect(fontSize).toBeGreaterThanOrEqual(14);
  });

  test('T7-8: report-canvas 子树无 inline-style hex/rgb 色值', async ({ page }) => {
    const violations = await page.$$eval(
      '[data-testid="report-canvas"], [data-testid="report-canvas"] *',
      (els) =>
        els
          .map((el) => el.getAttribute('style'))
          .filter((s): s is string => !!s)
          .filter((s) => /#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(/.test(s)),
    );
    expect(violations).toEqual([]);
  });

  test('T7-9: h1 唯一 + h2 数量 >= 1', async ({ page }) => {
    const h1Count = await page
      .locator('[data-testid="report-canvas"] h1')
      .count();
    expect(h1Count).toBe(1);
    const h2Count = await page
      .locator('[data-testid="report-canvas"] h2')
      .count();
    expect(h2Count).toBeGreaterThanOrEqual(1);
  });
});

test.describe('S2 P3 — T8 集成 + 视觉回归 + a11y 终检', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/research/demo-001/report');
    await expect(page.locator('[data-testid="p3-root"]')).toBeVisible();
    // 等所有三栏渲染完成（panel 默认开第 1 条）
    await expect(
      page.locator('[data-testid="kb-document-list"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="report-canvas"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="citation-panel"]'),
    ).toBeVisible();
  });

  test('T8-1: 三栏布局完整可见 (kb-panel + canvas + citation-panel-slot)', async ({
    page,
  }) => {
    await expect(
      page.locator('[data-testid="p3-kb-panel"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="p3-canvas"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="p3-citation-panel-slot"]'),
    ).toBeVisible();
  });

  test('T8-2: 左 288px / 右 360px (固定栏宽度)', async ({ page }) => {
    const left = await page.$eval(
      '[data-testid="p3-kb-panel"]',
      (el) => el.getBoundingClientRect().width,
    );
    const right = await page.$eval(
      '[data-testid="p3-citation-panel-slot"]',
      (el) => el.getBoundingClientRect().width,
    );
    expect(left).toBe(288);
    expect(right).toBe(360);
  });

  test('T8-3: 三栏宽度之和 === 1440px (1440 视口)', async ({ page }) => {
    const widths = await page.evaluate(() => {
      const sel = (id: string) =>
        document
          .querySelector(`[data-testid="${id}"]`)
          ?.getBoundingClientRect().width ?? 0;
      return {
        kb: sel('p3-kb-panel'),
        canvas: sel('p3-canvas'),
        slot: sel('p3-citation-panel-slot'),
      };
    });
    expect(widths.kb + widths.canvas + widths.slot).toBe(1440);
  });

  test('T8-4: axe 扫描 p3-root 子树 0 critical / 0 serious violations', async ({
    page,
  }) => {
    const results = await new AxeBuilder({ page })
      .include('[data-testid="p3-root"]')
      .analyze();
    const critical = results.violations.filter((v) => v.impact === 'critical');
    const serious = results.violations.filter((v) => v.impact === 'serious');
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test('T8-5: 全部 lucide 图标 aria-hidden="true"', async ({ page }) => {
    const iconClassNames = [
      'lucide-sparkles',
      'lucide-globe',
      'lucide-database',
      'lucide-triangle-alert',
      'lucide-alert-triangle',
      'lucide-lightbulb',
      'lucide-x',
    ];
    const selector = iconClassNames.map((c) => `svg.${c}`).join(', ');
    const states = await page.$$eval(selector, (els) =>
      els.map((el) => ({
        cls: el.getAttribute('class') ?? '',
        ariaHidden: el.getAttribute('aria-hidden'),
      })),
    );
    expect(states.length).toBeGreaterThan(0);
    for (const s of states) {
      expect(s.ariaHidden, `icon class=${s.cls}`).toBe('true');
    }
  });

  test('T8-6: p3-root 子树无 inline-style hex/rgb 色值', async ({ page }) => {
    const violations = await page.$$eval(
      '[data-testid="p3-root"], [data-testid="p3-root"] *',
      (els) =>
        els
          .map((el) => el.getAttribute('style'))
          .filter((s): s is string => !!s)
          .filter((s) => /#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(/.test(s)),
    );
    expect(violations).toEqual([]);
  });

  test('T8-7: p3-root 子树 className 不含 Tailwind arbitrary 色值 [#xxx]', async ({
    page,
  }) => {
    const violations = await page.$$eval(
      '[data-testid="p3-root"], [data-testid="p3-root"] *',
      (els) =>
        els
          .map((el) => el.getAttribute('class') ?? '')
          .filter((cls) => /\[#[0-9a-fA-F]{3,8}\]/.test(cls)),
    );
    expect(violations).toEqual([]);
  });

  test('T8-8: 视觉回归 — 1440×900 dark baseline', async ({ page }) => {
    await expect(page).toHaveScreenshot('p3-report-reading-dark.png', {
      fullPage: false,
      maxDiffPixelRatio: 0.02,
    });
  });

  test('T8-9: 视觉回归 — 1440×900 light baseline', async ({ page }) => {
    await page.evaluate(() =>
      document.documentElement.setAttribute('data-theme', 'light'),
    );
    // 确定性等待 light scope 的 --bg token 解析完成（不用 waitForTimeout 防 CI flaky）。
    await expect
      .poll(() =>
        page.$eval(
          '[data-testid="p3-root"]',
          (el) => getComputedStyle(el).backgroundColor,
        ),
      )
      .toBe('rgb(250, 250, 250)'); // light --bg = #FAFAFA
    await expect(page).toHaveScreenshot('p3-report-reading-light.png', {
      fullPage: false,
      maxDiffPixelRatio: 0.02,
    });
  });

  test('T8-10: P1 (/) topbar 无回归', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="topbar"]')).toBeVisible();
  });

  test('T8-11: P2 (/research/demo-001) p2-root 无回归', async ({ page }) => {
    await page.goto('/research/demo-001');
    await expect(page.locator('[data-testid="p2-root"]')).toBeVisible();
  });
});
