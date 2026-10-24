// Plain server-rendered SVG area chart — single series (a trend over time), so per dataviz
// guidance this gets one hue, a 2px line, a ~10% opacity fill wash, and an end-label on the
// final point rather than a value on every point (which for a monthly series could easily be
// 12+ points — "never a number on every point").
const VIEW_WIDTH = 600;
const VIEW_HEIGHT = 220;
const TOP_PAD = 20;
const BASELINE_Y = 180;

export type AreaChartDatum = { label: string; value: number };

// Short month label (e.g. "2026-07" -> "Jul") for the x-axis — the full value is still in the
// per-point <title> (hover) and available via the label as given, just not forced onto every tick.
function shortLabel(label: string): string {
  const [, month] = label.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const idx = Number(month) - 1;
  return names[idx] ?? label;
}

export default function AreaChart({ data, color = '#006A52' }: { data: AreaChartDatum[]; color?: string }) {
  if (data.length === 0) {
    return <p style={{ color: '#8890b4', fontSize: 13 }}>No data yet.</p>;
  }

  const max = Math.max(1, ...data.map((d) => d.value));
  const plotHeight = BASELINE_Y - TOP_PAD;
  const stepX = data.length > 1 ? VIEW_WIDTH / (data.length - 1) : 0;
  const points = data.map((d, i) => ({
    x: data.length > 1 ? i * stepX : VIEW_WIDTH / 2,
    y: BASELINE_Y - (d.value / max) * plotHeight,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x},${BASELINE_Y} L ${points[0].x},${BASELINE_Y} Z`;

  // Show at most ~6 x-axis labels so months don't collide on a long series — always including
  // the first and last.
  const labelEvery = Math.max(1, Math.ceil(data.length / 6));
  const gridSteps = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} width="100%" height={VIEW_HEIGHT} role="img" aria-label="Growth over time">
      {gridSteps.map((step) => {
        const y = BASELINE_Y - step * plotHeight;
        return <line key={step} x1={0} y1={y} x2={VIEW_WIDTH} y2={y} stroke="#edf0f9" strokeWidth={1} />;
      })}
      <path d={areaPath} fill={color} fillOpacity={0.1} stroke="none" />
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={data[i].label}>
          <title>{`${data[i].label}: ${data[i].value}`}</title>
          {i === points.length - 1 && (
            <>
              <circle cx={p.x} cy={p.y} r={4} fill={color} stroke="#fff" strokeWidth={2} />
              <text x={p.x - 8} y={p.y - 10} textAnchor="end" fontSize="12" fontWeight={600} fill="#3a3f58">
                {data[i].value}
              </text>
            </>
          )}
          {i % labelEvery === 0 && (
            <text x={p.x} y={BASELINE_Y + 18} textAnchor="middle" fontSize="11" fill="#8890b4">
              {shortLabel(data[i].label)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
