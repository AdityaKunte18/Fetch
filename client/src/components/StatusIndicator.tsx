import type { AgentStatus } from '../types';

interface StatusIndicatorProps {
  status: AgentStatus;
}

const labelMap: Record<AgentStatus, string> = {
  idle: 'Ready',
  thinking: 'Thinking...',
  scraping: 'Scraping...',
  done: 'Complete',
  error: 'Error',
};

const colorMap: Record<AgentStatus, string> = {
  idle: 'var(--text-tertiary)',
  thinking: 'var(--status-thinking)',
  scraping: 'var(--status-scraping)',
  done: 'var(--status-done)',
  error: 'var(--status-error)',
};

export function StatusIndicator({ status }: StatusIndicatorProps) {
  const isAnimated = status === 'thinking' || status === 'scraping';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: colorMap[status],
          animation: isAnimated ? 'pulse 1.5s ease-in-out infinite' : 'none',
        }}
      />
      <span
        style={{
          fontSize: 12,
          color: 'var(--text-secondary)',
          textTransform: 'uppercase' as const,
          letterSpacing: '0.5px',
        }}
      >
        {labelMap[status]}
      </span>
    </div>
  );
}
