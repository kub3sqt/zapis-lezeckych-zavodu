document.addEventListener('DOMContentLoaded', () => {
  const user = requireAuth(['admin']);
  if (!user) return;

  document.getElementById('userInfo').textContent = `${user.name || user.email} (admin)`;
  document.getElementById('logoutBtn').addEventListener('click', () => {
    api.clearToken();
    window.location.href = 'login.html';
  });

  // Tab switching
  let activeTab = 'competitions';
  document.querySelectorAll('#mainTabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#mainTabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      activeTab = tab.dataset.tab;
      document.getElementById(`tab-${activeTab}`).classList.remove('hidden');

      if (activeTab === 'competitions') loadCompetitions();
      if (activeTab === 'registration') {
        loadRegData();
        loadUniqueChildren();
      }
      if (activeTab === 'results') loadResData();
      if (activeTab === 'overall') loadOverallData();
      if (activeTab === 'seasons') loadSeasons();
      if (activeTab === 'users') loadUsers();
      if (activeTab === 'recording') loadRecorder();
    });
  });

  // ==================== COMPETITIONS ====================
  let editingCompId = null;
  let boulderConfig = {}; // { "U9": { boys: [1,2,3], girls: [1,2,3] } }
  let currentBoulderCat = null;
  let currentBoulderGender = 'girls';
  let isDragging = false;
  let dragSelected = true;

  async function loadCompetitions() {
    try {
      const comps = await api.get('/api/competitions');
      const list = document.getElementById('competitionsList');
      if (comps.length === 0) {
        list.innerHTML = '<div class="empty-state"><div class="icon">🏆</div><p>Žádné závody</p></div>';
        return;
      }
      list.innerHTML = comps.map(c => `
        <div class="queue-item">
          <div>
            <div class="climber-name">${c.name}</div>
            <div class="text-muted text-xs">${c.date}</div>
          </div>
          <div class="flex gap-8 items-center">
            ${c.is_active ? '<span class="badge badge-active">AKTIVNÍ</span>' : '<span class="badge badge-inactive">Neaktivní</span>'}
            <button class="btn btn-sm ${c.is_active ? 'btn-ghost' : 'btn-success'}" onclick="toggleComp(${c.id}, ${c.is_active})">${c.is_active ? 'Deaktivovat' : 'Aktivovat'}</button>
            <button class="btn btn-sm btn-ghost" onclick="editComp(${c.id})">✏️</button>
            <button class="btn btn-sm btn-danger" onclick="deleteComp(${c.id})">🗑</button>
          </div>
        </div>
      `).join('');
    } catch (err) {
      showToast('Chyba při načítání závodů', 'error');
    }
  }

  window.toggleComp = async (id, isActive) => {
    try {
      if (isActive) {
        await api.post(`/api/competitions/${id}/deactivate`);
      } else {
        await api.post(`/api/competitions/${id}/activate`);
      }
      loadCompetitions();
      showToast(isActive ? 'Závod deaktivován' : 'Závod aktivován');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.editComp = async (id) => {
    try {
      const comp = await api.get(`/api/competitions/${id}`);
      editingCompId = id;
      document.getElementById('compEditorTitle').textContent = 'Upravit závod';
      document.getElementById('compName').value = comp.name;
      document.getElementById('compDate').value = comp.date;

      // Set category checkboxes
      document.querySelectorAll('#catCheckboxes input').forEach(cb => {
        cb.checked = comp.categories.some(c => c.category === cb.value);
      });

      // Load boulder config
      boulderConfig = {};
      for (const cat of comp.categories) {
        const catBoulders = comp.boulders.filter(b => b.category_id === cat.id);
        boulderConfig[cat.category] = { boys: [], girls: [] };
        catBoulders.forEach(b => {
          if (b.gender === 'both' || b.gender === 'boys') boulderConfig[cat.category].boys.push(b.boulder_number);
          if (b.gender === 'both' || b.gender === 'girls') boulderConfig[cat.category].girls.push(b.boulder_number);
        });
      }

      showCompEditor();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.deleteComp = async (id) => {
    if (!confirm('Opravdu smazat tento závod? Smaže se i vše s ním spojené.')) return;
    try {
      await api.delete(`/api/competitions/${id}`);
      loadCompetitions();
      showToast('Závod smazán');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  document.getElementById('newCompBtn').addEventListener('click', () => {
    editingCompId = null;
    document.getElementById('compEditorTitle').textContent = 'Nový závod';
    document.getElementById('compName').value = '';
    document.getElementById('compDate').value = '';
    document.querySelectorAll('#catCheckboxes input').forEach(cb => cb.checked = false);
    boulderConfig = {};
    showCompEditor();
  });

  function showCompEditor() {
    document.getElementById('compEditor').classList.remove('hidden');
    updateBoulderConfig();
  }

  document.getElementById('closeCompEditor').addEventListener('click', () => {
    document.getElementById('compEditor').classList.add('hidden');
  });
  document.getElementById('cancelCompBtn').addEventListener('click', () => {
    document.getElementById('compEditor').classList.add('hidden');
  });

  // Listen for category checkbox changes
  document.querySelectorAll('#catCheckboxes input').forEach(cb => {
    cb.addEventListener('change', updateBoulderConfig);
  });

  function updateBoulderConfig() {
    const selectedCats = [];
    document.querySelectorAll('#catCheckboxes input:checked').forEach(cb => selectedCats.push(cb.value));

    if (selectedCats.length === 0) {
      document.getElementById('boulderConfig').classList.add('hidden');
      return;
    }

    document.getElementById('boulderConfig').classList.remove('hidden');

    // Init config for new categories
    selectedCats.forEach(cat => {
      if (!boulderConfig[cat]) boulderConfig[cat] = { boys: [], girls: [] };
    });

    // Category tabs for boulders
    const catTabs = document.getElementById('boulderCatTabs');
    catTabs.innerHTML = '';
    selectedCats.forEach((cat, i) => {
      const btn = document.createElement('button');
      btn.className = `tab ${i === 0 && !currentBoulderCat ? 'active' : (cat === currentBoulderCat ? 'active' : '')}`;
      btn.textContent = cat;
      btn.addEventListener('click', () => {
        currentBoulderCat = cat;
        catTabs.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        renderBoulderGrid();
      });
      catTabs.appendChild(btn);
    });

    if (!currentBoulderCat || !selectedCats.includes(currentBoulderCat)) {
      currentBoulderCat = selectedCats[0];
    }

    renderBoulderGrid();
  }

  // Gender tabs for boulder config
  document.querySelectorAll('#boulderGenderTabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#boulderGenderTabs button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentBoulderGender = btn.dataset.gender;
      renderBoulderGrid();
    });
  });

  function renderBoulderGrid() {
    const grid = document.getElementById('boulderGrid');
    grid.innerHTML = '';

    if (!currentBoulderCat || !boulderConfig[currentBoulderCat]) return;

    const selected = boulderConfig[currentBoulderCat][currentBoulderGender] || [];

    for (let i = 1; i <= 30; i++) {
      const cell = document.createElement('div');
      cell.className = `boulder-card ${selected.includes(i) ? 'selected' : ''}`;
      cell.innerHTML = `<div class="boulder-num">${i}</div>`;
      cell.dataset.num = i;

      cell.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isDragging = true;
        dragSelected = !selected.includes(i);
        toggleBoulder(i, dragSelected);
      });

      cell.addEventListener('mouseenter', () => {
        if (isDragging) {
          toggleBoulder(i, dragSelected);
        }
      });

      cell.addEventListener('touchstart', (e) => {
        e.preventDefault();
        isDragging = true;
        dragSelected = !selected.includes(i);
        toggleBoulder(i, dragSelected);
      }, { passive: false });

      grid.appendChild(cell);
    }
  }

  document.addEventListener('mouseup', () => isDragging = false);
  document.addEventListener('touchend', () => isDragging = false);

  // Touch move handling for drag
  document.getElementById('boulderGrid')?.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (el && el.closest('.boulder-card')) {
      const num = parseInt(el.closest('.boulder-card').dataset.num);
      if (num) toggleBoulder(num, dragSelected);
    }
  }, { passive: true });

  function toggleBoulder(num, select) {
    const arr = boulderConfig[currentBoulderCat][currentBoulderGender];
    const idx = arr.indexOf(num);
    if (select && idx === -1) arr.push(num);
    if (!select && idx !== -1) arr.splice(idx, 1);
    renderBoulderGrid();
  }

  // Save competition
  document.getElementById('saveCompBtn').addEventListener('click', async () => {
    const name = document.getElementById('compName').value.trim();
    const date = document.getElementById('compDate').value;

    if (!name || !date) {
      showToast('Vyplňte název a datum', 'error');
      return;
    }

    const categories = [];
    document.querySelectorAll('#catCheckboxes input:checked').forEach(cb => categories.push(cb.value));

    if (categories.length === 0) {
      showToast('Vyberte alespoň jednu kategorii', 'error');
      return;
    }

    // Build boulders array
    const boulders = [];
    for (const cat of categories) {
      const cfg = boulderConfig[cat] || { boys: [], girls: [] };
      const boysSet = new Set(cfg.boys);
      const girlsSet = new Set(cfg.girls);
      const all = new Set([...boysSet, ...girlsSet]);

      for (const num of all) {
        const isBoys = boysSet.has(num);
        const isGirls = girlsSet.has(num);
        let gender = 'both';
        if (isBoys && !isGirls) gender = 'boys';
        if (isGirls && !isBoys) gender = 'girls';
        boulders.push({ category: cat, boulder_number: num, gender });
      }
    }

    try {
      if (editingCompId) {
        await api.put(`/api/competitions/${editingCompId}`, { name, date, categories, boulders });
        showToast('Závod aktualizován');
      } else {
        await api.post('/api/competitions', { name, date, categories, boulders });
        showToast('Závod vytvořen');
      }
      document.getElementById('compEditor').classList.add('hidden');
      loadCompetitions();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // ==================== REGISTRATION ====================
  let regCompData = null;

  async function loadRegData() {
    try {
      const comps = await api.get('/api/competitions');
      const select = document.getElementById('regCompSelect');
      select.innerHTML = '<option value="">Vyberte závod...</option>';
      let activeCompId = null;
      comps.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.name} (${c.date}) ${c.is_active ? ' -  ✔️ aktivní' : ''}`;
        select.appendChild(opt);
        if (c.is_active) activeCompId = c.id;
      });
      // Auto-select active competition
      if (activeCompId) {
        select.value = activeCompId;
        select.dispatchEvent(new Event('change'));
      }
    } catch (err) {
      showToast('Chyba při načítání', 'error');
    }
  }

  document.getElementById('regCompSelect').addEventListener('change', async () => {
    const compId = document.getElementById('regCompSelect').value;
    const catSelect = document.getElementById('regCatSelect');
    catSelect.innerHTML = '<option value="">Vyberte kategorii...</option>';

    if (!compId) return;

    try {
      const comp = await api.get(`/api/competitions/${compId}`);
      regCompData = comp;
      comp.categories.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.category;
        catSelect.appendChild(opt);
      });
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('regCatSelect').addEventListener('change', () => loadRegisteredChildren());

  document.getElementById('regSubmitBtn').addEventListener('click', async () => {
    const compId = document.getElementById('regCompSelect').value;
    const catId = document.getElementById('regCatSelect').value;
    const fullName = document.getElementById('regFullName').value.trim();
    const gender = document.getElementById('regGender').value;

    if (!compId || !catId || !fullName) {
      showToast('Vyplňte všechna pole', 'error');
      return;
    }

    const nameParts = fullName.split(' ').filter(p => p.trim());
    let firstName = '';
    let lastName = '';
    
    if (nameParts.length >= 2) {
      lastName = nameParts.pop();
      firstName = nameParts.join(' ');
    } else {
      firstName = fullName;
      lastName = '-';
    }

    try {
      // Check for similar existing records first
      const similar = await api.get(`/api/children/check-similar?first_name=${encodeURIComponent(firstName)}&last_name=${encodeURIComponent(lastName)}&gender=${gender}`);
      
      if (similar.length > 0) {
        showSimilarNamesModal(similar, compId, catId, firstName, lastName, gender);
        return;
      }
      
      // If no similar found, proceed with normal registration
      await executeRegistration(compId, catId, firstName, lastName, gender);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  async function executeRegistration(compId, catId, firstName, lastName, gender) {
    try {
      const result = await api.post('/api/children', {
        competition_id: parseInt(compId),
        category_id: parseInt(catId),
        first_name: firstName,
        last_name: lastName,
        gender
      });
      showQRCodeModal(result.access_key, `${firstName} ${lastName}`);
      document.getElementById('regFullName').value = '';
      document.getElementById('fullNameAutocomplete').classList.add('hidden');
      loadRegisteredChildren();
      loadUniqueChildren(); // Refresh autocomplete data in case it's a new name
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function showSimilarNamesModal(similarRecords, compId, catId, typedFirst, typedLast, gender) {
    const modal = document.getElementById('modalContent');
    const overlay = document.getElementById('modalOverlay');

    let html = `
      <h2>⚠️ Nalezena podobná jména</h2>
      <p class="mb-16">V historii už existuje závodník s velmi podobným jménem. <strong>Neměli jste na mysli jednoho z nich?</strong> Tímto zabráníte duplicitám.</p>
      
      <div class="similar-names-list mb-16" style="max-height: 40vh; overflow-y: auto;">
    `;

    similarRecords.forEach((sim, idx) => {
      html += `
        <div class="card mb-8" style="padding: 12px; background: var(--bg-card);">
          <div class="flex items-center justify-between">
            <div>
              <div style="font-weight: bold; font-size: 1.1rem;">${sim.first_name} ${sim.last_name}</div>
              <div class="text-muted text-xs">Pohlaví: ${sim.gender === 'male' ? 'Chlapec' : 'Dívka'} • Klíč: <code style="color:var(--accent-light);font-size:0.75rem">${sim.access_key}</code></div>
            </div>
            <button class="btn btn-success btn-sm btn-merge" data-idx="${idx}">Sloučit s tímto</button>
          </div>
        </div>
      `;
    });

    html += `
      </div>
      <div class="flex gap-8 items-center" style="border-top: 1px solid var(--border-color); padding-top: 16px;">
        <div class="flex-1">
          <div class="text-xs text-muted mb-4">Vámi zadané jméno (nové):</div>
          <div style="font-weight: bold;">${typedFirst} ${typedLast}</div>
        </div>
        <button class="btn btn-danger btn-sm" id="btnRegisterNewMatch">Ignorovat a zaregistrovat jako nového</button>
        <button class="btn btn-ghost btn-sm" id="btnCancelMatch">Zrušit</button>
      </div>
    `;

    modal.innerHTML = html;
    overlay.classList.remove('hidden');

    // Attach merge handlers
    modal.querySelectorAll('.btn-merge').forEach(btn => {
      btn.addEventListener('click', async () => {
        const sim = similarRecords[parseInt(btn.dataset.idx)];
        overlay.classList.add('hidden');
        // Execute registration using the EXISTING NAME so they share access_key implicitly via backend lookup
        await executeRegistration(compId, catId, sim.first_name, sim.last_name, sim.gender);
      });
    });

    // Register as new
    document.getElementById('btnRegisterNewMatch').addEventListener('click', async () => {
      overlay.classList.add('hidden');
      await executeRegistration(compId, catId, typedFirst, typedLast, gender);
    });

    // Cancel
    document.getElementById('btnCancelMatch').addEventListener('click', () => {
      overlay.classList.add('hidden');
    });
  }

  let uniqueChildren = [];
  let autocompleteActiveIndex = -1;

  async function loadUniqueChildren() {
    try {
      uniqueChildren = await api.get('/api/children/all/unique');
    } catch(err) {
      console.error('Failed to load unique children for autocomplete', err);
    }
  }

  function renderAutocomplete(query) {
    const list = document.getElementById('fullNameAutocomplete');
    autocompleteActiveIndex = -1;
    if (!query) {
      list.classList.add('hidden');
      return;
    }
    const q = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    // Filter logic: match first name or last name
    const matches = uniqueChildren.filter(c => {
      const full = `${c.first_name} ${c.last_name}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return full.includes(q);
    });

    if (matches.length === 0) {
      list.classList.add('hidden');
      return;
    }

    list.innerHTML = matches.slice(0, 10).map((m, idx) => `
      <li class="autocomplete-item" data-idx="${idx}">${m.first_name} ${m.last_name}</li>
    `).join('');
    list.classList.remove('hidden');

    list.querySelectorAll('.autocomplete-item').forEach(item => {
      item.addEventListener('click', () => {
        document.getElementById('regFullName').value = item.textContent;
        list.classList.add('hidden');
        document.getElementById('regFullName').focus();
      });
    });
  }

  document.getElementById('regFullName').addEventListener('input', (e) => {
    autocompleteActiveIndex = -1;
    renderAutocomplete(e.target.value.trim());
  });

  document.getElementById('regFullName').addEventListener('keydown', (e) => {
    const list = document.getElementById('fullNameAutocomplete');
    const items = list.querySelectorAll('.autocomplete-item');
    
    if (e.key === 'ArrowDown' || e.key === 'Tab') {
      if (!list.classList.contains('hidden') && items.length > 0) {
        e.preventDefault();
        autocompleteActiveIndex = (autocompleteActiveIndex + 1) % items.length;
        items.forEach((item, i) => item.classList.toggle('active', i === autocompleteActiveIndex));
        items[autocompleteActiveIndex].scrollIntoView({ block: 'nearest' });
        // Set value temporarily if Tab is pressed optionally, but let's just highlight it.
      }
    } else if (e.key === 'ArrowUp') {
      if (!list.classList.contains('hidden') && items.length > 0) {
        e.preventDefault();
        autocompleteActiveIndex = autocompleteActiveIndex <= 0 ? items.length - 1 : autocompleteActiveIndex - 1;
        items.forEach((item, i) => item.classList.toggle('active', i === autocompleteActiveIndex));
        items[autocompleteActiveIndex].scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!list.classList.contains('hidden') && autocompleteActiveIndex >= 0 && items[autocompleteActiveIndex]) {
        // Select active item
        document.getElementById('regFullName').value = items[autocompleteActiveIndex].textContent;
        list.classList.add('hidden');
      } else {
        // Submit
        list.classList.add('hidden');
        document.getElementById('regSubmitBtn').click();
      }
    } else if (e.key === 'Escape') {
      list.classList.add('hidden');
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#fullNameAutocomplete') && e.target.id !== 'regFullName') {
      document.getElementById('fullNameAutocomplete')?.classList.add('hidden');
    }
  });

  async function loadRegisteredChildren() {
    const compId = document.getElementById('regCompSelect').value;
    const catId = document.getElementById('regCatSelect').value;
    const list = document.getElementById('regChildrenList');

    if (!compId) { list.innerHTML = ''; return; }

    try {
      let url = `/api/children/${compId}`;
      if (catId) url += `?categoryId=${catId}`;
      const children = await api.get(url);

      if (children.length === 0) {
        list.innerHTML = '<div class="empty-state"><p>Žádní registrovaní závodníci</p></div>';
        return;
      }

      list.innerHTML = '<div class="table-wrap"><table><thead><tr><th>Jméno</th><th>Kategorie</th><th>Pohlaví</th><th>Klíč</th><th></th></tr></thead><tbody>' +
        children.map(c => `<tr>
          <td><strong>${c.first_name} ${c.last_name}</strong></td>
          <td>${c.category}</td>
          <td><span class="badge ${c.gender === 'male' ? 'badge-boys' : 'badge-girls'}">${c.gender === 'male' ? 'Chlapec' : 'Dívka'}</span></td>
          <td>
            <div class="flex items-center gap-8">
              <code style="color:var(--accent-light);font-size:0.75rem">${c.access_key}</code>
              <button class="btn btn-sm btn-ghost" style="padding:4px" onclick="showQRCodeModal('${c.access_key}', '${c.first_name.replace(/'/g, "\\'")} ${c.last_name.replace(/'/g, "\\'")}')">📱 QR</button>
            </div>
          </td>
          <td>
            <div class="flex gap-8 justify-end">
              <button class="btn btn-sm btn-ghost" style="padding:4px" onclick="editChild(${c.id}, '${c.first_name.replace(/'/g, "\\'")}', '${c.last_name.replace(/'/g, "\\'")}', '${c.gender}', ${c.category_id})">✏️ Upravit</button>
              <button class="btn btn-sm btn-danger" style="padding:4px" onclick="deleteChild(${c.id})">🗑 Smazat</button>
            </div>
          </td>
        </tr>`).join('') +
        '</tbody></table></div>';
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  window.deleteChild = async (id) => {
    if (!confirm('Smazat závodníka?')) return;
    try {
      await api.delete(`/api/children/${id}`);
      loadRegisteredChildren();
      showToast('Závodník smazán');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.editChild = async (id, firstName, lastName, gender, categoryId) => {
    const compId = document.getElementById('regCompSelect').value;
    if (!regCompData || regCompData.id != compId) {
      try {
        regCompData = await api.get(`/api/competitions/${compId}`);
      } catch(e) {
        showToast('Nešlo načíst kategorie pro editaci', 'error'); return;
      }
    }

    const modal = document.getElementById('modalContent');
    const overlay = document.getElementById('modalOverlay');

    let catOptions = '';
    regCompData.categories.forEach(c => {
      catOptions += `<option value="${c.id}" ${c.id === categoryId ? 'selected' : ''}>${c.category}</option>`;
    });

    modal.innerHTML = `
      <h2>Upravit závodníka</h2>
      <div class="input-group">
        <label>Jméno</label>
        <input type="text" id="editFirstName" value="${firstName}">
      </div>
      <div class="input-group">
        <label>Příjmení</label>
        <input type="text" id="editLastName" value="${lastName}">
      </div>
      <div class="input-group">
        <label>Pohlaví</label>
        <select id="editGender">
          <option value="male" ${gender === 'male' ? 'selected' : ''}>Chlapec</option>
          <option value="female" ${gender === 'female' ? 'selected' : ''}>Dívka</option>
        </select>
      </div>
      <div class="input-group">
        <label>Kategorie</label>
        <select id="editCategory">
          ${catOptions}
        </select>
      </div>
      <div class="flex gap-8 mt-16">
        <button class="btn btn-primary" id="saveEditChild">Uložit</button>
        <button class="btn btn-ghost" id="closeEditChild">Zrušit</button>
      </div>
    `;
    overlay.classList.remove('hidden');

    document.getElementById('closeEditChild').addEventListener('click', () => {
      overlay.classList.add('hidden');
    });

    document.getElementById('saveEditChild').addEventListener('click', async () => {
      try {
        await api.put(`/api/children/${id}`, {
          first_name: document.getElementById('editFirstName').value.trim(),
          last_name: document.getElementById('editLastName').value.trim(),
          gender: document.getElementById('editGender').value,
          category_id: parseInt(document.getElementById('editCategory').value)
        });
        showToast('Úpravy uloženy');
        overlay.classList.add('hidden');
        loadRegisteredChildren();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  };

  // ==================== RESULTS ====================
  let resCompId = null;
  let resCatId = null;

  async function loadResData() {
    try {
      const comps = await api.get('/api/competitions');
      const select = document.getElementById('resCompSelect');
      select.innerHTML = '<option value="">Vyberte závod...</option>';
      let activeCompId = null;
      comps.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.name} (${c.date}) ${c.is_active ? ' -  ✔️ aktivní' : ''}`;
        select.appendChild(opt);
        if (c.is_active) activeCompId = c.id;
      });
      // Auto-select active competition
      if (activeCompId) {
        select.value = activeCompId;
        select.dispatchEvent(new Event('change'));
      }
    } catch (err) {
      showToast('Chyba', 'error');
    }
  }

  document.getElementById('resCompSelect').addEventListener('change', async () => {
    resCompId = document.getElementById('resCompSelect').value;
    if (!resCompId) return;

    try {
      const comp = await api.get(`/api/competitions/${resCompId}`);
      const tabs = document.getElementById('resCatTabs');
      tabs.innerHTML = '';
      comp.categories.forEach((c, i) => {
        const btn = document.createElement('button');
        btn.className = `tab ${i === 0 ? 'active' : ''}`;
        btn.textContent = c.category;
        btn.addEventListener('click', () => {
          tabs.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
          btn.classList.add('active');
          resCatId = c.id;
          loadResults();
        });
        tabs.appendChild(btn);
      });
      if (comp.categories.length > 0) {
        resCatId = comp.categories[0].id;
        loadResults();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  async function loadResults() {
    if (!resCompId || !resCatId) return;

    try {
      const results = await api.get(`/api/results/admin/${resCompId}?categoryId=${resCatId}`);
      const table = document.getElementById('resultsTable');
      const key = Object.keys(results)[0];
      const data = results[key];

      if (!data || ((!data.boys || data.boys.length === 0) && (!data.girls || data.girls.length === 0))) {
        table.innerHTML = '<div class="empty-state"><p>Žádné výsledky</p></div>';
        document.getElementById('publishControls').style.display = 'none';
        return;
      }

      document.getElementById('publishControls').style.display = 'flex';
      document.getElementById('publishBtn').style.display = data.published ? 'none' : '';
      document.getElementById('unpublishBtn').style.display = data.published ? '' : 'none';

      let html = '';

      // Boys table
      if (data.boys && data.boys.length > 0) {
        html += '<div class="boys-section">';
        html += '<h3 class="mb-8" style="color:var(--zone2)">Kluci</h3>';
        html += renderAdminTable(data.boys);
        html += '</div><div class="mb-16"></div>';
      }

      // Girls table
      if (data.girls && data.girls.length > 0) {
        html += '<div class="girls-section">';
        html += '<h3 class="mb-8" style="color:#f472b6">Dívky</h3>';
        html += renderAdminTable(data.girls);
        html += '</div>';
      }

      table.innerHTML = html;
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function renderAdminTable(rankings) {
    let html = '<div class="table-wrap"><table><thead><tr><th>#</th><th>Jméno</th><th>Body</th><th>Pokusy</th><th>Topy</th><th class="no-print"></th></tr></thead><tbody>';
    rankings.forEach((r, i) => {
      const rank = i + 1;
      let rankClass = rank <= 3 ? `rank-${rank}` : '';
      html += `<tr>
        <td><span class="rank-badge ${rankClass}">${rank}</span></td>
        <td><strong>${r.first_name} ${r.last_name}</strong></td>
        <td><strong style="color:var(--accent-light)">${r.totalPoints}</strong></td>
        <td>${r.totalAttempts}</td>
        <td>${r.totalTops}</td>
        <td class="no-print"><button class="btn btn-sm btn-ghost" onclick="editScores(${r.id})">✏️</button></td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    return html;
  }

  document.getElementById('publishBtn').addEventListener('click', async () => {
    try {
      await api.post('/api/results/publish', { competition_id: parseInt(resCompId), category_id: parseInt(resCatId) });
      showToast('Výsledky zveřejněny');
      loadResults();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('unpublishBtn').addEventListener('click', async () => {
    try {
      await api.post('/api/results/unpublish', { competition_id: parseInt(resCompId), category_id: parseInt(resCatId) });
      showToast('Výsledky skryty');
      loadResults();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  function setPrintHeader() {
    const compSelect = document.getElementById('resCompSelect');
    const catSelect = document.querySelector('#resCatTabs .tab.active');
    let title = 'Výsledky';
    if (compSelect.options[compSelect.selectedIndex]) {
      title = compSelect.options[compSelect.selectedIndex].textContent.replace(' -  ✔️ aktivní', '').replace(/\s*\([^)]*\)/, '').trim();
    }
    if (catSelect) title += ` - ${(catSelect.textContent || '').trim()}`;
    const headerTitle = document.getElementById('printTitle');
    if (headerTitle) headerTitle.textContent = title;

    const now = new Date();
    const headerDate = document.getElementById('printDate');
    if (headerDate) headerDate.textContent = now.toLocaleDateString('cs-CZ') + ' ' + now.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  }

  document.getElementById('printResultsBtn').addEventListener('click', () => {
    setPrintHeader();
    document.body.className = '';
    window.print();
  });

  const printBoysBtn = document.getElementById('printBoysBtn');
  if (printBoysBtn) {
    printBoysBtn.addEventListener('click', () => {
      setPrintHeader();
      document.body.className = 'print-only-boys';
      window.print();
      setTimeout(() => document.body.className = '', 100);
    });
  }

  const printGirlsBtn = document.getElementById('printGirlsBtn');
  if (printGirlsBtn) {
    printGirlsBtn.addEventListener('click', () => {
      setPrintHeader();
      document.body.className = 'print-only-girls';
      window.print();
      setTimeout(() => document.body.className = '', 100);
    });
  }

  // Edit scores modal
  window.editScores = async (childId) => {
    try {
      const scores = await api.get(`/api/scores/child/${childId}`);
      const comp = await api.get(`/api/competitions/${resCompId}`);
      const children = await api.get(`/api/children/${resCompId}`);
      const child = children.find(c => c.id === childId);

      const modal = document.getElementById('modalContent');
      const overlay = document.getElementById('modalOverlay');

      let html = `<h2>Upravit výsledky — ${child.first_name} ${child.last_name}</h2>`;
      html += '<div style="max-height:60vh;overflow-y:auto">';

      // Get boulders for this category
      const catBoulders = comp.boulders.filter(b => b.category_id === child.category_id);
      const relevantBoulders = catBoulders.filter(b => b.gender === 'both' || b.gender === (child.gender === 'male' ? 'boys' : 'girls'));

      relevantBoulders.sort((a, b) => a.boulder_number - b.boulder_number);

      for (const b of relevantBoulders) {
        const score = scores.find(s => s.boulder_number === b.boulder_number);
        const attempts = score ? score.attempts : 0;
        const achievement = score ? score.best_achievement : 0;

        html += `<div class="queue-item mb-8" id="editScore-${b.boulder_number}">
          <div>
            <strong>B${b.boulder_number}</strong>
            ${b.gender !== 'both' ? `<span class="text-xs text-muted">(${b.gender === 'boys' ? 'kluci' : 'dívky'})</span>` : ''}
          </div>
          <div class="flex gap-8 items-center">
            <label class="text-xs">Pokusy:</label>
            <input type="number" min="0" value="${attempts}" style="width:60px;padding:4px 8px" class="edit-attempts" data-bn="${b.boulder_number}">
            <select class="edit-achievement" data-bn="${b.boulder_number}" style="padding:4px 8px;width:auto">
              <option value="0" ${achievement === 0 ? 'selected' : ''}>—</option>
              <option value="10" ${achievement === 10 ? 'selected' : ''}>Zóna 1</option>
              <option value="20" ${achievement === 20 ? 'selected' : ''}>Zóna 2</option>
              <option value="30" ${achievement >= 30 ? 'selected' : ''}>Top</option>
            </select>
          </div>
        </div>`;
      }

      html += '</div>';
      html += `<div class="flex gap-8 mt-16"><button class="btn btn-primary" id="saveEditScores">Uložit</button><button class="btn btn-ghost" id="closeModal">Zavřít</button></div>`;

      modal.innerHTML = html;
      overlay.classList.remove('hidden');

      document.getElementById('closeModal').addEventListener('click', () => overlay.classList.add('hidden'));

      document.getElementById('saveEditScores').addEventListener('click', async () => {
        try {
          const attemptInputs = modal.querySelectorAll('.edit-attempts');
          const achievementSelects = modal.querySelectorAll('.edit-achievement');

          for (let i = 0; i < attemptInputs.length; i++) {
            const bn = parseInt(attemptInputs[i].dataset.bn);
            const att = parseInt(attemptInputs[i].value) || 0;
            let ach = parseInt(achievementSelects[i].value) || 0;
            // Top on first attempt = 40
            if (ach >= 30 && att === 1) ach = 40;

            await api.put('/api/scores', {
              child_id: childId,
              competition_id: parseInt(resCompId),
              boulder_number: bn,
              attempts: att,
              best_achievement: ach
            });
          }
          showToast('Výsledky uloženy');
          overlay.classList.add('hidden');
          loadResults();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // ==================== QR CODES ====================
  window.showQRCodeModal = (key, name) => {
    const modal = document.getElementById('modalContent');
    const overlay = document.getElementById('modalOverlay');
    const url = `${window.location.origin}/startlist.html#${key}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(url)}`;

    modal.innerHTML = `
      <div id="qrPrintArea">
        <h2 style="text-align:center;margin-bottom:8px">${name}</h2>
        <p style="text-align:center;color:var(--text-muted);font-size:12px;margin-bottom:16px">Oskenuj pro zobrazení startovky</p>
        <div class="qr-container">
          <img src="${qrUrl}" alt="QR Code">
          <div class="qr-key-display">${key}</div>
        </div>
      </div>
      <div class="flex gap-8 mt-24 justify-center no-print">
        <button class="btn btn-primary" onclick="printQR()">🖨 Vytisknout štítek</button>
        <button class="btn btn-ghost" id="closeQRBtn">Zavřít</button>
      </div>
    `;
    overlay.classList.remove('hidden');

    const closeQR = () => {
      overlay.classList.add('hidden');
      document.removeEventListener('keydown', onEnterClose);
      document.getElementById('regFirstName').focus();
    };

    const onEnterClose = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        closeQR();
      }
    };

    document.getElementById('closeQRBtn').addEventListener('click', closeQR);
    setTimeout(() => document.addEventListener('keydown', onEnterClose), 100);
  };

  window.printQR = () => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
      <head>
        <title>Tisk štítku</title>
        <style>
          body { font-family: sans-serif; text-align: center; margin: 0; padding: 20px; }
          .qr-container { margin-top: 20px; }
          img { max-width: 150px; }
          .qr-key-display { font-family: monospace; font-size: 24px; font-weight: bold; margin-top: 10px; letter-spacing: 2px; }
        </style>
      </head>
      <body>
        ${document.getElementById('qrPrintArea').innerHTML}
        <script>window.onload = () => { window.print(); window.setTimeout(() => window.close(), 500); }</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  // ==================== OVERALL RESULTS ====================
  let overallSeasonId = null;
  let overallCatId = null;

  async function loadOverallData() {
    try {
      const seasons = await api.get('/api/seasons');
      const select = document.getElementById('overallSeasonSelect');
      select.innerHTML = '<option value="">Vyberte sérii...</option>';
      seasons.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.name}`;
        select.appendChild(opt);
      });
      if (seasons.length > 0) {
        select.value = seasons[0].id;
        select.dispatchEvent(new Event('change'));
      }
    } catch (err) {
      showToast('Chyba při načítání', 'error');
    }
  }

  document.getElementById('overallSeasonSelect').addEventListener('change', async () => {
    overallSeasonId = document.getElementById('overallSeasonSelect').value;
    if (!overallSeasonId) return;

    try {
      const results = await api.get(`/api/seasons/${overallSeasonId}/results`);
      // sort category keys (U9 before U11)
      const cats = Object.keys(results).sort((a, b) => {
        const na = parseInt(a.replace(/\\D/g, '')) || 0;
        const nb = parseInt(b.replace(/\\D/g, '')) || 0;
        return na - nb;
      });

      const tabs = document.getElementById('overallCatTabs');
      tabs.innerHTML = '';
      
      cats.forEach((catName, i) => {
        const btn = document.createElement('button');
        btn.className = `tab ${i === 0 ? 'active' : ''}`;
        btn.textContent = catName;
        btn.addEventListener('click', () => {
          tabs.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
          btn.classList.add('active');
          overallCatId = catName;
          renderOverallTable(results[catName]);
        });
        tabs.appendChild(btn);
      });

      if (cats.length > 0) {
        overallCatId = cats[0];
        renderOverallTable(results[overallCatId]);
      } else {
        document.getElementById('overallResultsTable').innerHTML = '<div class="empty-state"><p>Žádné výsledky</p></div>';
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  function renderOverallTable(data) {
    const table = document.getElementById('overallResultsTable');

    if (!data || ((!data.boys || data.boys.length === 0) && (!data.girls || data.girls.length === 0))) {
      table.innerHTML = '<div class="empty-state"><p>Žádné výsledky</p></div>';
      return;
    }

    let html = '';

    // Boys table
    if (data.boys && data.boys.length > 0) {
      html += '<div class="boys-section">';
      html += '<h3 class="mb-8" style="color:var(--zone2)">Kluci</h3>';
      html += renderAdminOverallTableHtml(data.boys);
      html += '</div><div class="mb-16"></div>';
    }

    // Girls table
    if (data.girls && data.girls.length > 0) {
      html += '<div class="girls-section">';
      html += '<h3 class="mb-8" style="color:#f472b6">Dívky</h3>';
      html += renderAdminOverallTableHtml(data.girls);
      html += '</div>';
    }

    table.innerHTML = html;
  }

  function renderAdminOverallTableHtml(rankings) {
    let html = '<div class="table-wrap"><table><thead><tr><th>#</th><th>Jméno</th><th>Body</th><th>Pokusy</th><th>Topy</th></tr></thead><tbody>';
    rankings.forEach((r, i) => {
      const rank = i + 1;
      let rankClass = rank <= 3 ? `rank-${rank}` : '';
      html += `<tr>
        <td><span class="rank-badge ${rankClass}">${rank}</span></td>
        <td><strong>${r.first_name} ${r.last_name}</strong></td>
        <td><strong style="color:var(--accent-light)">${r.totalPoints}</strong></td>
        <td>${r.totalAttempts}</td>
        <td>${r.totalTops}</td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    return html;
  }

  function setOverallPrintHeader() {
    const seasonSelect = document.getElementById('overallSeasonSelect');
    const catSelect = document.querySelector('#overallCatTabs .tab.active');
    let title = 'Celkové výsledky';
    if (seasonSelect.options[seasonSelect.selectedIndex]) {
      title = seasonSelect.options[seasonSelect.selectedIndex].textContent.trim();
    }
    if (catSelect) title += ` - ${(catSelect.textContent || '').trim()}`;
    const headerTitle = document.getElementById('printTitle');
    if (headerTitle) headerTitle.textContent = title;

    const now = new Date();
    const headerDate = document.getElementById('printDate');
    if (headerDate) headerDate.textContent = now.toLocaleDateString('cs-CZ') + ' ' + now.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  }

  document.getElementById('printOverallBtn').addEventListener('click', () => {
    setOverallPrintHeader();
    document.body.className = '';
    window.print();
  });

  const printOverallBoysBtn = document.getElementById('printOverallBoysBtn');
  if (printOverallBoysBtn) {
    printOverallBoysBtn.addEventListener('click', () => {
      setOverallPrintHeader();
      document.body.className = 'print-only-boys';
      window.print();
      setTimeout(() => document.body.className = '', 100);
    });
  }

  const printOverallGirlsBtn = document.getElementById('printOverallGirlsBtn');
  if (printOverallGirlsBtn) {
    printOverallGirlsBtn.addEventListener('click', () => {
      setOverallPrintHeader();
      document.body.className = 'print-only-girls';
      window.print();
      setTimeout(() => document.body.className = '', 100);
    });
  }

  // ==================== SEASONS ====================
  let editingSeasonId = null;

  async function loadSeasons() {
    try {
      const seasons = await api.get('/api/seasons');
      const list = document.getElementById('seasonsList');
      if (seasons.length === 0) {
        list.innerHTML = '<div class="empty-state"><p>Žádné série</p></div>';
        return;
      }
      list.innerHTML = seasons.map(s => `
        <div class="queue-item mb-8">
          <div>
            <div class="climber-name">${s.name}</div>
            <div class="text-muted text-xs">Přiřazených závodů: ${s.competitions.length}</div>
          </div>
          <div class="flex gap-8 items-center">
            <button class="btn btn-sm btn-ghost" onclick="editSeason(${s.id})">✏️ Upravit</button>
            <button class="btn btn-sm btn-danger" onclick="deleteSeason(${s.id})">🗑 Smazat</button>
          </div>
        </div>
      `).join('');
    } catch(err) {
      showToast(err.message, 'error');
    }
  }

  window.deleteSeason = async (id) => {
    if(!confirm('Smazat sérii? Závody zůstanou zachovány.')) return;
    try {
      await api.delete(`/api/seasons/${id}`);
      loadSeasons();
      showToast('Série smazána');
    } catch(err) {
      showToast(err.message, 'error');
    }
  };

  async function populateSeasonCompsCheckboxes(selectedIds = []) {
    const container = document.getElementById('seasonCompsCheckboxes');
    container.innerHTML = 'Načítání...';
    try {
      const comps = await api.get('/api/competitions');
      if (comps.length === 0) {
        container.innerHTML = '<p class="text-muted">Žádné závody k dispozici.</p>';
        return;
      }
      container.innerHTML = comps.map(c => `
        <label class="flex items-center gap-8" style="cursor:pointer">
          <input type="checkbox" value="${c.id}" ${selectedIds.includes(c.id) ? 'checked' : ''}>
          ${c.name} <span class="text-muted text-xs">(${c.date})</span>
        </label>
      `).join('');
    } catch(err) {
      container.innerHTML = '<p class="text-danger">Chyba</p>';
    }
  }

  document.getElementById('newSeasonBtn').addEventListener('click', () => {
    editingSeasonId = null;
    document.getElementById('seasonEditorTitle').textContent = 'Nová série';
    document.getElementById('seasonName').value = '';
    populateSeasonCompsCheckboxes([]);
    document.getElementById('seasonEditor').classList.remove('hidden');
  });

  window.editSeason = async (id) => {
    try {
      const seasons = await api.get('/api/seasons');
      const s = seasons.find(x => x.id === id);
      if(!s) return;
      editingSeasonId = id;
      document.getElementById('seasonEditorTitle').textContent = 'Upravit sérii';
      document.getElementById('seasonName').value = s.name;
      const compIds = s.competitions.map(c => c.id);
      await populateSeasonCompsCheckboxes(compIds);
      document.getElementById('seasonEditor').classList.remove('hidden');
    } catch(err) {
      showToast(err.message, 'error');
    }
  };

  document.getElementById('closeSeasonEditor').addEventListener('click', () => {
    document.getElementById('seasonEditor').classList.add('hidden');
  });
  document.getElementById('cancelSeasonBtn').addEventListener('click', () => {
    document.getElementById('seasonEditor').classList.add('hidden');
  });

  document.getElementById('saveSeasonBtn').addEventListener('click', async () => {
    const name = document.getElementById('seasonName').value.trim();
    if(!name) { showToast('Vyplňte název série', 'error'); return; }

    const selectedComps = [];
    document.querySelectorAll('#seasonCompsCheckboxes input:checked').forEach(cb => selectedComps.push(parseInt(cb.value)));

    try {
      if(editingSeasonId) {
        await api.put(`/api/seasons/${editingSeasonId}`, { name, competitions: selectedComps });
        showToast('Série uložena');
      } else {
        await api.post('/api/seasons', { name, competitions: selectedComps });
        showToast('Série vytvořena');
      }
      document.getElementById('seasonEditor').classList.add('hidden');
      loadSeasons();
    } catch(err) {
      showToast(err.message, 'error');
    }
  });

  // ==================== USERS ====================
  async function loadUsers() {
    try {
      const users = await api.get('/api/users');
      const list = document.getElementById('usersList');

      if (users.length === 0) {
        list.innerHTML = '<div class="empty-state"><p>Žádní uživatelé</p></div>';
        return;
      }

      list.innerHTML = '<div class="table-wrap"><table><thead><tr><th>E-mail</th><th>Jméno</th><th>Role</th><th>Heslo</th><th></th></tr></thead><tbody>' +
        users.map(u => `<tr>
          <td>${u.email}</td>
          <td>${u.name || '—'}</td>
          <td><span class="badge ${u.role === 'admin' ? 'badge-admin' : 'badge-recorder'}">${u.role === 'admin' ? 'Admin' : 'Zapisovač'}</span></td>
          <td>${u.has_password ? '<span class="text-success">✓</span>' : '<span class="text-warning">Nenastaveno</span>'}</td>
          <td>${u.id !== user.id ? `<button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id})">🗑</button>` : ''}</td>
        </tr>`).join('') +
        '</tbody></table></div>';
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  document.getElementById('addUserBtn').addEventListener('click', async () => {
    const email = document.getElementById('userEmail').value.trim();
    const name = document.getElementById('userName').value.trim();
    const role = document.getElementById('userRole').value;

    if (!email) {
      showToast('Zadejte e-mail', 'error');
      return;
    }

    try {
      await api.post('/api/users', { email, name, role });
      showToast(`Uživatel přidán (${email}). Musí si nastavit heslo.`);
      document.getElementById('userEmail').value = '';
      document.getElementById('userName').value = '';
      loadUsers();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  window.deleteUser = async (id) => {
    if (!confirm('Smazat uživatele?')) return;
    try {
      await api.delete(`/api/users/${id}`);
      loadUsers();
      showToast('Uživatel smazán');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // ==================== RECORDING (Embedded) ====================
  async function loadRecorder() {
    const embed = document.getElementById('recorderEmbed');
    embed.innerHTML = '<div class="loading"><div class="spinner"></div><p class="mt-8">Načítání zapisovacího rozhraní...</p></div>';

    // Load the recorder UI inline
    const script = document.createElement('script');
    script.src = 'js/recorder.js';
    // Signal that we're in embedded mode
    window.__recorderEmbedded = true;
    window.__recorderContainer = embed;

    // Remove old script if exists
    const old = document.querySelector('script[src="js/recorder.js"]');
    if (old) old.remove();

    document.body.appendChild(script);
  }

  // Initial load
  loadCompetitions();
});
