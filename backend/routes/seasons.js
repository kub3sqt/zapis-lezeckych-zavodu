const express = require('express');
const { db } = require('../db');
const { authMiddleware, adminOnly } = require('../auth');

const router = express.Router();

// Helper to sort categories by numeric part
function catSortKey(category) {
  const num = parseInt((category || '').replace(/\D/g, '')) || 0;
  return num;
}

// Get all seasons
router.get('/', authMiddleware, (req, res) => {
  try {
    const seasons = db.prepare('SELECT * FROM seasons ORDER BY created_at DESC').all();
    for (const season of seasons) {
      season.competitions = db.prepare(`
        SELECT c.* 
        FROM competitions c
        JOIN season_competitions sc ON c.id = sc.competition_id
        WHERE sc.season_id = ?
        ORDER BY c.date DESC
      `).all(season.id);
    }
    res.json(seasons);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all seasons (public, only those with published results... wait, better just return all for simplicity or ones that have at least one competition with published results)
router.get('/public', (req, res) => {
  try {
    const seasons = db.prepare('SELECT * FROM seasons ORDER BY created_at DESC').all();
    for (const season of seasons) {
      season.competitions = db.prepare(`
        SELECT c.* 
        FROM competitions c
        JOIN season_competitions sc ON c.id = sc.competition_id
        WHERE sc.season_id = ?
        ORDER BY c.date DESC
      `).all(season.id);
    }
    const filtered = seasons.filter(s => s.competitions.length > 0);
    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create season
router.post('/', authMiddleware, adminOnly, (req, res) => {
  try {
    const { name, competitions } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });

    const result = db.prepare('INSERT INTO seasons (name) VALUES (?)').run(name);
    const seasonId = result.lastInsertRowid;

    if (competitions && competitions.length > 0) {
      const insertComp = db.prepare('INSERT INTO season_competitions (season_id, competition_id) VALUES (?, ?)');
      for (const compId of competitions) {
        insertComp.run(seasonId, compId);
      }
    }

    res.json({ id: seasonId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update season
router.put('/:id', authMiddleware, adminOnly, (req, res) => {
  try {
    const { name, competitions } = req.body;
    const seasonId = req.params.id;

    if (name) {
      db.prepare('UPDATE seasons SET name = ? WHERE id = ?').run(name, seasonId);
    }

    if (competitions !== undefined) {
      db.prepare('DELETE FROM season_competitions WHERE season_id = ?').run(seasonId);
      const insertComp = db.prepare('INSERT INTO season_competitions (season_id, competition_id) VALUES (?, ?)');
      for (const compId of competitions) {
        insertComp.run(seasonId, compId);
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete season
router.delete('/:id', authMiddleware, adminOnly, (req, res) => {
  try {
    db.prepare('DELETE FROM seasons WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get season results
router.get('/:id/results', (req, res) => {
  try {
    const comps = db.prepare('SELECT competition_id FROM season_competitions WHERE season_id = ?').all(req.params.id);
    if (comps.length === 0) return res.json({});

    const compIds = comps.map(c => c.competition_id);
    const placeholders = compIds.map(() => '?').join(',');

    // Fetch all children who participated in these competitions
    // Group them uniquely by first_name, last_name, gender across these competitions
    const participants = db.prepare(`
      SELECT 
        first_name, last_name, gender, access_key,
        MAX(competition_id) as latest_comp_id
      FROM children
      WHERE competition_id IN (${placeholders})
      GROUP BY first_name, last_name, gender
    `).all(...compIds);

    const getScores = db.prepare(`
      SELECT s.* 
      FROM scores s
      JOIN children c ON s.child_id = c.id
      WHERE c.first_name = ? AND c.last_name = ? AND c.gender = ?
      AND s.competition_id IN (${placeholders})
    `);

    // Fetch the category name for their latest competition
    const getCategory = db.prepare(`
      SELECT cc.category 
      FROM children c
      JOIN comp_categories cc ON c.category_id = cc.id
      WHERE c.competition_id = ? AND c.first_name = ? AND c.last_name = ?
      LIMIT 1
    `);

    const aggregated = [];

    for (const p of participants) {
      let totalPoints = 0;
      let totalAttempts = 0;
      let totalTops = 0;
      let totalZones = 0;
      let topAttempts = 0;
      let zoneAttempts = 0;

      const scores = getScores.all(p.first_name, p.last_name, p.gender, ...compIds);

      for (const score of scores) {
        if (score.best_achievement >= 30) {
          totalTops++;
          topAttempts += score.attempts;
          if (score.best_achievement === 40 || score.attempts === 1 || (score.top_attempts && score.top_attempts === 1)) {
            totalPoints += 40;
          } else {
            totalPoints += 30;
          }
        } else if (score.best_achievement === 20) {
          totalZones++;
          zoneAttempts += score.attempts;
          totalPoints += 20;
        } else if (score.best_achievement === 10) {
          totalZones++;
          zoneAttempts += score.attempts;
          totalPoints += 10;
        }
        totalAttempts += score.attempts;
      }

      const catRecord = getCategory.get(p.latest_comp_id, p.first_name, p.last_name);
      const category = catRecord ? catRecord.category : 'Neznámá';

      aggregated.push({
        first_name: p.first_name,
        last_name: p.last_name,
        gender: p.gender,
        category,
        totalPoints,
        totalAttempts,
        totalTops,
        totalZones,
        topAttempts,
        zoneAttempts
      });
    }

    // Now group by category and gender
    const results = {};
    for (const child of aggregated) {
      if (!results[child.category]) {
        results[child.category] = { boys: [], girls: [] };
      }
      if (child.gender === 'male') {
        results[child.category].boys.push(child);
      } else {
        results[child.category].girls.push(child);
      }
    }

    // Sort individuals in each group
    const sortFn = (a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (a.totalAttempts !== b.totalAttempts) return a.totalAttempts - b.totalAttempts;
      if (b.totalTops !== a.totalTops) return b.totalTops - a.totalTops;
      if (a.topAttempts !== b.topAttempts) return a.topAttempts - b.topAttempts;
      return a.last_name.localeCompare(b.last_name);
    };

    const sortedResults = {};
    // Sort keys based on U9, U11, etc.
    const sortedCats = Object.keys(results).sort((a,b) => catSortKey(a) - catSortKey(b));
    for (const cat of sortedCats) {
      results[cat].boys.sort(sortFn);
      results[cat].girls.sort(sortFn);
      sortedResults[cat] = results[cat];
    }

    res.json(sortedResults);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
