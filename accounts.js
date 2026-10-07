const accountsStyles = document.createElement('link');
accountsStyles.rel = 'stylesheet';
accountsStyles.href = 'accounts.css?v=20261007-01';
document.head.appendChild(accountsStyles);

state.accountsSearch = '';
state.activeAccountRecord = null;

Object.assign(els, {
  accountsDirectoryList: null,
  accountsDirectorySearch: null,
  propertyDialog: null,
  propertyDialogTitle: null,
  propertyDetailsForm: null,
  propertyAddress: null,
  propertyContactName: null,
  propertyContactPhone: null,
  propertyContactEmail: null,
  propertyThingsToKnow: null,
  propertyLinesUrl: null,
  propertyLinesOpenBtn: null,
  propertyLinesFindBtn: null,
  propertyCopyAddressBtn: null,
  propertyDetailsMessage: null,
  closePropertyDialogBtn: null,
  propertyRequestsList: null,
  propertyRequestForm: null,
  propertyRequestInput: null,
  propertyNotesShortcut: null
});

function ensureAccountsModule() {
  const tabs = document.querySelector('.module-tabs');
  if (!tabs) return;

  let tab = tabs.querySelector('[data-tab="accounts"]');
  if (!tab) {
    tab = document.createElement('button');
    tab.className = 'module-tab';
    tab.dataset.tab = 'accounts';
    tab.type = 'button';
    tab.textContent = 'Accounts';

    const colorTab = tabs.querySelector('[data-tab="color"]');
    if (colorTab?.nextSibling) tabs.insertBefore(tab, colorTab.nextSibling);
    else tabs.appendChild(tab);

    tab.addEventListener('click', () => {
      switchTab('accounts');
      renderAccountsDirectory();
    });
  }

  if (!document.querySelector('[data-panel="accounts"]')) {
    const panel = document.createElement('section');
    panel.className = 'module-panel';
    panel.dataset.panel = 'accounts';
    panel.innerHTML = `
      <div class="module-heading">
        <div>
          <p class="eyebrow">PROPERTY RECORDS</p>
          <h2>Accounts</h2>
        </div>
      </div>
      <section class="summary-card account-directory-intro">
        <strong>Master property files</strong>
        <p>Open a property for contacts, address, property-line access, special requests, and permanent account information.</p>
      </section>
      <section class="controls account-directory-controls">
        <input id="accountsDirectorySearch" type="search" placeholder="Search accounts…" autocomplete="off" />
      </section>
      <section id="accountsDirectoryList" class="property-directory" aria-live="polite"></section>
    `;

    const pruningPanel = document.querySelector('[data-panel="pruning"]');
    if (pruningPanel) pruningPanel.insertAdjacentElement('beforebegin', panel);
    else document.querySelector('main.app-shell')?.appendChild(panel);

    els.accountsDirectoryList = panel.querySelector('#accountsDirectoryList');
    els.accountsDirectorySearch = panel.querySelector('#accountsDirectorySearch');

    els.accountsDirectorySearch.addEventListener('input', event => {
      state.accountsSearch = event.target.value;
      renderAccountsDirectory();
    });
  }

  ensurePropertyDialog();
}

function accountDirectoryMatches(account) {
  const q = state.accountsSearch.trim().toLowerCase();
  return !q || account.name.toLowerCase().includes(q);
}

function renderAccountsDirectory() {
  ensureAccountsModule();
  if (!els.accountsDirectoryList) return;

  const accounts = [...state.accounts]
    .filter(accountDirectoryMatches)
    .sort((a,b) => a.name.localeCompare(b.name));

  els.accountsDirectoryList.innerHTML = '';

  if (!accounts.length) {
    els.accountsDirectoryList.innerHTML = '<div class="empty-state"><h2>No matches</h2><p>Try a different account name.</p></div>';
    return;
  }

  accounts.forEach(account => {
    const row = document.createElement('article');
    row.className = 'property-directory-row';

    const title = document.createElement('button');
    title.type = 'button';
    title.className = 'property-title-button';
    title.innerHTML = `<strong>${escapeHtml(account.name)}</strong><span>Open property file</span>`;
    title.addEventListener('click', () => openPropertyRecord(account.id));

    const chevron = document.createElement('button');
    chevron.type = 'button';
    chevron.className = 'property-open-button';
    chevron.setAttribute('aria-label', `Open ${account.name}`);
    chevron.textContent = '›';
    chevron.addEventListener('click', () => openPropertyRecord(account.id));

    row.append(title, chevron);
    els.accountsDirectoryList.appendChild(row);
  });
}

function ensurePropertyDialog() {
  if (els.propertyDialog) return;

  const dialog = document.createElement('dialog');
  dialog.id = 'propertyDialog';
  dialog.className = 'property-dialog';
  dialog.innerHTML = `
    <div class="dialog-card property-record-card">
      <div class="dialog-heading property-record-heading">
        <div>
          <p class="eyebrow">ACCOUNT FILE</p>
          <h2 id="propertyDialogTitle">Property</h2>
        </div>
        <button id="closePropertyDialogBtn" class="icon-btn" type="button" aria-label="Close">×</button>
      </div>

      <div class="property-record-grid">
        <form id="propertyDetailsForm" class="property-section property-details-section">
          <div class="property-section-heading">
            <h3>Property & Contact</h3>
            <span class="property-section-kicker">PERMANENT ACCOUNT INFO</span>
          </div>

          <label>Property address
            <input id="propertyAddress" type="text" maxlength="250" placeholder="Street, city, state, ZIP" />
          </label>

          <div class="property-contact-grid">
            <label>Contact name
              <input id="propertyContactName" type="text" maxlength="120" placeholder="Primary contact" />
            </label>
            <label>Phone
              <input id="propertyContactPhone" type="tel" maxlength="60" placeholder="Phone number" />
            </label>
          </div>

          <label>Email
            <input id="propertyContactEmail" type="email" maxlength="180" placeholder="Contact email" />
          </label>

          <label>Things we need to know
            <textarea id="propertyThingsToKnow" maxlength="8000" placeholder="Gate codes, timing restrictions, pets, irrigation concerns, access instructions, sensitive areas, client preferences…"></textarea>
          </label>

          <div class="property-lines-box">
            <div class="property-section-heading compact">
              <h3>Property Lines</h3>
              <span class="property-section-kicker">PARCEL REFERENCE</span>
            </div>
            <p class="property-helper">Use the property address to locate the parcel, then save the direct parcel/map link here.</p>
            <label>Saved property-lines link
              <input id="propertyLinesUrl" type="url" maxlength="1000" placeholder="Paste direct parcel or property map link" />
            </label>
            <div class="property-link-actions">
              <button id="propertyLinesOpenBtn" class="secondary-btn" type="button">Open Saved Map</button>
              <button id="propertyCopyAddressBtn" class="secondary-btn" type="button">Copy Address</button>
              <button id="propertyLinesFindBtn" class="secondary-btn" type="button">Find Property Lines</button>
            </div>
          </div>

          <p id="propertyDetailsMessage" class="auth-message" role="status"></p>
          <button class="primary-btn wide property-save-btn" type="submit">Save Property File</button>
        </form>

        <section class="property-section">
          <div class="property-section-heading">
            <h3>Special Requests</h3>
            <span class="property-section-kicker">CURRENT & HISTORICAL</span>
          </div>
          <form id="propertyRequestForm" class="special-request-form">
            <textarea id="propertyRequestInput" maxlength="4000" placeholder="Add a client request, manager request, or special instruction…" required></textarea>
            <button class="primary-btn" type="submit">Add Request</button>
          </form>
          <div id="propertyRequestsList" class="special-requests-list"></div>
        </section>

        <section class="property-section property-communications-section">
          <div class="property-section-heading">
            <h3>Property Communication</h3>
            <span class="property-section-kicker">TEAM NOTES</span>
          </div>
          <p class="property-helper">Use the existing property note system for ongoing updates and team/client-visible communication.</p>
          <button id="propertyNotesShortcut" class="secondary-btn wide" type="button">Open Property Notes</button>
        </section>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  els.propertyDialog = dialog;
  els.propertyDialogTitle = dialog.querySelector('#propertyDialogTitle');
  els.propertyDetailsForm = dialog.querySelector('#propertyDetailsForm');
  els.propertyAddress = dialog.querySelector('#propertyAddress');
  els.propertyContactName = dialog.querySelector('#propertyContactName');
  els.propertyContactPhone = dialog.querySelector('#propertyContactPhone');
  els.propertyContactEmail = dialog.querySelector('#propertyContactEmail');
  els.propertyThingsToKnow = dialog.querySelector('#propertyThingsToKnow');
  els.propertyLinesUrl = dialog.querySelector('#propertyLinesUrl');
  els.propertyLinesOpenBtn = dialog.querySelector('#propertyLinesOpenBtn');
  els.propertyLinesFindBtn = dialog.querySelector('#propertyLinesFindBtn');
  els.propertyCopyAddressBtn = dialog.querySelector('#propertyCopyAddressBtn');
  els.propertyDetailsMessage = dialog.querySelector('#propertyDetailsMessage');
  els.closePropertyDialogBtn = dialog.querySelector('#closePropertyDialogBtn');
  els.propertyRequestsList = dialog.querySelector('#propertyRequestsList');
  els.propertyRequestForm = dialog.querySelector('#propertyRequestForm');
  els.propertyRequestInput = dialog.querySelector('#propertyRequestInput');
  els.propertyNotesShortcut = dialog.querySelector('#propertyNotesShortcut');

  els.closePropertyDialogBtn.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  els.propertyDetailsForm.addEventListener('submit', savePropertyDetails);
  els.propertyRequestForm.addEventListener('submit', addSpecialRequest);
  els.propertyLinesOpenBtn.addEventListener('click', openSavedPropertyLines);
  els.propertyLinesFindBtn.addEventListener('click', openPropertyLineFinder);
  els.propertyCopyAddressBtn.addEventListener('click', copyPropertyAddress);
  els.propertyNotesShortcut.addEventListener('click', () => {
    if (!state.activeAccountRecord) return;
    const account = state.accounts.find(item => item.id === state.activeAccountRecord.id);
    if (account && typeof openPropertyNotes === 'function') openPropertyNotes(account);
  });
  els.propertyAddress.addEventListener('input', updatePropertyLineButtons);
  els.propertyLinesUrl.addEventListener('input', updatePropertyLineButtons);
}

async function openPropertyRecord(accountId) {
  ensurePropertyDialog();
  els.propertyDetailsMessage.textContent = '';
  els.propertyRequestsList.innerHTML = '<div class="history-empty">Loading property file…</div>';

  const { data, error } = await client
    .from('accounts')
    .select('id,name,address,contact_name,contact_phone,contact_email,things_to_know,property_lines_url,created_at')
    .eq('id', accountId)
    .single();

  if (error) {
    console.error(error);
    alert('Could not open property file: ' + error.message);
    return;
  }

  state.activeAccountRecord = data;
  els.propertyDialogTitle.textContent = data.name;
  els.propertyAddress.value = data.address || '';
  els.propertyContactName.value = data.contact_name || '';
  els.propertyContactPhone.value = data.contact_phone || '';
  els.propertyContactEmail.value = data.contact_email || '';
  els.propertyThingsToKnow.value = data.things_to_know || '';
  els.propertyLinesUrl.value = data.property_lines_url || '';

  const editable = typeof canManageAll === 'function' ? canManageAll() : true;
  [
    els.propertyAddress,
    els.propertyContactName,
    els.propertyContactPhone,
    els.propertyContactEmail,
    els.propertyThingsToKnow,
    els.propertyLinesUrl
  ].forEach(field => field.disabled = !editable);
  els.propertyDetailsForm.querySelector('.property-save-btn').hidden = !editable;

  const canRequest = ['admin','manager','crew','client'].includes(state.profile?.role);
  els.propertyRequestInput.disabled = !canRequest;
  els.propertyRequestForm.querySelector('button[type="submit"]').hidden = !canRequest;

  updatePropertyLineButtons();
  els.propertyDialog.showModal();
  await loadSpecialRequests(accountId);
}

async function savePropertyDetails(event) {
  event.preventDefault();
  if (!state.activeAccountRecord || !(typeof canManageAll === 'function' ? canManageAll() : true)) return;

  els.propertyDetailsMessage.textContent = 'Saving…';

  const updates = {
    address: els.propertyAddress.value.trim() || null,
    contact_name: els.propertyContactName.value.trim() || null,
    contact_phone: els.propertyContactPhone.value.trim() || null,
    contact_email: els.propertyContactEmail.value.trim() || null,
    things_to_know: els.propertyThingsToKnow.value.trim() || null,
    property_lines_url: els.propertyLinesUrl.value.trim() || null
  };

  const { data, error } = await client
    .from('accounts')
    .update(updates)
    .eq('id', state.activeAccountRecord.id)
    .select('id,name,address,contact_name,contact_phone,contact_email,things_to_know,property_lines_url')
    .single();

  if (error) {
    console.error(error);
    els.propertyDetailsMessage.textContent = 'Save failed: ' + error.message;
    return;
  }

  state.activeAccountRecord = { ...state.activeAccountRecord, ...data };
  els.propertyDetailsMessage.textContent = 'Property file saved.';
  updatePropertyLineButtons();
}

function updatePropertyLineButtons() {
  const address = els.propertyAddress.value.trim();
  const savedUrl = els.propertyLinesUrl.value.trim();

  els.propertyLinesOpenBtn.disabled = !savedUrl;
  els.propertyCopyAddressBtn.disabled = !address;
  els.propertyLinesFindBtn.disabled = !address;
}

function openSavedPropertyLines() {
  const url = els.propertyLinesUrl.value.trim();
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

async function copyPropertyAddress() {
  const address = els.propertyAddress.value.trim();
  if (!address) return;
  try {
    await navigator.clipboard.writeText(address);
    els.propertyDetailsMessage.textContent = 'Address copied.';
  } catch {
    els.propertyDetailsMessage.textContent = 'Could not copy automatically. Select the address and copy it manually.';
  }
}

async function openPropertyLineFinder() {
  const address = els.propertyAddress.value.trim();
  if (!address) return;

  try {
    await navigator.clipboard.writeText(address);
    els.propertyDetailsMessage.textContent = 'Address copied — paste it into Regrid search.';
  } catch {
    els.propertyDetailsMessage.textContent = 'Regrid opened. Search the property address shown above.';
  }

  window.open('https://app.regrid.com/', '_blank', 'noopener,noreferrer');
}

async function loadSpecialRequests(accountId) {
  const { data, error } = await client
    .from('special_requests')
    .select('id,request_text,status,created_at,updated_at,completed_at,author_id')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    els.propertyRequestsList.innerHTML = '<div class="history-empty">Could not load special requests.</div>';
    return;
  }

  if (!data?.length) {
    els.propertyRequestsList.innerHTML = '<div class="history-empty">No special requests yet.</div>';
    return;
  }

  els.propertyRequestsList.innerHTML = '';
  data.forEach(request => {
    const row = document.createElement('article');
    row.className = `special-request-row status-${request.status}`;

    const top = document.createElement('div');
    top.className = 'special-request-meta';

    const statusLabel = document.createElement('span');
    statusLabel.className = 'special-request-status';
    statusLabel.textContent = request.status.replace('_', ' ').toUpperCase();

    const time = document.createElement('time');
    time.textContent = new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    }).format(new Date(request.created_at));

    top.append(statusLabel, time);

    const body = document.createElement('p');
    body.textContent = request.request_text;

    row.append(top, body);

    if (typeof canManageAll === 'function' && canManageAll()) {
      const controls = document.createElement('div');
      controls.className = 'special-request-controls';

      const select = document.createElement('select');
      select.innerHTML = `
        <option value="open">Open</option>
        <option value="in_progress">In Progress</option>
        <option value="completed">Completed</option>
        <option value="cancelled">Cancelled</option>
      `;
      select.value = request.status;
      select.addEventListener('change', () => updateSpecialRequestStatus(request.id, select.value));

      controls.appendChild(select);
      row.appendChild(controls);
    }

    els.propertyRequestsList.appendChild(row);
  });
}

async function addSpecialRequest(event) {
  event.preventDefault();
  if (!state.activeAccountRecord) return;

  const requestText = els.propertyRequestInput.value.trim();
  if (!requestText) return;

  const { error } = await client.from('special_requests').insert({
    account_id: state.activeAccountRecord.id,
    author_id: state.session.user.id,
    request_text: requestText,
    status: 'open'
  });

  if (error) {
    console.error(error);
    alert('Could not add request: ' + error.message);
    return;
  }

  els.propertyRequestInput.value = '';
  await loadSpecialRequests(state.activeAccountRecord.id);
}

async function updateSpecialRequestStatus(requestId, status) {
  const updates = {
    status,
    updated_at: new Date().toISOString(),
    completed_at: status === 'completed' ? new Date().toISOString() : null
  };

  const { error } = await client
    .from('special_requests')
    .update(updates)
    .eq('id', requestId);

  if (error) {
    console.error(error);
    alert('Could not update request: ' + error.message);
    await loadSpecialRequests(state.activeAccountRecord.id);
    return;
  }

  await loadSpecialRequests(state.activeAccountRecord.id);
}

ensureAccountsModule();

const priorAccountsRender = render;
render = function() {
  priorAccountsRender();
  renderAccountsDirectory();
};

if (state.session) renderAccountsDirectory();
