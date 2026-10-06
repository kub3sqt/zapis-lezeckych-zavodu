const express = require('express');
const { db } = require('../db');
const { authMiddleware, adminOnly } = require('../auth');

const router = express.Router();

// Get all users (admin only)
router.get('/', authMiddleware, adminOnly, (req, res) => {
  try {
    const users = db.prepare(
      'SELECT id, email, name, role, password_hash IS NOT NULL as has_password, created_at FROM users ORDER BY role, email'
    ).all();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add user (admin only) - just email and role, user sets password themselves
router.post('/', authMiddleware, adminOnly, (req, res) => {
  try {
    const { email, name, role } = req.body;
    if (!email || !role) {
      return res.status(400).json({ error: 'Email and role required' });
    }
    if (!['admin', 'recorder'].includes(role)) {
      return res.status(400).json({ error: 'Role must be admin or recorder' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (existing) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const result = db.prepare(
      'INSERT INTO users (email, name, role) VALUES (?, ?, ?)'
    ).run(email.toLowerCase().trim(), name || '', role);

    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete user (admin only)
router.delete('/:id', authMiddleware, adminOnly, (req, res) => {
  try {
    // Don't allow deleting yourself
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
