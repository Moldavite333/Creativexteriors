const agroStyles = document.createElement('link');
agroStyles.rel = 'stylesheet';
agroStyles.href = 'agro.css?v=20261007-01';
document.head.appendChild(agroStyles);

state.activeFertilizationApplication = null;

Object.assign(els, {
  fertilizationApplications: document.getElementById('fertilizationApplications'),
  fertilizationManageDialog: null,
  fertilizationManageTitle: null,
  fertilizationAccountChoices: null,
  fertilizationManageForm: null,
  fertilizationManageMessage: null,
  fertilizationManageClose: null
});

function fertilizationRows(applicationNumber) {
  const accountMap = new Map(state.accounts.map(account => [account.id, account]));
  return (state.fertilizationApplications || [])
    .filter(row => Number(row.application_number) === Number(applicationNumber))
    .map(row => ({ ...row, account: accountMap.get(row.account_id) }))
    .filter(row => row.account)
    .sort((a, b) =>
      Number(a.completed) - Number(b.completed) ||
      a.account.name.localeCompare(b.account.name)
    );
}

function fertilizationProgress(applicationNumber) {
  const rows = fertilizationRows(applicationNumber);
  const completed = rows.filter(row => row.completed).length;
  return { rows, completed, total: rows.length };
}

function fertilizationApplicationCard(applicationNumber) {
  const { rows, completed, total } = fertilizationProgress(applicationNumber);
  const card = document.createElement('article');
  card.className = 'fert-application-card';

  const percent = total ? Math.round((completed / total) * 100) : 0;
  card.innerHTML = `
    <div class="fert-application-head">
      <div>
        <p class="eyebrow">FERTILIZATION ROUND</p>
        <h4>Application ${applicationNumber}</h4>
        <span class="fert-application-count">${completed} of ${total} complete</span>
      </div>
      <div class="fert-application-actions"></div>
    </div>
    <div class="mini-progress" aria-hidden="true">
      <div class="mini-progress-fill" style="width:${percent}%"></div>
    </div>
    <div class="fert-account-list"></div>
  `;

  const actions = card.querySelector('.fert-application-actions');
  if (typeof canManageAll === 'function' && canManageAll()) {
    const manageButton = document.createElement('button');
    manageButton.type = 'button';
    manageButton.className = 'secondary-btn fert-manage-btn';
    manageButton.textContent = 'Add / Remove Accounts';
    manageButton.addEventListener('click', () => openFertilizationManager(applicationNumber));
    actions.appendChild(manageButton);
  }

  const list = card.querySelector('.fert-account-list');
  if (!rows.length) {
    list.innerHTML = '<div class="history-empty">No accounts added to this application yet.</div>';
    return card;
  }

  rows.forEach(row => {
    const writable = typeof canUpdateAccountUI === 'function'
      ? canUpdateAccountUI(row.account_id)
      : true;

    const item = document.createElement('label');
    item.className = 'fert-account-row';
    item.classList.toggle('complete', !!row.completed);
    item.innerHTML = `
      <input type="checkbox" ${row.completed ? 'checked' : ''} ${writable ? '' : 'disabled'} />
      <span class="fert-account-name">${escapeHtml(row.account.name)}</span>
      <span class="fert-account-status">${row.completed ? (row.completed_at ? 'Done · ' + formatDate(row.completed_at) : 'Done') : 'Open'}</span>
    `;

    const checkbox = item.querySelector('input');
    checkbox.addEventListener('change', () => setFertilizationDone(row, checkbox.checked));
    list.appendChild(item);
  });

  return card;
}

function renderFertilization() {
  if (!els.fertilizationApplications) return;
  els.fertilizationApplications.innerHTML = '';
  [1, 2, 3, 4].forEach(applicationNumber => {
    els.fertilizationApplications.appendChild(fertilizationApplicationCard(applicationNumber));
  });
}

async function setFertilizationDone(row, completed) {
  if (!row) return;
  if (typeof canUpdateAccountUI === 'function' && !canUpdateAccountUI(row.account_id)) return;

  const local = (state.fertilizationApplications || []).find(item => item.id === row.id);
  if (local) {
    local.completed = completed;
    local.completed_at = completed ? new Date().toISOString() : null;
  }
  renderFertilization();
  setSyncStatus('Saving…');

  const updates = {
    completed,
    completed_at: completed ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
    updated_by: state.session.user.id
  };

  const { error } = await client
    .from('fertilization_applications')
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

function ensureFertilizationManager() {
  if (els.fertilizationManageDialog) return;

  const dialog = document.createElement('dialog');
  dialog.className = 'fert-manage-dialog';
  dialog.innerHTML = `
    <form id="fertilizationManageForm" class="dialog-card fert-manage-card">
      <div class="dialog-heading">
        <div>
          <p class="eyebrow">FERTILIZATION</p>
          <h2 id="fertilizationManageTitle">Application</h2>
        </div>
        <button id="fertilizationManageClose" class="icon-btn" type="button" aria-label="Close">×</button>
      </div>
      <p class="dialog-copy">Check every account that belongs in this fertilization application.</p>
      <div id="fertilizationAccountChoices" class="fert-account-choices"></div>
      <p id="fertilizationManageMessage" class="auth-message" role="status"></p>
      <button class="primary-btn wide" type="submit">Save Accounts</button>
    </form>
  `;

  document.body.appendChild(dialog);
  els.fertilizationManageDialog = dialog;
  els.fertilizationManageTitle = dialog.querySelector('#fertilizationManageTitle');
  els.fertilizationAccountChoices = dialog.querySelector('#fertilizationAccountChoices');
  els.fertilizationManageForm = dialog.querySelector('#fertilizationManageForm');
  els.fertilizationManageMessage = dialog.querySelector('#fertilizationManageMessage');
  els.fertilizationManageClose = dialog.querySelector('#fertilizationManageClose');

  els.fertilizationManageClose.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  els.fertilizationManageForm.addEventListener('submit', saveFertilizationAccounts);
}

function openFertilizationManager(applicationNumber) {
  if (typeof canManageAll === 'function' && !canManageAll()) return;
  ensureFertilizationManager();

  state.activeFertilizationApplication = Number(applicationNumber);
  els.fertilizationManageTitle.textContent = `Application ${applicationNumber}`;
  els.fertilizationManageMessage.textContent = '';

  const assigned = new Set(
    (state.fertilizationApplications || [])
      .filter(row => Number(row.application_number) === Number(applicationNumber))
      .map(row => row.account_id)
  );

  els.fertilizationAccountChoices.innerHTML = '';
  [...state.accounts]
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(account => {
      const label = document.createElement('label');
      label.className = 'fert-choice-row';
      label.innerHTML = `
        <input type="checkbox" value="${account.id}" ${assigned.has(account.id) ? 'checked' : ''} />
        <span>${escapeHtml(account.name)}</span>
      `;
      els.fertilizationAccountChoices.appendChild(label);
    });

  if (!state.accounts.length) {
    els.fertilizationAccountChoices.innerHTML = '<div class="history-empty">No accounts exist yet.</div>';
  }

  els.fertilizationManageDialog.showModal();
}

async function saveFertilizationAccounts(event) {
  event.preventDefault();
  if (typeof canManageAll === 'function' && !canManageAll()) return;

  const applicationNumber = Number(state.activeFertilizationApplication);
  if (![1, 2, 3, 4].includes(applicationNumber)) return;

  const selected = new Set(
    [...els.fertilizationAccountChoices.querySelectorAll('input[type="checkbox"]:checked')]
      .map(input => input.value)
  );

  const currentRows = (state.fertilizationApplications || [])
    .filter(row => Number(row.application_number) === applicationNumber);
  const current = new Set(currentRows.map(row => row.account_id));

  const toAdd = [...selected].filter(accountId => !current.has(accountId));
  const toRemove = [...current].filter(accountId => !selected.has(accountId));

  els.fertilizationManageMessage.textContent = 'Saving…';
  setSyncStatus('Saving…');

  if (toAdd.length) {
    const rows = toAdd.map(accountId => ({
      account_id: accountId,
      application_number: applicationNumber,
      completed: false,
      updated_at: new Date().toISOString(),
      updated_by: state.session.user.id
    }));
    const { error } = await client.from('fertilization_applications').insert(rows);
    if (error) {
      console.error(error);
      els.fertilizationManageMessage.textContent = error.message;
      setSyncStatus('Save failed', true);
      return;
    }
  }

  if (toRemove.length) {
    const { error } = await client
      .from('fertilization_applications')
      .delete()
      .eq('application_number', applicationNumber)
      .in('account_id', toRemove);

    if (error) {
      console.error(error);
      els.fertilizationManageMessage.textContent = error.message;
      setSyncStatus('Save failed', true);
      await loadData();
      return;
    }
  }

  await loadData();
  els.fertilizationManageDialog.close();
}

document.querySelector('[data-tab="organics"]')?.addEventListener('click', renderFertilization);

const renderWithAgro = render;
render = function() {
  renderWithAgro();
  renderFertilization();
};

if (state.session) renderFertilization();
