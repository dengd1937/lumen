import { Sparkles } from "lucide-react";

interface ResearchProgressTopBarProps {
  sessionId: string;
}

export function ResearchProgressTopBar({
  sessionId,
}: ResearchProgressTopBarProps) {
  return (
    <header
      data-testid="p2-topbar"
      className="h-16 flex items-center gap-2 px-6 border-b border-border shrink-0"
    >
      <Sparkles
        data-testid="p2-topbar-logo-icon"
        className="size-5 text-primary"
        aria-hidden="true"
      />
      <span className="font-semibold text-fg">Lumen</span>
      <span className="text-fg-muted text-sm" aria-hidden="true">
        /
      </span>
      <span className="text-fg-muted text-sm">研究进行中</span>
      <span
        data-testid="session-meta"
        className="ml-auto text-fg-muted text-sm font-mono"
      >
        session · {sessionId}
      </span>
    </header>
  );
}
