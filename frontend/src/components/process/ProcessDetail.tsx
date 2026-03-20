import { useEffect, useState } from 'react';
import { useProcessStore } from '../../stores/processStore';
import { useProcessSubscription } from '../../hooks/useProcessSubscription';
import { StateBadge } from '../common/StateBadge';
import { Tooltip } from '../common/Tooltip';
import { tooltips } from '../../utils/tooltips';
import {
  formatBytes,
  formatPercent,
  formatNumber,
  formatDuration,
  formatTimestamp,
} from '../../utils/format';
import { ThreadList } from '../thread/ThreadList';

interface OpenFile {
  path: string;
  fd: number;
}

interface Connection {
  local_addr: string;
  remote_addr: string;
  status: string;
}

interface ProcessDetailResponse {
  open_files: OpenFile[];
  connections: Connection[];
  environ: Record<string, string>;
}

interface ProcessDetailProps {
  pid: number;
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl border p-4 mb-4"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--bg-elevated)',
      }}
    >
      <h3
        className="text-xs font-semibold uppercase tracking-wider mb-3"
        style={{ color: 'var(--text-secondary)' }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function MetricGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-6 gap-y-2">{children}</div>;
}

/** Map display labels to tooltip keys */
const labelTooltipKey: Record<string, string> = {
  'PID': 'pid',
  'PPID': 'ppid',
  'CPU %': 'cpu_percent',
  'User Time': 'cpu_time_user',
  'System Time': 'cpu_time_system',
  'Children User': 'cpu_time_children_user',
  'Children System': 'cpu_time_children_system',
  'I/O Wait': 'cpu_time_iowait',
  'Nice': 'nice',
  'RSS': 'memory_rss_bytes',
  'Virtual': 'memory_vms_bytes',
  'Shared': 'memory_shared_bytes',
  'Text': 'memory_text_bytes',
  'Data': 'memory_data_bytes',
  'Lib': 'memory_lib_bytes',
  'Dirty': 'memory_dirty_bytes',
  'Percent': 'memory_percent',
  'USS': 'memory_uss_bytes',
  'PSS': 'memory_pss_bytes',
  'Read Bytes': 'io_read_bytes',
  'Write Bytes': 'io_write_bytes',
  'Read Ops': 'io_read_count',
  'Write Ops': 'io_write_count',
  'Voluntary': 'ctx_switches_voluntary',
  'Involuntary': 'ctx_switches_involuntary',
  'Open FDs': 'num_fds',
  'Open Files': 'num_open_files',
  'Network Connections': 'num_connections',
  'Status': 'status',
  'Executable': 'exe',
  'Command Line': 'cmdline',
  'User': 'username',
  'Started': 'create_time',
};

function MetricItem({ label, value }: { label: string; value: React.ReactNode }) {
  const tooltipKey = labelTooltipKey[label];
  const tooltipText = tooltipKey ? tooltips[tooltipKey] : undefined;

  const labelEl = (
    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
      {label}
    </span>
  );

  return (
    <div className="flex flex-col min-w-0">
      {tooltipText ? (
        <Tooltip text={tooltipText}>{labelEl}</Tooltip>
      ) : (
        labelEl
      )}
      <span
        className="text-sm font-medium break-words overflow-hidden"
        style={{ color: 'var(--text-primary)', overflowWrap: 'anywhere' }}
        title={typeof value === 'string' ? value : undefined}
      >
        {value}
      </span>
    </div>
  );
}

export function ProcessDetail({ pid }: ProcessDetailProps) {
  const process = useProcessStore((s) => s.processes[pid]);
  const threads = useProcessStore((s) => s.threads[pid]);
  const [detail, setDetail] = useState<ProcessDetailResponse | null>(null);
  const [detailError, setDetailError] = useState(false);

  useProcessSubscription(pid);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setDetailError(false);

    fetch(`/api/processes/${pid}`)
      .then((res) => {
        if (!res.ok) throw new Error('fetch failed');
        return res.json();
      })
      .then((data: ProcessDetailResponse) => {
        if (!cancelled) setDetail(data);
      })
      .catch(() => {
        if (!cancelled) setDetailError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [pid]);

  if (!process) {
    return (
      <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Process {pid} not found.
      </div>
    );
  }

  void threads; // read by ThreadList via store

  return (
    <div className="flex flex-col gap-1">
      {/* Identity */}
      <SectionCard title="Identity">
        <MetricGrid>
          <MetricItem label="PID" value={process.pid} />
          <MetricItem label="PPID" value={process.ppid} />
          <MetricItem label="Name" value={process.name} />
          <MetricItem label="Executable" value={process.exe || '—'} />
          <MetricItem label="Command Line" value={process.cmdline || '—'} />
          <MetricItem label="User" value={process.username} />
          <MetricItem label="Status" value={<StateBadge state={process.status} />} />
          <MetricItem label="Started" value={formatTimestamp(process.create_time)} />
        </MetricGrid>
      </SectionCard>

      {/* CPU */}
      <SectionCard title="CPU">
        <MetricGrid>
          <MetricItem label="CPU %" value={formatPercent(process.cpu_percent)} />
          <MetricItem label="User Time" value={formatDuration(process.cpu_time_user)} />
          <MetricItem label="System Time" value={formatDuration(process.cpu_time_system)} />
          <MetricItem label="Children User" value={formatDuration(process.cpu_time_children_user)} />
          <MetricItem label="Children System" value={formatDuration(process.cpu_time_children_system)} />
          <MetricItem label="I/O Wait" value={formatDuration(process.cpu_time_iowait)} />
          <MetricItem label="Nice" value={process.nice} />
        </MetricGrid>
      </SectionCard>

      {/* Memory */}
      <SectionCard title="Memory">
        <MetricGrid>
          <MetricItem label="RSS" value={formatBytes(process.memory_rss_bytes)} />
          <MetricItem label="Virtual" value={formatBytes(process.memory_vms_bytes)} />
          <MetricItem label="Shared" value={formatBytes(process.memory_shared_bytes)} />
          <MetricItem label="Text" value={formatBytes(process.memory_text_bytes)} />
          <MetricItem label="Data" value={formatBytes(process.memory_data_bytes)} />
          <MetricItem label="Lib" value={formatBytes(process.memory_lib_bytes)} />
          <MetricItem label="Dirty" value={formatBytes(process.memory_dirty_bytes)} />
          <MetricItem label="Percent" value={formatPercent(process.memory_percent)} />
          <MetricItem label="USS" value={formatBytes(process.memory_uss_bytes)} />
          <MetricItem label="PSS" value={formatBytes(process.memory_pss_bytes)} />
        </MetricGrid>
      </SectionCard>

      {/* I/O */}
      <SectionCard title="I/O">
        <MetricGrid>
          <MetricItem label="Read Ops" value={formatNumber(process.io_read_count)} />
          <MetricItem label="Write Ops" value={formatNumber(process.io_write_count)} />
          <MetricItem label="Read Bytes" value={formatBytes(process.io_read_bytes)} />
          <MetricItem label="Write Bytes" value={formatBytes(process.io_write_bytes)} />
        </MetricGrid>
      </SectionCard>

      {/* Context Switches */}
      <SectionCard title="Context Switches">
        <MetricGrid>
          <MetricItem label="Voluntary" value={formatNumber(process.ctx_switches_voluntary)} />
          <MetricItem label="Involuntary" value={formatNumber(process.ctx_switches_involuntary)} />
        </MetricGrid>
      </SectionCard>

      {/* File Handles */}
      <SectionCard title="File Handles">
        <MetricGrid>
          <MetricItem label="Open FDs" value={formatNumber(process.num_fds)} />
          <MetricItem label="Open Files" value={formatNumber(process.num_open_files)} />
          <MetricItem label="Network Connections" value={formatNumber(process.num_connections)} />
        </MetricGrid>
      </SectionCard>

      {/* Open Files */}
      {detail && detail.open_files.length > 0 && (
        <SectionCard title="Open Files">
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ color: 'var(--text-secondary)' }}>
                  <th className="text-left pb-2 font-medium" style={{ width: 40 }}>FD</th>
                  <th className="text-left pb-2 font-medium">Path</th>
                </tr>
              </thead>
              <tbody>
                {detail.open_files.map((f, i) => (
                  <tr key={i} style={{ color: 'var(--text-primary)' }}>
                    <td className="pr-4 py-0.5 font-mono">{f.fd}</td>
                    <td className="py-0.5 overflow-hidden text-ellipsis whitespace-nowrap" title={f.path}>{f.path}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Network Connections */}
      {detail && detail.connections.length > 0 && (
        <SectionCard title="Network Connections">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: 'var(--text-secondary)' }}>
                  <th className="text-left pb-2 font-medium">Local Addr</th>
                  <th className="text-left pb-2 font-medium">Remote Addr</th>
                  <th className="text-left pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {detail.connections.map((c, i) => (
                  <tr key={i} style={{ color: 'var(--text-primary)' }}>
                    <td className="pr-3 py-0.5 font-mono">{c.local_addr}</td>
                    <td className="pr-3 py-0.5 font-mono">{c.remote_addr || '—'}</td>
                    <td className="py-0.5">{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {detailError && (
        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Could not load extended details for this process.
        </div>
      )}

      {/* Threads */}
      <ThreadList pid={pid} />
    </div>
  );
}
