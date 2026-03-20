import { useState } from 'react';
import type { ThreadInfo } from '../../types/thread';
import { useProcessStore } from '../../stores/processStore';
import { Drawer } from '../layout/Drawer';
import { ThreadBadge } from '../badges/ThreadBadge';
import { ThreadRow } from './ThreadRow';
import { ThreadDetail } from './ThreadDetail';

interface ThreadListProps {
  pid: number;
}

export function ThreadList({ pid }: ThreadListProps) {
  const threads = useProcessStore((s) => s.threads[pid]);
  const [selectedThread, setSelectedThread] = useState<ThreadInfo | null>(null);

  if (!threads || threads.length === 0) {
    return (
      <div
        className="rounded-lg p-4 text-center text-sm"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          color: 'var(--text-muted)',
        }}
      >
        No thread data available
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <h3
          className="text-xs font-semibold uppercase tracking-wide mt-0 mb-2"
          style={{ color: 'var(--text-muted)' }}
        >
          Threads ({threads.length})
        </h3>

        {threads.map((t) => (
          <ThreadRow key={t.tid} thread={t} onClick={() => setSelectedThread(t)} />
        ))}
      </div>

      <Drawer
        isOpen={selectedThread !== null}
        onClose={() => setSelectedThread(null)}
        title={selectedThread ? `Thread ${selectedThread.tid}` : ''}
        badge={<ThreadBadge />}
      >
        {selectedThread && <ThreadDetail thread={selectedThread} />}
      </Drawer>
    </>
  );
}
