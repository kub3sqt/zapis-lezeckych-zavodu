const express = require('express');
const { db } = require('../db');
const { authMiddleware, adminOnly } = require('../auth');

const router = express.Router();

// Get categories for a competition
router.get('/:competitionId', authMiddleware, (req, res) => {
  try {
    const categories = db.prepare(
      "SELECT * FROM comp_categories WHERE competition_id = ? ORDER BY CAST(REPLACE(REPLACE(REPLACE(category, 'U', ''), 'u', ''), ' ', '') AS INTEGER)"
    ).all(req.params.competitionId);
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get boulders for a category
router.get('/:competitionId/:categoryId/boulders', authMiddleware, (req, res) => {
  try {
    const boulders = db.prepare(
      'SELECT * FROM comp_boulders WHERE competition_id = ? AND category_id = ? ORDER BY boulder_number'
    ).all(req.params.competitionId, req.params.categoryId);
    res.json(boulders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update boulders for a category (admin only)
router.put('/:competitionId/:categoryId/boulders', authMiddleware, adminOnly, (req, res) => {
  try {
    const { boulders } = req.body; // [{boulder_number, gender}]
    const { competitionId, categoryId } = req.params;

    db.prepare('DELETE FROM comp_boulders WHERE competition_id = ? AND category_id = ?')
      .run(competitionId, categoryId);

    const insert = db.prepare(
      'INSERT INTO comp_boulders (competition_id, category_id, boulder_number, gender) VALUES (?, ?, ?, ?)'
    );

    for (const b of boulders) {
      insert.run(competitionId, categoryId, b.boulder_number, b.gender || 'both');
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
