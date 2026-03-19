import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

interface MemoryTimeSeriesChartProps {
  data: { memory: number; swap: number }[];
  showSwap?: boolean;
}

export default function MemoryTimeSeriesChart({ data, showSwap = false }: MemoryTimeSeriesChartProps) {
  const chartData = data.map((d, i) => ({
    ...d,
    label: `-${data.length - 1 - i}s`,
  }));

  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-elevated)" />
        <XAxis
          dataKey="label"
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          stroke="var(--bg-elevated)"
          interval="preserveStartEnd"
          minTickGap={40}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          stroke="var(--bg-elevated)"
          tickFormatter={(v: number) => `${v}%`}
          width={45}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--bg-elevated)',
            borderRadius: 8,
            color: 'var(--text-primary)',
            fontSize: 12,
          }}
          formatter={(value: unknown, name: unknown) => [
            `${Number(value).toFixed(1)}%`,
            name === 'memory' ? 'Memory' : 'Swap',
          ]}
          labelFormatter={(label: unknown) => `Time: ${label}`}
        />
        <Line
          type="monotone"
          dataKey="memory"
          stroke="var(--color-info)"
          strokeWidth={2}
          dot={false}
          name="memory"
        />
        {showSwap && (
          <Line
            type="monotone"
            dataKey="swap"
            stroke="var(--color-warning)"
            strokeWidth={2}
            dot={false}
            name="swap"
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
