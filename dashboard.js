const dashboardStyles = document.createElement('link');
dashboardStyles.rel = 'stylesheet';
dashboardStyles.href = 'dashboard.css?v=20261007-01';
document.head.appendChild(dashboardStyles);

state.dashboardSearch = '';

Object.assign(els, {
  dashboardSearchInput: document.getElementById('dashboardSearchInput'),
  dashboardAccountCount: document.getElementById('dashboardAccountCount'),
  dashboardCards: document.getElementById('dashboardCards')
});

function dashboardPercent(account) {
  if (typeof accountPercent === 'function') return accountPercent(account);
  return 0;
}

function dashboardColorStatus(account) {
  if (typeof colorIsApplicable === 'function' && !colorIsApplicable(account)) {
    return { label: 'Color', value: 'N/A', level: 'na' };
  }
  const value = Number(account.annuals || 0);
  return { label: 'Color', value: value + '%', level: value >= 100 ? 'done' : value > 0 ? 'active' : 'open' };
}

function dashboardPruningStatus(account) {
  if (typeof pruningMetrics !== 'function') return { label: 'Pruning', value: '—', level: 'na' };
  const metrics = pruningMetrics(account);
  if (!metrics.contract) return { label: 'Pruning', value: 'Not set', level: 'na' };
  const remaining = Number(metrics.remainingHours || 0);
  return {
    label: 'Pruning',
    value: pruningHours(remaining) + ' hr' + (Math.abs(remaining) === 1 ? '' : 's') + ' left',
    level: remaining < 0 ? 'over' : remaining === 0 ? 'done' : 'active'
  };
}

function dashboardAgroStatus(account) {
  const fertRows = (state.fertilizationApplications || []).filter(row => row.account_id === account.id);
  const aerRows = (state.aerationRounds || []).filter(row => row.account_id === account.id);
  const assigned = fertRows.length + aerRows.length;
  const done = [...fertRows, ...aerRows].filter(row => row.completed).length;

  if (!assigned) return { label: 'Agro', value: 'Not assigned', level: 'na' };
  return {
    label: 'Agro',
    value: done + '/' + assigned + ' done',
    level: done === assigned ? 'done' : done > 0 ? 'active' : 'open'
  };
}

function dashboardCutbackStatus(account) {
  const value = dashboardPercent(account);
  return {
    label: 'Cutbacks',
    value: value + '%',
    level: value >= 100 ? 'done' : value > 0 ? 'active' : 'open'
  };
}

function dashboardStatusRow(status) {
  return `
    <div class="dashboard-status-row">
      <span>${escapeHtml(status.label)}</span>
      <strong class="dashboard-status-value ${status.level}">${escapeHtml(status.value)}</strong>
    </div>
  `;
}

function buildDashboardCard(account) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'dashboard-account-card';
  card.setAttribute('aria-label', 'Open ' + account.name + ' property record');

  const statuses = [
    dashboardCutbackStatus(account),
    dashboardColorStatus(account),
    dashboardPruningStatus(account),
    dashboardAgroStatus(account)
  ];

  const attention = statuses.some(status => status.level === 'over');
  card.classList.toggle('needs-attention', attention);

  card.innerHTML = `
    <div class="dashboard-account-head">
      <strong>${escapeHtml(account.name)}</strong>
      <span aria-hidden="true">›</span>
    </div>
    <div class="dashboard-account-statuses">
      ${statuses.map(dashboardStatusRow).join('')}
    </div>
  `;

  card.addEventListener('click', () => {
    if (typeof openPropertyRecord === 'function') {
      openPropertyRecord(account.id);
      return;
    }
    if (typeof switchTab === 'function') switchTab('accounts');
  });

  return card;
}

function renderDashboard() {
  if (!els.dashboardCards) return;
  const q = state.dashboardSearch.trim().toLowerCase();
  const accounts = [...state.accounts]
    .filter(account => !q || account.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));

  els.dashboardAccountCount.textContent = state.accounts.length;
  els.dashboardCards.innerHTML = '';

  if (!accounts.length) {
    els.dashboardCards.innerHTML = '<div class="empty-state dashboard-empty"><h2>No matches</h2><p>Try a different property name.</p></div>';
    return;
  }

  accounts.forEach(account => els.dashboardCards.appendChild(buildDashboardCard(account)));
}

els.dashboardSearchInput?.addEventListener('input', event => {
  state.dashboardSearch = event.target.value;
  renderDashboard();
});

const dashboardSwitchTab = switchTab;
switchTab = function(tab) {
  dashboardSwitchTab(tab);
  document.body.classList.toggle('dashboard-view', tab === 'dashboard');
  if (tab === 'dashboard') renderDashboard();
};

document.body.classList.toggle('dashboard-view', state.activeTab === 'dashboard');

const renderWithDashboard = render;
render = function() {
  renderWithDashboard();
  renderDashboard();
};

if (state.session) renderDashboard();
