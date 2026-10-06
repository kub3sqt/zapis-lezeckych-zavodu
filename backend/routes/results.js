const express = require('express');
const { db } = require('../db');
const { summarizeScores } = require('../scoring');
const { authMiddleware, adminOnly } = require('../auth');

const router = express.Router();

// Helper to sort categories by numeric part (U9, U11, U13...)
function catSortKey(category) {
  const num = parseInt(category.replace(/\D/g, '')) || 0;
  return num;
}

function sortCategories(cats) {
  return cats.sort((a, b) => catSortKey(a.category) - catSortKey(b.category));
}

// Calculate rankings for a category, filtered by gender
function calculateRankings(competitionId, categoryId, gender) {
  let query = 'SELECT * FROM children WHERE competition_id = ? AND category_id = ?';
  const params = [competitionId, categoryId];

  if (gender) {
    query += ' AND gender = ?';
    params.push(gender);
  }

  query += ' ORDER BY last_name, first_name';
  const children = db.prepare(query).all(...params);

  const results = children.map(child => {
    const scores = db.prepare(
      'SELECT * FROM scores WHERE child_id = ? AND competition_id = ?'
    ).all(child.id, competitionId);

    const { totalPoints, totalAttempts, totalTops, totalZones, topAttempts, zoneAttempts } = summarizeScores(scores);

    return {
      ...child,
      scores,
      totalPoints,
      totalAttempts,
      totalTops,
      totalZones,
      topAttempts,
      zoneAttempts
    };
  });

  results.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (a.totalAttempts !== b.totalAttempts) return a.totalAttempts - b.totalAttempts;
    if (b.totalTops !== a.totalTops) return b.totalTops - a.totalTops;
    if (a.topAttempts !== b.topAttempts) return a.topAttempts - b.topAttempts;
    return a.last_name.localeCompare(b.last_name);
  });

  return results;
}

// Get results for admin (always visible) — split by gender
router.get('/admin/:competitionId', authMiddleware, (req, res) => {
  try {
    const { categoryId } = req.query;
    let categories = categoryId
      ? [db.prepare('SELECT * FROM comp_categories WHERE id = ?').get(categoryId)]
      : db.prepare('SELECT * FROM comp_categories WHERE competition_id = ?').all(req.params.competitionId);

    categories = sortCategories(categories.filter(Boolean));

    const results = {};
    for (const cat of categories) {
      const published = db.prepare(
        'SELECT * FROM published_results WHERE competition_id = ? AND category_id = ?'
      ).get(req.params.competitionId, cat.id);

      results[cat.category] = {
        category_id: cat.id,
        published: !!published,
        boys: calculateRankings(req.params.competitionId, cat.id, 'male'),
        girls: calculateRankings(req.params.competitionId, cat.id, 'female')
      };
    }
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get public results (only published) — split by gender
router.get('/public/:competitionId', (req, res) => {
  try {
    let categories = db.prepare(
      'SELECT cc.* FROM comp_categories cc INNER JOIN published_results pr ON cc.id = pr.category_id WHERE cc.competition_id = ?'
    ).all(req.params.competitionId);

    categories = sortCategories(categories);

    const results = {};
    for (const cat of categories) {
      results[cat.category] = {
        category_id: cat.id,
        boys: calculateRankings(req.params.competitionId, cat.id, 'male'),
        girls: calculateRankings(req.params.competitionId, cat.id, 'female')
      };
    }
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all competitions with published results (for public page)
router.get('/public-competitions', (req, res) => {
  try {
    const comps = db.prepare(`
      SELECT DISTINCT c.* FROM competitions c
      INNER JOIN published_results pr ON c.id = pr.competition_id
      ORDER BY c.date DESC
    `).all();
    res.json(comps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Publish results for a category
router.post('/publish', authMiddleware, adminOnly, (req, res) => {
  try {
    const { competition_id, category_id } = req.body;
    const existing = db.prepare(
      'SELECT id FROM published_results WHERE competition_id = ? AND category_id = ?'
    ).get(competition_id, category_id);

    if (!existing) {
      db.prepare(
        'INSERT INTO published_results (competition_id, category_id) VALUES (?, ?)'
      ).run(competition_id, category_id);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Unpublish results for a category
router.post('/unpublish', authMiddleware, adminOnly, (req, res) => {
  try {
    const { competition_id, category_id } = req.body;
    db.prepare(
      'DELETE FROM published_results WHERE competition_id = ? AND category_id = ?'
    ).run(competition_id, category_id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
