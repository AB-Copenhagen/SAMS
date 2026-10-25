import Link from 'next/link';
import { getCurrentUser, requirePermission } from '../../../lib/auth';
import AppShell from '../../../components/AppShell';
import BarChart from '../../../components/charts/BarChart';
import { getCachedMatches, mergeMatchesByDay, opponentName, type MergedMatch } from '../../../lib/vivenu';
import { getCachedMatchActivity } from '../../../lib/customer-reports';
import { avatarColor, avatarInitial } from '../../../lib/customer-ui';

const RECENT_MATCHES_SHOWN = 8;

// "Today's match" wins if one is playing; otherwise the most recently played match, falling back
// to the soonest upcoming one if nothing has been played yet (a brand-new season). Staff landing
// here on a match day want today's check-ins first, not last season's reports-page history.
function pickDefaultMatch(merged: MergedMatch[], todayStr: string): MergedMatch {
  const today = merged.find((m) => m.start.slice(0, 10) === todayStr);
  if (today) return today;
  const past = [...merged].reverse().find((m) => m.start.slice(0, 10) < todayStr);
  return past ?? merged[0];
}

export default async function MatchActivityPage(props: { searchParams: Promise<{ date?: string }> }) {
  const user = requirePermission(await getCurrentUser(), 'crm', 'view');
  const searchParams = await props.searchParams;

  const merged = mergeMatchesByDay(await getCachedMatches());

  return (
    <AppShell user={user} wide>
      <div className="page-header">
        <div>
          <h1>Match activity</h1>
          <p>Live check-ins, attendance cohorts, and top fans for a single match day.</p>
        </div>
        <Link href="/customers/reports" className="asset-link">Reports →</Link>
      </div>

      {merged.length === 0 ? (
        <div className="card">
          <p style={{ color: '#8890b4', fontSize: 13 }}>No matches found in Vivenu yet.</p>
        </div>
      ) : (
        <MatchActivityBody merged={merged} selectedDate={searchParams.date} />
      )}
    </AppShell>
  );
}

async function MatchActivityBody({ merged, selectedDate }: { merged: MergedMatch[]; selectedDate?: string }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const match = (selectedDate && merged.find((m) => m.start.slice(0, 10) === selectedDate))
    || pickDefaultMatch(merged, todayStr);
  const matchDate = match.start.slice(0, 10);

  const { summary, topFans } = await getCachedMatchActivity(match.ids);
  const checkInRate = summary.ticketsSold > 0 ? summary.checkedIn / summary.ticketsSold : 0;
  const recentMatches = merged.slice(-RECENT_MATCHES_SHOWN).reverse();

  return (
    <>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header" style={{ marginBottom: 10 }}>Match</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {recentMatches.map((m) => {
            const day = m.start.slice(0, 10);
            const isActive = day === matchDate;
            return (
              <a
                key={day}
                href={`/customers/match-activity?date=${day}`}
                className={'match-pill' + (isActive ? ' match-pill-active' : '')}
              >
                vs {opponentName(m.name)}
                <span className="match-pill-date">
                  {new Date(m.start).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                  {day === todayStr ? ' · Today' : ''}
                </span>
              </a>
            );
          })}
        </div>
      </div>

      <div className="page-header" style={{ marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0 }}>vs {opponentName(match.name)}</h2>
          <p style={{ margin: 0 }}>
            {new Date(match.start).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Tickets sold</div>
          <div className="stat-value">{summary.ticketsSold}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Checked in</div>
          <div className="stat-value">{summary.checkedIn}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Guest check-ins</div>
          <div className="stat-value">{summary.guestCheckins}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">No-show / unknown</div>
          <div className="stat-value">{summary.noShow}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Check-in rate</div>
          <div className="stat-value">{Math.round(checkInRate * 100)}%</div>
        </div>
      </div>
      <p style={{ color: '#8890b4', fontSize: 12, marginTop: -8, marginBottom: 20 }}>
        Tickets sold is live from Vivenu. Checked-in/guest counts only reflect what the
        scan.created webhook has delivered since it went live — expect low or 0 counts for
        matches before then. Guest check-ins are approved scans whose ticket isn&apos;t linked to
        a CRM customer (away-team, comp, internal tickets, etc.) — they&apos;re still real
        check-ins, just not attributable to a known fan.
      </p>

      <div className="dashboard-row">
        <div className="card">
          <div className="card-header">New vs. returning fans checked in</div>
          <BarChart
            data={[
              { label: 'New (first match)', value: summary.newFans },
              { label: 'Returning', value: summary.returningFans },
            ]}
            color="#c2410c"
          />
        </div>

        <div className="card">
          <div className="card-header">Top fans at this match</div>
          {topFans.length === 0 ? (
            <p style={{ color: '#8890b4', fontSize: 13 }}>No check-ins recorded for this match yet.</p>
          ) : (
            <div className="config-list">
              {topFans.map((fan, i) => (
                <Link key={fan.id} href={`/customers/${fan.id}`} className="config-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <span style={{ width: 20, textAlign: 'right', color: '#8890b4', fontSize: 12, fontWeight: 600 }}>{i + 1}</span>
                  <span className="customer-avatar" style={{ background: avatarColor(fan.id) }}>
                    {avatarInitial(fan.name, fan.email)}
                  </span>
                  <div className="config-item-info">
                    <div className="config-item-title">
                      {fan.name || fan.email || fan.id}
                      {fan.seasonPass && <span className="season-pass-badge" style={{ marginLeft: 8 }}>SEASON PASS</span>}
                    </div>
                    <div className="config-item-sub">{fan.matchesAttended} match{fan.matchesAttended === 1 ? '' : 'es'} attended</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
