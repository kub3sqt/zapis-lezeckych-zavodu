const express = require('express');
const { db, generateAccessKey } = require('../db');
const { authMiddleware, adminOnly } = require('../auth');

const router = express.Router();

// Get all unique children from history
router.get('/all/unique', authMiddleware, (req, res) => {
  try {
    const children = db.prepare('SELECT DISTINCT first_name, last_name, gender, access_key FROM children ORDER BY last_name, first_name').all();
    res.json(children);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper for exact/partial string similarity
function getSimilarityScore(cFirst, cLast, typedFirst, typedLast, isNickname) {
  let score = 0;
  
  if (isNickname) {
    // Handling single word nickname inputs
    const typedTarget = typedFirst || typedLast;
    if (cLast.includes(typedTarget) || typedTarget.includes(cLast)) return 10;
    if (cFirst.includes(typedTarget) || typedTarget.includes(cFirst)) return 8;
  } else {
    function levenshtein(s, t) {
      if (s === t) return 0;
      if (s.length === 0) return t.length;
      if (t.length === 0) return s.length;
      const v0 = new Array(t.length + 1);
      const v1 = new Array(t.length + 1);
      for (let i = 0; i <= t.length; i++) v0[i] = i;
      for (let i = 0; i < s.length; i++) {
        v1[0] = i + 1;
        for (let j = 0; j < t.length; j++) {
          const cost = (s[i] === t[j]) ? 0 : 1;
          v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
        }
        for (let j = 0; j <= t.length; j++) v0[j] = v1[j];
      }
      return v1[t.length];
    }
    
    // exact identical
    if (cFirst === typedFirst && cLast === typedLast) return 100;
    
    const firstDist = levenshtein(cFirst, typedFirst);
    const lastDist = levenshtein(cLast, typedLast);
    
    // Combined distances - detect typos in BOTH first and last name simultaneously
    // E.g. "Jna Simke" vs "Jan Simek". total distance 4.
    if (firstDist <= 2 && lastDist <= 2 && (firstDist + lastDist) <= 4) {
      // Very close match
      return 15;
    }
    
    // same last name, similar first name
    if (cLast === typedLast) {
      if (cFirst.includes(typedFirst) || typedFirst.includes(cFirst)) return 20;
      if (firstDist <= 3) return 15;
      if (cFirst.substring(0, 3) === typedFirst.substring(0, 3) && cFirst.length >= 3) return 12;
      if (cFirst.substring(0, 2) === typedFirst.substring(0, 2) && firstDist <= 4) return 10;
    }
    // same first name, similar last name
    if (cFirst === typedFirst) {
      if (cLast.includes(typedLast) || typedLast.includes(cLast)) return 20;
      if (lastDist <= 3) return 15;
    }
    
    // swapped first/last name
    if (cFirst === typedLast && cLast === typedFirst) return 18;
  }
  return score;
}

// Check for similar names
router.get('/check-similar', authMiddleware, (req, res) => {
  try {
    const { first_name, last_name, gender } = req.query;
    if ((!first_name && !last_name) || !gender) return res.json([]);

    const normalize = str => str ? str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() : "";
    const normFirst = normalize(first_name);
    const normLast = normalize(last_name);
    const isNickname = (!normFirst && normLast) || (normFirst && !normLast);

    const allChildren = db.prepare('SELECT DISTINCT first_name, last_name, gender, access_key FROM children WHERE gender = ?').all(gender);
    
    const results = [];
    allChildren.forEach(c => {
      const cFirst = normalize(c.first_name);
      const cLast = normalize(c.last_name);
      
      const score = getSimilarityScore(cFirst, cLast, normFirst, normLast, isNickname);
      if (score >= 8 && score < 100) { // 100 is exact match, which we can ignore because existing check passes it automatically
        results.push({ ...c, score });
      }
    });

    results.sort((a, b) => b.score - a.score);
    res.json(results.slice(0, 5).map(r => ({
      first_name: r.first_name,
      last_name: r.last_name,
      gender: r.gender,
      access_key: r.access_key
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all children for a competition/category
router.get('/:competitionId', authMiddleware, (req, res) => {
  try {
    const { categoryId, gender } = req.query;
    let query = 'SELECT c.*, cc.category FROM children c JOIN comp_categories cc ON c.category_id = cc.id WHERE c.competition_id = ?';
    const params = [req.params.competitionId];

    if (categoryId) {
      query += ' AND c.category_id = ?';
      params.push(categoryId);
    }
    if (gender) {
      query += ' AND c.gender = ?';
      params.push(gender);
    }

    query += ' ORDER BY c.last_name, c.first_name';
    const children = db.prepare(query).all(...params);
    res.json(children);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Register a child
router.post('/', authMiddleware, adminOnly, (req, res) => {
  try {
    const { competition_id, category_id, first_name, last_name, gender } = req.body;
    if (!competition_id || !category_id || !first_name || !last_name || !gender) {
      return res.status(400).json({ error: 'All fields required' });
    }

    let accessKey;
    const existingChild = db.prepare('SELECT access_key FROM children WHERE first_name = ? AND last_name = ? AND gender = ? LIMIT 1').get(first_name, last_name, gender);
    
    if (existingChild) {
      accessKey = existingChild.access_key;
    } else {
      let attempts = 0;
      while (attempts < 100) {
        accessKey = generateAccessKey();
        const exists = db.prepare('SELECT id FROM children WHERE access_key = ?').get(accessKey);
        if (!exists) break;
        attempts++;
      }
    }

    const result = db.prepare(
      'INSERT INTO children (competition_id, category_id, first_name, last_name, gender, access_key) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(competition_id, category_id, first_name, last_name, gender, accessKey);

    res.json({ id: result.lastInsertRowid, access_key: accessKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update child
router.put('/:id', authMiddleware, adminOnly, (req, res) => {
  try {
    const { first_name, last_name, gender, category_id } = req.body;
    db.prepare(
      'UPDATE children SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name), gender = COALESCE(?, gender), category_id = COALESCE(?, category_id) WHERE id = ?'
    ).run(first_name || null, last_name || null, gender || null, category_id || null, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete child
router.delete('/:id', authMiddleware, adminOnly, (req, res) => {
  try {
    db.prepare('DELETE FROM children WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
