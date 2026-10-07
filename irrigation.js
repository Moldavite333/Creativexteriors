const irrigationStyles = document.createElement('link');
irrigationStyles.rel = 'stylesheet';
irrigationStyles.href = 'irrigation.css?v=20261007-01';
document.head.appendChild(irrigationStyles);

state.irrigationSearch = '';
state.irrigationEvents = [];
state.irrigationBilling = [];
state.irrigationAccountId = null;

Object.assign(els, {
  irrigationTab: null,
  irrigationPanel: null,
  irrigationSearch: null,
  irrigationAccountsList: null,
  irrigationTurnOnCount: null,
  irrigationBlowoutCount: null,
  irrigationRepairCount: null,
  irrigationReadyBillCount: null,
  irrigationBillingQueue: null,
  irrigationDialog: null,
  irrigationDialogTitle: null,
  irrigationEventForm: null,
  irrigationServiceType: null,
  irrigationServiceDate: null,
  irrigationStatus: null,
  irrigationRepairDescription: null,
  irrigationComments: null,
  irrigationEventList: null,
  closeIrrigationDialogBtn: null
});

function irrigationCurrentYear() {
  return new Date().getFullYear();
}

function irrigationInternalUser() {
  return ['admin','manager','crew'].includes(state.profile?.role);
}

function ensureIrrigationModule() {
  const tabs = document.querySelector('.module-tabs');
  if (!tabs) return;

  let tab = tabs.querySelector('[data-tab="irrigation"]');
  if (!tab) {
    tab = document.createElement('button');
    tab.className = 'module-tab';
    tab.dataset.tab = 'irrigation';
    tab.type = 'button';
    tab.textContent = 'Irrigation';

    const maintenanceTab = tabs.querySelector('[data-tab="maintenance"]');
    if (maintenanceTab?.nextSibling) tabs.insertBefore(tab, maintenanceTab.nextSibling);
    else tabs.appendChild(tab);

    tab.addEventListener('click', async () => {
      switchTab('irrigation');
      await loadIrrigationData();
    });
  }
  els.irrigationTab = tab;
  tab.hidden = !irrigationInternalUser();

  let panel = document.querySelector('[data-panel="irrigation"]');
  if (!panel) {
    panel = document.createElement('section');
    panel.className = 'module-panel';
    panel.dataset.panel = 'irrigation';
    panel.innerHTML = `
      <div class="module-heading">
        <div>
          <p class="eyebrow">IRRIGATION OPERATIONS</p>
          <h2>Irrigation</h2>
        </div>
      </div>

      <section class="irrigation-summary-grid">
        <article class="completion-tally"><span class="tally-label">Turn Ons Complete</span><strong id="irrigationTurnOnCount">0</strong></article>
        <article class="completion-tally"><span class="tally-label">Blow Outs Complete</span><strong id="irrigationBlowoutCount">0</strong></article>
        <article class="completion-tally"><span class="tally-label">Open Repairs</span><strong id="irrigationRepairCount">0</strong></article>
        <article class="completion-tally full"><span class="tally-label">Ready To Bill</span><strong id="irrigationReadyBillCount">0</strong></article>
      </section>

      <section class="controls irrigation-controls">
        <input id="irrigationSearch" type="search" placeholder="Search irrigation accounts…" autocomplete="off" />
      </section>

      <section id="irrigationAccountsList" class="property-directory" aria-live="polite"></section>

      <section class="irrigation-billing-section">
        <div class="module-heading">
          <div>
            <p class="eyebrow">OFFICE HANDOFF</p>
            <h2>Billing Queue</h2>
          </div>
        </div>
        <div id="irrigationBillingQueue" class="irrigation-billing-queue"></div>
      </section>
    `;

    const maintenancePanel = document.querySelector('[data-panel="maintenance"]');
    if (maintenancePanel?.nextSibling) maintenancePanel.insertAdjacentElement('afterend', panel);
    else document.querySelector('main.app-shell')?.appendChild(panel);
  }

  els.irrigationPanel = panel;
  els.irrigationSearch = panel.querySelector('#irrigationSearch');
  els.irrigationAccountsList = panel.querySelector('#irrigationAccountsList');
  els.irrigationTurnOnCount = panel.querySelector('#irrigationTurnOnCount');
  els.irrigationBlowoutCount = panel.querySelector('#irrigationBlowoutCount');
  els.irrigationRepairCount = panel.querySelector('#irrigationRepairCount');
  els.irrigationReadyBillCount = panel.querySelector('#irrigationReadyBillCount');
  els.irrigationBillingQueue = panel.querySelector('#irrigationBillingQueue');

  if (!els.irrigationSearch.dataset.bound) {
    els.irrigationSearch.dataset.bound = '1';
    els.irrigationSearch.addEventListener('input', event => {
      state.irrigationSearch = event.target.value;
      renderIrrigation();
    });
  }

  ensureIrrigationDialog();
}

function ensureIrrigationDialog() {
  if (els.irrigationDialog) return;

  const dialog = document.createElement('dialog');
  dialog.id = 'irrigationDialog';
  dialog.className = 'irrigation-dialog';
  dialog.innerHTML = `
    <div class="dialog-card irrigation-record-card">
      <div class="dialog-heading irrigation-record-heading">
        <div>
          <p class="eyebrow">IRRIGATION FILE</p>
          <h2 id="irrigationDialogTitle">Property</h2>
        </div>
        <button id="closeIrrigationDialogBtn" class="icon-btn" type="button" aria-label="Close">×</button>
      </div>

      <section class="property-section">
        <div class="property-section-heading">
          <h3>Add Irrigation Work</h3>
          <span class="property-section-kicker">FIELD RECORD</span>
        </div>
        <form id="irrigationEventForm" class="irrigation-event-form">
          <div class="irrigation-form-grid">
            <label>Work type
              <select id="irrigationServiceType">
                <option value="turn_on">Turn On</option>
                <option value="blowout">Blow Out</option>
                <option value="repair">Repair / Fix</option>
              </select>
            </label>
            <label>Date
              <input id="irrigationServiceDate" type="date" />
            </label>
            <label>Status
              <select id="irrigationStatus">
                <option value="scheduled">Scheduled</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
          </div>

          <label id="irrigationRepairWrap">Repair / fix made
            <textarea id="irrigationRepairDescription" maxlength="4000" placeholder="Valve replaced, broken head repaired, lateral leak fixed, controller issue, etc."></textarea>
          </label>

          <label>Comments
            <textarea id="irrigationComments" maxlength="4000" placeholder="Field notes, access notes, irrigation observations, follow-up needed…"></textarea>
          </label>

          <button class="primary-btn wide" type="submit">Save Irrigation Work</button>
        </form>
      </section>

      <section class="property-section">
        <div class="property-section-heading">
          <h3>History</h3>
          <span class="property-section-kicker">TURN ONS · BLOW OUTS · REPAIRS</span>
        </div>
        <div id="irrigationEventList" class="irrigation-event-list"></div>
      </section>
    </div>
  `;

  document.body.appendChild(dialog);

  els.irrigationDialog = dialog;
  els.irrigationDialogTitle = dialog.querySelector('#irrigationDialogTitle');
  els.irrigationEventForm = dialog.querySelector('#irrigationEventForm');
  els.irrigationServiceType = dialog.querySelector('#irrigationServiceType');
  els.irrigationServiceDate = dialog.querySelector('#irrigationServiceDate');
  els.irrigationStatus = dialog.querySelector('#irrigationStatus');
  els.irrigationRepairDescription = dialog.querySelector('#irrigationRepairDescription');
  els.irrigationComments = dialog.querySelector('#irrigationComments');
  els.irrigationEventList = dialog.querySelector('#irrigationEventList');
  els.closeIrrigationDialogBtn = dialog.querySelector('#closeIrrigationDialogBtn');

  els.closeIrrigationDialogBtn.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  els.irrigationEventForm.addEventListener('submit', saveIrrigationEvent);
  els.irrigationServiceType.addEventListener('change', updateIrrigationRepairVisibility);
  updateIrrigationRepairVisibility();
}

function updateIrrigationRepairVisibility() {
  const wrap = document.getElementById('irrigationRepairWrap');
  if (!wrap) return;
  wrap.hidden = els.irrigationServiceType.value !== 'repair';
  if (wrap.hidden) els.irrigationRepairDescription.value = '';
}

function irrigationTypeLabel(type) {
  return type === 'turn_on' ? 'Turn On' : type === 'blowout' ? 'Blow Out' : 'Repair / Fix';
}

function irrigationStatusLabel(status) {
  return status.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function irrigationEventAccountName(accountId) {
  return state.accounts.find(account => account.id === accountId)?.name || 'Property';
}

async function loadIrrigationData() {
  ensureIrrigationModule();
  if (!irrigationInternalUser()) return;

  const eventsPromise = client
    .from('irrigation_events')
    .select('id,account_id,service_type,service_date,status,repair_description,comments,created_by,created_at,updated_at,completed_at')
    .order('service_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  const billingPromise = canManageAll()
    ? client.from('irrigation_billing').select('event_id,amount,billing_notes,billing_status,updated_at,sent_at')
    : Promise.resolve({ data: [], error: null });

  const [eventsResult, billingResult] = await Promise.all([eventsPromise, billingPromise]);

  if (eventsResult.error) {
    console.error(eventsResult.error);
    setSyncStatus('Irrigation sync error', true);
    return;
  }
  if (billingResult.error) console.error(billingResult.error);

  state.irrigationEvents = eventsResult.data || [];
  state.irrigationBilling = billingResult.data || [];
  renderIrrigation();

  if (els.irrigationDialog?.open && state.irrigationAccountId) {
    renderIrrigationPropertyEvents();
  }
}

function irrigationEventsForAccount(accountId) {
  return state.irrigationEvents.filter(event => event.account_id === accountId);
}

function latestIrrigationEvent(accountId, type) {
  return irrigationEventsForAccount(accountId)
    .filter(event => event.service_type === type)
    .sort((a,b) => new Date(b.service_date || b.created_at) - new Date(a.service_date || a.created_at))[0];
}

function renderIrrigation() {
  ensureIrrigationModule();
  if (!irrigationInternalUser() || !els.irrigationAccountsList) return;

  const q = state.irrigationSearch.trim().toLowerCase();
  const accounts = [...state.accounts]
    .filter(account => !q || account.name.toLowerCase().includes(q))
    .sort((a,b) => a.name.localeCompare(b.name));

  const year = irrigationCurrentYear();
  const yearlyEvents = state.irrigationEvents.filter(event => {
    const source = event.service_date || event.created_at;
    return source && new Date(source).getFullYear() === year;
  });

  els.irrigationTurnOnCount.textContent = yearlyEvents.filter(event => event.service_type === 'turn_on' && event.status === 'completed').length;
  els.irrigationBlowoutCount.textContent = yearlyEvents.filter(event => event.service_type === 'blowout' && event.status === 'completed').length;
  els.irrigationRepairCount.textContent = state.irrigationEvents.filter(event => event.service_type === 'repair' && !['completed','cancelled'].includes(event.status)).length;
  els.irrigationReadyBillCount.textContent = state.irrigationBilling.filter(row => row.billing_status === 'ready').length;

  els.irrigationAccountsList.innerHTML = '';

  accounts.forEach(account => {
    const turnOn = latestIrrigationEvent(account.id, 'turn_on');
    const blowout = latestIrrigationEvent(account.id, 'blowout');
    const repairs = irrigationEventsForAccount(account.id).filter(event => event.service_type === 'repair' && !['completed','cancelled'].includes(event.status)).length;

    const row = document.createElement('article');
    row.className = 'irrigation-account-row';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'irrigation-account-main';
    button.innerHTML = `
      <div>
        <strong>${escapeHtml(account.name)}</strong>
        <span>${repairs ? repairs + ' open repair' + (repairs === 1 ? '' : 's') : 'No open repairs'}</span>
      </div>
      <div class="irrigation-account-statuses">
        <span>Turn On: ${turnOn ? irrigationStatusLabel(turnOn.status) : '—'}</span>
        <span>Blow Out: ${blowout ? irrigationStatusLabel(blowout.status) : '—'}</span>
      </div>
    `;
    button.addEventListener('click', () => openIrrigationProperty(account.id));

    const arrow = document.createElement('button');
    arrow.type = 'button';
    arrow.className = 'property-open-button';
    arrow.textContent = '›';
    arrow.setAttribute('aria-label', `Open irrigation file for ${account.name}`);
    arrow.addEventListener('click', () => openIrrigationProperty(account.id));

    row.append(button, arrow);
    els.irrigationAccountsList.appendChild(row);
  });

  if (!accounts.length) {
    els.irrigationAccountsList.innerHTML = '<div class="empty-state"><h2>No matches</h2><p>Try a different account name.</p></div>';
  }

  renderIrrigationBillingQueue();
}

function billingForEvent(eventId) {
  return state.irrigationBilling.find(row => Number(row.event_id) === Number(eventId));
}

function renderIrrigationBillingQueue() {
  if (!els.irrigationBillingQueue) return;

  if (!canManageAll()) {
    els.irrigationBillingQueue.innerHTML = '<div class="history-empty">Billing is available to managers and admins.</div>';
    return;
  }

  const billable = state.irrigationBilling
    .filter(row => ['ready','sent'].includes(row.billing_status))
    .map(row => ({
      billing: row,
      event: state.irrigationEvents.find(event => Number(event.id) === Number(row.event_id))
    }))
    .filter(item => item.event)
    .sort((a,b) => {
      const rank = status => status === 'ready' ? 0 : 1;
      return rank(a.billing.billing_status) - rank(b.billing.billing_status) ||
        new Date(b.event.service_date || b.event.created_at) - new Date(a.event.service_date || a.event.created_at);
    });

  if (!billable.length) {
    els.irrigationBillingQueue.innerHTML = '<div class="history-empty">Nothing waiting to be billed.</div>';
    return;
  }

  els.irrigationBillingQueue.innerHTML = '';
  billable.forEach(({billing,event}) => {
    const row = document.createElement('article');
    row.className = 'billing-queue-row';
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(irrigationEventAccountName(event.account_id))}</strong>
        <span>${irrigationTypeLabel(event.service_type)} · ${event.service_date ? formatDate(event.service_date + 'T12:00:00') : 'No date'}</span>
        ${billing.billing_notes ? `<p>${escapeHtml(billing.billing_notes)}</p>` : ''}
      </div>
      <div class="billing-queue-amount">
        <strong>${billing.amount != null ? '$' + Number(billing.amount).toFixed(2) : 'No amount'}</strong>
        <span>${billing.billing_status === 'ready' ? 'READY TO BILL' : 'SENT'}</span>
      </div>
    `;
    row.addEventListener('click', () => openIrrigationProperty(event.account_id));
    els.irrigationBillingQueue.appendChild(row);
  });
}

async function openIrrigationProperty(accountId) {
  ensureIrrigationDialog();
  state.irrigationAccountId = accountId;

  const account = state.accounts.find(item => item.id === accountId);
  els.irrigationDialogTitle.textContent = account?.name || 'Property';
  els.irrigationEventForm.reset();
  els.irrigationServiceDate.value = new Date().toISOString().slice(0,10);
  els.irrigationStatus.value = 'scheduled';
  updateIrrigationRepairVisibility();

  const writable = canUpdateAccountUI(accountId);
  els.irrigationEventForm.querySelectorAll('input,select,textarea,button').forEach(control => {
    control.disabled = !writable;
  });

  els.irrigationDialog.showModal();
  await loadIrrigationData();
  renderIrrigationPropertyEvents();
}

async function saveIrrigationEvent(event) {
  event.preventDefault();
  if (!state.irrigationAccountId || !canUpdateAccountUI(state.irrigationAccountId)) return;

  const status = els.irrigationStatus.value;
  const row = {
    account_id: state.irrigationAccountId,
    service_type: els.irrigationServiceType.value,
    service_date: els.irrigationServiceDate.value || null,
    status,
    repair_description: els.irrigationServiceType.value === 'repair'
      ? (els.irrigationRepairDescription.value.trim() || null)
      : null,
    comments: els.irrigationComments.value.trim() || null,
    created_by: state.session.user.id,
    completed_at: status === 'completed' ? new Date().toISOString() : null
  };

  const { error } = await client.from('irrigation_events').insert(row);
  if (error) {
    console.error(error);
    alert('Could not save irrigation work: ' + error.message);
    return;
  }

  els.irrigationEventForm.reset();
  els.irrigationServiceDate.value = new Date().toISOString().slice(0,10);
  els.irrigationStatus.value = 'scheduled';
  updateIrrigationRepairVisibility();
  await loadIrrigationData();
}

function renderIrrigationPropertyEvents() {
  if (!els.irrigationEventList || !state.irrigationAccountId) return;

  const events = irrigationEventsForAccount(state.irrigationAccountId)
    .sort((a,b) => new Date(b.service_date || b.created_at) - new Date(a.service_date || a.created_at));

  if (!events.length) {
    els.irrigationEventList.innerHTML = '<div class="history-empty">No irrigation work recorded yet.</div>';
    return;
  }

  els.irrigationEventList.innerHTML = '';

  events.forEach(event => {
    const billing = billingForEvent(event.id);
    const card = document.createElement('article');
    card.className = 'irrigation-event-card';
    card.innerHTML = `
      <div class="irrigation-event-head">
        <div>
          <span class="irrigation-type-chip">${irrigationTypeLabel(event.service_type)}</span>
          <strong>${event.service_date ? formatDate(event.service_date + 'T12:00:00') : 'No service date'}</strong>
        </div>
        <span class="irrigation-status-chip status-${event.status}">${irrigationStatusLabel(event.status)}</span>
      </div>
      ${event.repair_description ? `<div class="irrigation-detail"><span>FIX MADE</span><p>${escapeHtml(event.repair_description)}</p></div>` : ''}
      ${event.comments ? `<div class="irrigation-detail"><span>COMMENTS</span><p>${escapeHtml(event.comments)}</p></div>` : ''}
    `;

    if (canUpdateAccountUI(event.account_id)) {
      const fieldControls = document.createElement('div');
      fieldControls.className = 'irrigation-field-controls';
      fieldControls.innerHTML = `
        <label>Status
          <select>
            <option value="scheduled">Scheduled</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
      `;
      const statusSelect = fieldControls.querySelector('select');
      statusSelect.value = event.status;
      statusSelect.addEventListener('change', () => updateIrrigationEventStatus(event.id, statusSelect.value));
      card.appendChild(fieldControls);
    }

    if (canManageAll()) {
      const billingBox = document.createElement('section');
      billingBox.className = 'irrigation-billing-box';
      billingBox.innerHTML = `
        <div class="property-section-heading compact">
          <h3>Billing</h3>
          <span class="property-section-kicker">OFFICE HANDOFF</span>
        </div>
        <div class="irrigation-billing-grid">
          <label>Amount
            <input class="irrigation-billing-amount" type="number" min="0" step="0.01" placeholder="0.00" value="${billing?.amount ?? ''}" />
          </label>
          <label>Billing status
            <select class="irrigation-billing-status">
              <option value="not_ready">Not Ready</option>
              <option value="ready">Ready To Bill</option>
              <option value="sent">Sent</option>
              <option value="paid">Paid</option>
            </select>
          </label>
        </div>
        <label>Billing notes
          <textarea class="irrigation-billing-notes" maxlength="4000" placeholder="Parts, labor, billing description, PO/reference, anything the office needs…">${escapeHtml(billing?.billing_notes || '')}</textarea>
        </label>
        <button class="secondary-btn irrigation-save-billing" type="button">Save Billing</button>
      `;

      const billingStatus = billingBox.querySelector('.irrigation-billing-status');
      billingStatus.value = billing?.billing_status || 'not_ready';
      billingBox.querySelector('.irrigation-save-billing').addEventListener('click', () => saveIrrigationBilling(event.id, billingBox));
      card.appendChild(billingBox);
    }

    els.irrigationEventList.appendChild(card);
  });
}

async function updateIrrigationEventStatus(eventId, status) {
  const event = state.irrigationEvents.find(item => Number(item.id) === Number(eventId));
  if (!event) return;

  const { error } = await client
    .from('irrigation_events')
    .update({
      status,
      updated_at: new Date().toISOString(),
      completed_at: status === 'completed' ? new Date().toISOString() : null
    })
    .eq('id', eventId);

  if (error) {
    console.error(error);
    alert('Could not update irrigation status: ' + error.message);
    return;
  }

  await loadIrrigationData();
}

async function saveIrrigationBilling(eventId, billingBox) {
  if (!canManageAll()) return;

  const amountValue = billingBox.querySelector('.irrigation-billing-amount').value;
  const billingStatus = billingBox.querySelector('.irrigation-billing-status').value;
  const billingNotes = billingBox.querySelector('.irrigation-billing-notes').value.trim();

  const payload = {
    event_id: eventId,
    amount: amountValue === '' ? null : Number(amountValue),
    billing_notes: billingNotes || null,
    billing_status: billingStatus,
    updated_by: state.session.user.id,
    updated_at: new Date().toISOString(),
    sent_at: billingStatus === 'sent' ? new Date().toISOString() : null
  };

  const { error } = await client
    .from('irrigation_billing')
    .upsert(payload, { onConflict: 'event_id' });

  if (error) {
    console.error(error);
    alert('Could not save billing: ' + error.message);
    return;
  }

  await loadIrrigationData();
}

ensureIrrigationModule();

const priorIrrigationRoleChrome = renderRoleChrome;
renderRoleChrome = function() {
  priorIrrigationRoleChrome();
  ensureIrrigationModule();
  if (els.irrigationTab) els.irrigationTab.hidden = !irrigationInternalUser();
};

const priorIrrigationRender = render;
render = function() {
  priorIrrigationRender();
  renderIrrigation();
};

client
  .channel('irrigation-live')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'irrigation_events' }, () => loadIrrigationData())
  .on('postgres_changes', { event: '*', schema: 'public', table: 'irrigation_billing' }, () => {
    if (canManageAll()) loadIrrigationData();
  })
  .subscribe();

if (state.session) {
  loadIrrigationData();
}
