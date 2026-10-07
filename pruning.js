const pruningStyles = document.createElement('link');
pruningStyles.rel = 'stylesheet';
pruningStyles.href = 'pruning.css?v=20261007-01';
document.head.appendChild(pruningStyles);

const PRUNING_YEAR = new Date().getFullYear();
state.pruningSearch = '';
state.pruningFilter = 'all';
state.activePruningAccountId = null;

Object.assign(els, {
  pruningContractHours: document.getElementById('pruningContractHours'),
  pruningUsedHours: document.getElementById('pruningUsedHours'),
  pruningRemainingHours: document.getElementById('pruningRemainingHours'),
  pruningPropertyCount: document.getElementById('pruningPropertyCount'),
  pruningSearchInput: document.getElementById('pruningSearchInput'),
  pruningFilterSelect: document.getElementById('pruningFilterSelect'),
  pruningAccountsList: document.getElementById('pruningAccountsList'),
  pruningContractDialog: null,
  pruningContractForm: null,
  pruningContractTitle: null,
  pruningInitialHours: null,
  pruningAdditionalHours: null,
  pruningContractNotes: null,
  pruningContractMessage: null,
  pruningVisitDialog: null,
  pruningVisitForm: null,
  pruningVisitTitle: null,
  pruningVisitDate: null,
  pruningVisitHours: null,
  pruningVisitNotes: null,
  pruningVisitMessage: null
});

function pruningHours(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0';
  return Number.isInteger(number) ? String(number) : number.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function pruningContractFor(accountId) {
  return (state.pruningContracts || []).find(contract =>
    contract.account_id === accountId &&
    Number(contract.contract_year) === PRUNING_YEAR
  ) || null;
}

function pruningVisitsFor(contractId) {
  return (state.pruningVisits || [])
    .filter(visit => visit.contract_id === contractId)
    .sort((a, b) => {
      if (a.visit_type !== b.visit_type) return a.visit_type === 'initial' ? -1 : 1;
      return Number(a.sequence_number) - Number(b.sequence_number);
    });
}

function pruningMetrics(account) {
  const contract = pruningContractFor(account.id);
  if (!contract) {
    return {
      contract: null,
      visits: [],
      initialHours: 0,
      additionalHours: 0,
      totalHours: 0,
      usedHours: 0,
      remainingHours: 0
    };
  }

  const visits = pruningVisitsFor(contract.id);
  const initialHours = Number(contract.initial_hours || 0);
  const additionalHours = Number(contract.additional_hours || 0);
  const totalHours = initialHours + additionalHours;
  const usedHours = visits.reduce((sum, visit) => sum + Number(visit.hours_used || 0), 0);

  return {
    contract,
    visits,
    initialHours,
    additionalHours,
    totalHours,
    usedHours,
    remainingHours: totalHours - usedHours
  };
}

function pruningPortfolioMetrics() {
  return state.accounts.reduce((totals, account) => {
    const metrics = pruningMetrics(account);
    if (!metrics.contract) return totals;
    totals.contract += metrics.totalHours;
    totals.used += metrics.usedHours;
    totals.remaining += metrics.remainingHours;
    totals.properties += 1;
    return totals;
  }, { contract: 0, used: 0, remaining: 0, properties: 0 });
}

function pruningFilteredAccounts() {
  const q = state.pruningSearch.trim().toLowerCase();

  return [...state.accounts]
    .filter(account => !q || account.name.toLowerCase().includes(q))
    .filter(account => {
      const metrics = pruningMetrics(account);
      if (state.pruningFilter === 'configured') return !!metrics.contract;
      if (state.pruningFilter === 'remaining') return !!metrics.contract && metrics.remainingHours > 0;
      if (state.pruningFilter === 'over') return !!metrics.contract && metrics.remainingHours < 0;
      if (state.pruningFilter === 'unset') return !metrics.contract;
      return true;
    })
    .sort((a, b) => {
      const aMetrics = pruningMetrics(a);
      const bMetrics = pruningMetrics(b);
      if (!!aMetrics.contract !== !!bMetrics.contract) return aMetrics.contract ? -1 : 1;
      if (aMetrics.remainingHours < 0 !== (bMetrics.remainingHours < 0)) return aMetrics.remainingHours < 0 ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

function pruningLedgerRows(metrics) {
  const { contract, visits, initialHours, totalHours } = metrics;
  if (!contract) return '';

  const initial = visits.find(visit => visit.visit_type === 'initial');
  const rows = [];

  if (initial) {
    const used = Number(initial.hours_used || 0);
    rows.push({
      id: initial.id,
      label: 'Initial Prune',
      date: initial.work_date,
      start: initialHours,
      used,
      remaining: initialHours - used,
      notes: initial.notes || ''
    });
  } else {
    rows.push({
      id: null,
      label: 'Initial Prune',
      date: null,
      start: initialHours,
      used: null,
      remaining: initialHours,
      notes: ''
    });
  }

  let cumulativeUsed = initial ? Number(initial.hours_used || 0) : 0;
  const additional = visits
    .filter(visit => visit.visit_type === 'additional')
    .sort((a, b) => Number(a.sequence_number) - Number(b.sequence_number));

  additional.forEach(visit => {
    const used = Number(visit.hours_used || 0);
    const start = totalHours - cumulativeUsed;
    cumulativeUsed += used;
    rows.push({
      id: visit.id,
      label: `Additional Prune #${visit.sequence_number}`,
      date: visit.work_date,
      start,
      used,
      remaining: start - used,
      notes: visit.notes || ''
    });
  });

  return rows.map(row => `
    <div class="pruning-ledger-row">
      <div class="pruning-ledger-main">
        <strong>${escapeHtml(row.label)}</strong>
        <span>${row.date ? formatDate(row.date + 'T12:00:00') : 'Not logged yet'}</span>
        ${row.notes ? `<p>${escapeHtml(row.notes)}</p>` : ''}
      </div>
      <div class="pruning-ledger-number"><span>Start</span><strong>${pruningHours(row.start)}</strong></div>
      <div class="pruning-ledger-number"><span>Used</span><strong>${row.used === null ? '—' : pruningHours(row.used)}</strong></div>
      <div class="pruning-ledger-number ${row.remaining < 0 ? 'over' : ''}"><span>Left</span><strong>${pruningHours(row.remaining)}</strong></div>
      ${row.id && typeof canUpdateAccountUI === 'function' && canUpdateAccountUI(contract.account_id)
        ? `<button class="pruning-delete-visit" type="button" data-visit-id="${row.id}" aria-label="Remove ${escapeHtml(row.label)}">×</button>`
        : '<span></span>'}
    </div>
  `).join('');
}

function buildPruningCard(account) {
  const metrics = pruningMetrics(account);
  const writable = typeof canUpdateAccountUI === 'function' ? canUpdateAccountUI(account.id) : true;
  const manager = typeof canManageAll === 'function' ? canManageAll() : true;
  const card = document.createElement('article');
  card.className = 'pruning-account-card';
  card.classList.toggle('over-budget', metrics.contract && metrics.remainingHours < 0);

  if (!metrics.contract) {
    card.innerHTML = `
      <div class="pruning-account-head">
        <div>
          <h3>${escapeHtml(account.name)}</h3>
          <span class="pruning-status">No ${PRUNING_YEAR} pruning hours loaded</span>
        </div>
        ${manager ? '<button class="secondary-btn pruning-contract-btn" type="button">Set Contract Hours</button>' : ''}
      </div>
    `;
    card.querySelector('.pruning-contract-btn')?.addEventListener('click', () => openPruningContractDialog(account));
    return card;
  }

  const usedPercent = metrics.totalHours > 0
    ? Math.max(0, Math.min(100, Math.round((metrics.usedHours / metrics.totalHours) * 100)))
    : 0;
  const initialVisit = metrics.visits.find(visit => visit.visit_type === 'initial');
  const nextAdditional = metrics.visits
    .filter(visit => visit.visit_type === 'additional')
    .reduce((max, visit) => Math.max(max, Number(visit.sequence_number || 0)), 0) + 1;

  card.innerHTML = `
    <div class="pruning-account-head">
      <div>
        <h3>${escapeHtml(account.name)}</h3>
        <span class="pruning-status">${metrics.remainingHours < 0
          ? `OVER BY ${pruningHours(Math.abs(metrics.remainingHours))} HRS`
          : `${pruningHours(metrics.remainingHours)} HRS REMAINING`}</span>
      </div>
      <div class="pruning-card-actions">
        ${manager ? '<button class="secondary-btn pruning-contract-btn" type="button">Edit Contract</button>' : ''}
        ${writable ? `<button class="primary-btn pruning-log-btn" type="button">${initialVisit ? 'Log Return Visit' : 'Log Initial Prune'}</button>` : ''}
      </div>
    </div>

    <div class="pruning-hour-summary">
      <div><span>Total Contract</span><strong>${pruningHours(metrics.totalHours)}</strong><small>Initial ${pruningHours(metrics.initialHours)} + Additional ${pruningHours(metrics.additionalHours)}</small></div>
      <div><span>Used</span><strong>${pruningHours(metrics.usedHours)}</strong></div>
      <div class="${metrics.remainingHours < 0 ? 'over' : ''}"><span>Remaining</span><strong>${pruningHours(metrics.remainingHours)}</strong></div>
    </div>

    <div class="mini-progress pruning-progress" aria-hidden="true">
      <div class="mini-progress-fill" style="width:${usedPercent}%"></div>
    </div>

    <div class="pruning-ledger">
      <div class="pruning-ledger-label">VISIT LEDGER</div>
      ${pruningLedgerRows(metrics)}
    </div>
  `;

  card.querySelector('.pruning-contract-btn')?.addEventListener('click', () => openPruningContractDialog(account));
  card.querySelector('.pruning-log-btn')?.addEventListener('click', () => {
    openPruningVisitDialog(account, initialVisit ? 'additional' : 'initial', nextAdditional);
  });
  card.querySelectorAll('.pruning-delete-visit').forEach(button => {
    button.addEventListener('click', () => deletePruningVisit(button.dataset.visitId, account.name));
  });

  return card;
}

function renderPruning() {
  if (!els.pruningAccountsList) return;

  const totals = pruningPortfolioMetrics();
  els.pruningContractHours.textContent = pruningHours(totals.contract);
  els.pruningUsedHours.textContent = pruningHours(totals.used);
  els.pruningRemainingHours.textContent = pruningHours(totals.remaining);
  els.pruningRemainingHours.classList.toggle('over', totals.remaining < 0);
  els.pruningPropertyCount.textContent = totals.properties;

  const accounts = pruningFilteredAccounts();
  els.pruningAccountsList.innerHTML = '';
  accounts.forEach(account => els.pruningAccountsList.appendChild(buildPruningCard(account)));

  if (!accounts.length) {
    els.pruningAccountsList.innerHTML = '<div class="empty-state"><h2>No pruning accounts found</h2><p>Try a different search or filter.</p></div>';
  }
}

function ensurePruningContractDialog() {
  if (els.pruningContractDialog) return;

  const dialog = document.createElement('dialog');
  dialog.className = 'pruning-dialog';
  dialog.innerHTML = `
    <form id="pruningContractForm" class="dialog-card pruning-dialog-card">
      <div class="dialog-heading">
        <div><p class="eyebrow">PRUNING CONTRACT</p><h2 id="pruningContractTitle">Contract Hours</h2></div>
        <button class="icon-btn" type="button" data-close aria-label="Close">×</button>
      </div>
      <p class="dialog-copy">Load the hours already sold in the annual contract. Unused Initial Prune hours roll forward into the return-visit bank.</p>
      <div class="pruning-form-grid">
        <label>Initial Prune Hours<input id="pruningInitialHours" type="number" min="0" step="0.25" required /></label>
        <label>Additional Prune Hours<input id="pruningAdditionalHours" type="number" min="0" step="0.25" required /></label>
      </div>
      <div class="pruning-contract-total">Total Contract Hours: <strong id="pruningContractTotalPreview">0</strong></div>
      <label>Contract notes<textarea id="pruningContractNotes" rows="3" placeholder="Optional notes about the pruning agreement"></textarea></label>
      <p id="pruningContractMessage" class="auth-message" role="status"></p>
      <button class="primary-btn wide" type="submit">Save Contract Hours</button>
    </form>
  `;

  document.body.appendChild(dialog);
  els.pruningContractDialog = dialog;
  els.pruningContractForm = dialog.querySelector('#pruningContractForm');
  els.pruningContractTitle = dialog.querySelector('#pruningContractTitle');
  els.pruningInitialHours = dialog.querySelector('#pruningInitialHours');
  els.pruningAdditionalHours = dialog.querySelector('#pruningAdditionalHours');
  els.pruningContractNotes = dialog.querySelector('#pruningContractNotes');
  els.pruningContractMessage = dialog.querySelector('#pruningContractMessage');
  const totalPreview = dialog.querySelector('#pruningContractTotalPreview');

  const updatePreview = () => {
    totalPreview.textContent = pruningHours(Number(els.pruningInitialHours.value || 0) + Number(els.pruningAdditionalHours.value || 0));
  };

  els.pruningInitialHours.addEventListener('input', updatePreview);
  els.pruningAdditionalHours.addEventListener('input', updatePreview);
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  els.pruningContractForm.addEventListener('submit', savePruningContract);
}

function openPruningContractDialog(account) {
  if (typeof canManageAll === 'function' && !canManageAll()) return;
  ensurePruningContractDialog();

  state.activePruningAccountId = account.id;
  const contract = pruningContractFor(account.id);
  els.pruningContractTitle.textContent = `${account.name} · ${PRUNING_YEAR}`;
  els.pruningInitialHours.value = contract ? Number(contract.initial_hours || 0) : 0;
  els.pruningAdditionalHours.value = contract ? Number(contract.additional_hours || 0) : 0;
  els.pruningContractNotes.value = contract?.notes || '';
  els.pruningContractMessage.textContent = '';

  const total = Number(els.pruningInitialHours.value || 0) + Number(els.pruningAdditionalHours.value || 0);
  els.pruningContractDialog.querySelector('#pruningContractTotalPreview').textContent = pruningHours(total);
  els.pruningContractDialog.showModal();
}

async function savePruningContract(event) {
  event.preventDefault();
  if (typeof canManageAll === 'function' && !canManageAll()) return;

  const accountId = state.activePruningAccountId;
  if (!accountId) return;

  const initialHours = Number(els.pruningInitialHours.value || 0);
  const additionalHours = Number(els.pruningAdditionalHours.value || 0);
  if (initialHours < 0 || additionalHours < 0) return;

  els.pruningContractMessage.textContent = 'Saving…';
  setSyncStatus('Saving…');

  const payload = {
    account_id: accountId,
    contract_year: PRUNING_YEAR,
    initial_hours: initialHours,
    additional_hours: additionalHours,
    notes: els.pruningContractNotes.value.trim() || null,
    updated_at: new Date().toISOString(),
    updated_by: state.session.user.id
  };

  const { error } = await client
    .from('pruning_hour_contracts')
    .upsert(payload, { onConflict: 'account_id,contract_year' });

  if (error) {
    console.error(error);
    els.pruningContractMessage.textContent = error.message;
    setSyncStatus('Save failed', true);
    return;
  }

  await loadData();
  els.pruningContractDialog.close();
}

function ensurePruningVisitDialog() {
  if (els.pruningVisitDialog) return;

  const dialog = document.createElement('dialog');
  dialog.className = 'pruning-dialog';
  dialog.innerHTML = `
    <form id="pruningVisitForm" class="dialog-card pruning-dialog-card">
      <div class="dialog-heading">
        <div><p class="eyebrow">PRUNING HOURS USED</p><h2 id="pruningVisitTitle">Log Visit</h2></div>
        <button class="icon-btn" type="button" data-close aria-label="Close">×</button>
      </div>
      <div class="pruning-form-grid">
        <label>Date<input id="pruningVisitDate" type="date" required /></label>
        <label>Hours Used<input id="pruningVisitHours" type="number" min="0.25" step="0.25" required /></label>
      </div>
      <label>Visit notes<textarea id="pruningVisitNotes" rows="3" placeholder="Optional crew or work notes"></textarea></label>
      <p id="pruningVisitMessage" class="auth-message" role="status"></p>
      <button class="primary-btn wide" type="submit">Subtract These Hours</button>
    </form>
  `;

  document.body.appendChild(dialog);
  els.pruningVisitDialog = dialog;
  els.pruningVisitForm = dialog.querySelector('#pruningVisitForm');
  els.pruningVisitTitle = dialog.querySelector('#pruningVisitTitle');
  els.pruningVisitDate = dialog.querySelector('#pruningVisitDate');
  els.pruningVisitHours = dialog.querySelector('#pruningVisitHours');
  els.pruningVisitNotes = dialog.querySelector('#pruningVisitNotes');
  els.pruningVisitMessage = dialog.querySelector('#pruningVisitMessage');

  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  els.pruningVisitForm.addEventListener('submit', savePruningVisit);
}

function openPruningVisitDialog(account, visitType, sequenceNumber) {
  const contract = pruningContractFor(account.id);
  if (!contract) return;
  if (typeof canUpdateAccountUI === 'function' && !canUpdateAccountUI(account.id)) return;

  ensurePruningVisitDialog();
  state.activePruningAccountId = account.id;
  state.activePruningVisitType = visitType;
  state.activePruningVisitSequence = visitType === 'initial' ? 0 : Number(sequenceNumber);

  els.pruningVisitTitle.textContent = visitType === 'initial'
    ? `${account.name} · Initial Prune`
    : `${account.name} · Additional Prune #${sequenceNumber}`;
  els.pruningVisitDate.value = new Date().toISOString().slice(0, 10);
  els.pruningVisitHours.value = '';
  els.pruningVisitNotes.value = '';
  els.pruningVisitMessage.textContent = '';
  els.pruningVisitDialog.showModal();
  window.setTimeout(() => els.pruningVisitHours.focus(), 50);
}

async function savePruningVisit(event) {
  event.preventDefault();

  const account = state.accounts.find(item => item.id === state.activePruningAccountId);
  if (!account) return;
  if (typeof canUpdateAccountUI === 'function' && !canUpdateAccountUI(account.id)) return;

  const contract = pruningContractFor(account.id);
  if (!contract) return;

  const hoursUsed = Number(els.pruningVisitHours.value || 0);
  if (!(hoursUsed > 0)) return;

  els.pruningVisitMessage.textContent = 'Saving…';
  setSyncStatus('Saving…');

  const payload = {
    contract_id: contract.id,
    visit_type: state.activePruningVisitType,
    sequence_number: Number(state.activePruningVisitSequence || 0),
    work_date: els.pruningVisitDate.value,
    hours_used: hoursUsed,
    notes: els.pruningVisitNotes.value.trim() || null,
    created_by: state.session.user.id,
    updated_at: new Date().toISOString()
  };

  const { error } = await client.from('pruning_hour_visits').insert(payload);

  if (error) {
    console.error(error);
    els.pruningVisitMessage.textContent = error.message;
    setSyncStatus('Save failed', true);
    return;
  }

  await loadData();
  els.pruningVisitDialog.close();
}

async function deletePruningVisit(visitId, accountName) {
  if (!visitId) return;
  if (!confirm(`Remove this pruning-hour entry for ${accountName}? The hours will be returned to the remaining balance.`)) return;

  setSyncStatus('Saving…');
  const { error } = await client.from('pruning_hour_visits').delete().eq('id', visitId);
  if (error) {
    console.error(error);
    alert(error.message);
    setSyncStatus('Save failed', true);
    return;
  }

  await loadData();
}

els.pruningSearchInput?.addEventListener('input', event => {
  state.pruningSearch = event.target.value;
  renderPruning();
});

els.pruningFilterSelect?.addEventListener('change', event => {
  state.pruningFilter = event.target.value;
  renderPruning();
});

document.querySelector('[data-tab="pruning"]')?.addEventListener('click', renderPruning);

const renderWithPruning = render;
render = function() {
  renderWithPruning();
  renderPruning();
};

if (state.session) renderPruning();
