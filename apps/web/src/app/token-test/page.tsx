'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

type Theme = 'dark' | 'light';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-medium text-fg">{title}</h2>
      <div className="flex flex-wrap gap-3">{children}</div>
    </section>
  );
}

function Swatch({
  testId,
  label,
  className,
  style,
}: {
  testId: string;
  label: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className="flex flex-col items-start gap-1">
      <div
        data-testid={testId}
        className={`size-20 rounded-md border border-border ${className ?? ''}`}
        style={style}
      />
      <span className="text-xs text-fg-muted">{label}</span>
    </div>
  );
}

export default function TokenTestPage() {
  const [theme, setTheme] = useState<Theme>('dark');

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    setTheme(next);
  };

  return (
    <main className="flex flex-col gap-8 p-8 bg-bg text-fg min-h-screen">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Lumen Token Smoke</h1>
          <p className="text-sm text-fg-muted">
            S1 烟囱验证 — 当前主题：<code className="font-mono">{theme}</code>
          </p>
        </div>
        <Button data-testid="theme-toggle" onClick={toggleTheme} variant="outline">
          切换为 {theme === 'dark' ? 'light' : 'dark'}
        </Button>
      </header>

      <Section title="Background / Surface 色阶">
        <Swatch testId="swatch-bg" label="--bg" className="bg-bg" />
        <Swatch testId="swatch-surface" label="--surface" className="bg-surface" />
        <Swatch
          testId="swatch-surface-elevated"
          label="--surface-elevated"
          className="bg-surface-elevated"
        />
        <Swatch testId="swatch-border" label="--border" className="bg-border" />
      </Section>

      <Section title="Primary & Brand">
        <Swatch testId="swatch-primary" label="--primary" className="bg-primary" />
        <Swatch
          testId="swatch-primary-hover"
          label="--primary-hover"
          style={{ backgroundColor: 'var(--primary-hover)' }}
        />
      </Section>

      <Section title="Track Colors">
        <Swatch testId="swatch-track-web" label="--track-web-fg" className="bg-track-web-fg" />
        <Swatch testId="swatch-track-kb" label="--track-kb-fg" className="bg-track-kb-fg" />
        <Swatch testId="swatch-conflict" label="--conflict-fg" className="bg-conflict-fg" />
      </Section>

      <Section title="Node States">
        <Swatch
          testId="swatch-state-planning"
          label="planning"
          className="bg-node-state-planning"
        />
        <Swatch
          testId="swatch-state-retrieving"
          label="retrieving"
          className="bg-node-state-retrieving"
        />
        <Swatch
          testId="swatch-state-completed"
          label="completed"
          className="bg-node-state-completed"
        />
        <Swatch testId="swatch-state-error" label="error" className="bg-node-state-error" />
      </Section>

      <Section title="Radius Scale">
        <div data-testid="radius-xs" className="size-16 bg-surface-elevated rounded-xs" />
        <div data-testid="radius-sm" className="size-16 bg-surface-elevated rounded-sm" />
        <div data-testid="radius-md" className="size-16 bg-surface-elevated rounded-md" />
        <div data-testid="radius-lg" className="size-16 bg-surface-elevated rounded-lg" />
        <div data-testid="radius-xl" className="size-16 bg-surface-elevated rounded-xl" />
        <div data-testid="radius-full" className="size-16 bg-surface-elevated rounded-full" />
      </Section>

      <Section title="Shadow Scale">
        <div data-testid="shadow-sm" className="size-20 bg-surface rounded-md shadow-sm" />
        <div data-testid="shadow-md" className="size-20 bg-surface rounded-md shadow-md" />
        <div data-testid="shadow-lg" className="size-20 bg-surface rounded-md shadow-lg" />
      </Section>

      <Section title="Typography">
        <p data-testid="font-sans-sample" className="font-sans text-base">
          Geist Sans — The quick brown fox jumps over the lazy dog. 0123456789
        </p>
        <p data-testid="font-mono-sample" className="font-mono text-base">
          JetBrains Mono — const lumen = &quot;deep research&quot;; // 0123456789
        </p>
      </Section>

      <Section title="shadcn 兼容样例（N5）">
        <div className="flex flex-wrap items-center gap-3">
          <Button data-testid="shadcn-button-default">Primary</Button>
          <Button variant="secondary" data-testid="shadcn-button-secondary">
            Secondary
          </Button>
          <Input
            data-testid="shadcn-input"
            placeholder="search"
            className="w-48"
          />
        </div>
        <Card data-testid="shadcn-card" className="w-72">
          <CardHeader>
            <CardTitle>Card Title</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-fg-muted">
              shadcn Card 在 lumen tokens 下应可见背景分层。
            </p>
          </CardContent>
        </Card>
      </Section>
    </main>
  );
}
