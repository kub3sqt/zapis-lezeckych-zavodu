document.addEventListener('DOMContentLoaded', async () => {
  const compSelect = document.getElementById('competitionSelect');
  const categoriesGrid = document.getElementById('categoriesGrid');
  const resultsArea = document.getElementById('resultsArea');

  let currentResults = {};
  let currentView = 'competitions';

  const viewTabs = document.querySelectorAll('#viewTabs .tab');
  const viewComps = document.getElementById('view-competitions');
  const viewSeasons = document.getElementById('view-seasons');
  const seasonSelect = document.getElementById('seasonSelect');

  viewTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      viewTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentView = tab.dataset.view;
      if (currentView === 'competitions') {
        viewComps.classList.remove('hidden');
        viewSeasons.classList.add('hidden');
        if (compSelect.value) loadResults(compSelect.value);
        else { categoriesGrid.innerHTML = ''; resultsArea.innerHTML = ''; }
      } else {
        viewComps.classList.add('hidden');
        viewSeasons.classList.remove('hidden');
        if (seasonSelect.value) loadSeasonResults(seasonSelect.value);
        else { categoriesGrid.innerHTML = ''; resultsArea.innerHTML = ''; }
      }
    });
  });

  // Helper: sort category keys by numeric part (U9 before U11)
  function sortCatKeys(keys) {
    return keys.sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, '')) || 0;
      const nb = parseInt(b.replace(/\D/g, '')) || 0;
      return na - nb;
    });
  }

  // Load competitions with published results
  try {
    const comps = await api.get('/api/results/public-competitions');
    if (comps.length === 0) {
      categoriesGrid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="icon">📊</div><p>Zatím nejsou zveřejněné žádné výsledky</p></div>';
      return;
    }
    comps.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.name} (${c.date})`;
      compSelect.appendChild(opt);
    });
    compSelect.value = comps[0].id;
    loadResults(comps[0].id);
  } catch (err) {
    categoriesGrid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="icon">⚠️</div><p>Nepodařilo se načíst závody</p></div>';
  }

  compSelect.addEventListener('change', () => {
    if (compSelect.value && currentView === 'competitions') loadResults(compSelect.value);
  });

  // Load seasons
  try {
    const seasons = await api.get('/api/seasons/public');
    if (seasons.length > 0) {
      seasons.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.name}`;
        seasonSelect.appendChild(opt);
      });
      seasonSelect.value = seasons[0].id;
    }
  } catch(err) {
    console.error('Failed to load seasons', err);
  }

  seasonSelect.addEventListener('change', () => {
    if (seasonSelect.value && currentView === 'seasons') loadSeasonResults(seasonSelect.value);
  });

  async function loadResults(compId) {
    categoriesGrid.innerHTML = '<div class="loading" style="grid-column:1/-1"><div class="spinner"></div></div>';
    resultsArea.innerHTML = '';

    try {
      currentResults = await api.get(`/api/results/public/${compId}`);
      const cats = sortCatKeys(Object.keys(currentResults));

      if (cats.length === 0) {
        categoriesGrid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="icon">📊</div><p>Žádné zveřejněné výsledky pro tento závod</p></div>';
        return;
      }

      categoriesGrid.innerHTML = '';
      cats.forEach(cat => {
        const data = currentResults[cat];
        const boyCount = data.boys ? data.boys.length : 0;
        const girlCount = data.girls ? data.girls.length : 0;
        const card = document.createElement('div');
        card.className = 'category-card';
        card.innerHTML = `<div class="cat-name">${cat}</div><div class="cat-count">${boyCount} / ${girlCount}</div>`;
        card.addEventListener('click', () => {
          document.querySelectorAll('.category-card').forEach(c => c.classList.remove('active'));
          card.classList.add('active');
          showResults(cat);
        });
        categoriesGrid.appendChild(card);
      });
    } catch (err) {
      categoriesGrid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="icon">⚠️</div><p>Chyba při načítání</p></div>';
    }
  }

  async function loadSeasonResults(seasonId) {
    categoriesGrid.innerHTML = '<div class="loading" style="grid-column:1/-1"><div class="spinner"></div></div>';
    resultsArea.innerHTML = '';

    try {
      currentResults = await api.get(`/api/seasons/${seasonId}/results`);
      const cats = sortCatKeys(Object.keys(currentResults));

      if (cats.length === 0) {
        categoriesGrid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="icon">📊</div><p>Žádné výsledky pro tuto sérii</p></div>';
        return;
      }

      categoriesGrid.innerHTML = '';
      cats.forEach(cat => {
        const data = currentResults[cat];
        const boyCount = data.boys ? data.boys.length : 0;
        const girlCount = data.girls ? data.girls.length : 0;
        const card = document.createElement('div');
        card.className = 'category-card';
        card.innerHTML = `<div class="cat-name">${cat}</div><div class="cat-count">${boyCount} / ${girlCount}</div>`;
        card.addEventListener('click', () => {
          document.querySelectorAll('.category-card').forEach(c => c.classList.remove('active'));
          card.classList.add('active');
          showResults(cat);
        });
        categoriesGrid.appendChild(card);
      });
    } catch (err) {
      categoriesGrid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="icon">⚠️</div><p>Chyba při načítání série</p></div>';
    }
  }

  function showResults(category) {
    const data = currentResults[category];
    if (!data) return;

    let html = '';

    // Boys
    if (data.boys && data.boys.length > 0) {
      html += renderRankingTable(category, 'Kluci ♂', data.boys, 'badge-boys');
    }

    // Girls
    if (data.girls && data.girls.length > 0) {
      html += renderRankingTable(category, 'Dívky ♀', data.girls, 'badge-girls');
    }

    if (!html) {
      html = '<div class="empty-state"><p>Žádní závodníci v této kategorii</p></div>';
    }

    resultsArea.innerHTML = html;
  }

  function renderRankingTable(category, title, rankings, badgeClass) {
    let html = `<div class="card mb-16"><div class="card-header"><h2>${category} — ${title}</h2></div>`;
    html += '<div class="table-wrap"><table><thead><tr><th>#</th><th>Jméno</th><th>Body</th><th>Pokusy</th><th>Topy</th></tr></thead><tbody>';

    rankings.forEach((r, i) => {
      const rank = i + 1;
      let rankClass = '';
      if (rank === 1) rankClass = 'rank-1';
      else if (rank === 2) rankClass = 'rank-2';
      else if (rank === 3) rankClass = 'rank-3';

      html += `<tr>
        <td><span class="rank-badge ${rankClass}">${rank}</span></td>
        <td><strong>${r.first_name} ${r.last_name}</strong></td>
        <td><strong style="color:var(--accent-light)">${r.totalPoints}</strong></td>
        <td>${r.totalAttempts}</td>
        <td>${r.totalTops}</td>
      </tr>`;
    });

    html += '</tbody></table></div></div>';
    return html;
  }
});
