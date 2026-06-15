// SofaScore API importer for AB match results
// Team ID 203406 = AB (Akademisk Boldklub)

const TEAM_ID   = 203406;
const AB_NAMES  = ['ab', 'akademisk boldklub'];
const SEASON    = '25/26';

// Headers that mimic a browser — SofaScore blocks naked server requests
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Referer':    'https://www.sofascore.com/',
  'Accept':     'application/json',
};

export interface SofaEvent {
  id: number;
  slug: string;
  startTimestamp: number;
  status:      { type: string; description: string };
  tournament:  { name: string };
  season:      { name: string; year: string; id: number };
  roundInfo?:  { round: number };
  homeTeam:    { name: string; id: number };
  awayTeam:    { name: string; id: number };
  homeScore?:  { current?: number; display?: number };
  awayScore?:  { current?: number; display?: number };
  winnerCode?: number; // 1=home, 2=away, 3=draw
}

export interface ParsedMatch {
  sofaId: number;
  date: string;           // YYYY-MM-DD
  startTimestamp: number;
  homeTeam: string;
  awayTeam: string;
  isHome: boolean;
  opponent: string;
  homeScore: number | null;
  awayScore: number | null;
  result: string | null;  // "3-0", "1-1", etc.
  abResult: 'W' | 'D' | 'L' | null;
  competition: string;
  round: number | null;
  status: string;
  name: string;           // "AB 3-0 Thisted FC" or "AB vs Thisted FC"
}

async function fetchPage(page: number): Promise<SofaEvent[]> {
  const url = `https://api.sofascore.com/api/v1/team/${TEAM_ID}/events/last/${page}`;
  const res  = await fetch(url, { headers: HEADERS });
  if (res.status === 404) return [];  // no more pages
  if (!res.ok) throw new Error(`SofaScore API error ${res.status} on page ${page}`);
  const data = await res.json() as { events?: SofaEvent[] };
  return data.events ?? [];
}

export async function fetchSeasonMatches(): Promise<SofaEvent[]> {
  const results: SofaEvent[] = [];

  for (let page = 0; page < 20; page++) {
    const events = await fetchPage(page);
    if (events.length === 0) break;

    const seasonEvents = events.filter((e) => e.season?.year === SEASON);
    results.push(...seasonEvents);

    // Stop once we've passed the season boundary (all events are older)
    const hasSeasonEvent = seasonEvents.length > 0;
    const allOlder = events.every((e) => {
      const y = e.season?.year ?? '';
      return y !== SEASON && (y < SEASON || y === '2025');
    });
    if (!hasSeasonEvent || allOlder) break;
  }

  // Sort chronologically
  return results.sort((a, b) => a.startTimestamp - b.startTimestamp);
}

function isAB(name: string): boolean {
  return AB_NAMES.some((n) => name.toLowerCase().includes(n));
}

export function parseMatch(e: SofaEvent): ParsedMatch {
  const date     = new Date(e.startTimestamp * 1000);
  const dateStr  = date.toISOString().split('T')[0];
  const isHome   = isAB(e.homeTeam.name);
  const opponent = isHome ? e.awayTeam.name : e.homeTeam.name;

  const hs = e.homeScore?.current ?? e.homeScore?.display ?? null;
  const as_ = e.awayScore?.current ?? e.awayScore?.display ?? null;
  const finished = e.status.type === 'finished';

  const result    = finished && hs !== null && as_ !== null ? `${hs}-${as_}` : null;
  const abGoals   = finished ? (isHome ? hs : as_) : null;
  const oppGoals  = finished ? (isHome ? as_ : hs) : null;
  const abResult  = abGoals === null || oppGoals === null ? null
    : abGoals > oppGoals ? 'W'
    : abGoals < oppGoals ? 'L'
    : 'D';

  const scoreStr  = result ? (isHome ? `${hs}-${as_}` : `${as_}-${hs}`) : null;
  const name = scoreStr
    ? `AB ${scoreStr} ${opponent}`
    : `AB vs ${opponent}`;

  return {
    sofaId:     e.id,
    date:       dateStr,
    startTimestamp: e.startTimestamp,
    homeTeam:   e.homeTeam.name,
    awayTeam:   e.awayTeam.name,
    isHome,
    opponent,
    homeScore:  hs,
    awayScore:  as_,
    result,
    abResult,
    competition: e.tournament.name,
    round:      e.roundInfo?.round ?? null,
    status:     e.status.type,
    name,
  };
}
