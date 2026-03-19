import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';

interface CpuTimeSeriesChartProps {
  data: number[];
}

export default function CpuTimeSeriesChart({ data }: CpuTimeSeriesChartProps) {
  const chartData = data.map((cpu, i) => ({
    cpu,
    label: `-${data.length - 1 - i}s`,
  }));

  const avg = data.length > 0 ? data.reduce((a, b) => a + b, 0) / data.length : 0;

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
          formatter={(value: unknown) => [`${Number(value).toFixed(1)}%`, 'CPU']}
          labelFormatter={(label: unknown) => `Time: ${label}`}
        />
        <ReferenceLine
          y={avg}
          stroke="var(--text-muted)"
          strokeDasharray="4 4"
          strokeWidth={1}
          label={{
            value: `Avg ${avg.toFixed(1)}%`,
            position: 'right',
            fill: 'var(--text-muted)',
            fontSize: 10,
          }}
        />
        <Line
          type="monotone"
          dataKey="cpu"
          stroke="var(--color-primary)"
          strokeWidth={2}
          dot={false}
          name="cpu"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
