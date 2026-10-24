// Plain meter/progress track — per dataviz guidance, a single ratio against a limit is a meter,
// not a 2-slice pie. Fill and track are the same hue (track = a lighter step), not a
// severity ramp, since "season pass %" has no good/bad connotation.
export default function Meter({ rate, color = '#006A52', trackColor = '#e3f0ec' }: { rate: number; color?: string; trackColor?: string }) {
  const pct = Math.max(0, Math.min(1, rate)) * 100;
  return (
    <div style={{ width: '100%', height: 14, borderRadius: 999, background: trackColor, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 999 }} />
    </div>
  );
}
