const express = require('express');
const { db } = require('../db');

const router = express.Router();

// Get personal startlist by access key (no auth needed)
router.get('/:accessKey', (req, res) => {
  try {
    const child = db.prepare(`
      SELECT c.*, cc.category, comp.name as competition_name, comp.date as competition_date
      FROM children c
      JOIN comp_categories cc ON c.category_id = cc.id
      JOIN competitions comp ON c.competition_id = comp.id
      WHERE c.access_key = ?
    `).get(req.params.accessKey);

    if (!child) {
      return res.status(404).json({ error: 'Invalid access key' });
    }

    // Get boulders assigned to this child's category and gender
    const boulders = db.prepare(`
      SELECT * FROM comp_boulders
      WHERE competition_id = ? AND category_id = ?
      AND (gender = 'both' OR gender = ?)
      ORDER BY boulder_number
    `).all(child.competition_id, child.category_id, child.gender === 'male' ? 'boys' : 'girls');

    // Get scores
    const scores = db.prepare(
      'SELECT * FROM scores WHERE child_id = ? AND competition_id = ? ORDER BY boulder_number'
    ).all(child.id, child.competition_id);

    res.json({
      child: {
        first_name: child.first_name,
        last_name: child.last_name,
        gender: child.gender,
        category: child.category,
        competition_name: child.competition_name,
        competition_date: child.competition_date
      },
      boulders,
      scores
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
