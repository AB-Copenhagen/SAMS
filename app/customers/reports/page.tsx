import Link from 'next/link';
import { getCurrentUser, requireAdmin } from '../../../lib/auth';
import AppShell from '../../../components/AppShell';
import BarChart from '../../../components/charts/BarChart';
import AreaChart from '../../../components/charts/AreaChart';
import Meter from '../../../components/charts/Meter';
import {
  getCachedSpendDistribution,
  getCachedAttendanceCohorts,
  getCachedCustomerGrowth,
  getCachedSeasonPassRate,
} from '../../../lib/customer-reports';

export default async function CustomerReportsPage() {
  const user = requireAdmin(await getCurrentUser());

  const [spendDistribution, attendanceCohorts, growth, seasonPass] = await Promise.all([
    getCachedSpendDistribution(),
    getCachedAttendanceCohorts(),
    getCachedCustomerGrowth(),
    getCachedSeasonPassRate(),
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
