document.addEventListener('DOMContentLoaded', () => {
  const keyForm = document.getElementById('keyForm');
  const startlistView = document.getElementById('startlistView');

  document.getElementById('lookupBtn').addEventListener('click', loadStartlist);
  document.getElementById('accessKey').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadStartlist();
  });

  document.getElementById('backBtn').addEventListener('click', () => {
    startlistView.classList.add('hidden');
    keyForm.classList.remove('hidden');
  });

  async function loadStartlist() {
    const key = document.getElementById('accessKey').value.trim().toUpperCase();
    const errorEl = document.getElementById('keyError');
    errorEl.classList.add('hidden');

    if (!key) {
      errorEl.textContent = 'Zadejte přístupový klíč';
      errorEl.classList.remove('hidden');
      return;
    }

    try {
      const data = await api.get(`/api/startlist/${key}`);
      displayStartlist(data);
    } catch (err) {
      errorEl.textContent = 'Neplatný přístupový klíč';
      errorEl.classList.remove('hidden');
    }
  }

  function displayStartlist(data) {
    keyForm.classList.add('hidden');
    startlistView.classList.remove('hidden');

    document.getElementById('childName').textContent = `${data.child.first_name} ${data.child.last_name}`;
    document.getElementById('childMeta').textContent = `${data.child.category} | ${data.child.competition_name} | ${data.child.competition_date}`;

    const bouldersView = document.getElementById('bouldersView');
    bouldersView.innerHTML = '';

    if (data.boulders.length === 0) {
      bouldersView.innerHTML = '<div class="empty-state"><p>Žádné přiřazené bouldery</p></div>';
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'grid grid-2';

    data.boulders.forEach(b => {
      const score = data.scores.find(s => s.boulder_number === b.boulder_number);
      const card = document.createElement('div');
      card.className = 'card';

      let statusIcon = '⬜';
      let statusText = 'Nezkoušeno';
      let statusColor = 'var(--text-muted)';
      let scoreText = '';

      if (score && score.attempts > 0) {
        if (score.best_achievement >= 30) {
          statusIcon = '✅';
          statusText = 'TOP';
          statusColor = 'var(--top-color)';
        } else if (score.best_achievement === 20) {
          statusIcon = '🔵';
          statusText = 'Zóna 2';
          statusColor = 'var(--zone2)';
        } else if (score.best_achievement === 10) {
          statusIcon = '🟡';
          statusText = 'Zóna 1';
          statusColor = 'var(--zone1)';
        } else {
          statusIcon = '❌';
          statusText = 'Zkoušeno';
          statusColor = 'var(--danger)';
        }
        scoreText = `${score.attempts}/${score.best_achievement}`;
      }

      card.innerHTML = `
        <div class="flex items-center justify-between mb-8">
          <strong>Boulder ${b.boulder_number}</strong>
          <span style="font-size:1.2rem">${statusIcon}</span>
        </div>
        <div style="color:${statusColor};font-size:0.85rem;font-weight:600">${statusText}</div>
        ${scoreText ? `<div class="score-mini has-score mt-8">${scoreText}</div>` : ''}
      `;
      grid.appendChild(card);
    });

    bouldersView.appendChild(grid);
  }

  // Check URL hash for auto-lookup
  const hash = window.location.hash.replace('#', '');
  if (hash) {
    document.getElementById('accessKey').value = hash;
    loadStartlist();
  }
});
