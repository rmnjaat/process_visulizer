import { useEffect, useState, useCallback } from 'react';
import { useProcessStore } from '../../stores/processStore';
import { useProcessSubscription } from '../../hooks/useProcessSubscription';
import { useIoRates } from '../../hooks/useIoRates';
import { useToastStore } from '../../stores/toastStore';
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
import ProcessMemoryBar from '../charts/ProcessMemoryBar';

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
  'Read Rate': 'io_read_rate',
  'Write Rate': 'io_write_rate',
  'Read Ops/s': 'io_read_ops_rate',
  'Write Ops/s': 'io_write_ops_rate',
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

const SIGNAL_ACTIONS = [
  {
    signal: 'SIGTERM',
    label: 'Terminate',
    tooltip: 'Gracefully ask the process to exit',
    color: 'var(--color-warning)',
  },
  {
    signal: 'SIGKILL',
    label: 'Kill',
    tooltip: 'Force kill immediately — process cannot catch this',
    color: 'var(--color-danger)',
  },
  {
    signal: 'SIGSTOP',
    label: 'Stop',
    tooltip: 'Pause/freeze the process',
    color: 'var(--text-secondary)',
  },
  {
    signal: 'SIGCONT',
    label: 'Continue',
    tooltip: 'Resume a stopped process',
    color: 'var(--color-success)',
  },
] as const;

function ProcessActions({ pid, processName }: { pid: number; processName: string }) {
  const addToast = useToastStore((s) => s.addToast);
  const [sending, setSending] = useState<string | null>(null);

  const handleSignal = useCallback(
    async (signal: string) => {
      const confirmed = window.confirm(
        `Are you sure you want to send ${signal} to ${processName} (PID ${pid})?`,
      );
      if (!confirmed) return;

      setSending(signal);
      try {
        const res = await fetch(`/api/processes/${pid}/signal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signal }),
        });
        const data = await res.json();
        if (res.ok) {
          addToast(`Sent ${signal} to ${processName} (PID ${pid})`, 'success');
        } else {
          addToast(data.detail || `Failed to send ${signal}`, 'warning');
        }
      } catch {
        addToast(`Network error sending ${signal}`, 'warning');
      } finally {
        setSending(null);
      }
    },
    [pid, processName, addToast],
  );

  return (
    <SectionCard title="Process Actions">
      <div className="flex flex-wrap gap-2">
        {SIGNAL_ACTIONS.map((action) => (
          <Tooltip key={action.signal} text={action.tooltip}>
            <button
              disabled={sending !== null}
              onClick={() => handleSignal(action.signal)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity"
              style={{
                backgroundColor: action.color,
                color: action.color === 'var(--text-secondary)' ? 'var(--bg-primary)' : '#fff',
                opacity: sending === action.signal ? 0.5 : 1,
                cursor: sending !== null ? 'not-allowed' : 'pointer',
                border: 'none',
              }}
            >
              {sending === action.signal ? `${action.label}...` : action.label}
            </button>
          </Tooltip>
        ))}
      </div>
    </SectionCard>
  );
}

export function ProcessDetail({ pid }: ProcessDetailProps) {
  const process = useProcessStore((s) => s.processes[pid]);
  const [detail, setDetail] = useState<ProcessDetailResponse | null>(null);
  const [detailError, setDetailError] = useState(false);

  useProcessSubscription(pid);
  const ioRates = useIoRates(pid);

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

  return (
    <div className="flex flex-col gap-1">
      {/* Process Actions */}
      <ProcessActions pid={process.pid} processName={process.name} />

      {/* Identity */}
      <SectionCard title="Identity">
        <MetricGrid>
          <MetricItem label="PID" value={process.pid} />
          <MetricItem label="PPID" value={process.ppid} />
          <MetricItem label="Name" value={process.name} />
          <MetricItem label="User" value={process.username} />
          <MetricItem label="Status" value={<StateBadge state={process.status} />} />
          <MetricItem label="Started" value={formatTimestamp(process.create_time)} />
        </MetricGrid>
        {/* Full-width fields for long paths */}
        {process.exe && (
          <div className="mt-3">
            <MetricItem label="Executable" value={process.exe} />
          </div>
        )}
        {process.cmdline && (
          <div className="mt-2">
            <MetricItem label="Command Line" value={process.cmdline} />
          </div>
        )}
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
        <ProcessMemoryBar
          uss={process.memory_uss_bytes ?? 0}
          shared={process.memory_shared_bytes ?? 0}
          text={process.memory_text_bytes ?? 0}
          data={process.memory_data_bytes ?? 0}
          lib={process.memory_lib_bytes ?? 0}
          rss={process.memory_rss_bytes ?? 0}
        />
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
          <MetricItem label="Read Bytes" value={formatBytes(process.io_read_bytes)} />
          <MetricItem label="Write Bytes" value={formatBytes(process.io_write_bytes)} />
          <MetricItem label="Read Ops" value={formatNumber(process.io_read_count)} />
          <MetricItem label="Write Ops" value={formatNumber(process.io_write_count)} />
        </MetricGrid>
        <div
          className="mt-3 pt-3"
          style={{ borderTop: '1px solid var(--bg-elevated)' }}
        >
          <h4
            className="text-xs font-semibold uppercase tracking-wider mb-2"
            style={{ color: 'var(--text-secondary)' }}
          >
            Throughput
          </h4>
          <MetricGrid>
            <MetricItem label="Read Rate" value={`${formatBytes(ioRates.readBytesPerSec)}/s`} />
            <MetricItem label="Write Rate" value={`${formatBytes(ioRates.writeBytesPerSec)}/s`} />
            <MetricItem label="Read Ops/s" value={formatNumber(Math.round(ioRates.readOpsPerSec))} />
            <MetricItem label="Write Ops/s" value={formatNumber(Math.round(ioRates.writeOpsPerSec))} />
          </MetricGrid>
        </div>
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
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: 'var(--text-secondary)' }}>
                  <th className="text-left pb-2 font-medium align-top" style={{ width: 40 }}>FD</th>
                  <th className="text-left pb-2 font-medium">Path</th>
                </tr>
              </thead>
              <tbody>
                {detail.open_files.map((f, i) => (
                  <tr key={i} style={{ color: 'var(--text-primary)' }}>
                    <td className="pr-4 py-0.5 font-mono align-top">{f.fd}</td>
                    <td className="py-0.5 font-mono" style={{ wordBreak: 'break-all' }}>{f.path}</td>
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

      {/* Environment Variables */}
      {detail && Object.keys(detail.environ).length > 0 && (
        <SectionCard title="Environment Variables">
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: 'var(--text-secondary)' }}>
                  <th className="text-left pb-2 font-medium align-top" style={{ width: 160, minWidth: 120 }}>Variable</th>
                  <th className="text-left pb-2 font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(detail.environ)
                  .sort((a, b) => a.localeCompare(b))
                  .map((key) => (
                    <tr key={key} style={{ color: 'var(--text-primary)' }}>
                      <td
                        className="pr-3 py-1 font-mono align-top font-semibold"
                        style={{ color: 'var(--color-primary)', wordBreak: 'break-all' }}
                      >
                        {key}
                      </td>
                      <td
                        className="py-1 font-mono"
                        style={{ wordBreak: 'break-all', lineHeight: '1.5' }}
                      >
                        {detail.environ[key]}
                      </td>
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
