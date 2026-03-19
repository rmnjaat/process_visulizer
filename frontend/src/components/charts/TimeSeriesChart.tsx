import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

interface DataPoint {
  timestamp?: number;
  cpu: number;
  memory: number;
}

interface TimeSeriesChartProps {
  data: DataPoint[];
}

export default function TimeSeriesChart({ data }: TimeSeriesChartProps) {
  // Add an index-based label so X axis shows relative time
  const now = Date.now() / 1000;
  const chartData = data.map((d, i) => ({
    ...d,
    label: d.timestamp
      ? `-${Math.round(now - d.timestamp)}s`
      : `-${(data.length - 1 - i)}s`,
  }));

  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--bg-elevated)"
        />
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
            name === 'cpu' ? 'CPU' : 'Memory',
          ]}
          labelFormatter={(label: unknown) => `Time: ${label}`}
        />
        <Line
          type="monotone"
          dataKey="cpu"
          stroke="var(--color-primary)"
          strokeWidth={2}
          dot={false}
          name="cpu"
        />
        <Line
          type="monotone"
          dataKey="memory"
          stroke="var(--color-info)"
          strokeWidth={2}
          dot={false}
          name="memory"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
