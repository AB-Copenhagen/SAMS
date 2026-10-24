import Link from 'next/link';
import { getCurrentUser, requireStaff } from '../../../lib/auth';
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
} from '../../../lib/customer-reports';

export default async function CustomerReportsPage() {
  const user = requireStaff(await getCurrentUser());

  const [spendDistribution, attendanceCohorts, growth, seasonPass, matchAttendance] = await Promise.all([
    getCachedSpendDistribution(),
    getCachedAttendanceCohorts(),
    getCachedCustomerGrowth(),
    getCachedSeasonPassRate(),
    getCachedMatchAttendance(),
  ]);

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
