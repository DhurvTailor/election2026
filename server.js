// Election 2026 - Backend API
// 5 APIs: list/search, add member, edit member, delete member, add family (auto-created via member add too)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
app.use(cors());
app.use(express.json());

const ADMIN_CODE = process.env.ADMIN_CODE || '4141';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'election2026',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
});

// ---------- Hindi (Devanagari) -> Roman transliteration (approx, phonetic) ----------
// Isse har naam ka ek "hinglish" version auto ban jata hai jo DB me save hota hai,
// taaki user Hinglish type kare to bhi Hindi naam mil jaaye. Manual seed ki zaroorat nahi.
const consonants = {
  'क':'k','ख':'kh','ग':'g','घ':'gh','ङ':'ng',
  'च':'ch','छ':'chh','ज':'j','झ':'jh','ञ':'ny',
  'ट':'t','ठ':'th','ड':'d','ढ':'dh','ण':'n',
  'त':'t','थ':'th','द':'d','ध':'dh','न':'n',
  'प':'p','फ':'ph','ब':'b','भ':'bh','म':'m',
  'य':'y','र':'r','ल':'l','व':'v',
  'श':'sh','ष':'sh','स':'s','ह':'h',
  'क्ष':'ksh','त्र':'tr','ज्ञ':'gy',
  'ड़':'r','ढ़':'rh','फ़':'f','ज़':'z','ऱ':'r',
};
const matras = { 'ा':'a','ि':'i','ी':'i','ु':'u','ू':'u','ृ':'ri','े':'e','ै':'ai','ो':'o','ौ':'au','ं':'n','ँ':'n','ः':'h','ॅ':'e' };
const independentVowels = { 'अ':'a','आ':'aa','इ':'i','ई':'i','उ':'u','ऊ':'u','ऋ':'ri','ए':'e','ऐ':'ai','ओ':'o','औ':'au' };
const halant = '्';

function transliterate(hindiText) {
  if (!hindiText) return '';
  let out = '';
  const chars = Array.from(hindiText);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const next = chars[i + 1];
    if (independentVowels[ch]) { out += independentVowels[ch]; continue; }
    if (consonants[ch]) {
      out += consonants[ch];
      if (next === halant) { i++; continue; } // no inherent 'a', consonant joins next
      if (next && matras[next]) { out += matras[next]; i++; }
      else if (next && independentVowels[next]) { /* rare, skip inherent a */ }
      else { out += 'a'; } // inherent vowel 'a'
      continue;
    }
    if (matras[ch]) { out += matras[ch]; continue; }
    if (ch === halant) { continue; }
    if (ch === ' ') { out += ' '; continue; }
    out += ch; // already roman / number / punctuation - keep as is
  }
  return out.toLowerCase().trim();
}

// ---------- Auth middleware for write operations ----------
function requireAdmin(req, res, next) {
  const code = req.body.adminCode || req.query.adminCode || req.headers['x-admin-code'];
  if (String(code) !== String(ADMIN_CODE)) {
    return res.status(401).json({ error: 'Galat admin code' });
  }
  next();
}

async function getOrCreateFamily(familyNumber, familyLabel) {
  const [rows] = await pool.query('SELECT id FROM families WHERE family_number = ?', [familyNumber]);
  if (rows.length) return rows[0].id;
  const [result] = await pool.query(
    'INSERT INTO families (family_number, family_label) VALUES (?, ?)',
    [familyNumber, familyLabel || null]
  );
  return result.insertId;
}

// ---------- API 1: List all families with members (grouped) ----------
app.get('/api/members', async (req, res) => {
  try {
    const [families] = await pool.query('SELECT * FROM families ORDER BY family_number');
    const [members] = await pool.query('SELECT * FROM members ORDER BY id');
    const grouped = families.map(f => ({
      ...f,
      members: members.filter(m => m.family_id === f.id),
    }));
    res.json(grouped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- API 2: Search (Hindi ya Hinglish dono se match) ----------
app.get('/api/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);
    const qLower = q.toLowerCase();
    const [rows] = await pool.query(
      `SELECT m.*, f.family_number, f.family_label
       FROM members m JOIN families f ON f.id = m.family_id
       WHERE m.name_hindi LIKE ? OR m.name_search LIKE ? OR m.mobile LIKE ?
       ORDER BY f.family_number`,
      [`%${q}%`, `%${qLower}%`, `%${q}%`]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- API 3: Add member (admin only) ----------
app.post('/api/members', requireAdmin, async (req, res) => {
  try {
    const { familyNumber, familyLabel, nameHindi, mobile } = req.body;
    if (!familyNumber || !nameHindi) {
      return res.status(400).json({ error: 'familyNumber aur nameHindi zaroori hai' });
    }
    const familyId = await getOrCreateFamily(familyNumber, familyLabel);
    const nameSearch = transliterate(nameHindi);
    const [result] = await pool.query(
      'INSERT INTO members (family_id, name_hindi, name_search, mobile) VALUES (?, ?, ?, ?)',
      [familyId, nameHindi, nameSearch, mobile || null]
    );
    res.json({ id: result.insertId, familyId, nameHindi, nameSearch, mobile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- API 4: Edit member (admin only) ----------
app.put('/api/members/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { nameHindi, mobile } = req.body;
    if (!nameHindi) return res.status(400).json({ error: 'nameHindi zaroori hai' });
    const nameSearch = transliterate(nameHindi);
    await pool.query(
      'UPDATE members SET name_hindi = ?, name_search = ?, mobile = ? WHERE id = ?',
      [nameHindi, nameSearch, mobile || null, id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- API 5: Delete member (admin only) ----------
app.delete('/api/members/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM members WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Election 2026 API chal raha hai: http://localhost:${PORT}`));
