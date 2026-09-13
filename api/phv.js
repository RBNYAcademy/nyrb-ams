// /api/phv — PHV sheet (?type=medical also serves the Quarterly Medical
// Checks sheet from this same function — kept together to stay under the
// Vercel Hobby plan's 12-Serverless-Function limit rather than adding a
// 13th file).
const { fetchSheet } = require('./_sheet');
module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.query.type === 'medical') return handleMedical(req, res);
  if (req.query.type === 'cards') return handleCards(req, res);
  try {
    const rows = await fetchSheet('PHV');
    const byPlayer = {};
    rows.forEach(row => {
      const player = row['Name'];
      if (!player) return;
      if (!byPlayer[player]) byPlayer[player] = [];
      byPlayer[player].push({
        date:        row['Date']                || null,
        team:        row['Team']                || null,
        dob:         row['DOB']                 || null,
        ageAtTest:   toNum(row['Age at Test']),
        bioAge:      toNum(row['Biological Age']),
        weight:      toNum(row['Weight (lb)']),
        weightChg:   toNum(row['Weight Change']),
        height:      toInches(row['Standing Height (in)']),
        heightChg:   toNum(row['Height Change']),
        adultHeight: toInches(row['Adult Height (in)']),
        phv:         toNum(row['PHV']),
        growthPct:   toNum(row['Growth %']),
      });
    });
    Object.keys(byPlayer).forEach(p => {
      byPlayer[p].sort((a, b) => parseD(a.date) - parseD(b.date));
    });
    res.status(200).json(byPlayer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// /api/medical — Quarterly Medical Checks tab
async function handleMedical(req, res) {
  try {
    const rows = await fetchSheet('Quarterly Medical Checks');
    const byPlayer = {};
    rows.forEach(row => {
      const get = (key) => { const k = Object.keys(row).find(k => k.toLowerCase() === key.toLowerCase()); return k ? row[k] : undefined; };
      const player = get('name');
      if (!player) return;
      if (!byPlayer[player]) byPlayer[player] = [];
      byPlayer[player].push({
        date:       get('date') || null,
        team:       normTeam(get('team')),
        lDorsi:     toNumMed(get("l cc dorsiflexion")),
        rDorsi:     toNumMed(get("r cc dorsiflexion")),
        lHam:       toNumMed(get("l hamstring 90/90")),
        rHam:       toNumMed(get("r hamstring 90/90")),
        lGroin:     toNumMed(get("l groin rom")),
        rGroin:     toNumMed(get("r groin rom")),
        lIR:        toNumMed(get("l ir rom")),
        rIR:        toNumMed(get("r ir rom")),
        lQuad:      toNumMed(get("l quad ely's")),
        rQuad:      toNumMed(get("r quad ely's")),
        notes:      get('addl notes') || null,
        nordic:     get('nordic findings') || null,
        ffHipAdd:   get('ff hip add findings') || null,
        ffHipAbd:   get('ff hip abd findings') || null,
      });
    });
    Object.keys(byPlayer).forEach(p => {
      byPlayer[p].sort((a, b) => parseD(a.date) - parseD(b.date));
    });
    res.status(200).json(byPlayer);
  } catch (err) {
    console.error('[Medical] error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
// /api/playercards — PlayerCards tab (one row per player, not a time series)
async function handleCards(req, res) {
  try {
    const rows = await fetchSheet('PlayerCards');
    const byPlayer = {};
    rows.forEach(row => {
      const player = row['Name'];
      if (!player) return;
      byPlayer[player] = {
        slug:        slugify(player),
        overall:     toNum(row['Overall']),
        position:    row['Position']  || null,
        agile:       toNum(row['Agile']),
        fast:        toNum(row['Fast']),
        strong:      toNum(row['Strong']),
        durable:     toNum(row['Durable']),
        powerful:    toNum(row['Powerful']),
        born:        toNum(row['Born']),
        height:      row['Height']  || null,
        weight:      toNum(row['Weight']),
        nationality: row['Nationality'] || null,
      };
    });
    res.status(200).json(byPlayer);
  } catch (err) {
    console.error('[PlayerCards] error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
// Matches the naming convention expected for player-cards/ image files:
// lowercase, spaces to hyphens, accents/punctuation stripped.
function slugify(name) {
  return String(name).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-');
}
function toNumMed(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
}
// Sheet has inconsistent casing on age-group team names (u16 vs U16) —
// normalize so the U always displays capitalized, matching the rest of the site.
function normTeam(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  return /^u\d+$/i.test(s) ? s.toUpperCase() : s;
}

function parseD(s) {
  if (!s) return 0;
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
// Sheet stores height as feet+inches text, e.g. 5' 5.9" — parseFloat alone
// truncates at the apostrophe and silently drops the inches, rounding every
// height down to the nearest foot. Parse both parts and return total inches.
function toInches(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  const m = s.match(/(\d+)\s*'\s*([\d.]+)/);
  if (m) return +(parseFloat(m[1]) * 12 + parseFloat(m[2])).toFixed(1);
  return toNum(v);
}
