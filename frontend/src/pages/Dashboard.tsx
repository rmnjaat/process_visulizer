import { useSystemStore } from '../stores/systemStore';
import { formatBytes, formatDuration, formatPercent } from '../utils/format';
import CpuGauge from '../components/gauges/CpuGauge';
import MemoryGauge from '../components/gauges/MemoryGauge';
import TimeSeriesChart from '../components/charts/TimeSeriesChart';
import CoreBarChart from '../components/charts/CoreBarChart';
import MetricCard from '../components/common/MetricCard';
import { Tooltip } from '../components/common/Tooltip';
import { tooltips } from '../utils/tooltips';

function LoadingState() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="text-center">
        <div
          className="w-12 h-12 rounded-full border-4 border-t-transparent animate-spin mx-auto mb-4"
          style={{ borderColor: 'var(--bg-elevated)', borderTopColor: 'var(--color-primary)' }}
        />
        <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
          Connecting...
        </p>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Waiting for system data
        </p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const system = useSystemStore((s) => s.system);
  const history = useSystemStore((s) => s.history);
  const connected = useSystemStore((s) => s.connected);

  if (!system) {
    return <LoadingState />;
  }

  const { cpu, memory, load_average, hostname, os, uptime_seconds } = system;

  const chartData = history.map((s) => ({
    cpu: s.cpu.total_usage,
    memory: s.memory.percent,
  }));

  const uptimeDays = Math.floor(uptime_seconds / 86400);
  const uptimeLabel =
    uptimeDays >= 1
      ? `${uptimeDays}d ${formatDuration(uptime_seconds % 86400)}`
      : formatDuration(uptime_seconds);

  return (
    <div
      className="min-h-screen p-6"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          System Overview
        </h1>
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Uptime: {uptimeLabel}
        </span>
      </div>

      {/* Connecting banner */}
      {!connected && (
        <div
          className="mb-4 px-4 py-2 rounded-lg text-sm font-medium text-center animate-pulse"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            color: 'var(--color-warning)',
          }}
        >
          Reconnecting to backend...
        </div>
      )}

      {/* Top row: Gauges + Swap + Load */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* CPU Gauge */}
        <Tooltip text={tooltips.cpu_gauge}>
          <div
            className="rounded-xl p-4 border flex items-center justify-center w-full"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--bg-elevated)',
            }}
          >
            <CpuGauge value={cpu.total_usage} />
          </div>
        </Tooltip>

        {/* Memory Gauge */}
        <Tooltip text={tooltips.memory_gauge}>
          <div
            className="rounded-xl p-4 border flex items-center justify-center w-full"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--bg-elevated)',
            }}
          >
            <MemoryGauge
              value={memory.percent}
              used={memory.used_bytes}
              total={memory.total_bytes}
            />
          </div>
        </Tooltip>

        {/* Swap Card */}
        <Tooltip text={tooltips.swap}>
          <div className="w-full">
            <MetricCard
              label="Swap"
              value={formatPercent(memory.swap_percent)}
              subtitle={`${formatBytes(memory.swap_used_bytes)} / ${formatBytes(memory.swap_total_bytes)}`}
              color={
                memory.swap_percent < 50
                  ? 'var(--color-success)'
                  : memory.swap_percent < 80
                    ? 'var(--color-warning)'
                    : 'var(--color-danger)'
              }
            />
          </div>
        </Tooltip>

        {/* Load Average */}
        <div
          className="rounded-xl p-4 border"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--bg-elevated)',
          }}
        >
          <Tooltip text={tooltips.load_average}>
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
              Load Average
            </p>
          </Tooltip>
          <div className="flex gap-4">
            {(['1m', '5m', '15m'] as const).map((label, i) => (
              <div key={label} className="text-center">
                <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                  {(load_average[i] ?? 0).toFixed(2)}
                </p>
                <Tooltip text={tooltips[`load_${label}`]}>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {label}
                  </p>
                </Tooltip>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Middle row: Core bar chart + Time series */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Per-core CPU */}
        <div
          className="rounded-xl p-5 border"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--bg-elevated)',
          }}
        >
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>
            CPU Per Core
          </h2>
          <CoreBarChart cores={cpu.usage_per_core} />
        </div>

        {/* Time series chart */}
        <div
          className="rounded-xl p-5 border"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--bg-elevated)',
          }}
        >
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>
            CPU &amp; Memory Over Time
          </h2>
          {chartData.length > 1 ? (
            <TimeSeriesChart data={chartData} />
          ) : (
            <div
              className="flex items-center justify-center h-[250px]"
              style={{ color: 'var(--text-muted)' }}
            >
              Collecting data...
            </div>
          )}
        </div>
      </div>

      {/* Bottom row: System info */}
      <div
        className="rounded-xl p-5 border"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--bg-elevated)',
        }}
      >
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>
          System Info
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <InfoItem label="Hostname" value={hostname} />
          <InfoItem label="OS" value={os} />
          <InfoItem label="CPU Model" value={cpu.model} />
          <InfoItem label="Cores" value={`${cpu.physical_cores}P / ${cpu.logical_cores}L`} />
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {label}
      </p>
      <p
        className="text-sm font-medium truncate"
        style={{ color: 'var(--text-primary)' }}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}
