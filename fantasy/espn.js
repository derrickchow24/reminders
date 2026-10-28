// ESPN Fantasy Football (unofficial v3 API) client.
// Private leagues need ESPN_S2 + ESPN_SWID cookies from a logged-in browser session.
const BASE = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl';

const POSITIONS = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'D/ST' };
const SLOTS = {
  0: 'QB', 2: 'RB', 4: 'WR', 6: 'TE', 16: 'D/ST', 17: 'K',
  20: 'Bench', 21: 'IR', 23: 'FLEX', 7: 'OP',
};
const PRO_TEAMS = {
  0: 'FA', 1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET',
  9: 'GB', 10: 'TEN', 11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR', 15: 'MIA', 16: 'MIN',
  17: 'NE', 18: 'NO', 19: 'NYG', 20: 'NYJ', 21: 'PHI', 22: 'ARI', 23: 'PIT', 24: 'LAC',
  25: 'SF', 26: 'SEA', 27: 'TB', 28: 'WSH', 29: 'CAR', 30: 'JAX', 33: 'BAL', 34: 'HOU',
};

function config() {
  const leagueId = process.env.ESPN_LEAGUE_ID;
  const teamId = Number(process.env.ESPN_TEAM_ID);
  if (!leagueId || !teamId) throw new Error('Set ESPN_LEAGUE_ID and ESPN_TEAM_ID');
  const now = new Date();
  // NFL season year: Jan/Feb games belong to the previous season
  const season = Number(process.env.ESPN_SEASON) || (now.getMonth() < 2 ? now.getFullYear() - 1 : now.getFullYear());
  return { leagueId, teamId, season };
}

async function espnGet(views, extraHeaders = {}) {
  const { leagueId, season } = config();
  const qs = views.map(v => 'view=' + v).join('&');
  const headers = { Accept: 'application/json', ...extraHeaders };
  if (process.env.ESPN_S2 && process.env.ESPN_SWID) {
    headers.Cookie = `espn_s2=${process.env.ESPN_S2}; SWID=${process.env.ESPN_SWID}`;
  }
  const res = await fetch(`${BASE}/seasons/${season}/segments/0/leagues/${leagueId}?${qs}`, { headers });
  if (!res.ok) throw new Error(`ESPN ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

function toPlayer(player, extra = {}) {
  const stats = player.stats || [];
  const seasonStat = stats.find(s => s.statSourceId === 0 && s.statSplitTypeId === 0);
  const projStat = stats.find(s => s.statSourceId === 1 && s.statSplitTypeId === 1);
  return {
    id: player.id,
    name: player.fullName,
    position: POSITIONS[player.defaultPositionId] || '?',
    proTeam: PRO_TEAMS[player.proTeamId] || '?',
    injuryStatus: player.injuryStatus || 'ACTIVE',
    percentOwned: round(player.ownership?.percentOwned),
    percentChange: round(player.ownership?.percentChange),
    seasonPoints: round(seasonStat?.appliedTotal),
    avgPoints: round(seasonStat?.appliedAverage),
    projectedPoints: round(projStat?.appliedTotal),
    ...extra,
  };
}

function round(n) {
  return typeof n === 'number' ? Math.round(n * 10) / 10 : null;
}

function teamName(t) {
  return t.name || [t.location, t.nickname].filter(Boolean).join(' ') || `Team ${t.id}`;
}

async function getMyTeam() {
  const { teamId } = config();
  const data = await espnGet(['mTeam', 'mRoster', 'mSettings', 'mStandings']);
  const team = data.teams.find(t => t.id === teamId);
  if (!team) throw new Error(`Team ${teamId} not found in league`);
  const rec = team.record?.overall || {};
  const scoring = data.settings?.scoringSettings?.scoringItems || [];
  // statId 53 = receptions; its points value tells us PPR vs half vs standard
  const rec53 = scoring.find(s => s.statId === 53);
  return {
    league: data.settings?.name || 'League',
    week: data.scoringPeriodId,
    scoring: rec53 ? (rec53.points === 1 ? 'PPR' : rec53.points === 0.5 ? 'Half PPR' : `${rec53.points} pts/rec`) : 'Standard',
    team: {
      name: teamName(team),
      wins: rec.wins ?? 0,
      losses: rec.losses ?? 0,
      ties: rec.ties ?? 0,
      pointsFor: round(rec.pointsFor),
      pointsAgainst: round(rec.pointsAgainst),
      standing: team.playoffSeed || team.rankCalculatedFinal || null,
    },
    roster: (team.roster?.entries || []).map(e =>
      toPlayer(e.playerPoolEntry.player, { slot: SLOTS[e.lineupSlotId] || String(e.lineupSlotId) })
    ),
  };
}

async function getFreeAgents(limit = 60) {
  const filter = {
    players: {
      filterStatus: { value: ['FREEAGENT', 'WAIVERS'] },
      filterSlotIds: { value: [0, 2, 4, 6, 16, 17] },
      limit,
      sortPercOwned: { sortPriority: 1, sortAsc: false },
    },
  };
  const data = await espnGet(['kona_player_info'], { 'X-Fantasy-Filter': JSON.stringify(filter) });
  return (data.players || []).map(p => toPlayer(p.player, { status: p.status }));
}

module.exports = { getMyTeam, getFreeAgents };
