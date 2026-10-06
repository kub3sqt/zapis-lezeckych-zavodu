const express = require('express');
const cors = require('cors');
const path = require('path');

// Initialize database
require('./db');

const { authMiddleware } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/competitions', require('./routes/competitions'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/children', require('./routes/children'));
app.use('/api/users', require('./routes/users'));
app.use('/api/scores', require('./routes/scores'));
app.use('/api/results', require('./routes/results'));
app.use('/api/startlist', require('./routes/startlist'));
app.use('/api/seasons', require('./routes/seasons'));

// Protected /api/auth/me route
const authRoutes = require('./routes/auth');
app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Fallback to index.html for non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
  }
});

app.listen(PORT, () => {
  console.log(`🧗 Climbing Competition Backend running on http://localhost:${PORT}`);
});
