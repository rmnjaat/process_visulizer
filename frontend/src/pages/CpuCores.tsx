import { useSystemStore } from '../stores/systemStore';
import { useProcessStore } from '../stores/processStore';
import { formatBytes, formatPercent, formatNumber } from '../utils/format';
import CpuGauge from '../components/gauges/CpuGauge';
import CoreBarChart from '../components/charts/CoreBarChart';
import CpuTimeSeriesChart from '../components/charts/CpuTimeSeriesChart';
import CoreHeatmap from '../components/charts/CoreHeatmap';
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

export default function CpuCores() {
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

  const { cpu, load_average } = system;

  const cpuHistory = history.map((s) => s.cpu.total_usage);

  // Top CPU consumers
  const topCpu = Object.values(processes)
    .sort((a, b) => b.cpu_percent - a.cpu_percent)
    .slice(0, 10);

  const freqColor =
    cpu.frequency_mhz > cpu.frequency_max_mhz * 0.8
      ? 'var(--color-danger)'
      : cpu.frequency_mhz > cpu.frequency_max_mhz * 0.5
        ? 'var(--color-warning)'
        : 'var(--color-success)';

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
        <Tooltip text={tooltips.cpu_page_title}>
          <span>CPU Cores</span>
        </Tooltip>
      </h1>

      {/* Row 1: Stats overview */}
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

        {/* CPU Model */}
        <Tooltip text={tooltips.cpu_processor}>
          <div className="w-full">
            <MetricCard
              label="Processor"
              value={`${cpu.physical_cores}P / ${cpu.logical_cores}L`}
              subtitle={cpu.model || 'Unknown'}
            />
          </div>
        </Tooltip>

        {/* Frequency */}
        <Tooltip text={tooltips.cpu_frequency}>
          <div className="w-full">
            <MetricCard
              label="Frequency"
              value={`${cpu.frequency_mhz.toFixed(0)} MHz`}
              subtitle={`${cpu.frequency_min_mhz.toFixed(0)} – ${cpu.frequency_max_mhz.toFixed(0)} MHz`}
              color={freqColor}
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

      {/* Row 2: Per-Core Live Bars */}
      <div className="mb-6">
        <SectionCard title="Per-Core Usage" tooltip={tooltips.cpu_per_core_usage}>
          <CoreBarChart cores={cpu.usage_per_core} />
        </SectionCard>
      </div>

      {/* Row 3: Charts side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <SectionCard title="CPU Usage Over Time" tooltip={tooltips.cpu_usage_over_time}>
          {cpuHistory.length > 1 ? (
            <CpuTimeSeriesChart data={cpuHistory} />
          ) : (
            <div
              className="flex items-center justify-center h-[250px]"
              style={{ color: 'var(--text-muted)' }}
            >
              Collecting data...
            </div>
          )}
        </SectionCard>

        <SectionCard title="Per-Core Heatmap" tooltip={tooltips.cpu_heatmap}>
          <CoreHeatmap history={history} />
        </SectionCard>
      </div>

      {/* Row 4: Top CPU Consumers */}
      <SectionCard title="Top CPU Consumers" tooltip={tooltips.cpu_top_consumers}>
        {topCpu.length === 0 ? (
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
                    <Tooltip text={tooltips.cpu_top_name}><span>Name</span></Tooltip>
                  </th>
                  <th className="text-right pb-3 font-medium">
                    <Tooltip text={tooltips.cpu_percent}><span>CPU %</span></Tooltip>
                  </th>
                  <th className="text-right pb-3 font-medium">
                    <Tooltip text={tooltips.cpu_top_memory}><span>Memory</span></Tooltip>
                  </th>
                  <th className="text-center pb-3 font-medium">
                    <Tooltip text={tooltips.cpu_top_threads}><span>Threads</span></Tooltip>
                  </th>
                  <th className="text-left pb-3 font-medium">
                    <Tooltip text={tooltips.cpu_top_user}><span>User</span></Tooltip>
                  </th>
                </tr>
              </thead>
              <tbody>
                {topCpu.map((p) => (
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
                    <td className="py-2 text-right font-mono">
                      <span
                        style={{
                          color:
                            p.cpu_percent > 50
                              ? 'var(--color-danger)'
                              : p.cpu_percent > 20
                                ? 'var(--color-warning)'
                                : 'var(--color-success)',
                        }}
                      >
                        {formatPercent(p.cpu_percent)}
                      </span>
                    </td>
                    <td className="py-2 text-right font-mono">{formatBytes(p.memory_rss_bytes)}</td>
                    <td className="py-2 text-center">{formatNumber(p.num_threads)}</td>
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
