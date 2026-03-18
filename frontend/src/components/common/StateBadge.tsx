const STATE_COLORS: Record<string, string> = {
  running: '#22C55E',
  sleeping: '#3B82F6',
  idle: '#3B82F6',
  'disk-sleep': '#F59E0B',
  zombie: '#EF4444',
  stopped: '#6B7280',
};

interface StateBadgeProps {
  state: string;
}

export function StateBadge({ state }: StateBadgeProps) {
  const color = STATE_COLORS[state.toLowerCase()] ?? '#6B7280';

  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span
        className="inline-block w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />
      <span style={{ color: 'var(--text-primary)' }}>{state}</span>
    </span>
  );
}
