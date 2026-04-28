import { Sparkles } from 'lucide-react';

import { ResearchInputHero } from '@/components/research/research-input-hero';

export default function Home() {
  return (
    <main data-testid="home-root" className="bg-bg min-h-screen flex flex-col">
      <header
        data-testid="topbar"
        className="h-16 flex items-center gap-2 px-6 border-b border-border shrink-0"
      >
        <Sparkles
          data-testid="topbar-logo-icon"
          className="size-5 text-primary"
          aria-hidden="true"
        />
        <span className="font-semibold text-fg">Lumen</span>
        <span className="text-fg-muted text-sm" aria-hidden="true">
          /
        </span>
        <span className="text-fg-muted text-sm">咨询级深度研究</span>
      </header>

      <section className="flex-1 flex items-center justify-center px-6 py-12">
        <div
          data-testid="hero-inner"
          className="w-full"
          style={{ maxWidth: 'var(--hero-max-width, 720px)' }}
        >
          <ResearchInputHero />
        </div>
      </section>
    </main>
  );
}
