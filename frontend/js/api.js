// API Configuration - uses relative URLs (works with Nginx reverse proxy)
// For local dev, set window.API_BASE_URL = 'http://localhost:3000' before loading
const API_BASE = window.API_BASE_URL || '';

const api = {
  getToken() {
    return localStorage.getItem('climbing_token');
  },

  setToken(token) {
    localStorage.setItem('climbing_token', token);
  },

  clearToken() {
    localStorage.removeItem('climbing_token');
    localStorage.removeItem('climbing_user');
  },

  getUser() {
    const u = localStorage.getItem('climbing_user');
    return u ? JSON.parse(u) : null;
  },

  setUser(user) {
    localStorage.setItem('climbing_user', JSON.stringify(user));
  },

  async request(method, path, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`${API_BASE}${path}`, opts);

    if (res.status === 401) {
      this.clearToken();
      if (!window.location.pathname.includes('login') &&
          !window.location.pathname.includes('index') &&
          !window.location.pathname.includes('startlist')) {
        window.location.href = 'login.html';
      }
      throw new Error('Unauthorized');
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },

  get(path) { return this.request('GET', path); },
  post(path, body) { return this.request('POST', path, body); },
  put(path, body) { return this.request('PUT', path, body); },
  delete(path) { return this.request('DELETE', path); }
};

// Toast notifications
function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  });
}

// Check auth and redirect
function requireAuth(allowedRoles = ['admin', 'recorder']) {
  const token = api.getToken();
  const user = api.getUser();
  if (!token || !user || !allowedRoles.includes(user.role)) {
    window.location.href = 'login.html';
    return null;
  }
  return user;
}
