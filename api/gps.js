// /api/gps — GPS_Daily tab
const { fetchSheet } = require('./_sheet');
module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const rows = dedupeRows(await fetchSheet('GPS_Daily'));
    const byPlayer = {};
    const posMap = {};
    const ageMap = {};
    rows.forEach(row => {
      const player = row['Name'];
      if (!player || isAggregateRow(player)) return;
      const pos = row['Position'] || '';
      const age = row['Age Group'] || '';
      if (pos) posMap[player] = normalizePos(pos);
      if (age) ageMap[player] = age.trim();
      if (!byPlayer[player]) byPlayer[player] = [];
      byPlayer[player].push({
        date:    row['Date']                              || null,
        week:    toNum(row['Week']),
        session: row['Session Type']                      || null,
        md:      row['MD (-)']                            || null,
        participation: row['Participation']               || null,
        pos:     row['Position']                          || null,
        age:     row['Age Group']                         || null,
        dist:    toNum(row['Distance (m)']),
        hsr:     toNum(row['Distance (HSR) (m)']),
        vhsr:    toNum(row['Distance (VHSR) (m)']),
        sprint:  toNum(row['Distance(speed |Sprinting) (m)']),
        dpm:     toNum(row['Distance / min (m)']),
        maxspd:  toNum(row['Speed (max.) (m/s)']),
        expl:    toNum(row['Explosive Distance (m)']),
        acc:     toNum(row['Accelerations (high)']),
        dec:     toNum(row['Decelerations (high)']),
        hml:     toNum(row['HMLD (m)']),
        mins:    toNum(row['Session Length (Mins)']),
      });
    });
    Object.keys(byPlayer).forEach(p => {
      byPlayer[p].sort((a, b) => parseD(a.date) - parseD(b.date));
    });
    const latest = {};
    Object.keys(byPlayer).forEach(p => {
      const sessions = byPlayer[p].filter(s => s.dist);
      if (sessions.length) latest[p] = { ...sessions[sessions.length - 1], player: p, pos: posMap[p] || 'MF' };
    });
    const allDates = [...new Set(rows.map(r => r['Date']).filter(Boolean))].sort();
    const matchSessions = rows.filter(r => r['MD (-)'] === 'MD' && r['Distance (m)'] && !isAggregateRow(r['Name']));
    const matchByKey = {};
    matchSessions.forEach(r => {
      const d = r['Date'];
      const player = r['Name'];
      if (!d || !player) return;
      const label = r['Session Type'] || '';
      const key = d + '||' + label;
      if (!matchByKey[key]) matchByKey[key] = { date: d, label, data: [] };
      matchByKey[key].data.push({
        name:    player,
        pos:     r['Position'] ? normalizePos(r['Position']) : null,
        age:     r['Age Group']                         || null,
        date:    d,
        session: r['Session Type'],
        md:      'MD',
        dist:    toNum(r['Distance (m)']),
        hsr:     toNum(r['Distance (HSR) (m)']),
        sprint:  toNum(r['Distance(speed |Sprinting) (m)']),
        expl:    toNum(r['Explosive Distance (m)']),
        dpm:     toNum(r['Distance / min (m)']),
        maxspd:  toNum(r['Speed (max.) (m/s)']),
        acc:     toNum(r['Accelerations (high)']),
        dec:     toNum(r['Decelerations (high)']),
        hml:     toNum(r['HMLD (m)']),
        mins:    toNum(r['Session Length (Mins)']),
      });
    });
    const matchList = Object.values(matchByKey)
      .map(v => [v.date, { label: v.label, data: v.data }])
      .sort(([a], [b]) => a.localeCompare(b));
    const METRIC_KEYS = ['dist', 'dpm', 'hsr', 'vhsr', 'sprint', 'expl', 'maxspd', 'acc', 'dec'];
    // Weekly value has two flavors:
    //   sum = grand total of every session's value within the ISO week
    //         (every player, every session, summed).
    //   avg = each day's team average within the week, summed across the
    //         days (i.e. "average the days, then add them up") — an
    //         estimate of one typical player's week rather than the whole
    //         squad's combined output.
    // This "All Ages" aggregate pools every age group, whose own "Week"
    // columns in the sheet run on different, non-aligned schedules (each
    // team's preseason starts on a different date) — so a shared ISO
    // calendar week is the only grouping that's meaningful across teams.
    // Per-team views use the sheet's own Week column instead (see gps
    // field `week` below, consumed client-side).
    //
    // A player can have more than one row on the same date (e.g. a separate
    // Training block and an IDP block) — those get combined into one record
    // per player per day before rolling into the daily/weekly aggregate, so
    // a split-session day isn't double-counted as if two players trained.
    const dailyPlayerRows = {};
    rows.forEach(r => {
      const d = r['Date'];
      const player = r['Name'];
      if (!d || !player || isAggregateRow(player)) return;
      if (normalizePos(r['Position'] || '') === 'GK') return;
      const date = new Date(d);
      if (isNaN(date)) return;
      const dist = toNum(r['Distance (m)']);
      if (dist == null) return;
      if (!dailyPlayerRows[d]) dailyPlayerRows[d] = { date, players: {} };
      if (!dailyPlayerRows[d].players[player]) dailyPlayerRows[d].players[player] = [];
      dailyPlayerRows[d].players[player].push({
        dist,
        rtp:    String(r['Session Type'] || '').trim().toLowerCase() === 'rtp',
        dpm:    toNum(r['Distance / min (m)']),
        hsr:    toNum(r['Distance (HSR) (m)']),
        vhsr:   toNum(r['Distance (VHSR) (m)']),
        sprint: toNum(r['Distance(speed |Sprinting) (m)']),
        expl:   toNum(r['Explosive Distance (m)']),
        maxspd: toNum(r['Speed (max.) (m/s)']),
        acc:    toNum(r['Accelerations (high)']),
        dec:    toNum(r['Decelerations (high)']),
        mins:   toNum(r['Session Length (Mins)']),
      });
    });
    const dailyMap = {};
    Object.keys(dailyPlayerRows).forEach(d => {
      const { date, players } = dailyPlayerRows[d];
      dailyMap[d] = { date, vals: {} };
      dailyMap[d].avgVals = {};
      METRIC_KEYS.forEach(k => { dailyMap[d].vals[k] = []; dailyMap[d].avgVals[k] = []; });
      Object.values(players).forEach(sessions => {
        const combined = combineSessions(sessions);
        // RTP sessions count toward the weekly sum but not the averages.
        const nonRTP = sessions.filter(s => !s.rtp);
        const combinedNoRTP = nonRTP.length ? combineSessions(nonRTP) : null;
        METRIC_KEYS.forEach(k => {
          if (combined[k] != null) dailyMap[d].vals[k].push(combined[k]);
          if (combinedNoRTP && combinedNoRTP[k] != null) dailyMap[d].avgVals[k].push(combinedNoRTP[k]);
        });
      });
    });
    const weeklyAgg = {};
    Object.values(dailyMap).forEach(({ date, vals, avgVals }) => {
      const wk = `${date.getFullYear()}-W${String(getWeekNumber(date)).padStart(2, '0')}`;
      if (!weeklyAgg[wk]) {
        weeklyAgg[wk] = {};
        METRIC_KEYS.forEach(k => { weeklyAgg[wk][k] = { sum: 0, avgSum: 0, avgTotal: 0, n: 0 }; });
      }
      METRIC_KEYS.forEach(k => {
        const dayVals = vals[k];
        if (dayVals.length) weeklyAgg[wk][k].sum += dayVals.reduce((a, b) => a + b, 0);
        const aVals = avgVals[k];
        if (!aVals.length) return;
        const aSum = aVals.reduce((a, b) => a + b, 0);
        weeklyAgg[wk][k].avgSum += aSum / aVals.length;
        weeklyAgg[wk][k].avgTotal += aSum;
        weeklyAgg[wk][k].n += aVals.length;
      });
    });
    const teamWeekly = {};
    Object.keys(weeklyAgg).sort().forEach(wk => {
      teamWeekly[wk] = {};
      METRIC_KEYS.forEach(k => {
        const { sum, avgSum, avgTotal, n } = weeklyAgg[wk][k];
        // mean = true grand average across every session that week (sum / n),
        // as opposed to `avg` which sums each day's average. Used for metrics
        // like maxspd where summing/day-averaging doesn't make sense.
        teamWeekly[wk][k] = (n || sum) ? { sum: +sum.toFixed(1), avg: n ? +avgSum.toFixed(1) : null, mean: n ? +(avgTotal / n).toFixed(1) : null } : null;
      });
    });
    res.status(200).json({
      players: Object.keys(byPlayer).sort(),
      pos_map: posMap,
      age_map: ageMap,
      gps: byPlayer,
      latest,
      all_dates: allDates,
      match_list: matchList,
      team_weekly: teamWeekly,
      week_keys: Object.keys(teamWeekly).sort(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
// Manual GPS exports get re-pasted with overlapping date ranges, so the
// same session (same player/date/distance/HMLD/session length) sometimes
// ends up in the sheet twice -- once under its specific MD (-) tag and
// once under "General", or as a plain repeated row -- and occasionally
// under two different date formats for the same calendar day (e.g.
// "5/9/26" and "5/9/2026"). Keep one row per session, preferring the
// specific tag over "General" when both exist, matching on the parsed
// calendar date rather than the raw date string so format doesn't matter.
function dedupeRows(rows) {
  const seen = new Map();
  const order = [];
  rows.forEach(r => {
    const name = String(r['Name'] || '').trim();
    if (!name || isAggregateRow(name)) { order.push(r); return; }
    const d = parseD(r['Date']);
    const dateKey = d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : r['Date'];
    const key = [name, dateKey, r['Distance (m)'], r['HMLD (m)'], r['Session Length (Mins)']].join('|');
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, r);
      order.push(r);
      return;
    }
    const existingIsGeneral = String(existing['MD (-)'] || '').trim().toLowerCase() === 'general';
    const currentIsGeneral = String(r['MD (-)'] || '').trim().toLowerCase() === 'general';
    if (existingIsGeneral && !currentIsGeneral) {
      order[order.indexOf(existing)] = r;
      seen.set(key, r);
    }
    // otherwise keep whichever was already kept (drop this duplicate)
  });
  return order;
}
// Sums cumulative metrics across a player's same-day sessions, takes the
// peak for max speed, and recomputes dist/min from the totals when session
// length is available (mirrors combineDaySessions() in index.html).
function combineSessions(sessions) {
  if (sessions.length === 1) return sessions[0];
  const sum = k => { const vs = sessions.map(s => s[k]).filter(v => v != null); return vs.length ? vs.reduce((a, b) => a + b, 0) : null; };
  const max = k => { const vs = sessions.map(s => s[k]).filter(v => v != null); return vs.length ? Math.max(...vs) : null; };
  const out = { ...sessions[0] };
  ['dist', 'hsr', 'vhsr', 'sprint', 'expl', 'acc', 'dec', 'mins'].forEach(k => { out[k] = sum(k); });
  out.maxspd = max('maxspd');
  if (out.mins) {
    out.dpm = +(out.dist / out.mins).toFixed(1);
  } else {
    const vs = sessions.map(s => s.dpm).filter(v => v != null);
    out.dpm = vs.length ? +(vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(1) : null;
  }
  return out;
}
function isAggregateRow(name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return true;
  return n.startsWith('ø') || n.includes('all player') || n.includes('squad') || n.includes('average') || n.includes(' avg') || n === 'avg';
}
function parseD(s) {
  if (s === null || s === undefined || s === '') return 0;
  if (typeof s === 'number') return new Date((s - 25569) * 86400000);
  if (s.includes('-')) return new Date(s);
  const [m, d, y] = s.split('/');
  if (!y) return 0;
  return new Date(+y < 100 ? 2000 + +y : +y, +m - 1, +d);
}
function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}
function normalizePos(pos) {
  const p = String(pos).trim().toUpperCase();
  if (p.includes('GK') || p.includes('GOAL')) return 'GK';
  if (p.includes('CB') || p.includes('CENTER BACK') || p.includes('CENTRE BACK')) return 'CB';
  if (p.includes('FB') || p.includes('FULL') || p.includes('BACK')) return 'FB';
  if (p.includes('MF') || p.includes('MID')) return 'MF';
  if (p.includes('FW') || p.includes('FOR') || p.includes('ATT')) return 'FW';
  return String(pos).trim();
}
function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}
