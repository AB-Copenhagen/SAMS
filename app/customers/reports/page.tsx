import Link from 'next/link';
import { getCurrentUser, requirePermission } from '../../../lib/auth';
import AppShell from '../../../components/AppShell';
import BarChart from '../../../components/charts/BarChart';
import AreaChart from '../../../components/charts/AreaChart';
import Meter from '../../../components/charts/Meter';
import StackedBarChart from '../../../components/charts/StackedBarChart';
import {
  getCachedSpendDistribution,
  getCachedAttendanceCohorts,
  getCachedCustomerGrowth,
  getCachedSeasonPassRate,
  getCachedMatchAttendance,
  getCachedDescopeUserSnapshots,
} from '../../../lib/customer-reports';

// Only the most recent days, same "keep the bar chart readable" reasoning as the match
// attendance report's `.slice(-10)` above — this grows by one row per day forever, so an
// unbounded chart would eventually squeeze hundreds of illegible bars into one view. The table
// below isn't capped: it's just rows, not an SVG layout that degrades with more of them.
const SNAPSHOT_CHART_DAYS = 60;

function formatSnapshotDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}

export default async function CustomerReportsPage() {
  const user = requirePermission(await getCurrentUser(), 'crm', 'view');

  const [spendDistribution, attendanceCohorts, growth, seasonPass, matchAttendance, descopeUserSnapshots] = await Promise.all([
    getCachedSpendDistribution(),
    getCachedAttendanceCohorts(),
    getCachedCustomerGrowth(),
    getCachedSeasonPassRate(),
    getCachedMatchAttendance(),
    getCachedDescopeUserSnapshots(),
  ]);

  // Only rows that can actually show both added and lost — backfilled pre-feature rows have
  // addedCount but no lostCount/totalCount (see gh-113), and don't belong in this stack.
  const addedLostChartData = descopeUserSnapshots
    .filter((s) => s.addedCount !== null && s.lostCount !== null)
    .slice(-SNAPSHOT_CHART_DAYS)
    .map((s) => ({
      label: formatSnapshotDate(s.date),
      segments: [
        { name: 'Added', value: s.addedCount!, color: '#006A52' },
        { name: 'Lost', value: s.lostCount!, color: '#c2410c' },
      ],
    }));

  return (
    <AppShell user={user} wide>
      <div className="page-header">
        <div>
          <h1>Reports</h1>
          <p>Fixed reports over the unified customer record — spend, growth, and match attendance.</p>
        </div>
        <Link href="/customers" className="asset-link">← Dashboard</Link>
      </div>

      <div className="dashboard-row">
        <div className="card">
          <div className="card-header">Customers by Shopify spend</div>
          <BarChart data={spendDistribution.map((b) => ({ label: b.label, value: b.count }))} />
        </div>

        <div className="card">
          <div className="card-header">Matches attended (cohorts)</div>
          <BarChart data={attendanceCohorts.map((b) => ({ label: b.label, value: b.count }))} color="#c2410c" />
        </div>
      </div>

      <div className="card">
        <div className="card-header">Tickets sold vs. checked in, per match</div>
        <p style={{ color: '#8890b4', fontSize: 12, marginTop: -10, marginBottom: 14 }}>
          Tickets sold is live from Vivenu for every match. Checked-in only reflects what the
          scan.created webhook has delivered since it went live — expect 0 for matches before
          then, including past ones.
        </p>
        <StackedBarChart
          data={matchAttendance.map((m) => ({
            label: m.label,
            sublabel: m.date,
            segments: [
              { name: 'Checked in', value: m.checkedIn, color: '#006A52' },
              { name: 'No-show / unknown', value: m.noShow, color: '#dde1ee' },
            ],
          }))}
        />
      </div>

      <div className="card">
        <div className="card-header">Customer growth over time</div>
        <AreaChart data={growth.map((g) => ({ label: g.month, value: g.cumulativeCount }))} />
      </div>

      <div className="card">
        <div className="card-header">Descope users added vs. lost, per day</div>
        <p style={{ color: '#8890b4', fontSize: 12, marginTop: -10, marginBottom: 14 }}>
          Only shows the last {SNAPSHOT_CHART_DAYS} days with a recorded snapshot. History from
          before this tracking shipped only has "added" (see the table below) — "lost" couldn't
          be reconstructed after the fact, so those earlier days aren't in this chart.
        </p>
        <StackedBarChart
          data={addedLostChartData}
          emptyMessage="No daily snapshots recorded yet."
          ariaLabel="Descope users added vs lost per day"
        />
      </div>

      <div className="card">
        <div className="card-header">Descope user count history</div>
        {descopeUserSnapshots.length === 0 ? (
          <div style={{ padding: '24px 20px', textAlign: 'center', color: '#8890b4' }}>No daily snapshots recorded yet.</div>
        ) : (
          <div className="asset-table-wrap">
            <table className="asset-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Total</th>
                  <th>Added</th>
                  <th>Lost</th>
                </tr>
              </thead>
              <tbody>
                {[...descopeUserSnapshots].reverse().map((s) => (
                  <tr key={s.date}>
                    <td style={{ fontWeight: 500 }}>{s.date}</td>
                    <td>{s.totalCount ?? '—'}</td>
                    <td>{s.addedCount ?? '—'}</td>
                    <td>{s.lostCount ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">Season pass holders</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10 }}>
          <div style={{ fontSize: 32, fontWeight: 600, color: '#2d3154' }}>{Math.round(seasonPass.rate * 100)}%</div>
          <div style={{ color: '#8890b4', fontSize: 13 }}>
            {seasonPass.holders} of {seasonPass.total} customers
          </div>
        </div>
        <Meter rate={seasonPass.rate} />
      </div>
    </AppShell>
  );
}
