import { useState, useMemo } from 'react';
import { useProcessStore } from '../stores/processStore';
import type { ProcessInfo } from '../types/process';

/* ------------------------------------------------------------------ */
/*  Metric category definitions                                       */
/* ------------------------------------------------------------------ */

type Direction = 'lower' | 'higher' | 'neutral';

interface MetricDef {
  label: string;
  field: keyof ProcessInfo;
  /** Which direction is "better" for color coding */
  better: Direction;
  format?: (v: number | string) => string;
  /** Show a bar chart comparison for this metric */
  bar?: boolean;
}

interface MetricCategory {
  title: string;
  metrics: MetricDef[];
}

const fmtBytes = (v: number | string): string => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (n === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

const fmtPct = (v: number | string): string => `${Number(v).toFixed(1)}%`;
const fmtInt = (v: number | string): string => Number(v).toLocaleString();
const fmtSec = (v: number | string): string => `${Number(v).toFixed(2)}s`;

const CATEGORIES: MetricCategory[] = [
  {
    title: 'Identity',
    metrics: [
      { label: 'PID', field: 'pid', better: 'neutral', format: fmtInt },
      { label: 'Parent PID', field: 'ppid', better: 'neutral', format: fmtInt },
      { label: 'Name', field: 'name', better: 'neutral' },
      { label: 'Status', field: 'status', better: 'neutral' },
      { label: 'User', field: 'username', better: 'neutral' },
      { label: 'Nice', field: 'nice', better: 'neutral', format: fmtInt },
    ],
  },
  {
    title: 'CPU',
    metrics: [
      { label: 'CPU %', field: 'cpu_percent', better: 'lower', format: fmtPct, bar: true },
      { label: 'User Time', field: 'cpu_time_user', better: 'lower', format: fmtSec },
      { label: 'System Time', field: 'cpu_time_system', better: 'lower', format: fmtSec },
      { label: 'Children User', field: 'cpu_time_children_user', better: 'lower', format: fmtSec },
      { label: 'Children System', field: 'cpu_time_children_system', better: 'lower', format: fmtSec },
      { label: 'IO Wait', field: 'cpu_time_iowait', better: 'lower', format: fmtSec },
    ],
  },
  {
    title: 'Memory',
    metrics: [
      { label: 'RSS', field: 'memory_rss_bytes', better: 'lower', format: fmtBytes, bar: true },
      { label: 'VMS', field: 'memory_vms_bytes', better: 'lower', format: fmtBytes, bar: true },
      { label: 'Memory %', field: 'memory_percent', better: 'lower', format: fmtPct },
      { label: 'Shared', field: 'memory_shared_bytes', better: 'neutral', format: fmtBytes },
      { label: 'USS', field: 'memory_uss_bytes', better: 'lower', format: fmtBytes },
      { label: 'PSS', field: 'memory_pss_bytes', better: 'lower', format: fmtBytes },
      { label: 'Text', field: 'memory_text_bytes', better: 'neutral', format: fmtBytes },
      { label: 'Data', field: 'memory_data_bytes', better: 'neutral', format: fmtBytes },
    ],
  },
  {
    title: 'I/O',
    metrics: [
      { label: 'Read Count', field: 'io_read_count', better: 'lower', format: fmtInt },
      { label: 'Write Count', field: 'io_write_count', better: 'lower', format: fmtInt },
      { label: 'Read Bytes', field: 'io_read_bytes', better: 'lower', format: fmtBytes },
      { label: 'Write Bytes', field: 'io_write_bytes', better: 'lower', format: fmtBytes },
    ],
  },
  {
    title: 'Context Switches',
    metrics: [
      { label: 'Voluntary', field: 'ctx_switches_voluntary', better: 'lower', format: fmtInt },
      { label: 'Involuntary', field: 'ctx_switches_involuntary', better: 'lower', format: fmtInt },
    ],
  },
  {
    title: 'File Handles',
    metrics: [
      { label: 'File Descriptors', field: 'num_fds', better: 'lower', format: fmtInt },
      { label: 'Open Files', field: 'num_open_files', better: 'lower', format: fmtInt },
      { label: 'Connections', field: 'num_connections', better: 'lower', format: fmtInt },
      { label: 'Threads', field: 'num_threads', better: 'neutral', format: fmtInt },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Helper: color a cell based on comparison                          */
/* ------------------------------------------------------------------ */

function cellColor(
  valA: number,
  valB: number,
  side: 'a' | 'b',
  better: Direction,
): string | undefined {
  if (better === 'neutral' || valA === valB) return undefined;

  const thisVal = side === 'a' ? valA : valB;
  const otherVal = side === 'a' ? valB : valA;

  if (better === 'lower') {
    return thisVal < otherVal ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.12)';
  }
  // better === 'higher'
  return thisVal > otherVal ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.12)';
}

/* ------------------------------------------------------------------ */
/*  Bar comparison component                                          */
/* ------------------------------------------------------------------ */

function ComparisonBar({ valA, valB, labelA, labelB }: { valA: number; valB: number; labelA: string; labelB: string }) {
  const max = Math.max(valA, valB, 1);
  const pctA = (valA / max) * 100;
  const pctB = (valB / max) * 100;

  return (
    <div className="flex flex-col gap-1.5 my-1">
      <div className="flex items-center gap-2">
        <span className="text-xs w-20 text-right shrink-0" style={{ color: 'var(--text-secondary)' }}>
          {labelA}
        </span>
        <div className="flex-1 h-4 rounded overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <div
            className="h-full rounded transition-all duration-500"
            style={{
              width: `${pctA}%`,
              backgroundColor: 'var(--color-primary)',
              opacity: 0.8,
            }}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs w-20 text-right shrink-0" style={{ color: 'var(--text-secondary)' }}>
          {labelB}
        </span>
        <div className="flex-1 h-4 rounded overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <div
            className="h-full rounded transition-all duration-500"
            style={{
              width: `${pctB}%`,
              backgroundColor: 'var(--color-info)',
              opacity: 0.8,
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PID selector dropdown                                             */
/* ------------------------------------------------------------------ */

function PidSelector({
  value,
  onChange,
  processes,
  otherPid,
  label,
}: {
  value: number | null;
  onChange: (pid: number | null) => void;
  processes: ProcessInfo[];
  otherPid: number | null;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="rounded-lg px-3 py-2 text-sm outline-none border transition-colors"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
        }}
      >
        <option value="">-- Select PID --</option>
        {processes.map((p) => (
          <option key={p.pid} value={p.pid} disabled={p.pid === otherPid}>
            {p.pid} - {p.name} ({fmtPct(p.cpu_percent)} CPU, {fmtBytes(p.memory_rss_bytes)})
          </option>
        ))}
      </select>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page component                                               */
/* ------------------------------------------------------------------ */

export default function ProcessCompare() {
  const processes = useProcessStore((s) => s.processes);
  const [pidA, setPidA] = useState<number | null>(null);
  const [pidB, setPidB] = useState<number | null>(null);

  const sortedList = useMemo(
    () =>
      Object.values(processes).sort((a, b) => b.cpu_percent - a.cpu_percent),
    [processes],
  );

  const procA = pidA !== null ? processes[pidA] ?? null : null;
  const procB = pidB !== null ? processes[pidB] ?? null : null;

  const bothSelected = procA !== null && procB !== null;

  return (
    <div className="flex flex-col h-full p-6 gap-6 overflow-y-auto">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Process Comparison
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Select two processes to compare their metrics side by side.
        </p>
      </div>

      {/* PID selectors */}
      <div
        className="grid grid-cols-2 gap-4 p-4 rounded-xl border"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--bg-elevated)' }}
      >
        <PidSelector
          value={pidA}
          onChange={setPidA}
          processes={sortedList}
          otherPid={pidB}
          label="Process A"
        />
        <PidSelector
          value={pidB}
          onChange={setPidB}
          processes={sortedList}
          otherPid={pidA}
          label="Process B"
        />
      </div>

      {/* Empty state */}
      {!bothSelected && (
        <div
          className="flex items-center justify-center h-48 rounded-xl border text-sm"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--bg-elevated)',
            color: 'var(--text-muted)',
          }}
        >
          {pidA === null && pidB === null
            ? 'Select two processes above to begin comparison.'
            : 'Select the second process to begin comparison.'}
        </div>
      )}

      {/* Comparison tables per category */}
      {bothSelected && (
        <div
          className="text-xs px-3 py-2 rounded-lg"
          style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-muted)' }}
        >
          Note: Metrics showing "N/A" are not available on this platform (e.g., USS, PSS, I/O counters require root or are macOS-limited).
        </div>
      )}

      {bothSelected &&
        CATEGORIES.map((cat) => (
          <section key={cat.title}>
            <h2
              className="text-sm font-semibold uppercase tracking-wider mb-2"
              style={{ color: 'var(--color-primary)' }}
            >
              {cat.title}
            </h2>

            <div
              className="rounded-xl border overflow-hidden"
              style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--bg-elevated)' }}
            >
              {/* Table head */}
              <div
                className="grid items-center px-4 py-2 text-xs font-semibold uppercase tracking-wider"
                style={{
                  gridTemplateColumns: '180px 1fr 1fr',
                  backgroundColor: 'var(--bg-elevated)',
                  color: 'var(--text-secondary)',
                }}
              >
                <div>Metric</div>
                <div className="text-center">
                  {procA.name}{' '}
                  <span style={{ color: 'var(--text-muted)' }}>(PID {procA.pid})</span>
                </div>
                <div className="text-center">
                  {procB.name}{' '}
                  <span style={{ color: 'var(--text-muted)' }}>(PID {procB.pid})</span>
                </div>
              </div>

              {/* Rows */}
              {cat.metrics.map((m, idx) => {
                const rawA = procA[m.field];
                const rawB = procB[m.field];
                const numA = typeof rawA === 'number' ? rawA : 0;
                const numB = typeof rawB === 'number' ? rawB : 0;
                const isNumeric = typeof rawA === 'number';
                // Show "N/A" for metrics that are 0 on both sides (likely unavailable on this platform)
                const bothZero = isNumeric && numA === 0 && numB === 0 && m.better !== 'neutral';
                const displayA = bothZero ? 'N/A' : m.format ? m.format(rawA as number) : String(rawA ?? '-');
                const displayB = bothZero ? 'N/A' : m.format ? m.format(rawB as number) : String(rawB ?? '-');
                const bgA = isNumeric && !bothZero ? cellColor(numA, numB, 'a', m.better) : undefined;
                const bgB = isNumeric && !bothZero ? cellColor(numA, numB, 'b', m.better) : undefined;

                return (
                  <div key={m.field}>
                    <div
                      className="grid items-center px-4 py-2.5 text-sm"
                      style={{
                        gridTemplateColumns: '180px 1fr 1fr',
                        borderTop: idx === 0 ? 'none' : '1px solid var(--bg-elevated)',
                      }}
                    >
                      <div style={{ color: 'var(--text-secondary)' }}>{m.label}</div>
                      <div
                        className="text-center rounded px-2 py-0.5 transition-colors"
                        style={{ backgroundColor: bgA, color: 'var(--text-primary)' }}
                      >
                        {displayA}
                      </div>
                      <div
                        className="text-center rounded px-2 py-0.5 transition-colors"
                        style={{ backgroundColor: bgB, color: 'var(--text-primary)' }}
                      >
                        {displayB}
                      </div>
                    </div>

                    {/* Visual bar comparison for key metrics */}
                    {m.bar && (
                      <div className="px-4 pb-2">
                        <ComparisonBar
                          valA={numA}
                          valB={numB}
                          labelA={`PID ${procA.pid}`}
                          labelB={`PID ${procB.pid}`}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
    </div>
  );
}
