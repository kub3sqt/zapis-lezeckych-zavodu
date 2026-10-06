(function () {
  // Support both standalone and embedded mode
  const isEmbedded = window.__recorderEmbedded === true;
  let container;

  if (isEmbedded) {
    container = window.__recorderContainer;
    window.__recorderEmbedded = false;
  } else {
    const user = requireAuth(['admin', 'recorder']);
    if (!user) return;
    container = document.getElementById('recorderContent');
    const userInfo = document.getElementById('recUserInfo');
    if (userInfo) userInfo.textContent = `${user.name || user.email} (${user.role})`;
    const logoutBtn = document.getElementById('recLogoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => {
      api.clearToken();
      window.location.href = 'login.html';
    });
  }

  if (!container) return;

  // State
  let competition = null;
  let categories = [];
  let selectedCategoryId = null;
  let selectedCategory = null;
  let boulders = [];
  let selectedBoulder = null;
  let allChildren = [];
  let queue = []; // [{child, score}]
  let activeIndex = 0;

  init();

  async function init() {
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
      competition = await api.get('/api/competitions/active');
      if (!competition) {
        container.innerHTML = '<div class="empty-state"><div class="icon">🏆</div><p>Žádný aktivní závod</p><p class="text-muted text-sm">Požádejte administrátora o aktivaci závodu.</p></div>';
        return;
      }

      const compDetail = await api.get(`/api/competitions/${competition.id}`);
      categories = compDetail.categories;
      showCategorySelect();
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>${err.message}</p></div>`;
    }
  }

  function showCategorySelect() {
    let html = `<div class="mb-16"><h2 style="text-align:center;margin-bottom:4px">${competition.name}</h2><p class="text-muted text-center text-sm">${competition.date}</p></div>`;
    html += '<h3 class="mb-12">Vyberte kategorii</h3>';
    html += '<div class="grid grid-3 gap-8">';
    categories.forEach(c => {
      html += `<div class="category-card" data-cat-id="${c.id}" data-cat-name="${c.category}">
        <div class="cat-name">${c.category}</div>
      </div>`;
    });
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.category-card').forEach(card => {
      card.addEventListener('click', () => {
        selectedCategoryId = parseInt(card.dataset.catId);
        selectedCategory = card.dataset.catName;
        loadBoulders();
      });
    });
  }

  async function loadBoulders() {
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
      boulders = await api.get(`/api/categories/${competition.id}/${selectedCategoryId}/boulders`);
      allChildren = await api.get(`/api/children/${competition.id}?categoryId=${selectedCategoryId}`);

      showBoulderList();
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><p>${err.message}</p></div>`;
    }
  }

  function showBoulderList() {
    // Deduplicate boulders by number for display
    const boulderMap = {};
    boulders.forEach(b => {
      if (!boulderMap[b.boulder_number]) {
        boulderMap[b.boulder_number] = { number: b.boulder_number, genders: [] };
      }
      boulderMap[b.boulder_number].genders.push(b.gender);
    });

    const boulderList = Object.values(boulderMap).sort((a, b) => a.number - b.number);

    let html = `<button class="back-btn" id="backToCats">← Kategorie</button>`;
    html += `<h3 class="mb-12">${selectedCategory} — Bouldery</h3>`;
    html += '<div class="grid grid-5 gap-8">';
    boulderList.forEach(b => {
      let genderLabel = '';
      const genders = [...new Set(b.genders)];
      if (genders.length === 1 && genders[0] === 'boys') genderLabel = 'jen kluci';
      else if (genders.length === 1 && genders[0] === 'girls') genderLabel = 'jen dívky';

      html += `<div class="boulder-card" data-boulder="${b.number}">
        <div class="boulder-num">${b.number}</div>
        ${genderLabel ? `<div class="boulder-gender">${genderLabel}</div>` : ''}
      </div>`;
    });
    html += '</div>';
    container.innerHTML = html;

    document.getElementById('backToCats').addEventListener('click', showCategorySelect);

    container.querySelectorAll('.boulder-card').forEach(card => {
      card.addEventListener('click', () => {
        selectedBoulder = parseInt(card.dataset.boulder);
        showBoulderScoring();
      });
    });
  }

  async function showBoulderScoring() {
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    // Determine gender restriction for this boulder
    const boulderEntries = boulders.filter(b => b.boulder_number === selectedBoulder);
    const allowedGenders = [...new Set(boulderEntries.map(b => b.gender))];

    let genderNote = '';
    if (allowedGenders.length === 1 && allowedGenders[0] === 'boys') genderNote = '(jen kluci)';
    else if (allowedGenders.length === 1 && allowedGenders[0] === 'girls') genderNote = '(jen dívky)';

    // Load existing scores for this boulder
    let existingScores = [];
    try {
      existingScores = await api.get(`/api/scores/boulder/${competition.id}/${selectedBoulder}?categoryId=${selectedCategoryId}`);
    } catch (e) { }

    // Build score map by child_id
    const scoreMap = {};
    existingScores.forEach(s => { scoreMap[s.child_id] = s; });

    // Filter children by allowed genders
    let filteredChildren = allChildren;
    if (allowedGenders.length === 1 && allowedGenders[0] !== 'both') {
      const genderFilter = allowedGenders[0] === 'boys' ? 'male' : 'female';
      filteredChildren = allChildren.filter(c => c.gender === genderFilter);
    }

    // Rebuild queue from stored state or empty
    const queueKey = `queue_${competition.id}_${selectedCategoryId}_${selectedBoulder}`;
    const savedQueue = sessionStorage.getItem(queueKey);
    if (savedQueue) {
      try {
        const savedIds = JSON.parse(savedQueue);
        queue = savedIds.map(id => {
          const child = filteredChildren.find(c => c.id === id);
          if (!child) return null;
          return { child, score: scoreMap[id] || null };
        }).filter(Boolean);
      } catch (e) {
        queue = [];
      }
    } else {
      queue = [];
    }
    activeIndex = 0;

    renderBoulderUI(filteredChildren, genderNote, queueKey, scoreMap);
  }

  function renderBoulderUI(filteredChildren, genderNote, queueKey, scoreMap) {
    let html = `<button class="back-btn" id="backToBoulders">← Bouldery</button>`;
    html += `<h3 class="mb-8">Boulder ${selectedBoulder} ${genderNote}</h3>`;

    // Search to add to queue
    html += `<div class="card mb-16">
      <div class="card-header"><h3>Přidat do fronty</h3></div>
      <div class="search-box">
        <input type="text" id="queueSearch" placeholder="Hledat závodníka...">
      </div>
      <div id="searchResults" class="search-results hidden"></div>
    </div>`;

    // Active climber scoring
    html += '<div id="scoringArea"></div>';

    // Queue list
    html += `<div class="card mt-16">
      <div class="card-header"><h3>Fronta</h3><span class="text-muted text-sm" id="queueCount"></span></div>
      <div id="queueList"></div>
    </div>`;

    container.innerHTML = html;

    document.getElementById('backToBoulders').addEventListener('click', showBoulderList);

    // Search functionality
    const searchInput = document.getElementById('queueSearch');
    const searchResults = document.getElementById('searchResults');

    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase().trim();
      if (!q) {
        searchResults.classList.add('hidden');
        return;
      }

      const queueIds = new Set(queue.map(qi => qi.child.id));
      const matches = filteredChildren.filter(c =>
        !queueIds.has(c.id) &&
        (`${c.first_name} ${c.last_name}`.toLowerCase().includes(q))
      ).slice(0, 10);

      if (matches.length === 0) {
        searchResults.innerHTML = '<div class="text-muted text-sm" style="padding:10px">Žádný závodník nenalezen</div>';
      } else {
        searchResults.innerHTML = matches.map(c => `
          <div class="search-result-item" data-child-id="${c.id}">
            <span>${c.first_name} ${c.last_name}</span>
            <span class="badge ${c.gender === 'male' ? 'badge-boys' : 'badge-girls'}">${c.gender === 'male' ? '' : ''}</span>
          </div>
        `).join('');

        searchResults.querySelectorAll('.search-result-item').forEach(item => {
          item.addEventListener('click', () => {
            const childId = parseInt(item.dataset.childId);
            const child = filteredChildren.find(c => c.id === childId);
            if (child) {
              queue.push({ child, score: scoreMap[childId] || null });
              saveQueueState(queueKey);
              renderQueueAndScoring(queueKey, scoreMap);
              searchInput.value = '';
              searchResults.classList.add('hidden');
            }
          });
        });
      }
      searchResults.classList.remove('hidden');
    });

    renderQueueAndScoring(queueKey, scoreMap);
  }

  function saveQueueState(queueKey) {
    sessionStorage.setItem(queueKey, JSON.stringify(queue.map(q => q.child.id)));
  }

  function renderQueueAndScoring(queueKey, scoreMap) {
    const scoringArea = document.getElementById('scoringArea');
    const queueList = document.getElementById('queueList');
    const queueCount = document.getElementById('queueCount');

    queueCount.textContent = `${queue.length} závodníků`;

    if (queue.length === 0) {
      scoringArea.innerHTML = '<div class="empty-state"><div class="icon">👆</div><p>Přidejte závodníka do fronty vyhledáním výše</p></div>';
      queueList.innerHTML = '';
      return;
    }

    // Active climber
    const active = queue[activeIndex] || queue[0];
    if (!active) return;

    // Get current score from server data (not local)
    const currentScore = active.score || {};
    const attempts = currentScore.attempts || 0;
    const achievement = currentScore.best_achievement || 0;
    const z1 = currentScore.zone1_attempts || 0;
    const z2 = currentScore.zone2_attempts || 0;
    const tp = currentScore.top_attempts || 0;
    const points = scoring.points(currentScore);
    const resultAtt = scoring.resultAttempts(currentScore);
    // Older rows may have an achievement without the attempt number stored
    const z1At = achievement >= 10 ? (z1 || resultAtt) : 0;
    const z2At = achievement >= 20 ? (z2 || resultAtt) : 0;
    const tpAt = achievement >= 30 ? (tp || resultAtt) : 0;
    const minAttempts = Math.max(z1At, z2At, tpAt);

    let achievementLabel = '—';
    let achievementColorClass = '';
    if (achievement >= 30) { achievementLabel = 'TOP'; achievementColorClass = 'top'; }
    else if (achievement === 20) { achievementLabel = 'Zóna 2'; achievementColorClass = 'zone2'; }
    else if (achievement === 10) { achievementLabel = 'Zóna 1'; achievementColorClass = 'zone1'; }

    const nextAttempt = Math.max(attempts, 1);
    const atLabel = n => n ? `${n}. pokus` : '—';

    scoringArea.innerHTML = `
      <div class="scoring-panel">
        <div class="climber-info">
          <h3>${active.child.first_name} ${active.child.last_name}</h3>
          <span class="badge ${active.child.gender === 'male' ? 'badge-boys' : 'badge-girls'}">${active.child.gender === 'male' ? 'Chlapec' : 'Dívka'}</span>
        </div>

        <div class="text-center mb-16">
          <div class="score-display" style="font-size:2rem">
            <span class="score-attempts">${resultAtt}</span>
            <span class="score-separator">/</span>
            <span class="score-points ${achievementColorClass}">${points}</span>
          </div>
          <div class="text-muted text-xs mt-8">Výsledek: ${achievementLabel}</div>
        </div>

        <div class="scoring-controls">
          <div class="text-center text-xs text-muted">Pokusy celkem</div>
          <div class="attempts-control">
            <button class="btn btn-icon btn-ghost" id="attMinus" ${attempts <= minAttempts || attempts <= 0 ? 'disabled' : ''}>−</button>
            <div class="count">${attempts}</div>
            <button class="btn btn-icon btn-primary" id="attPlus">+</button>
          </div>
          <div class="zone-buttons">
            <button class="btn btn-zone1 ${achievement >= 10 ? 'active' : ''}" id="btnZone1">Zóna 1<br><span class="text-xs">${z1At ? atLabel(z1At) : '10b'}</span></button>
            <button class="btn btn-zone2 ${achievement >= 20 ? 'active' : ''}" id="btnZone2">Zóna 2<br><span class="text-xs">${z2At ? atLabel(z2At) : '20b'}</span></button>
            <button class="btn btn-top ${achievement >= 30 ? 'active' : ''}" id="btnTop">TOP<br><span class="text-xs">${tpAt ? atLabel(tpAt) : (nextAttempt === 1 ? '40b' : '30b')}</span></button>
          </div>
          <div class="text-center text-xs text-muted">Zóna / top se zapíše na ${nextAttempt}. pokus</div>
          <div class="flex gap-8 mt-8">
            <button class="btn btn-success btn-block" id="saveAndNext">💾 Uložit & pokračovat</button>
          </div>
          <button class="btn btn-ghost btn-sm btn-block mt-8" id="removeFromQueue">Odebrat z fronty</button>
        </div>
      </div>
    `;

    const save = (att, nz1, nz2, ntp) => updateScore(active, {
      attempts: att,
      zone1_attempts: nz1,
      zone2_attempts: nz2,
      top_attempts: ntp,
      best_achievement: scoring.bestFrom(nz1, nz2, ntp)
    }, queueKey, scoreMap);

    // Wire up scoring buttons
    document.getElementById('attPlus').addEventListener('click', async () => {
      await save(attempts + 1, z1At, z2At, tpAt);
    });

    document.getElementById('attMinus').addEventListener('click', async () => {
      if (attempts <= 0 || attempts <= minAttempts) return;
      await save(attempts - 1, z1At, z2At, tpAt);
    });

    // Reaching a level records the current attempt number; lower levels count as reached too.
    // Pressing an active level removes it (and everything above it).
    document.getElementById('btnZone1').addEventListener('click', async () => {
      if (achievement >= 10) await save(attempts, 0, 0, 0);
      else await save(nextAttempt, nextAttempt, 0, 0);
    });

    document.getElementById('btnZone2').addEventListener('click', async () => {
      if (achievement >= 20) await save(attempts, z1At, 0, 0);
      else await save(nextAttempt, z1At || nextAttempt, nextAttempt, 0);
    });

    document.getElementById('btnTop').addEventListener('click', async () => {
      if (achievement >= 30) await save(attempts, z1At, z2At, 0);
      else await save(nextAttempt, z1At || nextAttempt, z2At || nextAttempt, nextAttempt);
    });

    document.getElementById('saveAndNext').addEventListener('click', () => {
      // Move active climber to the bottom of the queue
      if (queue.length > 1) {
        const [item] = queue.splice(activeIndex, 1);
        queue.push(item);
        activeIndex = 0;
        saveQueueState(queueKey);
      }
      renderQueueAndScoring(queueKey, scoreMap);
    });

    document.getElementById('removeFromQueue').addEventListener('click', () => {
      queue.splice(activeIndex, 1);
      if (activeIndex >= queue.length) activeIndex = 0;
      saveQueueState(queueKey);
      renderQueueAndScoring(queueKey, scoreMap);
    });

    // Render queue list
    queueList.innerHTML = '';
    queue.forEach((qi, i) => {
      const sc = qi.score || { attempts: 0, best_achievement: 0 };
      const hasScore = sc.best_achievement > 0 || sc.attempts > 0;
      const div = document.createElement('div');
      div.className = `queue-item ${i === activeIndex ? 'active-climber' : ''}`;
      div.innerHTML = `
        <div>
          <span class="climber-name">${qi.child.first_name} ${qi.child.last_name}</span>
          <span class="climber-gender badge ${qi.child.gender === 'male' ? 'badge-boys' : 'badge-girls'}">${qi.child.gender === 'male' ? '' : ''}</span>
          ${i === activeIndex ? ' <span class="badge badge-active">LEZE</span>' : ''}
        </div>
        <div class="score-mini ${hasScore ? 'has-score' : 'no-score'}">${scoring.text(sc)}</div>
      `;
      div.addEventListener('click', () => {
        activeIndex = i;
        renderQueueAndScoring(queueKey, scoreMap);
      });
      queueList.appendChild(div);
    });
  }

  async function updateScore(queueItem, newScore, queueKey, scoreMap) {
    try {
      await api.put('/api/scores', {
        child_id: queueItem.child.id,
        competition_id: competition.id,
        boulder_number: selectedBoulder,
        ...newScore
      });

      // Update local state
      queueItem.score = newScore;
      scoreMap[queueItem.child.id] = newScore;

      renderQueueAndScoring(queueKey, scoreMap);
    } catch (err) {
      showToast('Chyba při ukládání: ' + err.message, 'error');
    }
  }
})();
