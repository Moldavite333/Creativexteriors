const agroStyles = document.createElement('link');
agroStyles.rel = 'stylesheet';
agroStyles.href = 'agro.css?v=20261007-02';
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
    manageButton.textContent = 'Add / Remove Accounts';
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
    <form id="agroManageForm" class="dialog-card agro-manage-card">
      <div class="dialog-heading">
        <div>
          <p class="eyebrow">AGRO</p>
          <h2 id="agroManageTitle">Round</h2>
        </div>
        <button id="agroManageClose" class="icon-btn" type="button" aria-label="Close">×</button>
      </div>
      <p id="agroManageCopy" class="dialog-copy">Choose the accounts for this round.</p>
      <div id="agroAccountChoices" class="agro-account-choices"></div>
      <p id="agroManageMessage" class="auth-message" role="status"></p>
      <button class="primary-btn wide" type="submit">Save Accounts</button>
    </form>
  `;

  document.body.appendChild(dialog);
  els.agroManageDialog = dialog;
  els.agroManageTitle = dialog.querySelector('#agroManageTitle');
  els.agroManageCopy = dialog.querySelector('#agroManageCopy');
  els.agroAccountChoices = dialog.querySelector('#agroAccountChoices');
  els.agroManageForm = dialog.querySelector('#agroManageForm');
  els.agroManageMessage = dialog.querySelector('#agroManageMessage');
  els.agroManageClose = dialog.querySelector('#agroManageClose');

  els.agroManageClose.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  els.agroManageForm.addEventListener('submit', saveAgroRoundAccounts);
}

function openAgroRoundManager(type, roundNumber) {
  const config = AGRO_TRACKERS[type];
  if (!config || (typeof canManageAll === 'function' && !canManageAll())) return;

  ensureAgroRoundManager();
  state.activeAgroAssignment = { type, roundNumber: Number(roundNumber) };

  els.agroManageTitle.textContent = `${config.label} · Round ${roundNumber}`;
  els.agroManageCopy.textContent = `Check every account that belongs in ${config.label} Round ${roundNumber}.`;
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
      `;
      els.agroAccountChoices.appendChild(label);
    });

  if (!state.accounts.length) {
    els.agroAccountChoices.innerHTML = '<div class="history-empty">No accounts exist yet.</div>';
  }

  els.agroManageDialog.showModal();
}

async function saveAgroRoundAccounts(event) {
  event.preventDefault();
  if (typeof canManageAll === 'function' && !canManageAll()) return;

  const assignment = state.activeAgroAssignment;
  const config = assignment ? AGRO_TRACKERS[assignment.type] : null;
  if (!config) return;

  const roundNumber = Number(assignment.roundNumber);
  if (roundNumber < 1 || roundNumber > config.rounds) return;

  const selected = new Set(
    [...els.agroAccountChoices.querySelectorAll('input[type="checkbox"]:checked')]
      .map(input => input.value)
  );

  const currentRows = (state[config.stateKey] || [])
    .filter(row => Number(row[config.roundField]) === roundNumber);
  const current = new Set(currentRows.map(row => row.account_id));

  const toAdd = [...selected].filter(accountId => !current.has(accountId));
  const toRemove = [...current].filter(accountId => !selected.has(accountId));

  els.agroManageMessage.textContent = 'Saving…';
  setSyncStatus('Saving…');

  if (toAdd.length) {
    const rows = toAdd.map(accountId => ({
      account_id: accountId,
      [config.roundField]: roundNumber,
      completed: false,
      updated_at: new Date().toISOString(),
      updated_by: state.session.user.id
    }));

    const { error } = await client.from(config.table).insert(rows);
    if (error) {
      console.error(error);
      els.agroManageMessage.textContent = error.message;
      setSyncStatus('Save failed', true);
      return;
    }
  }

  if (toRemove.length) {
    const { error } = await client
      .from(config.table)
      .delete()
      .eq(config.roundField, roundNumber)
      .in('account_id', toRemove);

    if (error) {
      console.error(error);
      els.agroManageMessage.textContent = error.message;
      setSyncStatus('Save failed', true);
      await loadData();
      return;
    }
  }

  await loadData();
  els.agroManageDialog.close();
}

document.querySelector('[data-tab="organics"]')?.addEventListener('click', renderAgro);

const renderWithAgro = render;
render = function() {
  renderWithAgro();
  renderAgro();
};

if (state.session) renderAgro();
