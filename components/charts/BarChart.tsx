// Plain server-rendered SVG bar chart — no client JS, no charting library. Single series only
// (this app's reports are all one-hue magnitude comparisons), so per dataviz guidance a bar
// chart's color job is "sequential, one hue" and no legend is needed (a single color needs no
// legend box — the chart's own title already says what's plotted).
const VIEW_WIDTH = 600;
const VIEW_HEIGHT = 220;
const BASELINE_Y = 180;
const MAX_BAR_WIDTH = 56; // viewBox units — caps thickness so bars never fill the whole band
const CORNER_RADIUS = 4;

export type BarChartDatum = { label: string; value: number };

function roundedTopBarPath(x: number, width: number, top: number, baseline: number): string {
  const r = Math.min(CORNER_RADIUS, (baseline - top) / 2, width / 2);
  if (r <= 0) return `M ${x},${baseline} L ${x + width},${baseline} Z`;
  return [
    `M ${x},${top + r}`,
    `Q ${x},${top} ${x + r},${top}`,
    `L ${x + width - r},${top}`,
    `Q ${x + width},${top} ${x + width},${top + r}`,
    `L ${x + width},${baseline}`,
    `L ${x},${baseline}`,
    'Z',
  ].join(' ');
}

export default function BarChart({ data, color = '#006A52' }: { data: BarChartDatum[]; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const bandWidth = VIEW_WIDTH / data.length;
  const barWidth = Math.min(MAX_BAR_WIDTH, bandWidth * 0.55);

  // Gridlines at 0/25/50/75/100% of the tallest bar, rounded to a clean step — recessive,
  // one-step-off-surface gray, never dashed.
  const gridSteps = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} width="100%" height={VIEW_HEIGHT} role="img" aria-label="Bar chart">
      {gridSteps.map((step) => {
        const y = BASELINE_Y - step * (BASELINE_Y - 20);
        return <line key={step} x1={0} y1={y} x2={VIEW_WIDTH} y2={y} stroke="#edf0f9" strokeWidth={1} />;
      })}
      {data.map((d, i) => {
        const x = i * bandWidth + (bandWidth - barWidth) / 2;
        const barHeight = (d.value / max) * (BASELINE_Y - 20);
        const top = BASELINE_Y - barHeight;
        return (
          <g key={d.label}>
            <title>{`${d.label}: ${d.value}`}</title>
            <path d={roundedTopBarPath(x, barWidth, top, BASELINE_Y)} fill={color} />
            {d.value > 0 && (
              <text x={x + barWidth / 2} y={top - 6} textAnchor="middle" fontSize="12" fill="#3a3f58" fontWeight={600}>
                {d.value}
              </text>
            )}
            <text x={x + barWidth / 2} y={BASELINE_Y + 18} textAnchor="middle" fontSize="11" fill="#8890b4">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
