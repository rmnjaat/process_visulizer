import { useState, useCallback, useEffect, useRef } from 'react';
import type { TreeNode } from '../../types/tree';
import type { ProcessInfo } from '../../types/process';
import type { ThreadInfo } from '../../types/thread';
import { ProcessBadge } from '../badges/ProcessBadge';
import { ThreadBadge } from '../badges/ThreadBadge';
import { formatBytes, formatPercent, formatDuration } from '../../utils/format';

interface ProcessTreeNodeProps {
  node: TreeNode;
  depth: number;
  onSelectProcess: (pid: number, data: ProcessInfo) => void;
  onSelectThread: (thread: ThreadInfo) => void;
}

export function ProcessTreeNode({ node, depth, onSelectProcess, onSelectThread }: ProcessTreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [threadChildren, setThreadChildren] = useState<TreeNode[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(false);

  const isProcess = node.entity_type === 'process';
  const data = node.data;

  const allChildren = [...node.children, ...threadChildren];
  const hasFetchedOnce = useRef(false);

  const fetchThreads = useCallback(async () => {
    if (!isProcess) return;
    const proc = data as ProcessInfo;
    setLoadingThreads(true);
    try {
      const res = await fetch(`/api/processes/${proc.pid}/threads`);
      if (res.ok) {
        const threads: ThreadInfo[] = await res.json();
        const threadNodes: TreeNode[] = threads.map((t) => ({
          entity_type: 'thread' as const,
          data: t,
          children: [],
        }));
        setThreadChildren(threadNodes);
      }
    } catch {
      // silently fail — threads just won't show
    } finally {
      setLoadingThreads(false);
    }
  }, [isProcess, data]);

  // Re-fetch threads every 5s while expanded
  useEffect(() => {
    if (!expanded || !isProcess) return;
    if (!hasFetchedOnce.current) {
      fetchThreads();
      hasFetchedOnce.current = true;
    }
    const interval = setInterval(fetchThreads, 5000);
    return () => clearInterval(interval);
  }, [expanded, isProcess, fetchThreads]);

  const toggleExpand = useCallback(() => {
    const willExpand = !expanded;
    setExpanded(willExpand);
    if (willExpand && !hasFetchedOnce.current) {
      fetchThreads();
      hasFetchedOnce.current = true;
    }
  }, [expanded, fetchThreads]);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    toggleExpand();
  }, [toggleExpand]);

  const handleRowClick = useCallback(() => {
    if (isProcess) {
      onSelectProcess((data as ProcessInfo).pid, data as ProcessInfo);
      if (!expanded) toggleExpand();
    } else {
      onSelectThread(data as ThreadInfo);
    }
  }, [isProcess, data, onSelectProcess, onSelectThread, expanded, toggleExpand]);

  if (isProcess) {
    const proc = data as ProcessInfo;
    return (
      <div>
        <div
          className="flex items-center gap-2 py-1.5 pr-3 cursor-pointer group"
          style={{
            paddingLeft: depth * 20 + 8,
            borderLeft: depth > 0 ? '1px solid var(--bg-elevated)' : undefined,
            marginLeft: depth > 0 ? depth * 20 - 20 : undefined,
          }}
          onClick={handleRowClick}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-surface)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
          }}
        >
          {/* Expand/Collapse toggle */}
          <button
            className="w-5 h-5 flex items-center justify-center border-none bg-transparent cursor-pointer text-sm shrink-0"
            style={{ color: 'var(--text-secondary)' }}
            onClick={handleToggle}
          >
            {expanded ? '\u25BC' : '\u25B6'}
          </button>

          <ProcessBadge />

          <span
            className="font-semibold text-sm truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {proc.name}
          </span>

          <span
            className="text-xs shrink-0"
            style={{ color: 'var(--text-secondary)' }}
          >
            PID {proc.pid}
          </span>

          <span className="ml-auto flex items-center gap-3 text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>
            <span>CPU {formatPercent(proc.cpu_percent)}</span>
            <span>RSS {formatBytes(proc.memory_rss_bytes)}</span>
            <span>{proc.num_threads} threads</span>
          </span>
        </div>

        {expanded && (
          <div>
            {loadingThreads && (
              <div
                className="text-xs py-1"
                style={{
                  paddingLeft: (depth + 1) * 20 + 8,
                  color: 'var(--text-secondary)',
                }}
              >
                Loading threads...
              </div>
            )}
            {!loadingThreads && allChildren.length === 0 && (
              <div
                className="text-xs py-1 italic"
                style={{
                  paddingLeft: (depth + 1) * 20 + 8,
                  color: 'var(--text-muted)',
                }}
              >
                No child processes or threads
              </div>
            )}
            {allChildren.map((child) => {
              const key =
                child.entity_type === 'process'
                  ? `p-${(child.data as ProcessInfo).pid}`
                  : `t-${(child.data as ThreadInfo).tid}`;
              return (
                <ProcessTreeNode
                  key={key}
                  node={child}
                  depth={depth + 1}
                  onSelectProcess={onSelectProcess}
                  onSelectThread={onSelectThread}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Thread node
  const thread = data as ThreadInfo;
  return (
    <div
      className="flex items-center gap-2 py-1 pr-3 cursor-pointer"
      style={{
        paddingLeft: depth * 20 + 28,
        borderLeft: depth > 0 ? '1px solid var(--bg-elevated)' : undefined,
        marginLeft: depth > 0 ? depth * 20 - 20 : undefined,
      }}
      onClick={handleRowClick}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-surface)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
      }}
    >
      <ThreadBadge />

      <span
        className="text-xs truncate"
        style={{ color: 'var(--text-primary)' }}
      >
        {thread.name || `Thread ${thread.tid}`}
      </span>

      <span
        className="text-xs shrink-0"
        style={{ color: 'var(--text-secondary)' }}
      >
        TID {thread.tid}
      </span>

      <span className="ml-auto flex items-center gap-3 text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>
        <span>CPU {formatPercent(thread.cpu_percent)}</span>
        <span>Time {formatDuration(thread.cpu_time_user + thread.cpu_time_system)}</span>
      </span>
    </div>
  );
}
