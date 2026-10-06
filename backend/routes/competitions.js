const express = require('express');
const { db } = require('../db');
const { authMiddleware, adminOnly } = require('../auth');

const router = express.Router();

// Get all competitions
router.get('/', authMiddleware, (req, res) => {
  try {
    const comps = db.prepare('SELECT * FROM competitions ORDER BY created_at DESC').all();
    res.json(comps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get active competition
router.get('/active', (req, res) => {
  try {
    const comp = db.prepare('SELECT * FROM competitions WHERE is_active = 1').get();
    res.json(comp || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single competition with categories and boulders
router.get('/:id', authMiddleware, (req, res) => {
  try {
    const comp = db.prepare('SELECT * FROM competitions WHERE id = ?').get(req.params.id);
    if (!comp) return res.status(404).json({ error: 'Competition not found' });

    const categories = db.prepare('SELECT * FROM comp_categories WHERE competition_id = ? ORDER BY CAST(REPLACE(REPLACE(REPLACE(category, \'U\', \'\'), \'u\', \'\'), \' \', \'\') AS INTEGER)').all(comp.id);
    const boulders = db.prepare('SELECT * FROM comp_boulders WHERE competition_id = ?').all(comp.id);

    res.json({ ...comp, categories, boulders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create competition
router.post('/', authMiddleware, adminOnly, (req, res) => {
  try {
    const { name, date, categories, boulders } = req.body;
    if (!name || !date) {
      return res.status(400).json({ error: 'Name and date required' });
    }

    const result = db.prepare('INSERT INTO competitions (name, date) VALUES (?, ?)').run(name, date);
    const compId = result.lastInsertRowid;

    // Add categories
    if (categories && categories.length > 0) {
      const insertCat = db.prepare('INSERT INTO comp_categories (competition_id, category) VALUES (?, ?)');
      for (const cat of categories) {
        insertCat.run(compId, cat);
      }
    }

    // Add boulders
    if (boulders && boulders.length > 0) {
      const insertBoulder = db.prepare('INSERT INTO comp_boulders (competition_id, category_id, boulder_number, gender) VALUES (?, ?, ?, ?)');
      const getCatId = db.prepare('SELECT id FROM comp_categories WHERE competition_id = ? AND category = ?');
      for (const b of boulders) {
        const cat = getCatId.get(compId, b.category);
        if (cat) {
          insertBoulder.run(compId, cat.id, b.boulder_number, b.gender || 'both');
        }
      }
    }

    res.json({ id: compId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update competition
router.put('/:id', authMiddleware, adminOnly, (req, res) => {
  try {
    const { name, date, categories, boulders } = req.body;
    const compId = req.params.id;

    const comp = db.prepare('SELECT * FROM competitions WHERE id = ?').get(compId);
    if (!comp) return res.status(404).json({ error: 'Competition not found' });

    if (name || date) {
      db.prepare('UPDATE competitions SET name = COALESCE(?, name), date = COALESCE(?, date) WHERE id = ?')
        .run(name || null, date || null, compId);
    }

    // Update categories if provided
    if (categories) {
      // Get existing categories to preserve IDs where possible
      const existingCats = db.prepare('SELECT * FROM comp_categories WHERE competition_id = ?').all(compId);
      const existingNames = existingCats.map(c => c.category);
      const newNames = categories;

      // Remove categories not in new list
      const toRemove = existingNames.filter(n => !newNames.includes(n));
      if (toRemove.length > 0) {
        const delCat = db.prepare('DELETE FROM comp_categories WHERE competition_id = ? AND category = ?');
        for (const cat of toRemove) delCat.run(compId, cat);
      }

      // Add new categories
      const toAdd = newNames.filter(n => !existingNames.includes(n));
      const insertCat = db.prepare('INSERT INTO comp_categories (competition_id, category) VALUES (?, ?)');
      for (const cat of toAdd) insertCat.run(compId, cat);
    }

    // Update boulders if provided
    if (boulders) {
      // Remove existing boulders for this competition
      db.prepare('DELETE FROM comp_boulders WHERE competition_id = ?').run(compId);

      const insertBoulder = db.prepare('INSERT INTO comp_boulders (competition_id, category_id, boulder_number, gender) VALUES (?, ?, ?, ?)');
      const getCatId = db.prepare('SELECT id FROM comp_categories WHERE competition_id = ? AND category = ?');

      for (const b of boulders) {
        const cat = getCatId.get(compId, b.category);
        if (cat) {
          insertBoulder.run(compId, cat.id, b.boulder_number, b.gender || 'both');
        }
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Activate competition (deactivates all others)
router.post('/:id/activate', authMiddleware, adminOnly, (req, res) => {
  try {
    db.prepare('UPDATE competitions SET is_active = 0').run();
    db.prepare('UPDATE competitions SET is_active = 1 WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Deactivate competition
router.post('/:id/deactivate', authMiddleware, adminOnly, (req, res) => {
  try {
    db.prepare('UPDATE competitions SET is_active = 0 WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete competition
router.delete('/:id', authMiddleware, adminOnly, (req, res) => {
  try {
    db.prepare('DELETE FROM competitions WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
