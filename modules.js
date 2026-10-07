const modulesStyles = document.createElement('link');
modulesStyles.rel = 'stylesheet';
modulesStyles.href = 'modules.css?v=20261007-01';
document.head.appendChild(modulesStyles);

const FALL_TASK_KEYS = new Set(['perennials', 'roses']);
state.colorSearch = '';
state.colorFilter = 'all';

Object.assign(els, {
  colorOverallPercent: document.getElementById('colorOverallPercent'),
  colorOverallBar: document.getElementById('colorOverallBar'),
  colorCompleteCount: document.getElementById('colorCompleteCount'),
  colorAccountCount: document.getElementById('colorAccountCount'),
  colorSearchInput: document.getElementById('colorSearchInput'),
  colorFilterSelect: document.getElementById('colorFilterSelect'),
  colorAccountsList: document.getElementById('colorAccountsList')
});

applicableTasks = function(account) {
  return TASKS.filter(task =>
    FALL_TASK_KEYS.has(task.key) &&
    account[`${task.key}Applicable`] !== false
  );
};

function fallCompletedAt(account) {
  if (!isComplete(account)) return null;
  const dates = applicableTasks(account)
    .map(task => account[`${task.key}CompletedAt`])
    .filter(Boolean)
    .map(value => new Date(value));
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map(date => date.getTime()))).toISOString();
}

openTaskDialog = function(account) {
  state.editingAccountId = account.id;
  els.taskDialogTitle.textContent = account.name;
  els.taskPerennials.checked = account.perennialsApplicable !== false;
  els.taskRoses.checked = account.rosesApplicable !== false;
  els.taskAnnuals.checked = account.annualsApplicable !== false;
  els.taskAnnuals.closest('label').hidden = true;
  els.taskFormMessage.textContent = '';
  els.taskDialog.showModal();
};

saveTaskApplicability = async function(accountId, selectedKeys) {
  const selectedFall = new Set([...selectedKeys].filter(key => FALL_TASK_KEYS.has(key)));
  if (!selectedFall.size) {
    els.taskFormMessage.textContent = 'Keep at least one Fall Cutbacks task for this property.';
    return false;
  }

  setSyncStatus('Saving…');
  const account = state.accounts.find(item => item.id === accountId);
  const results = await Promise.all(
    TASKS.filter(task => FALL_TASK_KEYS.has(task.key)).map(async task => {
      const workTypeId = workTypeIdForTask(task.key);
      if (!workTypeId) return { error: null };
      return client.from('account_progress').upsert({
        account_id: accountId,
        work_type_id: workTypeId,
        progress: Number(account?.[task.key] || 0),
        applicable: selectedFall.has(task.key),
        updated_at: new Date().toISOString(),
        updated_by: state.session.user.id
      }, { onConflict: 'account_id,work_type_id' });
    })
  );

  const error = results.find(result => result.error)?.error;
  if (error) {
    console.error(error);
    els.taskFormMessage.textContent = error.message;
    setSyncStatus('Save failed', true);
    return false;
  }

  await loadData();
  return true;
};

const roleAwareFallCard = buildAccountCard;
buildAccountCard = function(account) {
  const fragment = roleAwareFallCard(account);
  const card = fragment.querySelector('.account-card');
  if (!card) return fragment;

  card.querySelector('.task-block[data-task="annuals"]')?.remove();

  const percent = accountPercent(account);
  const complete = isComplete(account);
  const completedAt = fallCompletedAt(account);
  const tasks = applicableTasks(account);

  card.classList.toggle('complete', complete);
  const percentEl = card.querySelector('.account-percent');
  if (percentEl) percentEl.textContent = `${percent}%`;
  const statusEl = card.querySelector('.account-status');
  if (statusEl) {
    statusEl.textContent = complete
      ? `COMPLETE${completedAt ? ' · ' + formatDate(completedAt) : ''}`
      : `IN PROGRESS · ${tasks.length} ${tasks.length === 1 ? 'TASK' : 'TASKS'}`;
  }
  const bar = card.querySelector('.mini-progress-fill');
  if (bar) bar.style.width = `${percent}%`;

  return fragment;
};

renderCompletionHistory = function() {
  const groups = {
    perennials: state.accounts.filter(a => a.perennialsApplicable !== false && Number(a.perennials) === 100 && a.perennialsCompletedAt),
    roses: state.accounts.filter(a => a.rosesApplicable !== false && Number(a.roses) === 100 && a.rosesCompletedAt),
    full: state.accounts.filter(a => isComplete(a))
  };

  els.completionHistoryCard.hidden = state.accounts.length === 0;
  els.perennialCompleteCount.textContent = groups.perennials.length;
  els.annualCompleteCount.textContent = '0';
  els.roseCompleteCount.textContent = groups.roses.length;
  els.completionHistoryCount.textContent = groups.full.length;
  els.perennialHistoryList.innerHTML = historyRows(groups.perennials, 'perennialsCompletedAt');
  els.annualHistoryList.innerHTML = '';
  els.roseHistoryList.innerHTML = historyRows(groups.roses, 'rosesCompletedAt');
  els.fullHistoryList.innerHTML = groups.full.length
    ? [...groups.full]
        .sort((a,b) => new Date(fallCompletedAt(b) || 0) - new Date(fallCompletedAt(a) || 0))
        .map(a => `<div class="history-row"><span class="history-name">${escapeHtml(a.name)}</span><span class="history-date">${formatDate(fallCompletedAt(a))}</span></div>`)
        .join('')
    : '<div class="history-empty">None completed yet.</div>';
  els.completionHistoryList.hidden = !state.historyOpen;
  els.toggleHistoryBtn.textContent = state.historyOpen ? 'Hide history' : 'Show history';
};

function colorIsApplicable(account) {
  return account.annualsApplicable !== false;
}

function colorIsComplete(account) {
  return colorIsApplicable(account) && Number(account.annuals || 0) === 100;
}

function colorAccounts() {
  const q = state.colorSearch.trim().toLowerCase();
  return [...state.accounts]
    .filter(account => !q || account.name.toLowerCase().includes(q))
    .filter(account => {
      if (state.colorFilter === 'complete') return colorIsComplete(account);
      if (state.colorFilter === 'active') return colorIsApplicable(account) && !colorIsComplete(account);
      if (state.colorFilter === 'na') return !colorIsApplicable(account);
      return true;
    })
    .sort((a,b) => Number(colorIsComplete(a)) - Number(colorIsComplete(b)) || a.name.localeCompare(b.name));
}

async function setAnnualApplicable(account, applicable) {
  const workTypeId = workTypeIdForTask('annuals');
  if (!workTypeId) return;

  setSyncStatus('Saving…');
  const { error } = await client.from('account_progress').upsert({
    account_id: account.id,
    work_type_id: workTypeId,
    progress: Number(account.annuals || 0),
    applicable,
    updated_at: new Date().toISOString(),
    updated_by: state.session.user.id
  }, { onConflict: 'account_id,work_type_id' });

  if (error) {
    console.error(error);
    alert('Could not update Annual Pulls: ' + error.message);
    setSyncStatus('Save failed', true);
    return;
  }
  await loadData();
}

function buildColorCard(account) {
  const card = document.createElement('article');
  card.className = 'account-card color-card';
  const applicable = colorIsApplicable(account);
  const complete = colorIsComplete(account);
  const value = Number(account.annuals || 0);
  const writable = typeof canUpdateAccountUI === 'function' ? canUpdateAccountUI(account.id) : true;

  card.classList.toggle('complete', complete);
  card.innerHTML = `
    <div class="account-head">
      <div>
        <h2 class="account-name">${escapeHtml(account.name)}</h2>
        <span class="account-status">${applicable ? (complete ? `COMPLETE${account.annualsCompletedAt ? ' · ' + formatDate(account.annualsCompletedAt) : ''}` : 'ANNUAL PULLS') : 'N/A · NO ANNUAL PULLS'}</span>
      </div>
      <div class="account-head-actions">
        <div class="account-percent">${applicable ? value + '%' : 'N/A'}</div>
      </div>
    </div>
    <div class="mini-progress"><div class="mini-progress-fill" style="width:${applicable ? value : 0}%"></div></div>
  `;

  const actions = card.querySelector('.account-head-actions');

  if (typeof openPropertyNotes === 'function') {
    const notesButton = document.createElement('button');
    notesButton.type = 'button';
    notesButton.className = 'property-notes-btn';
    notesButton.textContent = 'Notes';
    notesButton.addEventListener('click', () => openPropertyNotes(account));
    actions.appendChild(notesButton);
  }

  if (applicable) {
    const task = document.createElement('div');
    task.className = 'task-block';
    task.innerHTML = `
      <div class="task-label-row">
        <div class="task-name-actions"><span>Annual Pulls</span></div>
        <strong class="task-percent">${value === 100 && account.annualsCompletedAt ? '100% · ' + formatDate(account.annualsCompletedAt) : value + '%'}</strong>
      </div>
      <div class="progress-buttons" role="group" aria-label="Annual pulls progress">
        <button type="button" data-value="0">0</button>
        <button type="button" data-value="25">25</button>
        <button type="button" data-value="50">50</button>
        <button type="button" data-value="100">100</button>
      </div>
    `;

    if (writable) {
      const naButton = document.createElement('button');
      naButton.type = 'button';
      naButton.className = 'task-na-btn';
      naButton.textContent = 'N/A';
      naButton.title = 'This property does not have Annual Pulls';
      naButton.addEventListener('click', () => setAnnualApplicable(account, false));
      task.querySelector('.task-name-actions').appendChild(naButton);
    }

    task.querySelectorAll('.progress-buttons button').forEach(button => {
      const buttonValue = Number(button.dataset.value);
      button.classList.toggle('active', buttonValue === value);
      button.disabled = !writable;
      button.addEventListener('click', () => setProgress(account.id, 'annuals', buttonValue));
    });

    card.appendChild(task);
  } else if (writable) {
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'secondary-btn color-restore-btn';
    restore.textContent = 'Restore Annual Pulls';
    restore.addEventListener('click', () => setAnnualApplicable(account, true));
    card.appendChild(restore);
  }

  return card;
}

function renderColor() {
  if (!els.colorAccountsList) return;

  const applicable = state.accounts.filter(colorIsApplicable);
  const complete = applicable.filter(colorIsComplete);
  const percent = applicable.length
    ? Math.round(applicable.reduce((sum, account) => sum + Number(account.annuals || 0), 0) / applicable.length)
    : 0;

  els.colorOverallPercent.textContent = `${percent}%`;
  els.colorOverallBar.style.width = `${percent}%`;
  els.colorCompleteCount.textContent = complete.length;
  els.colorAccountCount.textContent = applicable.length;

  const accounts = colorAccounts();
  els.colorAccountsList.innerHTML = '';
  accounts.forEach(account => els.colorAccountsList.appendChild(buildColorCard(account)));

  if (!accounts.length) {
    els.colorAccountsList.innerHTML = '<div class="empty-state"><h2>No matches</h2><p>Try a different search or filter.</p></div>';
  }
}

if (els.colorSearchInput) {
  els.colorSearchInput.addEventListener('input', event => {
    state.colorSearch = event.target.value;
    renderColor();
  });
}

if (els.colorFilterSelect) {
  els.colorFilterSelect.addEventListener('change', event => {
    state.colorFilter = event.target.value;
    renderColor();
  });
}

document.querySelector('[data-tab="color"]')?.addEventListener('click', renderColor);

const renderWithSeparatedModules = render;
render = function() {
  renderWithSeparatedModules();
  renderColor();
};

if (state.session) {
  render();
}
