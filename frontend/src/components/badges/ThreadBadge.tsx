import { Circle } from 'lucide-react';

export function ThreadBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold uppercase"
      style={{ backgroundColor: 'var(--color-thread, #8B5CF6)', color: '#fff' }}
    >
      <Circle size={10} fill="currentColor" /> Thread
    </span>
  );
}
