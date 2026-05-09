'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Database, Globe, Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type SourceId = 'web' | 'kb';

type Source = {
  id: SourceId;
  label: string;
  note?: string;
  icon: typeof Globe;
  trackColor: string;
};

const SOURCES: ReadonlyArray<Source> = [
  { id: 'web', label: '公开 Web', icon: Globe, trackColor: 'text-track-web-fg' },
  {
    id: 'kb',
    label: '内部 KB',
    note: '4 份文档已就绪',
    icon: Database,
    trackColor: 'text-track-kb-fg',
  },
  // TODO(S3): wire to KB API
];

export function ResearchInputHero() {
  const router = useRouter();
  const [topic, setTopic] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // T8 D13.5: client_request_id stable across submits during component lifetime.
  // 'use client' 组件下 useRef factory 仅在浏览器首次 mount 时计算；
  // 与 useState + useEffect 等价，但避免额外重渲染。
  // 不存在 SSR pre-render 路径（client component），无 hydration mismatch。
  const clientRequestIdRef = useRef<string>(crypto.randomUUID());
  const [activeSources, setActiveSources] = useState<ReadonlySet<SourceId>>(
    () => new Set<SourceId>(['web', 'kb']),
  );

  const canSubmit = topic.trim().length > 0 && !submitting;

  const togglePill = (id: SourceId) => {
    setActiveSources((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      const r = await fetch('/api/research/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: topic.trim(),
          client_request_id: clientRequestIdRef.current,
        }),
      });

      if (!r.ok) {
        const errBody: { detail?: string } = await r.json().catch(() => ({}));
        setError(errBody.detail ?? `请求失败 (${r.status})`);
        setSubmitting(false);
        return;
      }

      const body: { session_id?: unknown } = await r.json();
      const session_id = body.session_id;
      if (typeof session_id !== 'string' || session_id.length === 0) {
        setError('服务返回无效 session_id');
        setSubmitting(false);
        return;
      }
      // T9 D13: navigate to /research/[session_id].
      // 不重置 submitting：导航期间保持 spinner，直到组件 unmount。
      router.push(`/research/${session_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '网络错误');
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      <Badge
        data-testid="hero-badge"
        variant="outline"
        className="rounded-full px-3 py-1.5 h-auto text-sm gap-1.5"
      >
        <span className="text-fg-muted">公开 Web + 私有 KB · 双轨验证</span>
      </Badge>

      <h1
        data-testid="hero-title"
        className="text-4xl font-bold leading-tight text-fg text-center"
      >
        研究什么主题？
      </h1>

      <p
        data-testid="hero-subtitle"
        className="text-md leading-normal text-fg-muted text-center max-w-xl"
      >
        Lumen 将你的问题拆解为结构化子任务，跨公开信息与内部知识库双轨检索，自动标注冲突点并输出完整证据链报告。
      </p>

      <div
        data-testid="input-card"
        className={cn(
          'w-full rounded-lg border border-border bg-surface shadow-lg p-4',
          'flex flex-col gap-4 transition-shadow',
          'focus-within:ring-2 focus-within:ring-ring',
        )}
      >
        <label htmlFor="research-topic" className="sr-only">
          研究主题
        </label>
        <Textarea
          id="research-topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="例如：AI Agent 在企业知识管理中的最佳落地路径，要求对比公开行业报告与内部已有项目案例…"
          rows={4}
          maxLength={2000}
          className="border-0 bg-transparent shadow-none resize-none focus-visible:ring-0 focus-visible:border-transparent text-base"
        />

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            {SOURCES.map((source) => {
              const active = activeSources.has(source.id);
              const Icon = source.icon;
              return (
                <button
                  key={source.id}
                  type="button"
                  data-testid={`pill-${source.id}`}
                  aria-pressed={active}
                  onClick={() => togglePill(source.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active
                      ? cn(source.trackColor, 'border-border bg-surface-elevated')
                      : 'border-border-subtle text-fg-muted opacity-60',
                  )}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  <span>{source.label}</span>
                  {source.note && <span className="text-fg-muted">· {source.note}</span>}
                </button>
              );
            })}
          </div>

          <Button
            type="button"
            data-testid="submit-btn"
            aria-label="启动研究"
            onClick={() => { void onSubmit(); }}
            disabled={!canSubmit}
            className="rounded-md bg-primary text-primary-fg hover:bg-primary-hover px-5 py-3 h-auto gap-1.5"
          >
            <span>启动研究</span>
            {submitting ? (
              <Loader2
                data-testid="icon-spinner"
                className="size-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <ArrowRight data-testid="icon-arrow" className="size-4" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>

      {/* T8: error display for failed POST or network errors */}
      {error && (
        <p
          data-testid="hero-error"
          role="alert"
          className="text-sm text-destructive text-center"
        >
          {error}
        </p>
      )}

      <p
        data-testid="hero-meta"
        className="text-base text-fg-muted text-center flex items-center gap-2"
      >
        <span>⊘ 本地化·数据不出境</span>
        <span aria-hidden="true">·</span>
        <span>完整证据链·引用可溯</span>
      </p>
    </div>
  );
}
