import { Box } from 'lucide-react';

export function ProcessBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold uppercase"
      style={{ backgroundColor: 'var(--color-process, #3B82F6)', color: '#fff' }}
    >
      <Box size={10} /> Process
    </span>
  );
}
