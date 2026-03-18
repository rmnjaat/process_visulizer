interface MetricCardProps {
  label: string;
  value: string;
  subtitle?: string;
  color?: string;
}

export default function MetricCard({ label, value, subtitle, color }: MetricCardProps) {
  return (
    <div
      className="rounded-xl p-4 border"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--bg-elevated)',
      }}
    >
      <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
        {label}
      </p>
      <p
        className="text-2xl font-bold"
        style={{ color: color ?? 'var(--text-primary)' }}
      >
        {value}
      </p>
      {subtitle && (
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
