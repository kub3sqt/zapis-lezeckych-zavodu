const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'climbing-comp-secret-key-change-in-production-2026';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function recorderOrAdmin(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'recorder') {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
}

module.exports = { generateToken, authMiddleware, adminOnly, recorderOrAdmin, JWT_SECRET };
