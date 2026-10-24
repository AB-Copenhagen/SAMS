// Plain server-rendered SVG stacked bar chart. Two series this time (checked-in + no-show,
// stacking to tickets sold), so per dataviz guidance this needs a legend (always present for
// 2+ series — color alone isn't a reliable identity channel) and a 2px surface gap between the
// two stacked segments, rounded top corners only on the whole stack's outer silhouette.
const VIEW_WIDTH = 600;
const VIEW_HEIGHT = 240;
const BASELINE_Y = 190;
const MAX_BAR_WIDTH = 48;
const CORNER_RADIUS = 4;
const SEGMENT_GAP = 2;

export type StackedBarDatum = { label: string; segments: { name: string; value: number; color: string }[] };

function topRoundedRectPath(x: number, width: number, top: number, bottom: number): string {
  const r = Math.min(CORNER_RADIUS, (bottom - top) / 2, width / 2);
  if (r <= 0) return `M ${x},${bottom} L ${x + width},${bottom} Z`;
  return [
    `M ${x},${top + r}`,
    `Q ${x},${top} ${x + r},${top}`,
    `L ${x + width - r},${top}`,
    `Q ${x + width},${top} ${x + width},${top + r}`,
    `L ${x + width},${bottom}`,
    `L ${x},${bottom}`,
    'Z',
  ].join(' ');
}

export default function StackedBarChart({ data }: { data: StackedBarDatum[] }) {
  if (data.length === 0) {
    return <p style={{ color: '#8890b4', fontSize: 13 }}>No matches yet.</p>;
  }

  const max = Math.max(1, ...data.map((d) => d.segments.reduce((sum, s) => sum + s.value, 0)));
  const plotHeight = BASELINE_Y - 20;
  const bandWidth = VIEW_WIDTH / data.length;
  const barWidth = Math.min(MAX_BAR_WIDTH, bandWidth * 0.55);
  const seriesNames = data[0]?.segments.map((s) => s.name) ?? [];

  return (
    <div>
      {seriesNames.length > 1 && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 12, color: '#6b7491' }}>
          {data[0].segments.map((s) => (
            <span key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, display: 'inline-block' }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} width="100%" height={VIEW_HEIGHT} role="img" aria-label="Tickets sold vs checked in">
        {[0, 0.25, 0.5, 0.75, 1].map((step) => {
          const y = BASELINE_Y - step * plotHeight;
          return <line key={step} x1={0} y1={y} x2={VIEW_WIDTH} y2={y} stroke="#edf0f9" strokeWidth={1} />;
        })}
        {data.map((d, i) => {
          const x = i * bandWidth + (bandWidth - barWidth) / 2;
          const total = d.segments.reduce((sum, s) => sum + s.value, 0);
          // Compute each segment's true (ungapped) boundaries bottom-up first, then shrink each
          // segment's rect inward from its upper edge by the gap — so neighbors never touch,
          // without having to reason about both edges of a shared boundary at once.
          let runningTop = BASELINE_Y;
          const boundaries = d.segments.map((seg) => {
            const segHeight = total > 0 ? (seg.value / max) * plotHeight : 0;
            const bottom = runningTop;
            const top = runningTop - segHeight;
            runningTop = top;
            return { seg, top, bottom };
          });

          return (
            <g key={d.label}>
              <title>{`${d.label}: ${d.segments.map((s) => `${s.name} ${s.value}`).join(', ')}`}</title>
              {boundaries.map(({ seg, top, bottom }, segIdx) => {
                if (bottom - top <= 0) return null;
                const isTopmost = segIdx === boundaries.length - 1;
                // Pull this segment's top edge down by the gap, except the very topmost
                // segment of the stack (nothing above it to gap away from).
                const drawTop = isTopmost ? top : Math.min(bottom, top + SEGMENT_GAP);
                return isTopmost
                  ? <path key={seg.name} d={topRoundedRectPath(x, barWidth, drawTop, bottom)} fill={seg.color} />
                  : <rect key={seg.name} x={x} y={drawTop} width={barWidth} height={bottom - drawTop} fill={seg.color} />;
              })}
              {total > 0 && (
                <text x={x + barWidth / 2} y={boundaries[boundaries.length - 1].top - 6} textAnchor="middle" fontSize="11" fontWeight={600} fill="#3a3f58">
                  {total}
                </text>
              )}
              <text x={x + barWidth / 2} y={BASELINE_Y + 18} textAnchor="middle" fontSize="11" fill="#8890b4">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
