const agroStyles = document.createElement('link');
agroStyles.rel = 'stylesheet';
agroStyles.href = 'agro.css?v=20261007-orange01';
document.head.appendChild(agroStyles);

state.activeAgroAssignment = null;

const AGRO_TRACKERS = {
  fertilization: {
    label: 'Fertilization',
    stateKey: 'fertilizationApplications',
    table: 'fertilization_applications',
    roundField: 'application_number',
    rounds: 4,
    containerId: 'fertilizationRounds'
  },
  aeration: {
    label: 'Aeration',
    stateKey: 'aerationRounds',
    table: 'aeration_rounds',
    roundField: 'round_number',
    rounds: 2,
    containerId: 'aerationRounds'
  }
};

Object.assign(els, {
  fertilizationRounds: document.getElementById('fertilizationRounds'),
  aerationRounds: document.getElementById('aerationRounds'),
  agroManageDialog: null,
  agroManageTitle: null,
  agroManageCopy: null,
  agroAccountChoices: null,
  agroManageForm: null,
  agroManageMessage: null,
  agroManageClose: null
});

function agroTrackerRows(config, roundNumber) {
  const accountMap = new Map(state.accounts.map(account => [account.id, account]));
  return (state[config.stateKey] || [])
    .filter(row => Number(row[config.roundField]) === Number(roundNumber))
    .map(row => ({ ...row, account: accountMap.get(row.account_id) }))
    .filter(row => row.account)
    .sort((a, b) =>
      Number(a.completed) - Number(b.completed) ||
      a.account.name.localeCompare(b.account.name)
    );
}

function agroTrackerProgress(config, roundNumber) {
  const rows = agroTrackerRows(config, roundNumber);
  const completed = rows.filter(row => row.completed).length;
  return { rows, completed, total: rows.length };
}

function agroRoundCard(type, roundNumber) {
  const config = AGRO_TRACKERS[type];
  const { rows, completed, total } = agroTrackerProgress(config, roundNumber);
  const percent = total ? Math.round((completed / total) * 100) : 0;

  const card = document.createElement('article');
  card.className = 'agro-round-card';
  card.innerHTML = `
    <div class="agro-round-head">
      <div>
        <p class="eyebrow">${escapeHtml(config.label.toUpperCase())}</p>
        <h4>Round ${roundNumber}</h4>
        <span class="agro-round-count">${completed} of ${total} complete</span>
      </div>
      <div class="agro-round-actions"></div>
    </div>
    <div class="mini-progress" aria-hidden="true">
      <div class="mini-progress-fill" style="width:${percent}%"></div>
    </div>
    <div class="agro-account-list"></div>
  `;

  const actions = card.querySelector('.agro-round-actions');
  if (typeof canManageAll === 'function' && canManageAll()) {
    const manageButton = document.createElement('button');
    manageButton.type = 'button';
    manageButton.className = 'secondary-btn agro-manage-btn';
    manageButton.textContent = 'Choose Accounts';
    manageButton.addEventListener('click', () => openAgroRoundManager(type, roundNumber));
    actions.appendChild(manageButton);
  }

  const list = card.querySelector('.agro-account-list');
  if (!rows.length) {
    list.innerHTML = `<div class="history-empty">No accounts added to ${escapeHtml(config.label)} Round ${roundNumber} yet.</div>`;
    return card;
  }

  rows.forEach(row => {
    const writable = typeof canUpdateAccountUI === 'function'
      ? canUpdateAccountUI(row.account_id)
      : true;

    const item = document.createElement('label');
    item.className = 'agro-account-row';
    item.classList.toggle('complete', !!row.completed);
    item.innerHTML = `
      <input type="checkbox" ${row.completed ? 'checked' : ''} ${writable ? '' : 'disabled'} />
      <span class="agro-account-name">${escapeHtml(row.account.name)}</span>
      <span class="agro-account-status">${row.completed
        ? (row.completed_at ? 'Done · ' + formatDate(row.completed_at) : 'Done')
        : 'Open'}</span>
    `;

    item.querySelector('input').addEventListener('change', event => {
      setAgroRoundDone(type, row, event.target.checked);
    });

    list.appendChild(item);
  });

  return card;
}

function renderAgroTracker(type) {
  const config = AGRO_TRACKERS[type];
  const container = document.getElementById(config.containerId);
  if (!container) return;

  container.innerHTML = '';
  for (let roundNumber = 1; roundNumber <= config.rounds; roundNumber += 1) {
    container.appendChild(agroRoundCard(type, roundNumber));
  }
}

function renderAgro() {
  renderAgroTracker('fertilization');
  renderAgroTracker('aeration');
}

async function setAgroRoundDone(type, row, completed) {
  const config = AGRO_TRACKERS[type];
  if (!config || !row) return;
  if (typeof canUpdateAccountUI === 'function' && !canUpdateAccountUI(row.account_id)) return;

  const local = (state[config.stateKey] || []).find(item => item.id === row.id);
  if (local) {
    local.completed = completed;
    local.completed_at = completed ? new Date().toISOString() : null;
  }

  renderAgroTracker(type);
  setSyncStatus('Saving…');

  const updates = {
    completed,
    completed_at: completed ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
    updated_by: state.session.user.id
  };

  const { error } = await client
    .from(config.table)
    .update(updates)
    .eq('id', row.id);

  if (error) {
    console.error(error);
    setSyncStatus('Save failed', true);
    await loadData();
    return;
  }

  setSyncStatus('Live sync on');
}

function ensureAgroRoundManager() {
  if (els.agroManageDialog) return;

  const dialog = document.createElement('dialog');
  dialog.className = 'agro-manage-dialog';
  dialog.innerHTML = `
    <div class="dialog-card agro-manage-card">
      <div class="dialog-heading">
        <div>
          <p class="eyebrow">AGRO</p>
          <h2 id="agroManageTitle">Round</h2>
        </div>
        <button id="agroManageClose" class="icon-btn" type="button" aria-label="Close">×</button>
      </div>
      <p id="agroManageCopy" class="dialog-copy">Choose the accounts for this round. Changes save immediately.</p>
      <div id="agroAccountChoices" class="agro-account-choices"></div>
      <p id="agroManageMessage" class="auth-message" role="status"></p>
      <button id="agroManageDone" class="primary-btn wide" type="button">Done</button>
    </div>
  `;

  document.body.appendChild(dialog);
  els.agroManageDialog = dialog;
  els.agroManageTitle = dialog.querySelector('#agroManageTitle');
  els.agroManageCopy = dialog.querySelector('#agroManageCopy');
  els.agroAccountChoices = dialog.querySelector('#agroAccountChoices');
  els.agroManageMessage = dialog.querySelector('#agroManageMessage');
  els.agroManageClose = dialog.querySelector('#agroManageClose');

  els.agroManageClose.addEventListener('click', () => dialog.close());
  dialog.querySelector('#agroManageDone')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
}

function openAgroRoundManager(type, roundNumber) {
  const config = AGRO_TRACKERS[type];
  if (!config || (typeof canManageAll === 'function' && !canManageAll())) return;

  ensureAgroRoundManager();
  state.activeAgroAssignment = { type, roundNumber: Number(roundNumber) };

  els.agroManageTitle.textContent = `${config.label} · Round ${roundNumber}`;
  els.agroManageCopy.textContent = `Click the accounts that belong in ${config.label} Round ${roundNumber}. They are added or removed immediately.`;
  els.agroManageMessage.textContent = '';

  const assigned = new Set(
    (state[config.stateKey] || [])
      .filter(row => Number(row[config.roundField]) === Number(roundNumber))
      .map(row => row.account_id)
  );

  els.agroAccountChoices.innerHTML = '';
  [...state.accounts]
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(account => {
      const label = document.createElement('label');
      label.className = 'agro-choice-row';
      label.innerHTML = `
        <input type="checkbox" value="${account.id}" ${assigned.has(account.id) ? 'checked' : ''} />
        <span>${escapeHtml(account.name)}</span>
        <span class="agro-choice-state">${assigned.has(account.id) ? 'Added' : ''}</span>
      `;

      const checkbox = label.querySelector('input');
      checkbox.addEventListener('change', () => {
        setAgroRoundAssignment(type, roundNumber, account, checkbox.checked, label);
      });

      els.agroAccountChoices.appendChild(label);
    });

  if (!state.accounts.length) {
    els.agroAccountChoices.innerHTML = '<div class="history-empty">No accounts exist yet.</div>';
  }

  els.agroManageDialog.showModal();
}

async function setAgroRoundAssignment(type, roundNumber, account, assigned, label) {
  const config = AGRO_TRACKERS[type];
  if (!config || !account) return;
  if (typeof canManageAll === 'function' && !canManageAll()) return;

  const checkbox = label?.querySelector('input');
  const stateLabel = label?.querySelector('.agro-choice-state');
  if (checkbox) checkbox.disabled = true;
  if (stateLabel) stateLabel.textContent = 'Saving…';
  els.agroManageMessage.textContent = '';

  try {
    if (assigned) {
      const row = {
        account_id: account.id,
        [config.roundField]: Number(roundNumber),
        completed: false,
        updated_at: new Date().toISOString(),
        updated_by: state.session.user.id
      };

      const { data, error } = await client
        .from(config.table)
        .upsert(row, { onConflict: `account_id,${config.roundField}` })
        .select('id,account_id,' + config.roundField + ',completed,completed_at,updated_at,updated_by')
        .single();

      if (error) throw error;

      const existingIndex = (state[config.stateKey] || []).findIndex(item =>
        item.account_id === account.id &&
        Number(item[config.roundField]) === Number(roundNumber)
      );

      if (existingIndex >= 0) state[config.stateKey][existingIndex] = data;
      else state[config.stateKey].push(data);

      if (stateLabel) stateLabel.textContent = 'Added';
      els.agroManageMessage.textContent = `${account.name} added to ${config.label} Round ${roundNumber}.`;
    } else {
      const { error } = await client
        .from(config.table)
        .delete()
        .eq('account_id', account.id)
        .eq(config.roundField, Number(roundNumber));

      if (error) throw error;

      state[config.stateKey] = (state[config.stateKey] || []).filter(item =>
        !(item.account_id === account.id &&
          Number(item[config.roundField]) === Number(roundNumber))
      );

      if (stateLabel) stateLabel.textContent = '';
      els.agroManageMessage.textContent = `${account.name} removed from ${config.label} Round ${roundNumber}.`;
    }

    renderAgroTracker(type);
    setSyncStatus('Live sync on');
  } catch (error) {
    console.error(error);
    if (checkbox) checkbox.checked = !assigned;
    if (stateLabel) stateLabel.textContent = !assigned ? 'Added' : '';
    els.agroManageMessage.textContent = 'Could not update this round: ' + (error.message || 'Unknown error');
    setSyncStatus('Save failed', true);
  } finally {
    if (checkbox) checkbox.disabled = false;
  }
}

document.querySelector('[data-tab="organics"]')?.addEventListener('click', renderAgro);

const renderWithAgro = render;
render = function() {
  renderWithAgro();
  renderAgro();
};

if (state.session) renderAgro();
