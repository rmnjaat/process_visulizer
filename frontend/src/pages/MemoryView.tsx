import { useSystemStore } from '../stores/systemStore';
import { useProcessStore } from '../stores/processStore';
import { formatBytes, formatPercent, formatNumber } from '../utils/format';
import MemoryGauge from '../components/gauges/MemoryGauge';
import MemoryTimeSeriesChart from '../components/charts/MemoryTimeSeriesChart';
import MemoryBreakdownBar from '../components/charts/MemoryBreakdownBar';
import MetricCard from '../components/common/MetricCard';
import { useNavigate } from 'react-router-dom';

function SectionCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl p-5 border"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--bg-elevated)',
      }}
    >
      {title && (
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>
          {title}
        </h2>
      )}
      {children}
    </div>
  );
}

export default function MemoryView() {
  const system = useSystemStore((s) => s.system);
  const history = useSystemStore((s) => s.history);
  const processes = useProcessStore((s) => s.processes);
  const navigate = useNavigate();

  if (!system) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <p style={{ color: 'var(--text-secondary)' }}>Waiting for system data...</p>
      </div>
    );
  }

  const { memory } = system;
  const isMacOS = memory.wired_bytes > 0 || memory.compressed_bytes > 0;

  const memHistory = history.map((s) => ({
    memory: s.memory.percent,
    swap: s.memory.swap_percent,
  }));

  // Top Memory consumers
  const topMem = Object.values(processes)
    .sort((a, b) => b.memory_rss_bytes - a.memory_rss_bytes)
    .slice(0, 10);

  const swapColor =
    memory.swap_percent < 30
      ? 'var(--color-success)'
      : memory.swap_percent < 70
        ? 'var(--color-warning)'
        : 'var(--color-danger)';

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
        Memory
      </h1>

      {/* Row 1: Stats overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Memory Gauge */}
        <div
          className="rounded-xl p-4 border flex items-center justify-center"
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

        {/* Used */}
        <MetricCard
          label="Used"
          value={formatBytes(memory.used_bytes)}
          subtitle={`of ${formatBytes(memory.total_bytes)}`}
          color={
            memory.percent < 50
              ? 'var(--color-success)'
              : memory.percent < 80
                ? 'var(--color-warning)'
                : 'var(--color-danger)'
          }
        />

        {/* Available */}
        <MetricCard
          label="Available"
          value={formatBytes(memory.available_bytes)}
          subtitle={`${formatPercent(100 - memory.percent)} of total`}
          color="var(--color-success)"
        />

        {/* Swap */}
        <MetricCard
          label="Swap"
          value={formatPercent(memory.swap_percent)}
          subtitle={`${formatBytes(memory.swap_used_bytes)} / ${formatBytes(memory.swap_total_bytes)}`}
          color={swapColor}
        />
      </div>

      {/* Row 2: Memory Breakdown Bar */}
      <div className="mb-6">
        <SectionCard title="Memory Breakdown">
          <MemoryBreakdownBar
            used={memory.used_bytes}
            cached={memory.cached_bytes}
            buffers={memory.buffers_bytes}
            shared={memory.shared_bytes}
            free={memory.free_bytes}
            total={memory.total_bytes}
            wired={memory.wired_bytes}
            compressed={memory.compressed_bytes}
            app_memory={memory.app_memory_bytes}
          />
        </SectionCard>
      </div>

      {/* Row 3: Charts side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <SectionCard title="Memory Usage Over Time">
          {memHistory.length > 1 ? (
            <MemoryTimeSeriesChart data={memHistory} />
          ) : (
            <div
              className="flex items-center justify-center h-[250px]"
              style={{ color: 'var(--text-muted)' }}
            >
              Collecting data...
            </div>
          )}
        </SectionCard>

        <SectionCard title="Swap Usage Over Time">
          {memHistory.length > 1 ? (
            <MemoryTimeSeriesChart data={memHistory} showSwap />
          ) : (
            <div
              className="flex items-center justify-center h-[250px]"
              style={{ color: 'var(--text-muted)' }}
            >
              Collecting data...
            </div>
          )}
        </SectionCard>
      </div>

      {/* Row 4: Detailed Stats */}
      <div className="mb-6">
        <SectionCard title="Detailed Statistics">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <StatItem label="Physical Memory" value={formatBytes(memory.total_bytes)} />
            <StatItem label="Memory Used" value={formatBytes(memory.used_bytes)} />
            <StatItem label="Available" value={formatBytes(memory.available_bytes)} />
            {isMacOS ? (
              <>
                <StatItem label="App Memory" value={formatBytes(memory.app_memory_bytes)} />
                <StatItem label="Wired Memory" value={formatBytes(memory.wired_bytes)} />
                <StatItem label="Compressed" value={formatBytes(memory.compressed_bytes)} />
              </>
            ) : (
              <>
                <StatItem label="Free" value={formatBytes(memory.free_bytes)} />
                <StatItem label="Cached" value={formatBytes(memory.cached_bytes)} />
                <StatItem label="Buffers" value={formatBytes(memory.buffers_bytes)} />
                <StatItem label="Shared" value={formatBytes(memory.shared_bytes)} />
              </>
            )}
            <StatItem label="Usage" value={formatPercent(memory.percent)} />
            <StatItem label="Swap Total" value={formatBytes(memory.swap_total_bytes)} />
            <StatItem label="Swap Used" value={formatBytes(memory.swap_used_bytes)} />
            <StatItem label="Swap Free" value={formatBytes(memory.swap_free_bytes)} />
            <StatItem label="Swap Usage" value={formatPercent(memory.swap_percent)} />
          </div>
        </SectionCard>
      </div>

      {/* Row 5: Top Memory Consumers */}
      <SectionCard title="Top Memory Consumers">
        {topMem.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            No process data available
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: 'var(--text-secondary)' }}>
                  <th className="text-left pb-3 font-medium">PID</th>
                  <th className="text-left pb-3 font-medium">Name</th>
                  <th className="text-right pb-3 font-medium">RSS</th>
                  <th className="text-right pb-3 font-medium">Virtual</th>
                  <th className="text-right pb-3 font-medium">Mem %</th>
                  <th className="text-right pb-3 font-medium">CPU %</th>
                  <th className="text-left pb-3 font-medium">User</th>
                </tr>
              </thead>
              <tbody>
                {topMem.map((p) => (
                  <tr
                    key={p.pid}
                    className="cursor-pointer transition-colors"
                    style={{ color: 'var(--text-primary)' }}
                    onClick={() => {
                      navigate('/processes');
                      setTimeout(() => {
                        useProcessStore.getState().setSelectedPid(p.pid);
                      }, 100);
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--bg-elevated)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <td className="py-2 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {p.pid}
                    </td>
                    <td className="py-2 truncate max-w-[200px]">{p.name}</td>
                    <td className="py-2 text-right font-mono">{formatBytes(p.memory_rss_bytes)}</td>
                    <td className="py-2 text-right font-mono">{formatBytes(p.memory_vms_bytes)}</td>
                    <td className="py-2 text-right font-mono">
                      <span
                        style={{
                          color:
                            p.memory_percent > 10
                              ? 'var(--color-danger)'
                              : p.memory_percent > 5
                                ? 'var(--color-warning)'
                                : 'var(--color-success)',
                        }}
                      >
                        {formatPercent(p.memory_percent)}
                      </span>
                    </td>
                    <td className="py-2 text-right font-mono">{formatPercent(p.cpu_percent)}</td>
                    <td
                      className="py-2 truncate max-w-[100px]"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {p.username}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {label}
      </p>
      <p className="text-sm font-medium font-mono" style={{ color: 'var(--text-primary)' }}>
        {value}
      </p>
    </div>
  );
}
