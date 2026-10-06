const express = require('express');
const { db } = require('../db');
const { authMiddleware, recorderOrAdmin } = require('../auth');

const router = express.Router();

// Get scores for a child
router.get('/child/:childId', authMiddleware, (req, res) => {
  try {
    const scores = db.prepare(
      'SELECT s.*, u.name as recorder_name FROM scores s LEFT JOIN users u ON s.recorder_id = u.id WHERE s.child_id = ? ORDER BY s.boulder_number'
    ).all(req.params.childId);
    res.json(scores);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all scores for a boulder (all children)
router.get('/boulder/:competitionId/:boulderNumber', authMiddleware, (req, res) => {
  try {
    const { categoryId } = req.query;
    let query = `
      SELECT s.*, c.first_name, c.last_name, c.gender, u.name as recorder_name
      FROM scores s
      JOIN children c ON s.child_id = c.id
      LEFT JOIN users u ON s.recorder_id = u.id
      WHERE s.competition_id = ? AND s.boulder_number = ?
    `;
    const params = [req.params.competitionId, req.params.boulderNumber];

    if (categoryId) {
      query += ' AND c.category_id = ?';
      params.push(categoryId);
    }

    query += ' ORDER BY c.last_name, c.first_name';
    const scores = db.prepare(query).all(...params);
    res.json(scores);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update/create score for a child on a boulder
router.put('/', authMiddleware, recorderOrAdmin, (req, res) => {
  try {
    const { child_id, competition_id, boulder_number, attempts, best_achievement, zone1_attempts, zone2_attempts, top_attempts } = req.body;

    if (!child_id || !competition_id || boulder_number === undefined) {
      return res.status(400).json({ error: 'child_id, competition_id and boulder_number required' });
    }

    const existing = db.prepare(
      'SELECT id FROM scores WHERE child_id = ? AND competition_id = ? AND boulder_number = ?'
    ).get(child_id, competition_id, boulder_number);

    if (existing) {
      db.prepare(`
        UPDATE scores SET
          attempts = ?,
          best_achievement = ?,
          zone1_attempts = COALESCE(?, zone1_attempts),
          zone2_attempts = COALESCE(?, zone2_attempts),
          top_attempts = COALESCE(?, top_attempts),
          recorder_id = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        attempts || 0,
        best_achievement || 0,
        zone1_attempts !== undefined ? zone1_attempts : null,
        zone2_attempts !== undefined ? zone2_attempts : null,
        top_attempts !== undefined ? top_attempts : null,
        req.user.id,
        existing.id
      );
    } else {
      db.prepare(`
        INSERT INTO scores (child_id, competition_id, boulder_number, attempts, best_achievement, zone1_attempts, zone2_attempts, top_attempts, recorder_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        child_id, competition_id, boulder_number,
        attempts || 0,
        best_achievement || 0,
        zone1_attempts || 0,
        zone2_attempts || 0,
        top_attempts || 0,
        req.user.id
      );
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
