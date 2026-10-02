// Shared utility: fetches a Google Sheet tab as CSV and parses to JSON
// Usage: const rows = await fetchSheet('TabName');

const SHEET_ID = '1dKhc7TtQuDjQjNpcJGg7EjGqK_AsnvNMwbPB3D4wYHw';

async function fetchSheet(tabName) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}&tq=select%20*%20limit%2050000`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch sheet "${tabName}": ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  return parseCSV(text).filter(row => !isRemovedPlayerRow(row));
}

// Players removed from the whole dashboard: any row in any tab that names
// them is dropped before the API handlers see it. Matched case-insensitively
// on every word of the name across the row's text cells, so "Last, First"
// and split GivenName / FamilyName columns are caught too.
const REMOVED_PLAYERS = [
  'Zico Marshall-Rutty',
].map(n => n.toLowerCase().split(/\s+/));

function isRemovedPlayerRow(row) {
  const text = Object.values(row).filter(v => typeof v === 'string').join(' | ').toLowerCase();
  return REMOVED_PLAYERS.some(words => words.every(w => text.includes(w)));
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      let val = (values[idx] || '').trim().replace(/^"|"$/g, '');
      // Auto-convert numbers
      if (val !== '' && !isNaN(val) && val !== ' ') {
        val = parseFloat(val);
      }
      // Blank stays null
      if (val === '') val = null;
      row[h] = val;
    });
    // Skip completely empty rows
    const hasData = Object.values(row).some(v => v !== null && v !== '');
    if (hasData) rows.push(row);
  }

  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

module.exports = { fetchSheet };

