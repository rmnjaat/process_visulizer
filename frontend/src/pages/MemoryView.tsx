import { useSystemStore } from '../stores/systemStore';
import { useProcessStore } from '../stores/processStore';
import { formatBytes, formatPercent } from '../utils/format';
import MemoryGauge from '../components/gauges/MemoryGauge';
import MemoryTimeSeriesChart from '../components/charts/MemoryTimeSeriesChart';
import MemoryBreakdownBar from '../components/charts/MemoryBreakdownBar';
import MetricCard from '../components/common/MetricCard';
import { Tooltip } from '../components/common/Tooltip';
import { tooltips } from '../utils/tooltips';
import { useNavigate } from 'react-router-dom';

function SectionCard({ title, tooltip, children }: { title?: string; tooltip?: string; children: React.ReactNode }) {
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
          {tooltip ? (
            <Tooltip text={tooltip}>
              <span>{title}</span>
            </Tooltip>
          ) : (
            title
          )}
        </h2>
      )}
      {children}
    </div>
  );
}

function StatItem({ label, value, tooltip }: { label: string; value: string; tooltip?: string }) {
  return (
    <div>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {tooltip ? (
          <Tooltip text={tooltip}>
            <span>{label}</span>
          </Tooltip>
        ) : (
          label
        )}
      </p>
      <p className="text-sm font-medium font-mono" style={{ color: 'var(--text-primary)' }}>
        {value}
      </p>
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
        <Tooltip text={tooltips.mem_page_title}>
          <span>Memory</span>
        </Tooltip>
      </h1>

      {/* Row 1: Stats overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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

        {/* Used */}
        <Tooltip text={tooltips.mem_used}>
          <div className="w-full">
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
          </div>
        </Tooltip>

        {/* Available */}
        <Tooltip text={tooltips.mem_available}>
          <div className="w-full">
            <MetricCard
              label="Available"
              value={formatBytes(memory.available_bytes)}
              subtitle={`${formatPercent(100 - memory.percent)} of total`}
              color="var(--color-success)"
            />
          </div>
        </Tooltip>

        {/* Swap */}
        <Tooltip text={tooltips.mem_swap_card}>
          <div className="w-full">
            <MetricCard
              label="Swap"
              value={formatPercent(memory.swap_percent)}
              subtitle={`${formatBytes(memory.swap_used_bytes)} / ${formatBytes(memory.swap_total_bytes)}`}
              color={swapColor}
            />
          </div>
        </Tooltip>
      </div>

      {/* Row 2: Memory Breakdown Bar */}
      <div className="mb-6">
        <SectionCard title="Memory Breakdown" tooltip={tooltips.mem_breakdown}>
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
        <SectionCard title="Memory Usage Over Time" tooltip={tooltips.mem_usage_over_time}>
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

        <SectionCard title="Swap Usage Over Time" tooltip={tooltips.mem_swap_over_time}>
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
        <SectionCard title="Detailed Statistics" tooltip={tooltips.mem_detailed_stats}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <StatItem label="Physical Memory" value={formatBytes(memory.total_bytes)} tooltip={tooltips.mem_physical} />
            <StatItem label="Memory Used" value={formatBytes(memory.used_bytes)} tooltip={tooltips.mem_used} />
            <StatItem label="Available" value={formatBytes(memory.available_bytes)} tooltip={tooltips.mem_available} />
            {isMacOS ? (
              <>
                <StatItem label="App Memory" value={formatBytes(memory.app_memory_bytes)} tooltip={tooltips.mem_app_memory} />
                <StatItem label="Wired Memory" value={formatBytes(memory.wired_bytes)} tooltip={tooltips.mem_wired} />
                <StatItem label="Compressed" value={formatBytes(memory.compressed_bytes)} tooltip={tooltips.mem_compressed} />
              </>
            ) : (
              <>
                <StatItem label="Free" value={formatBytes(memory.free_bytes)} tooltip={tooltips.mem_free} />
                <StatItem label="Cached" value={formatBytes(memory.cached_bytes)} tooltip={tooltips.mem_cached} />
                <StatItem label="Buffers" value={formatBytes(memory.buffers_bytes)} tooltip={tooltips.mem_buffers} />
                <StatItem label="Shared" value={formatBytes(memory.shared_bytes)} tooltip={tooltips.mem_shared} />
              </>
            )}
            <StatItem label="Usage" value={formatPercent(memory.percent)} tooltip={tooltips.mem_usage_percent} />
            <StatItem label="Swap Total" value={formatBytes(memory.swap_total_bytes)} tooltip={tooltips.mem_swap_total} />
            <StatItem label="Swap Used" value={formatBytes(memory.swap_used_bytes)} tooltip={tooltips.mem_swap_used} />
            <StatItem label="Swap Free" value={formatBytes(memory.swap_free_bytes)} tooltip={tooltips.mem_swap_free} />
            <StatItem label="Swap Usage" value={formatPercent(memory.swap_percent)} tooltip={tooltips.mem_swap_usage} />
          </div>
        </SectionCard>
      </div>

      {/* Row 5: Top Memory Consumers */}
      <SectionCard title="Top Memory Consumers" tooltip={tooltips.mem_top_consumers}>
        {topMem.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            No process data available
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: 'var(--text-secondary)' }}>
                  <th className="text-left pb-3 font-medium">
                    <Tooltip text={tooltips.pid}><span>PID</span></Tooltip>
                  </th>
                  <th className="text-left pb-3 font-medium">
                    <Tooltip text={tooltips.mem_top_name}><span>Name</span></Tooltip>
                  </th>
                  <th className="text-right pb-3 font-medium">
                    <Tooltip text={tooltips.mem_top_rss}><span>RSS</span></Tooltip>
                  </th>
                  <th className="text-right pb-3 font-medium">
                    <Tooltip text={tooltips.mem_top_virtual}><span>Virtual</span></Tooltip>
                  </th>
                  <th className="text-right pb-3 font-medium">
                    <Tooltip text={tooltips.mem_top_mem_pct}><span>Mem %</span></Tooltip>
                  </th>
                  <th className="text-right pb-3 font-medium">
                    <Tooltip text={tooltips.mem_top_cpu_pct}><span>CPU %</span></Tooltip>
                  </th>
                  <th className="text-left pb-3 font-medium">
                    <Tooltip text={tooltips.mem_top_user}><span>User</span></Tooltip>
                  </th>
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
