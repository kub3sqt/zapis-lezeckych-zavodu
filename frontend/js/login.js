document.addEventListener('DOMContentLoaded', () => {
  // If already logged in, redirect
  const user = api.getUser();
  const token = api.getToken();
  if (user && token) {
    if (user.role === 'admin') window.location.href = 'admin.html';
    else window.location.href = 'recorder.html';
    return;
  }

  const loginForm = document.getElementById('loginForm');
  const setPasswordForm = document.getElementById('setPasswordForm');

  document.getElementById('showSetPassword').addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.classList.add('hidden');
    setPasswordForm.classList.remove('hidden');
  });

  document.getElementById('showLogin').addEventListener('click', (e) => {
    e.preventDefault();
    setPasswordForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
  });

  // Login
  document.getElementById('loginBtn').addEventListener('click', async () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('loginError');
    errorEl.classList.add('hidden');

    if (!email || !password) {
      errorEl.textContent = 'Vyplňte e-mail a heslo';
      errorEl.classList.remove('hidden');
      return;
    }

    try {
      const data = await api.post('/api/auth/login', { email, password });
      api.setToken(data.token);
      api.setUser(data.user);
      if (data.user.role === 'admin') window.location.href = 'admin.html';
      else window.location.href = 'recorder.html';
    } catch (err) {
      if (err.message.includes('Password not set') || err.message.includes('needsPassword')) {
        errorEl.textContent = 'Nemáte nastavené heslo. Klikněte na "Nastavte si ho".';
      } else {
        errorEl.textContent = err.message || 'Chyba při přihlašování';
      }
      errorEl.classList.remove('hidden');
    }
  });

  // Set password
  document.getElementById('setPasswordBtn').addEventListener('click', async () => {
    const email = document.getElementById('spEmail').value.trim();
    const password = document.getElementById('spPassword').value;
    const password2 = document.getElementById('spPassword2').value;
    const errorEl = document.getElementById('spError');
    errorEl.classList.add('hidden');

    if (!email || !password) {
      errorEl.textContent = 'Vyplňte e-mail a heslo';
      errorEl.classList.remove('hidden');
      return;
    }
    if (password.length < 6) {
      errorEl.textContent = 'Heslo musí mít alespoň 6 znaků';
      errorEl.classList.remove('hidden');
      return;
    }
    if (password !== password2) {
      errorEl.textContent = 'Hesla se neshodují';
      errorEl.classList.remove('hidden');
      return;
    }

    try {
      const data = await api.post('/api/auth/set-password', { email, password });
      api.setToken(data.token);
      api.setUser(data.user);
      if (data.user.role === 'admin') window.location.href = 'admin.html';
      else window.location.href = 'recorder.html';
    } catch (err) {
      errorEl.textContent = err.message || 'Chyba při nastavování hesla';
      errorEl.classList.remove('hidden');
    }
  });

  // Enter key support
  document.getElementById('password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('loginBtn').click();
  });
  document.getElementById('spPassword2').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('setPasswordBtn').click();
  });
});
