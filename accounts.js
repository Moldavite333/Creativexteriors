const accountsStyles = document.createElement('link');
accountsStyles.rel = 'stylesheet';
accountsStyles.href = 'accounts.css?v=20261007-02';
document.head.appendChild(accountsStyles);

state.accountsSearch = '';
state.activeAccountRecord = null;
let propertyMap = null;
let propertyParcelLayer = null;
let propertyAddressMarker = null;

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
  propertyMap: null,
  propertyParcelSummary: null,
  propertyParcelLookupBtn: null,
  propertyAddressMapBtn: null,
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
              <span class="property-section-kicker">LIVE PARCEL MAP</span>
            </div>
            <p class="property-helper">The parcel boundary is saved with this account after the first lookup, so everyone sees the same property line without searching again.</p>
            <div id="propertyMap" class="property-map" aria-label="Property parcel map"></div>
            <div id="propertyParcelSummary" class="property-parcel-summary">No parcel boundary saved yet.</div>
            <div class="property-map-actions">
              <button id="propertyParcelLookupBtn" class="primary-btn" type="button">Find / Refresh Parcel</button>
              <button id="propertyAddressMapBtn" class="secondary-btn" type="button">Open Address Map</button>
              <button id="propertyLinesFindBtn" class="secondary-btn" type="button">Open Regrid</button>
              <button id="propertyLinesOpenBtn" class="secondary-btn" type="button">Open Saved Map</button>
              <button id="propertyCopyAddressBtn" class="secondary-btn" type="button">Copy Address</button>
            </div>
            <label>Saved property-lines link
              <input id="propertyLinesUrl" type="url" maxlength="1000" placeholder="Optional direct parcel or property map link" />
            </label>
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
  els.propertyMap = dialog.querySelector('#propertyMap');
  els.propertyParcelSummary = dialog.querySelector('#propertyParcelSummary');
  els.propertyParcelLookupBtn = dialog.querySelector('#propertyParcelLookupBtn');
  els.propertyAddressMapBtn = dialog.querySelector('#propertyAddressMapBtn');
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
  els.propertyParcelLookupBtn.addEventListener('click', lookupPropertyParcel);
  els.propertyAddressMapBtn.addEventListener('click', openPropertyAddressMap);
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
    .select('id,name,address,contact_name,contact_phone,contact_email,things_to_know,property_lines_url,parcel_geojson,parcel_meta,parcel_lookup_at,created_at')
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
  els.propertyParcelLookupBtn.hidden = !editable;

  const canRequest = ['admin','manager','crew','client'].includes(state.profile?.role);
  els.propertyRequestInput.disabled = !canRequest;
  els.propertyRequestForm.querySelector('button[type="submit"]').hidden = !canRequest;

  updatePropertyLineButtons();
  els.propertyDialog.showModal();
  window.requestAnimationFrame(() => {
    renderPropertyParcelMap(data);
    const meta = data.parcel_meta || {};
    const hasCoordinates = propertyCoordinate(meta.latitude) !== null && propertyCoordinate(meta.longitude) !== null;
    if (data.address && !data.parcel_geojson && !hasCoordinates) {
      window.setTimeout(() => lookupPropertyParcel({ silent: true }), 0);
    }
  });
  await loadSpecialRequests(accountId);
}

async function savePropertyDetails(event) {
  event.preventDefault();
  if (!state.activeAccountRecord || !(typeof canManageAll === 'function' ? canManageAll() : true)) return;

  els.propertyDetailsMessage.textContent = 'Saving…';

  const nextAddress = els.propertyAddress.value.trim() || null;
  const previousAddress = String(state.activeAccountRecord.address || '').trim();
  const addressChanged = String(nextAddress || '').trim() !== previousAddress;

  const updates = {
    address: nextAddress,
    contact_name: els.propertyContactName.value.trim() || null,
    contact_phone: els.propertyContactPhone.value.trim() || null,
    contact_email: els.propertyContactEmail.value.trim() || null,
    things_to_know: els.propertyThingsToKnow.value.trim() || null,
    property_lines_url: els.propertyLinesUrl.value.trim() || null
  };

  // A cached parcel belongs to the old address. Never silently carry it to a
  // different property; require a fresh parcel lookup instead.
  if (addressChanged) {
    updates.parcel_geojson = null;
    updates.parcel_meta = null;
    updates.parcel_lookup_at = null;
  }

  const { data, error } = await client
    .from('accounts')
    .update(updates)
    .eq('id', state.activeAccountRecord.id)
    .select('id,name,address,contact_name,contact_phone,contact_email,things_to_know,property_lines_url,parcel_geojson,parcel_meta,parcel_lookup_at')
    .single();

  if (error) {
    console.error(error);
    els.propertyDetailsMessage.textContent = 'Save failed: ' + error.message;
    return;
  }

  state.activeAccountRecord = { ...state.activeAccountRecord, ...data };
  els.propertyDetailsMessage.textContent = addressChanged ? 'Property file saved. Address changed, so the old parcel boundary was cleared.' : 'Property file saved.';
  if (addressChanged) renderPropertyParcelMap(state.activeAccountRecord);
  updatePropertyLineButtons();
}

function updatePropertyLineButtons() {
  const address = els.propertyAddress.value.trim();
  const savedUrl = els.propertyLinesUrl.value.trim();

  els.propertyParcelLookupBtn.disabled = !address;
  els.propertyAddressMapBtn.disabled = !address;
  els.propertyLinesOpenBtn.disabled = !savedUrl;
  els.propertyCopyAddressBtn.disabled = !address;
  els.propertyLinesFindBtn.disabled = !address;
}

function propertyCoordinate(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parcelSummary(record) {
  const meta = record?.parcel_meta || {};
  const bits = [];
  if (meta.parcel_number) bits.push(`Parcel ${meta.parcel_number}`);
  if (Number(meta.acreage) > 0) bits.push(`${Number(meta.acreage).toFixed(2)} acres`);
  if (meta.matched_address) bits.push(meta.matched_address);
  if (!bits.length && record?.parcel_geojson) bits.push('Parcel boundary saved');
  if (!bits.length && propertyCoordinate(meta.latitude) !== null) bits.push(record?.address ? `Address located: ${record.address}` : 'Address located');
  return bits.join(' · ') || 'No property location saved yet. Enter a full address and click Find / Refresh Parcel.';
}

function renderPropertyParcelMap(record = state.activeAccountRecord) {
  if (!els.propertyMap) return;

  if (!window.L) {
    els.propertyParcelSummary.textContent = 'Map library did not load. The saved parcel link and Regrid fallback still work.';
    return;
  }

  if (!propertyMap) {
    propertyMap = L.map(els.propertyMap, {
      zoomControl: true,
      attributionControl: true
    }).setView([39.7392, -104.9903], 10);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 20,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(propertyMap);
  }

  if (propertyParcelLayer) {
    propertyParcelLayer.remove();
    propertyParcelLayer = null;
  }
  if (propertyAddressMarker) {
    propertyAddressMarker.remove();
    propertyAddressMarker = null;
  }

  const geojson = record?.parcel_geojson;
  const meta = record?.parcel_meta || {};
  const latitude = propertyCoordinate(meta.latitude);
  const longitude = propertyCoordinate(meta.longitude);
  const hasCoordinates = latitude !== null && longitude !== null;

  if (hasCoordinates) {
    propertyAddressMarker = L.marker([latitude, longitude])
      .addTo(propertyMap)
      .bindPopup(escapeHtml(meta.matched_address || record?.address || 'Property'));
  }

  if (geojson?.geometry || geojson?.type === 'FeatureCollection') {
    propertyParcelLayer = L.geoJSON(geojson, {
      style: {
        color: '#f4b942',
        weight: 4,
        opacity: 1,
        fillColor: '#f4b942',
        fillOpacity: 0.13
      }
    }).addTo(propertyMap);

    const bounds = propertyParcelLayer.getBounds();
    if (bounds.isValid()) propertyMap.fitBounds(bounds.pad(0.18), { maxZoom: 19 });
  } else if (hasCoordinates) {
    propertyMap.setView([latitude, longitude], 18);
    propertyAddressMarker?.openPopup();
  } else {
    propertyMap.setView([39.7392, -104.9903], 10);
  }

  els.propertyParcelSummary.textContent = parcelSummary(record);
  window.setTimeout(() => propertyMap?.invalidateSize(), 40);
}

async function lookupPropertyParcel(options = {}) {
  if (!state.activeAccountRecord) return;
  const address = els.propertyAddress.value.trim();
  if (!address) return;

  const silent = !!options.silent;
  const button = els.propertyParcelLookupBtn;
  const originalText = button.textContent;
  button.disabled = true;
  if (!silent) {
    button.textContent = 'Finding parcel…';
    els.propertyDetailsMessage.textContent = 'Locating the property and checking for a parcel boundary…';
  }

  try {
    const { data, error } = await client.functions.invoke('parcel-lookup', {
      body: { address }
    });

    if (error) {
      let detail = error.message || 'Property lookup failed.';
      try {
        const body = await error.context?.json?.();
        if (body?.error) detail = body.error;
      } catch {}
      throw new Error(detail);
    }

    const hasParcel = !!data?.feature?.geometry;
    const hasLocation = propertyCoordinate(data?.meta?.latitude) !== null && propertyCoordinate(data?.meta?.longitude) !== null;
    if (!hasParcel && !hasLocation) throw new Error(data?.error || 'The address could not be located.');

    const updates = {
      address,
      parcel_geojson: hasParcel ? data.feature : null,
      parcel_meta: data.meta || {},
      parcel_lookup_at: new Date().toISOString()
    };

    if (!els.propertyLinesUrl.value.trim() && data.source_url) {
      updates.property_lines_url = data.source_url;
    }

    const { data: saved, error: saveError } = await client
      .from('accounts')
      .update(updates)
      .eq('id', state.activeAccountRecord.id)
      .select('id,name,address,contact_name,contact_phone,contact_email,things_to_know,property_lines_url,parcel_geojson,parcel_meta,parcel_lookup_at')
      .single();

    if (saveError) throw saveError;

    state.activeAccountRecord = { ...state.activeAccountRecord, ...saved };
    if (saved.property_lines_url) els.propertyLinesUrl.value = saved.property_lines_url;
    renderPropertyParcelMap(state.activeAccountRecord);
    updatePropertyLineButtons();

    if (!silent) {
      els.propertyDetailsMessage.textContent = hasParcel
        ? 'Parcel boundary found and saved to this account.'
        : (data?.error || 'Address located and centered on the map. Parcel boundary is not available yet.');
    }
  } catch (error) {
    console.error(error);
    if (!silent) els.propertyDetailsMessage.textContent = error.message || 'Could not locate this property.';
  } finally {
    button.textContent = originalText;
    updatePropertyLineButtons();
  }
}

function openPropertyAddressMap() {
  const address = els.propertyAddress.value.trim();
  if (!address) return;
  const url = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address);
  window.open(url, '_blank', 'noopener,noreferrer');
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
    els.propertyDetailsMessage.textContent = 'Address copied — Regrid is opening as a manual fallback.';
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
