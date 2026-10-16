// /api/hipforce — VALD_HipForce tab
const { fetchSheet } = require('./_sheet');
module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const rows = await fetchSheet('VALD_HipForce');
    const byPlayer = {};
    rows.forEach(row => {
      const player = row['Name'];
      if (!player) return;
      if (!byPlayer[player]) byPlayer[player] = [];
      byPlayer[player].push({
        date:        row['Date UTC'] || null,
        test:        row['Test'] || null,
        direction:   row['Direction'] || null,
        position:    row['Position'] || null,
        lMax:        toNum(row['L Max Force (N)']),
        rMax:        toNum(row['R Max Force (N)']),
        imbalance:   toNum(row['Max Imbalance']),
        lMaxPerKg:   toNum(row['L Max Force Per kg (N/kg)']),
        rMaxPerKg:   toNum(row['R Max Force Per kg (N/kg)']),
        lAvg:        toNum(row['L Avg Force (N)']),
        rAvg:        toNum(row['R Avg Force (N)']),
        age:         row['Age Group'] || null,
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
function parseD(s){if(s===null||s===undefined||s==='')return 0;if(typeof s==='number')return new Date((s-25569)*86400000);if(s.includes('-'))return new Date(s);const[m,d,y]=s.split('/');if(!y)return 0;return new Date(+y<100?2000+ +y:+y,+m-1,+d);}
function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}
