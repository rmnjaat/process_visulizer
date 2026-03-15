import type { ReactElement } from 'react';

interface SparklineProps {
  /** Array of numeric values (most recent last). */
  data: number[];
  /** Width of the SVG in pixels. */
  width?: number;
  /** Height of the SVG in pixels. */
  height?: number;
  /** Stroke colour — use a CSS variable string. */
  color?: string;
}

/**
 * Tiny inline SVG sparkline chart.
 * Normalises the data to fill the available height and draws a polyline.
 */
export function Sparkline({
  data,
  width = 60,
  height = 20,
  color = 'var(--color-primary)',
}: SparklineProps): ReactElement {
  if (data.length < 2) {
    // Not enough data — render an empty placeholder
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: 'block' }}
      />
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1; // avoid division by zero

  const padding = 2; // px vertical padding so the line doesn't clip edges
  const usableHeight = height - padding * 2;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = padding + usableHeight - ((v - min) / range) * usableHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.85}
      />
    </svg>
  );
}
