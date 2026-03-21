import { useState, useEffect, useCallback, useRef } from 'react';
import type { TreeNode } from '../types/tree';
import type { ProcessInfo } from '../types/process';
import type { ThreadInfo } from '../types/thread';
import { ProcessTreeNode } from '../components/process/ProcessTreeNode';
import { Drawer } from '../components/layout/Drawer';
import { ProcessBadge } from '../components/badges/ProcessBadge';
import { ThreadBadge } from '../components/badges/ThreadBadge';
import { formatBytes, formatPercent, formatDuration } from '../utils/format';

export default function ProcessTree() {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Drawer state
  const [selectedProcess, setSelectedProcess] = useState<ProcessInfo | null>(null);
  const [selectedThread, setSelectedThread] = useState<ThreadInfo | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTree = useCallback(async () => {
    try {
      const res = await fetch('/api/tree');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: TreeNode[] = await res.json();
      setTree(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tree');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTree();
    intervalRef.current = setInterval(fetchTree, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchTree]);

  const handleSelectProcess = useCallback((_pid: number, data: ProcessInfo) => {
    setSelectedThread(null);
    setSelectedProcess(data);
  }, []);

  const handleSelectThread = useCallback((thread: ThreadInfo) => {
    setSelectedProcess(null);
    setSelectedThread(thread);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setSelectedProcess(null);
    setSelectedThread(null);
  }, []);

  // Filter tree by search query
  const filterTree = useCallback((nodes: TreeNode[], query: string): TreeNode[] => {
    if (!query) return nodes;
    const q = query.toLowerCase();

    return nodes.reduce<TreeNode[]>((acc, node) => {
      const matchesSelf =
        node.entity_type === 'process'
          ? (node.data as ProcessInfo).name.toLowerCase().includes(q) ||
            String((node.data as ProcessInfo).pid).includes(q)
          : (node.data as ThreadInfo).name.toLowerCase().includes(q) ||
            String((node.data as ThreadInfo).tid).includes(q);

      const filteredChildren = filterTree(node.children, query);

      if (matchesSelf || filteredChildren.length > 0) {
        acc.push({
          ...node,
          children: matchesSelf ? node.children : filteredChildren,
        });
      }

      return acc;
    }, []);
  }, []);

  const filteredTree = filterTree(tree, searchQuery);

  const drawerOpen = selectedProcess !== null || selectedThread !== null;
  const drawerTitle = selectedProcess
    ? selectedProcess.name
    : selectedThread
      ? selectedThread.name || `Thread ${selectedThread.tid}`
      : '';
  const drawerBadge = selectedProcess ? <ProcessBadge /> : selectedThread ? <ThreadBadge /> : null;

  return (
    <div className="flex flex-col h-full" style={{ color: 'var(--text-primary)' }}>
      {/* Header / Search */}
      <div
        className="flex items-center gap-3 px-6 py-3 border-b shrink-0"
        style={{ borderColor: 'var(--bg-elevated)' }}
      >
        <h1 className="text-lg font-semibold m-0">Process Tree</h1>

        <div className="flex-1 max-w-md ml-4">
          <input
            type="text"
            placeholder="Filter by name or PID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg border-none text-sm outline-none"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        <button
          onClick={() => { setLoading(true); fetchTree(); }}
          className="px-3 py-1.5 rounded-lg border-none cursor-pointer text-sm"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            color: 'var(--text-secondary)',
          }}
        >
          Refresh
        </button>
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && tree.length === 0 && (
          <div className="p-6 text-center" style={{ color: 'var(--text-secondary)' }}>
            Loading process tree...
          </div>
        )}

        {error && (
          <div className="p-6 text-center" style={{ color: '#EF4444' }}>
            Error: {error}
          </div>
        )}

        {!loading && !error && filteredTree.length === 0 && (
          <div className="p-6 text-center" style={{ color: 'var(--text-secondary)' }}>
            {searchQuery ? 'No processes match your filter.' : 'No processes found.'}
          </div>
        )}

        <div className="py-2">
          {filteredTree.map((node) => {
            const key =
              node.entity_type === 'process'
                ? `p-${(node.data as ProcessInfo).pid}`
                : `t-${(node.data as ThreadInfo).tid}`;
            return (
              <ProcessTreeNode
                key={key}
                node={node}
                depth={0}
                onSelectProcess={handleSelectProcess}
                onSelectThread={handleSelectThread}
              />
            );
          })}
        </div>
      </div>

      {/* Drawer */}
      <Drawer isOpen={drawerOpen} onClose={handleCloseDrawer} title={drawerTitle} badge={drawerBadge}>
        {selectedProcess && <ProcessDrawerContent process={selectedProcess} />}
        {selectedThread && <ThreadDrawerContent thread={selectedThread} />}
      </Drawer>
    </div>
  );
}

function ProcessDrawerContent({ process: proc }: { process: ProcessInfo }) {
  const fields: { label: string; value: string }[] = [
    { label: 'PID', value: String(proc.pid) },
    { label: 'Name', value: proc.name },
    { label: 'Status', value: proc.status },
    { label: 'User', value: proc.username },
    { label: 'CPU', value: formatPercent(proc.cpu_percent) },
    { label: 'Memory (RSS)', value: formatBytes(proc.memory_rss_bytes) },
    { label: 'Memory (VMS)', value: formatBytes(proc.memory_vms_bytes) },
    { label: 'Memory %', value: formatPercent(proc.memory_percent) },
    { label: 'Threads', value: String(proc.num_threads) },
    { label: 'Parent PID', value: String(proc.ppid) },
    { label: 'Nice', value: String(proc.nice) },
    { label: 'Open FDs', value: String(proc.num_fds) },
  ];

  return (
    <div className="flex flex-col gap-3">
      {fields.map((f) => (
        <div
          key={f.label}
          className="flex items-center justify-between px-4 py-2.5 rounded-lg"
          style={{ backgroundColor: 'var(--bg-elevated)' }}
        >
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            {f.label}
          </span>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {f.value}
          </span>
        </div>
      ))}
      {proc.cmdline && (
        <div className="px-4 py-2.5 rounded-lg" style={{ backgroundColor: 'var(--bg-elevated)' }}>
          <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
            Command Line
          </div>
          <div
            className="text-xs font-mono break-all"
            style={{ color: 'var(--text-primary)' }}
          >
            {proc.cmdline}
          </div>
        </div>
      )}
    </div>
  );
}

function ThreadDrawerContent({ thread }: { thread: ThreadInfo }) {
  const fields: { label: string; value: string }[] = [
    { label: 'TID', value: String(thread.tid) },
    { label: 'PID', value: String(thread.pid) },
    { label: 'Name', value: thread.name || '—' },
    { label: 'State', value: thread.state },
    { label: 'CPU %', value: formatPercent(thread.cpu_percent) },
    { label: 'CPU Time (User)', value: formatDuration(thread.cpu_time_user) },
    { label: 'CPU Time (System)', value: formatDuration(thread.cpu_time_system) },
    { label: 'Priority', value: String(thread.priority) },
    { label: 'Nice', value: String(thread.nice) },
    { label: 'Core ID', value: thread.core_id !== null ? String(thread.core_id) : '—' },
    { label: 'Vol. Ctx Switches', value: String(thread.voluntary_ctx_switches) },
    { label: 'Invol. Ctx Switches', value: String(thread.involuntary_ctx_switches) },
    { label: 'Stack Size', value: formatBytes(thread.stack_size_bytes) },
  ];

  return (
    <div className="flex flex-col gap-3">
      {fields.map((f) => (
        <div
          key={f.label}
          className="flex items-center justify-between px-4 py-2.5 rounded-lg"
          style={{ backgroundColor: 'var(--bg-elevated)' }}
        >
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            {f.label}
          </span>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {f.value}
          </span>
        </div>
      ))}
    </div>
  );
}
