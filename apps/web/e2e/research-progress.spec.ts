import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

test.describe('S2 P2 — T2 路由 + P2 容器 + TopBar 骨架', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('T2-1: 访问 /research/demo-001 返回 HTTP 200', async ({ page }) => {
    const response = await page.goto('/research/demo-001');
    expect(response?.status()).toBe(200);
  });

  test('T2-2: p2-root 可见', async ({ page }) => {
    await page.goto('/research/demo-001');
    await expect(page.locator('[data-testid="p2-root"]')).toBeVisible();
  });

  test('T2-3: p2-root 背景色 === rgb(10, 10, 11) (--bg dark)', async ({ page }) => {
    await page.goto('/research/demo-001');
    const bg = await page.$eval(
      '[data-testid="p2-root"]',
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(bg).toBe('rgb(10, 10, 11)');
  });

  test('T2-4: p2-split 可见', async ({ page }) => {
    await page.goto('/research/demo-001');
    await expect(page.locator('[data-testid="p2-split"]')).toBeVisible();
  });

  test('T2-5: p2-task-panel 占位 div 可见，宽度 432px', async ({ page }) => {
    await page.goto('/research/demo-001');
    const panel = page.locator('[data-testid="p2-task-panel"]');
    await expect(panel).toBeVisible();
    const width = await panel.evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBe(432);
  });

  test('T2-6: p2-canvas 占位 div 可见，宽度 1008px', async ({ page }) => {
    await page.goto('/research/demo-001');
    const canvas = page.locator('[data-testid="p2-canvas"]');
    await expect(canvas).toBeVisible();
    const width = await canvas.evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBe(1008);
  });

  // T2-7 已被 T8-1 / T8-2 取代（占位 footer 由 BottomActiveBar 真实组件替换）

  test('T2-8: 1440×900 视口下 split 总高度 === 780px', async ({ page }) => {
    await page.goto('/research/demo-001');
    const height = await page.$eval(
      '[data-testid="p2-split"]',
      (el) => el.getBoundingClientRect().height,
    );
    expect(height).toBe(780);
  });

  test('T2-9: 左右面板宽度之和填满视口（验证 canvas 流式填充剩余空间）', async ({ page }) => {
    await page.goto('/research/demo-001');
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    const widths = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="p2-task-panel"]');
      const canvas = document.querySelector('[data-testid="p2-canvas"]');
      return {
        panel: panel?.getBoundingClientRect().width ?? 0,
        canvas: canvas?.getBoundingClientRect().width ?? 0,
      };
    });
    expect(widths.panel + widths.canvas).toBe(viewport!.width);
  });

  test('T2-10: p2-root 子树无 inline-style hex/rgb 色值', async ({ page }) => {
    await page.goto('/research/demo-001');
    const violations = await page.$$eval(
      '[data-testid="p2-root"], [data-testid="p2-root"] *',
      (els) =>
        els
          .map((el) => el.getAttribute('style'))
          .filter((s): s is string => !!s)
          .filter((s) => /#[0-9a-fA-F]{3,8}|rgb\(|rgba\(|hsl\(/.test(s)),
    );
    expect(violations).toEqual([]);
  });

  test('T2-11: p2-topbar 高度计算值 === 64px', async ({ page }) => {
    await page.goto('/research/demo-001');
    const height = await page.$eval(
      '[data-testid="p2-topbar"]',
      (el) => el.getBoundingClientRect().height,
    );
    expect(height).toBe(64);
  });

  test('T2-12: p2-topbar 含 "Lumen" 文本', async ({ page }) => {
    await page.goto('/research/demo-001');
    await expect(page.locator('[data-testid="p2-topbar"]')).toContainText('Lumen');
  });

  test('T2-13: session-meta 可见，内容含 demo-001', async ({ page }) => {
    await page.goto('/research/demo-001');
    const meta = page.locator('[data-testid="session-meta"]');
    await expect(meta).toBeVisible();
    await expect(meta).toContainText('demo-001');
  });

  test('T2-14: P1 (/) 的 topbar 仍可见（P1 无回归）', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="topbar"]')).toBeVisible();
  });
});

test.describe('S2 P2 — T3 Task Panel + TaskItem', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/research/demo-001');
  });

  test('T3-1: task-panel 在 /research/demo-001 可见', async ({ page }) => {
    await expect(page.locator('[data-testid="task-panel"]')).toBeVisible();
  });

  test('T3-2: task-item 数量在 5-7 之间（间接验证 C1-7）', async ({ page }) => {
    const count = await page.locator('li[data-testid^="task-item-"]').count();
    expect(count).toBeGreaterThanOrEqual(5);
    expect(count).toBeLessThanOrEqual(7);
  });

  test('T3-3: 至少一个 task-item planning 态可见', async ({ page }) => {
    await expect(page.locator('[data-testid^="task-item-"][data-testid$="-planning"]').first()).toBeVisible();
  });

  test('T3-4: 至少一个 task-item retrieving 态可见', async ({ page }) => {
    await expect(page.locator('[data-testid^="task-item-"][data-testid$="-retrieving"]').first()).toBeVisible();
  });

  test('T3-5: 至少一个 task-item completed 态可见', async ({ page }) => {
    await expect(page.locator('[data-testid^="task-item-"][data-testid$="-completed"]').first()).toBeVisible();
  });

  test('T3-6: planning 态状态圆点 backgroundColor === rgb(59, 130, 246)', async ({ page }) => {
    const item = page.locator('[data-testid^="task-item-"][data-testid$="-planning"]').first();
    const dot = item.locator('[data-testid^="task-item-dot-"]');
    const bg = await dot.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe('rgb(59, 130, 246)');
  });

  test('T3-7: retrieving 态状态圆点 backgroundColor === rgb(245, 158, 11)', async ({ page }) => {
    const item = page.locator('[data-testid^="task-item-"][data-testid$="-retrieving"]').first();
    const dot = item.locator('[data-testid^="task-item-dot-"]');
    const bg = await dot.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe('rgb(245, 158, 11)');
  });

  test('T3-8: completed 态状态圆点 backgroundColor === rgb(16, 185, 129)', async ({ page }) => {
    const item = page.locator('[data-testid^="task-item-"][data-testid$="-completed"]').first();
    const dot = item.locator('[data-testid^="task-item-dot-"]');
    const bg = await dot.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe('rgb(16, 185, 129)');
  });

  test('T3-9: retrieving 态 task-item 中 task-item-spinner 可见', async ({ page }) => {
    const item = page.locator('[data-testid^="task-item-"][data-testid$="-retrieving"]').first();
    await expect(item.locator('[data-testid="task-item-spinner"]')).toBeVisible();
  });

  test('T3-10: completed 态 task-item 中 task-item-check 可见', async ({ page }) => {
    const item = page.locator('[data-testid^="task-item-"][data-testid$="-completed"]').first();
    await expect(item.locator('[data-testid="task-item-check"]')).toBeVisible();
  });

  test('T3-11: task-panel 字号 >= 14px', async ({ page }) => {
    const fontSize = await page.$eval(
      '[data-testid="task-panel"]',
      (el) => getComputedStyle(el).fontSize,
    );
    expect(parseFloat(fontSize)).toBeGreaterThanOrEqual(14);
  });

  test('T3-12: task-panel 子树无 inline-style hex/rgb 色值', async ({ page }) => {
    const violations = await page.$$eval(
      '[data-testid="task-panel"], [data-testid="task-panel"] *',
      (els) =>
        els
          .map((el) => el.getAttribute('style'))
          .filter((s): s is string => !!s)
          .filter((s) => /#[0-9a-fA-F]{3,8}|rgb\(|rgba\(|hsl\(/.test(s)),
    );
    expect(violations).toEqual([]);
  });

  test('T3-13: 所有 task-item-spinner 和 task-item-check 图标均设 aria-hidden="true"', async ({ page }) => {
    const violations = await page.$$eval(
      '[data-testid="task-item-spinner"], [data-testid="task-item-check"]',
      (els) => els.filter((el) => el.getAttribute('aria-hidden') !== 'true').length,
    );
    expect(violations).toBe(0);
  });
});

test.describe('S2 P2 — T4 React Flow Canvas Provider', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('T4-1: research-canvas 在 /research/demo-001 可见', async ({ page }) => {
    await page.goto('/research/demo-001');
    await expect(page.locator('[data-testid="research-canvas"]')).toBeVisible();
  });

  test('T4-2: research-canvas 宽度 === 1008px', async ({ page }) => {
    await page.goto('/research/demo-001');
    const width = await page.$eval(
      '[data-testid="research-canvas"]',
      (el) => el.getBoundingClientRect().width,
    );
    expect(width).toBe(1008);
  });

  test('T4-3: research-canvas 高度 === 780px', async ({ page }) => {
    await page.goto('/research/demo-001');
    const height = await page.$eval(
      '[data-testid="research-canvas"]',
      (el) => el.getBoundingClientRect().height,
    );
    expect(height).toBe(780);
  });

  test('T4-4: .react-flow 容器存在于 research-canvas 内部', async ({ page }) => {
    await page.goto('/research/demo-001');
    const flow = page.locator('[data-testid="research-canvas"] .react-flow');
    await expect(flow).toHaveCount(1);
  });

  test('T4-5: React Flow 内部 viewport / pane 可见（验证 RF 已 mount）', async ({ page }) => {
    await page.goto('/research/demo-001');
    await expect(page.locator('[data-testid="research-canvas"] .react-flow__pane').first()).toBeVisible();
    await expect(page.locator('[data-testid="research-canvas"] .react-flow__viewport').first()).toBeVisible();
  });

  test('T4-6: 无 hydration 错误（console 无 "Hydration" 相关警告）', async ({ page }) => {
    const messages: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') messages.push(msg.text());
    });
    page.on('pageerror', (err) => messages.push(err.message));
    await page.goto('/research/demo-001', { waitUntil: 'networkidle' });
    await expect(page.locator('[data-testid="research-canvas"] .react-flow')).toHaveCount(1);
    const hydrationIssues = messages.filter((m) => /hydrat/i.test(m));
    expect(hydrationIssues).toEqual([]);
  });

  test('T4-7: 无 SSR/CSR 不一致 "Extra attributes" 错误', async ({ page }) => {
    const messages: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') messages.push(msg.text());
    });
    page.on('pageerror', (err) => messages.push(err.message));
    await page.goto('/research/demo-001', { waitUntil: 'networkidle' });
    await expect(page.locator('[data-testid="research-canvas"] .react-flow')).toHaveCount(1);
    const extraAttrIssues = messages.filter((m) => /Extra attributes|Prop .* did not match|did not match/i.test(m));
    expect(extraAttrIssues).toEqual([]);
  });

  test('T4-8: research-canvas 背景色 === rgb(10, 10, 11) (--bg dark)', async ({ page }) => {
    await page.goto('/research/demo-001');
    const bg = await page.$eval(
      '[data-testid="research-canvas"]',
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(bg).toBe('rgb(10, 10, 11)');
  });

  test('T4-9: React Flow MiniMap 未渲染', async ({ page }) => {
    await page.goto('/research/demo-001');
    await expect(page.locator('[data-testid="research-canvas"] .react-flow')).toHaveCount(1);
    await expect(page.locator('.react-flow__minimap')).toHaveCount(0);
  });

  test('T4-10: React Flow attribution 不可见 (proOptions.hideAttribution)', async ({ page }) => {
    await page.goto('/research/demo-001');
    await expect(page.locator('[data-testid="research-canvas"] .react-flow')).toHaveCount(1);
    await expect(page.locator('.react-flow__attribution')).toHaveCount(0);
  });

  test('T4-11: .react-flow 容器 className 包含 "dark"（colorMode="dark" 生效）', async ({ page }) => {
    await page.goto('/research/demo-001');
    const cls = await page.$eval(
      '[data-testid="research-canvas"] .react-flow',
      (el) => el.className,
    );
    expect(cls).toMatch(/(^|\s)dark(\s|$)/);
  });

  test('T4-12: .react-flow__renderer position 计算值 === "absolute"（RF base CSS 已生效）', async ({ page }) => {
    await page.goto('/research/demo-001');
    const renderer = page.locator('[data-testid="research-canvas"] .react-flow__renderer').first();
    await expect(renderer).toHaveCount(1);
    const position = await renderer.evaluate((el) => getComputedStyle(el).position);
    expect(position).toBe('absolute');
  });
});

test.describe('S2 P2 — T5 ResearchNodeCard', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/research/demo-001');
    await expect(page.locator('[data-testid="research-canvas"] .react-flow')).toHaveCount(1);
  });

  test('T5-1: node-inner-web-1 可见', async ({ page }) => {
    await expect(page.locator('[data-testid="node-inner-web-1"]')).toBeVisible();
  });

  test('T5-2: web-1 borderRadius === 24px (--radius-lg)', async ({ page }) => {
    const radius = await page.$eval(
      '[data-testid="node-inner-web-1"]',
      (el) => getComputedStyle(el).borderRadius,
    );
    expect(radius).toBe('24px');
  });

  test('T5-3: kb-1 borderRadius === 2px (--radius-xs)', async ({ page }) => {
    const radius = await page.$eval(
      '[data-testid="node-inner-kb-1"]',
      (el) => getComputedStyle(el).borderRadius,
    );
    expect(radius).toBe('2px');
  });

  test('T5-4: web-1 borderColor 解析包含 "14, 165, 233" (--track-web-border)', async ({ page }) => {
    const color = await page.$eval(
      '[data-testid="node-inner-web-1"]',
      (el) => getComputedStyle(el).borderColor,
    );
    expect(color).toContain('14, 165, 233');
  });

  test('T5-5: kb-1 borderColor 解析包含 "139, 92, 246" (--track-kb-border)', async ({ page }) => {
    const color = await page.$eval(
      '[data-testid="node-inner-kb-1"]',
      (el) => getComputedStyle(el).borderColor,
    );
    expect(color).toContain('139, 92, 246');
  });

  test('T5-6: web-1 内含 Globe 图标 (aria-hidden=true)', async ({ page }) => {
    const icon = page.locator('[data-testid="node-inner-web-1"] svg.lucide-globe');
    await expect(icon).toHaveCount(1);
    expect(await icon.getAttribute('aria-hidden')).toBe('true');
  });

  test('T5-7: kb-1 内含 Database 图标 (aria-hidden=true)', async ({ page }) => {
    const icon = page.locator('[data-testid="node-inner-kb-1"] svg.lucide-database');
    await expect(icon).toHaveCount(1);
    expect(await icon.getAttribute('aria-hidden')).toBe('true');
  });

  test('T5-8: planning 节点 (merge) 包含状态圆点，且无 Loader2 图标', async ({ page }) => {
    const inner = page.locator('[data-testid="node-inner-merge"]');
    await expect(inner).toBeVisible();
    await expect(inner.locator('svg.lucide-loader-2, svg.lucide-loader-circle')).toHaveCount(0);
  });

  test('T5-9: retrieving 节点 (web-2) 包含 Loader2 (aria-hidden=true)', async ({ page }) => {
    const loader = page.locator(
      '[data-testid="node-inner-web-2"] svg.lucide-loader-2, [data-testid="node-inner-web-2"] svg.lucide-loader-circle',
    );
    await expect(loader.first()).toBeVisible();
    expect(await loader.first().getAttribute('aria-hidden')).toBe('true');
  });

  test('T5-10: completed 节点 (web-1) 包含 Check 图标 (aria-hidden=true)', async ({ page }) => {
    const check = page.locator('[data-testid="node-inner-web-1"] svg.lucide-check');
    await expect(check).toHaveCount(1);
    expect(await check.getAttribute('aria-hidden')).toBe('true');
  });

  test('T5-11: web-1 inner div 宽度 === 200px，高度 === 88px', async ({ page }) => {
    const size = await page.$eval('[data-testid="node-inner-web-1"]', (el) => {
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height };
    });
    expect(size.width).toBe(200);
    expect(size.height).toBe(88);
  });

  test('T5-12: web-1 role="group" 且 aria-label 包含节点标题', async ({ page }) => {
    const inner = page.locator('[data-testid="node-inner-web-1"]');
    expect(await inner.getAttribute('role')).toBe('group');
    const label = await inner.getAttribute('aria-label');
    expect(label).toContain('公开 Web · 行业报告');
  });

  test('T5-13: web-1 进度文本 fontFamily 包含 "JetBrains Mono"', async ({ page }) => {
    const family = await page.$eval(
      '[data-testid="node-progress-web-1"]',
      (el) => getComputedStyle(el).fontFamily,
    );
    expect(family).toContain('JetBrains Mono');
  });

  test('T5-14: node-inner-web-1 子树无 inline-style hex/rgb 色值', async ({ page }) => {
    const violations = await page.$$eval(
      '[data-testid="node-inner-web-1"], [data-testid="node-inner-web-1"] *',
      (els) =>
        els
          .map((el) => el.getAttribute('style'))
          .filter((s): s is string => !!s)
          .filter((s) => /#[0-9a-fA-F]{3,8}|rgb\(|rgba\(|hsl\(/.test(s)),
    );
    expect(violations).toEqual([]);
  });
});

test.describe('S2 P2 — T6 ConflictNode', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/research/demo-001');
    await expect(page.locator('[data-testid="research-canvas"] .react-flow')).toHaveCount(1);
  });

  test('T6-1: node-inner-conflict-c01 可见', async ({ page }) => {
    await expect(page.locator('[data-testid^="node-inner-conflict"]')).toBeVisible();
  });

  test('T6-2: conflict inner div borderRadius === 9999px', async ({ page }) => {
    const radius = await page.$eval(
      '[data-testid="node-inner-conflict-c01"]',
      (el) => getComputedStyle(el).borderRadius,
    );
    expect(radius).toBe('9999px');
  });

  test('T6-3: conflict inner div backgroundColor 解析包含 "255, 132, 0" (--conflict-bg)', async ({ page }) => {
    const bg = await page.$eval(
      '[data-testid="node-inner-conflict-c01"]',
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(bg).toContain('255, 132, 0');
  });

  test('T6-4: conflict inner div borderColor 解析包含 "255, 132, 0" (--conflict-border)', async ({ page }) => {
    const color = await page.$eval(
      '[data-testid="node-inner-conflict-c01"]',
      (el) => getComputedStyle(el).borderColor,
    );
    expect(color).toContain('255, 132, 0');
  });

  test('T6-5: conflict 内含 TriangleAlert 图标 (aria-hidden=true)', async ({ page }) => {
    const icon = page.locator(
      '[data-testid="node-inner-conflict-c01"] svg.lucide-triangle-alert, [data-testid="node-inner-conflict-c01"] svg.lucide-alert-triangle',
    );
    await expect(icon.first()).toBeVisible();
    expect(await icon.first().getAttribute('aria-hidden')).toBe('true');
  });

  test('T6-6: TriangleAlert 图标宽高均 === 14px', async ({ page }) => {
    const size = await page.$eval(
      '[data-testid="node-inner-conflict-c01"] svg.lucide-triangle-alert, [data-testid="node-inner-conflict-c01"] svg.lucide-alert-triangle',
      (el) => {
        const r = (el as SVGElement).getBoundingClientRect();
        return { width: r.width, height: r.height };
      },
    );
    expect(size.width).toBe(14);
    expect(size.height).toBe(14);
  });

  test('T6-7: conflict-divider 可见', async ({ page }) => {
    await expect(page.locator('[data-testid="conflict-divider"]')).toBeVisible();
  });

  test('T6-8: conflict 节点文本含 "ConflictSubgraph"', async ({ page }) => {
    const text = await page.locator('[data-testid="node-inner-conflict-c01"]').textContent();
    expect(text).toContain('ConflictSubgraph');
  });

  test('T6-9: conflict 节点文本含 "#C01"', async ({ page }) => {
    const text = await page.locator('[data-testid="node-inner-conflict-c01"]').textContent();
    expect(text).toContain('#C01');
  });

  test('T6-10: conflict 标识文本 fontFamily 包含 "JetBrains Mono"', async ({ page }) => {
    const family = await page.$eval(
      '[data-testid="conflict-identifier"]',
      (el) => getComputedStyle(el).fontFamily,
    );
    expect(family).toContain('JetBrains Mono');
  });

  test('T6-11: conflict inner div 高度 === 48px', async ({ page }) => {
    const height = await page.$eval(
      '[data-testid="node-inner-conflict-c01"]',
      (el) => el.getBoundingClientRect().height,
    );
    expect(height).toBe(48);
  });

  test('T6-12: conflict inner div role="group" 且 aria-label 含冲突概述', async ({ page }) => {
    const inner = page.locator('[data-testid="node-inner-conflict-c01"]');
    const role = await inner.getAttribute('role');
    expect(role).toBe('group');
    const label = await inner.getAttribute('aria-label');
    expect(label).toContain('公开 Web 与私有 KB 在落地路径上结论不一致');
  });

  test('T6-13: node-inner-conflict-c01 子树无 inline-style hex/rgb 色值', async ({ page }) => {
    const violations = await page.$$eval(
      '[data-testid="node-inner-conflict-c01"], [data-testid="node-inner-conflict-c01"] *',
      (els) =>
        els
          .map((el) => el.getAttribute('style'))
          .filter((s): s is string => !!s)
          .filter((s) => /#[0-9a-fA-F]{3,8}|rgb\(|rgba\(|hsl\(/.test(s)),
    );
    expect(violations).toEqual([]);
  });
});

test.describe('S2 P2 — T7 DualTrackEdge', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/research/demo-001');
    await expect(page.locator('[data-testid="research-canvas"] .react-flow')).toHaveCount(1);
    // React Flow 对边的渲染依赖节点测量，需在边路径实际挂载后再断言。
    await expect
      .poll(async () => page.locator('.react-flow path.react-flow__edge-path').count())
      .toBeGreaterThanOrEqual(4);
  });

  test('T7-1: 画布内 SVG path.react-flow__edge-path 数量 >= 4', async ({ page }) => {
    const count = await page.locator('.react-flow path.react-flow__edge-path').count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('T7-2: web variant 边 stroke 包含 "14, 165, 233" (--track-web-border)', async ({ page }) => {
    const stroke = await page.$eval(
      '[data-id="e-web1-web2"] path.react-flow__edge-path',
      (el) => getComputedStyle(el as SVGPathElement).stroke,
    );
    expect(stroke).toContain('14, 165, 233');
  });

  test('T7-3: kb variant 边 strokeDasharray === "4, 4" 或 "4,4"', async ({ page }) => {
    const dash = await page.$eval(
      '[data-id="e-kb1-kb2"] path.react-flow__edge-path',
      (el) => getComputedStyle(el as SVGPathElement).strokeDasharray,
    );
    expect(dash).toMatch(/^4(?:px)?,\s*4(?:px)?$/);
  });

  test('T7-4: kb variant 边 stroke 包含 "139, 92, 246" (--track-kb-border)', async ({ page }) => {
    const stroke = await page.$eval(
      '[data-id="e-kb1-kb2"] path.react-flow__edge-path',
      (el) => getComputedStyle(el as SVGPathElement).stroke,
    );
    expect(stroke).toContain('139, 92, 246');
  });

  test('T7-5: conflict variant 边 stroke 包含 "255, 132, 0" (--conflict-border)', async ({ page }) => {
    const stroke = await page.$eval(
      '[data-id="e-web2-conflict"] path.react-flow__edge-path',
      (el) => getComputedStyle(el as SVGPathElement).stroke,
    );
    expect(stroke).toContain('255, 132, 0');
  });

  test('T7-6: neutral variant 边 stroke 包含 "39, 39, 42" (--border dark)', async ({ page }) => {
    const stroke = await page.$eval(
      '[data-id="e-input-web1"] path.react-flow__edge-path',
      (el) => getComputedStyle(el as SVGPathElement).stroke,
    );
    expect(stroke).toContain('39, 39, 42');
  });

  test('T7-7: 所有边 strokeWidth === "1.5"', async ({ page }) => {
    const widths = await page.$$eval(
      '.react-flow path.react-flow__edge-path',
      (els) => els.map((el) => getComputedStyle(el as SVGPathElement).strokeWidth),
    );
    expect(widths.length).toBeGreaterThanOrEqual(4);
    for (const w of widths) {
      expect(w).toMatch(/^1\.5(?:px)?$/);
    }
  });

  test('T7-8: 所有边无 markerEnd 属性 (无箭头)', async ({ page }) => {
    const markers = await page.$$eval(
      '.react-flow path.react-flow__edge-path',
      (els) => els.map((el) => el.getAttribute('marker-end')),
    );
    for (const m of markers) {
      expect(m === null || m === '' || m === 'none').toBe(true);
    }
  });

  test('T7-9: 所有边 role="presentation" 或父容器 aria-hidden', async ({ page }) => {
    const states = await page.$$eval(
      '.react-flow path.react-flow__edge-path',
      (els) =>
        els.map((el) => {
          const ownRole = el.getAttribute('role');
          const groupAriaHidden = el.closest('g.react-flow__edge')?.getAttribute('aria-hidden');
          const svgAriaHidden = el.closest('svg')?.getAttribute('aria-hidden');
          return {
            ownRole,
            groupAriaHidden,
            svgAriaHidden,
          };
        }),
    );
    for (const s of states) {
      const ok =
        s.ownRole === 'presentation' ||
        s.groupAriaHidden === 'true' ||
        s.svgAriaHidden === 'true';
      expect(ok).toBe(true);
    }
  });

  test('T7-10: 边 path 无 inline-style hex/rgb 色值 (var(--xxx) 可接受)', async ({ page }) => {
    const violations = await page.$$eval(
      '.react-flow path.react-flow__edge-path',
      (els) =>
        els
          .map((el) => el.getAttribute('style'))
          .filter((s): s is string => !!s)
          .filter((s) => /#[0-9a-fA-F]{3,8}|rgb\(|rgba\(|hsl\(/.test(s)),
    );
    expect(violations).toEqual([]);
  });
});

test.describe('S2 P2 — T8 Bottom Active Node Bar', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/research/demo-001');
    await expect(page.locator('[data-testid="p2-root"]')).toBeVisible();
  });

  test('T8-1: bottom-active-bar 可见', async ({ page }) => {
    await expect(page.locator('[data-testid="bottom-active-bar"]')).toBeVisible();
  });

  test('T8-2: bottom-active-bar 高度 === 56px', async ({ page }) => {
    const h = await page.$eval(
      '[data-testid="bottom-active-bar"]',
      (el) => el.getBoundingClientRect().height,
    );
    expect(h).toBe(56);
  });

  test('T8-3: bottom-active-bar 宽度 === 1440px (1440 视口)', async ({ page }) => {
    const w = await page.$eval(
      '[data-testid="bottom-active-bar"]',
      (el) => el.getBoundingClientRect().width,
    );
    expect(w).toBe(1440);
  });

  test('T8-4: active-node-label 可见且文本非空', async ({ page }) => {
    const label = page.locator('[data-testid="active-node-label"]');
    await expect(label).toBeVisible();
    const text = (await label.textContent())?.trim() ?? '';
    expect(text.length).toBeGreaterThan(0);
  });

  test('T8-5: sse-meta 可见', async ({ page }) => {
    await expect(page.locator('[data-testid="sse-meta"]')).toBeVisible();
  });

  test('T8-6: controls-area 可见', async ({ page }) => {
    await expect(page.locator('[data-testid="controls-area"]')).toBeVisible();
  });

  test('T8-7: btn-pause 可见且 tagName === "BUTTON"', async ({ page }) => {
    const btn = page.locator('[data-testid="btn-pause"]');
    await expect(btn).toBeVisible();
    const tag = await btn.evaluate((el) => el.tagName);
    expect(tag).toBe('BUTTON');
  });

  test('T8-8: btn-pause 有可访问名 (aria-label 或文本子节点)', async ({ page }) => {
    const btn = page.locator('[data-testid="btn-pause"]');
    const aria = await btn.getAttribute('aria-label');
    const text = (await btn.textContent())?.trim() ?? '';
    const hasAccessibleName = (aria !== null && aria.length > 0) || text.length > 0;
    expect(hasAccessibleName).toBe(true);
  });

  test('T8-9: bottom-active-bar backgroundColor 解析包含 "24, 24, 27" (--surface dark)', async ({ page }) => {
    const bg = await page.$eval(
      '[data-testid="bottom-active-bar"]',
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(bg).toContain('24, 24, 27');
  });

  test('T8-10: bottom-active-bar 顶部有 1px --border 色边框 (rgb 含 "39, 39, 42")', async ({ page }) => {
    const top = await page.$eval(
      '[data-testid="bottom-active-bar"]',
      (el) => {
        const cs = getComputedStyle(el);
        return { width: cs.borderTopWidth, color: cs.borderTopColor };
      },
    );
    expect(top.width).toBe('1px');
    expect(top.color).toContain('39, 39, 42');
  });

  test('T8-11: active-node-label 字号 >= 14px', async ({ page }) => {
    const fs = await page.$eval(
      '[data-testid="active-node-label"]',
      (el) => parseFloat(getComputedStyle(el).fontSize),
    );
    expect(fs).toBeGreaterThanOrEqual(14);
  });

  test('T8-12a: btn-pause 内 Pause 图标 aria-hidden="true"', async ({ page }) => {
    const icon = page.locator('[data-testid="btn-pause"] svg.lucide-pause');
    await expect(icon).toHaveCount(1);
    expect(await icon.getAttribute('aria-hidden')).toBe('true');
  });

  test('T8-12: bottom-active-bar 子树无 inline-style hex/rgb 色值', async ({ page }) => {
    const violations = await page.$$eval(
      '[data-testid="bottom-active-bar"], [data-testid="bottom-active-bar"] *',
      (els) =>
        els
          .map((el) => el.getAttribute('style'))
          .filter((s): s is string => !!s)
          .filter((s) => /#[0-9a-fA-F]{3,8}|rgb\(|rgba\(|hsl\(/.test(s)),
    );
    expect(violations).toEqual([]);
  });
});

test.describe('S2 P2 — T9 静态拓扑 + 视觉回归 + a11y 终检', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/research/demo-001');
    await expect(page.locator('[data-testid="p2-root"]')).toBeVisible();
    await expect(page.locator('[data-testid="research-canvas"] .react-flow')).toHaveCount(1);
    await expect
      .poll(async () => page.locator('.react-flow__node').count())
      .toBeGreaterThanOrEqual(5);
  });

  test('T9-1: .react-flow__node 数量 >= 5', async ({ page }) => {
    const count = await page.locator('.react-flow .react-flow__node').count();
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test('T9-2: .react-flow__edge 数量 >= 4', async ({ page }) => {
    const count = await page.locator('.react-flow .react-flow__edge').count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('T9-3: 至少一个 web 节点和一个 kb 节点 inner div 同时可见', async ({ page }) => {
    await expect(page.locator('[data-testid="node-inner-web-1"]')).toBeVisible();
    await expect(page.locator('[data-testid="node-inner-kb-1"]')).toBeVisible();
  });

  test('T9-4: ConflictNode X 中心位于 web/kb 节点 X 范围中央 (误差 <= 60px)', async ({ page }) => {
    const centerX = (sel: string) =>
      page.$eval(sel, (el) => {
        const r = el.getBoundingClientRect();
        return r.left + r.width / 2;
      });
    const xs = await Promise.all([
      centerX('[data-testid="node-inner-web-1"]'),
      centerX('[data-testid="node-inner-web-2"]'),
      centerX('[data-testid="node-inner-kb-1"]'),
      centerX('[data-testid="node-inner-kb-2"]'),
    ]);
    const conflictX = await centerX('[data-testid="node-inner-conflict-c01"]');
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const midX = (minX + maxX) / 2;
    expect(Math.abs(conflictX - midX)).toBeLessThanOrEqual(60);
  });

  test('T9-5a: p2-root 内非 [role="presentation"] 元素 inline-style 不含 hex 色值', async ({ page }) => {
    const violations = await page.$$eval(
      '[data-testid="p2-root"], [data-testid="p2-root"] *',
      (els) =>
        els
          .filter((el) => el.getAttribute('role') !== 'presentation')
          .map((el) => ({
            style: el.getAttribute('style') ?? '',
            tag: el.tagName,
          }))
          .filter((entry) => /#[0-9a-fA-F]{3,8}/.test(entry.style)),
    );
    expect(violations).toEqual([]);
  });

  test('T9-5b: p2-root 内非 [role="presentation"] 元素 inline-style 不含 rgb/rgba 色值', async ({ page }) => {
    const violations = await page.$$eval(
      '[data-testid="p2-root"], [data-testid="p2-root"] *',
      (els) =>
        els
          .filter((el) => el.getAttribute('role') !== 'presentation')
          .map((el) => ({
            style: el.getAttribute('style') ?? '',
            tag: el.tagName,
          }))
          .filter((entry) => /rgb\(\d|rgba\(\d/.test(entry.style)),
    );
    expect(violations).toEqual([]);
  });

  test('T9-5c: p2-root 内非 [role="presentation"] 元素 className 不含 Tailwind arbitrary 色值 [#xxx]', async ({ page }) => {
    const violations = await page.$$eval(
      '[data-testid="p2-root"], [data-testid="p2-root"] *',
      (els) =>
        els
          .filter((el) => el.getAttribute('role') !== 'presentation')
          .map((el) => el.getAttribute('class') ?? '')
          .filter((cls) => /\[#[0-9a-fA-F]{3,8}\]/.test(cls)),
    );
    expect(violations).toEqual([]);
  });

  test('T9-6: axe 扫描 p2-root 零 critical / 零 serious violations', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .include('[data-testid="p2-root"]')
      .analyze();
    const critical = results.violations.filter((v) => v.impact === 'critical');
    const serious = results.violations.filter((v) => v.impact === 'serious');
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test('T9-7: btn-pause 通过 Tab 可聚焦 (tabindex 非 -1, 非 disabled)', async ({ page }) => {
    const btn = page.locator('[data-testid="btn-pause"]');
    const tabindex = await btn.getAttribute('tabindex');
    const disabled = await btn.getAttribute('disabled');
    expect(disabled).toBeNull();
    expect(tabindex === null || parseInt(tabindex, 10) >= 0).toBe(true);
    await btn.focus();
    const isFocused = await btn.evaluate((el) => el === document.activeElement);
    expect(isFocused).toBe(true);
  });

  test('T9-8: 全量扫描 lucide 图标均 aria-hidden="true"', async ({ page }) => {
    const iconClassNames = [
      'lucide-loader-2',
      'lucide-loader-circle',
      'lucide-check',
      'lucide-globe',
      'lucide-database',
      'lucide-lock',
      'lucide-triangle-alert',
      'lucide-alert-triangle',
      'lucide-pause',
      'lucide-sparkles',
      'lucide-search',
      'lucide-clock',
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

  test('T9-9: 视觉回归 — 1440×900 dark baseline', async ({ page }) => {
    // 已在 beforeEach 等待节点 + 边到位
    await expect
      .poll(async () => page.locator('.react-flow path.react-flow__edge-path').count())
      .toBeGreaterThanOrEqual(4);
    await expect(page).toHaveScreenshot('p2-research-progress-dark.png', {
      fullPage: false,
      mask: [page.locator('[data-testid="sse-meta"]')],
      maxDiffPixelRatio: 0.02,
    });
  });

  test('T9-10: 视觉回归 — 1440×900 light baseline', async ({ page }) => {
    await page.evaluate(() =>
      document.documentElement.setAttribute('data-theme', 'light'),
    );
    await expect
      .poll(async () => page.locator('.react-flow path.react-flow__edge-path').count())
      .toBeGreaterThanOrEqual(4);
    await expect(page).toHaveScreenshot('p2-research-progress-light.png', {
      fullPage: false,
      mask: [page.locator('[data-testid="sse-meta"]')],
      maxDiffPixelRatio: 0.02,
    });
  });
});
