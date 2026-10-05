const SUPABASE_URL = 'https://nsxbkfvmknjskjbgqogd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8xjscIHkKtesTauHl2S62w_AHaWCQUf';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const state = {
  accounts: [],
  workTypes: [],
  search: '',
  filter: 'all',
  session: null,
  channel: null,
  historyOpen: false
};

const els = {
  authScreen: document.getElementById('authScreen'),
  authForm: document.getElementById('authForm'),
  authEmail: document.getElementById('authEmail'),
  authPassword: document.getElementById('authPassword'),
  authMessage: document.getElementById('authMessage'),
  signUpBtn: document.getElementById('signUpBtn'),
  signOutBtn: document.getElementById('signOutBtn'),
  appShell: document.getElementById('appShell'),
  syncStatus: document.getElementById('syncStatus'),
  addAccountBtn: document.getElementById('addAccountBtn'),
  emptyAddBtn: document.getElementById('emptyAddBtn'),
  accountDialog: document.getElementById('accountDialog'),
  closeDialogBtn: document.getElementById('closeDialogBtn'),
  accountForm: document.getElementById('accountForm'),
  accountNameInput: document.getElementById('accountNameInput'),
  accountsList: document.getElementById('accountsList'),
  accountTemplate: document.getElementById('accountTemplate'),
  overallPercent: document.getElementById('overallPercent'),
  overallBar: document.getElementById('overallBar'),
  completeCount: document.getElementById('completeCount'),
  accountCount: document.getElementById('accountCount'),
  emptyState: document.getElementById('emptyState'),
  searchInput: document.getElementById('searchInput'),
  filterSelect: document.getElementById('filterSelect'),
  completionHistoryCard: document.getElementById('completionHistoryCard'),
  completionHistoryCount: document.getElementById('completionHistoryCount'),
  perennialCompleteCount: document.getElementById('perennialCompleteCount'),
  annualCompleteCount: document.getElementById('annualCompleteCount'),
  toggleHistoryBtn: document.getElementById('toggleHistoryBtn'),
  completionHistoryList: document.getElementById('completionHistoryList'),
  perennialHistoryList: document.getElementById('perennialHistoryList'),
  annualHistoryList: document.getElementById('annualHistoryList'),
  fullHistoryList: document.getElementById('fullHistoryList')
};

function companyEmail(email) {
  return email.trim().toLowerCase().endsWith('@creativexteriors.com');
}

function setAuthMessage(message) {
  els.authMessage.textContent = message || '';
}

function setSyncStatus(message, error = false) {
  els.syncStatus.textContent = message;
  els.syncStatus.classList.toggle('error', error);
}

function accountPercent(account) {
  return Math.round((Number(account.perennials || 0) + Number(account.annuals || 0)) / 2);
}

function isComplete(account) {
  return Number(account.perennials) === 100 && Number(account.annuals) === 100;
}

function overallPercent() {
  if (!state.accounts.length) return 0;
  return Math.round(state.accounts.reduce((sum, account) => sum + accountPercent(account), 0) / state.accounts.length);
}

function taskKeyForWorkType(name) {
  if (name === 'Perennial Cutbacks') return 'perennials';
  if (name === 'Annual Pulls') return 'annuals';
  return null;
}

function workTypeIdForTask(task) {
  const expected = task === 'perennials' ? 'Perennial Cutbacks' : 'Annual Pulls';
  return state.workTypes.find(item => item.name === expected)?.id;
}

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  }).format(new Date(value));
}

async function loadData() {
  setSyncStatus('Syncing…');
  const [accountsResult, workTypesResult, progressResult] = await Promise.all([
    client.from('accounts').select('id,name,created_at,completed_at').order('name'),
    client.from('work_types').select('id,name,sort_order').eq('active', true).order('sort_order'),
    client.from('account_progress').select('account_id,work_type_id,progress,completed_at')
  ]);

  const error = accountsResult.error || workTypesResult.error || progressResult.error;
  if (error) {
    console.error(error);
    setSyncStatus('Sync error', true);
    return;
  }

  state.workTypes = workTypesResult.data || [];
  const progressMap = new Map();
  for (const row of progressResult.data || []) {
    progressMap.set(`${row.account_id}:${row.work_type_id}`, {
      progress: Number(row.progress),
      completedAt: row.completed_at
    });
  }

  state.accounts = (accountsResult.data || []).map(account => {
    const assembled = {
      ...account,
      perennials: 0,
      annuals: 0,
      perennialsCompletedAt: null,
      annualsCompletedAt: null
    };

    for (const wt of state.workTypes) {
      const task = taskKeyForWorkType(wt.name);
      if (!task) continue;
      const row = progressMap.get(`${account.id}:${wt.id}`);
      assembled[task] = row?.progress ?? 0;
      assembled[`${task}CompletedAt`] = row?.completedAt ?? null;
    }

    return assembled;
  });

  render();
  setSyncStatus('Live sync on');
}

function filteredAccounts() {
  const query = state.search.trim().toLowerCase();
  return [...state.accounts]
    .filter(account => !query || account.name.toLowerCase().includes(query))
    .filter(account => state.filter === 'active' ? !isComplete(account) : state.filter === 'complete' ? isComplete(account) : true)
    .sort((a, b) => {
      const completeDifference = Number(isComplete(a)) - Number(isComplete(b));
      if (completeDifference !== 0) return completeDifference;
      return a.name.localeCompare(b.name);
    });
}

async function addAccount(name) {
  setSyncStatus('Saving…');
  const { data: account, error } = await client
    .from('accounts')
    .insert({ name: name.trim() })
    .select('id,name,created_at,completed_at')
    .single();

  if (error) {
    alert(error.code === '23505' ? 'That account already exists.' : error.message);
    setSyncStatus('Save failed', true);
    return false;
  }

  const rows = state.workTypes.map(wt => ({
    account_id: account.id,
    work_type_id: wt.id,
    progress: 0,
    completed_at: null,
    updated_by: state.session.user.id
  }));

  if (rows.length) {
    const { error: progressError } = await client.from('account_progress').insert(rows);
    if (progressError) {
      console.error(progressError);
      setSyncStatus('Partial save', true);
    }
  }

  await loadData();
  return true;
}

async function setProgress(accountId, task, value) {
  const workTypeId = workTypeIdForTask(task);
  if (!workTypeId) return;

  const now = new Date().toISOString();
  const local = state.accounts.find(item => item.id === accountId);
  if (!local) return;

  const wasTaskComplete = Number(local[task]) === 100;
  const becomesTaskComplete = Number(value) === 100;
  local[task] = Number(value);
  if (!wasTaskComplete && becomesTaskComplete) local[`${task}CompletedAt`] = now;
  if (wasTaskComplete && !becomesTaskComplete) local[`${task}CompletedAt`] = null;

  const willBeFullyComplete = Number(local.perennials) === 100 && Number(local.annuals) === 100;
  const wasFullyComplete = Boolean(local.completed_at);
  if (!wasFullyComplete && willBeFullyComplete) local.completed_at = now;
  if (wasFullyComplete && !willBeFullyComplete) local.completed_at = null;
  render();

  setSyncStatus('Saving…');

  const { error: progressError } = await client.from('account_progress').upsert({
    account_id: accountId,
    work_type_id: workTypeId,
    progress: Number(value),
    completed_at: local[`${task}CompletedAt`],
    updated_at: now,
    updated_by: state.session.user.id
  }, { onConflict: 'account_id,work_type_id' });

  if (progressError) {
    console.error(progressError);
    setSyncStatus('Save failed', true);
    await loadData();
    return;
  }

  const { error: accountError } = await client
    .from('accounts')
    .update({ completed_at: local.completed_at })
    .eq('id', accountId);

  if (accountError) {
    console.error(accountError);
    setSyncStatus('Save failed', true);
    await loadData();
    return;
  }

  setSyncStatus('Live sync on');
}

async function removeAccount(accountId) {
  const account = state.accounts.find(item => item.id === accountId);
  if (!account || !confirm(`Remove ${account.name}?`)) return;
  const { error } = await client.from('accounts').delete().eq('id', accountId);
  if (error) {
    alert(error.message);
    return;
  }
  await loadData();
}

function buildAccountCard(account) {
  const fragment = els.accountTemplate.content.cloneNode(true);
  const card = fragment.querySelector('.account-card');
  const percent = accountPercent(account);
  const complete = isComplete(account);

  card.dataset.id = account.id;
  card.classList.toggle('complete', complete);
  fragment.querySelector('.account-name').textContent = account.name;
  fragment.querySelector('.account-percent').textContent = `${percent}%`;
  fragment.querySelector('.account-status').textContent = complete
    ? `COMPLETE · ${formatDate(account.completed_at)}`
    : 'IN PROGRESS';
  fragment.querySelector('.mini-progress-fill').style.width = `${percent}%`;

  fragment.querySelectorAll('.task-block').forEach(block => {
    const task = block.dataset.task;
    const value = Number(account[task] || 0);
    const taskPercent = block.querySelector('.task-percent');
    taskPercent.textContent = value === 100 && account[`${task}CompletedAt`]
      ? `100% · ${formatDate(account[`${task}CompletedAt`])}`
      : `${value}%`;

    block.querySelectorAll('.progress-buttons button').forEach(button => {
      const buttonValue = Number(button.dataset.value);
      button.classList.toggle('active', buttonValue === value);
      button.setAttribute('aria-pressed', buttonValue === value ? 'true' : 'false');
      button.addEventListener('click', () => setProgress(account.id, task, buttonValue));
    });
  });

  fragment.querySelector('.delete-btn').addEventListener('click', () => removeAccount(account.id));
  return fragment;
}

function historyRows(items, dateKey) {
  if (!items.length) return '<div class="history-empty">None completed yet.</div>';
  return items
    .sort((a, b) => new Date(b[dateKey]) - new Date(a[dateKey]))
    .map(account => `
      <div class="history-row">
        <span class="history-name">${escapeHtml(account.name)}</span>
        <span class="history-date">${formatDate(account[dateKey])}</span>
      </div>
    `).join('');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderCompletionHistory() {
  const perennials = state.accounts.filter(a => Number(a.perennials) === 100 && a.perennialsCompletedAt);
  const annuals = state.accounts.filter(a => Number(a.annuals) === 100 && a.annualsCompletedAt);
  const full = state.accounts.filter(a => isComplete(a) && a.completed_at);

  els.completionHistoryCard.hidden = state.accounts.length === 0;
  els.perennialCompleteCount.textContent = perennials.length;
  els.annualCompleteCount.textContent = annuals.length;
  els.completionHistoryCount.textContent = full.length;
  els.perennialHistoryList.innerHTML = historyRows(perennials, 'perennialsCompletedAt');
  els.annualHistoryList.innerHTML = historyRows(annuals, 'annualsCompletedAt');
  els.fullHistoryList.innerHTML = historyRows(full, 'completed_at');
  els.completionHistoryList.hidden = !state.historyOpen;
  els.toggleHistoryBtn.textContent = state.historyOpen ? 'Hide history' : 'Show history';
}

function renderSummary() {
  const percent = overallPercent();
  els.overallPercent.textContent = `${percent}%`;
  els.overallBar.style.width = `${percent}%`;
  els.completeCount.textContent = state.accounts.filter(isComplete).length;
  els.accountCount.textContent = state.accounts.length;
  renderCompletionHistory();
}

function render() {
  renderSummary();
  const accounts = filteredAccounts();
  els.accountsList.innerHTML = '';
  accounts.forEach(account => els.accountsList.appendChild(buildAccountCard(account)));
  els.emptyState.hidden = state.accounts.length > 0;
  if (state.accounts.length > 0 && accounts.length === 0) {
    els.accountsList.innerHTML = '<div class="empty-state"><h2>No matches</h2><p>Try a different search or filter.</p></div>';
  }
}

function openDialog() {
  els.accountForm.reset();
  els.accountDialog.showModal();
  setTimeout(() => els.accountNameInput.focus(), 50);
}

function closeDialog() {
  els.accountDialog.close();
}

function subscribeRealtime() {
  if (state.channel) client.removeChannel(state.channel);
  state.channel = client.channel('fall-cleanup-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts' }, loadData)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'account_progress' }, loadData)
    .subscribe(status => {
      if (status === 'SUBSCRIBED') setSyncStatus('Live sync on');
    });
}

async function showApp(session) {
  state.session = session;
  els.authScreen.hidden = true;
  els.appShell.hidden = false;
  await loadData();
  subscribeRealtime();
}

function showAuth() {
  state.session = null;
  els.appShell.hidden = true;
  els.authScreen.hidden = false;
  if (state.channel) client.removeChannel(state.channel);
}

els.authForm.addEventListener('submit', async event => {
  event.preventDefault();
  const email = els.authEmail.value.trim();
  const password = els.authPassword.value;
  if (!companyEmail(email)) return setAuthMessage('Use your @creativexteriors.com work email.');
  setAuthMessage('Signing in…');
  const { error } = await client.auth.signInWithPassword({ email, password });
  setAuthMessage(error ? error.message : '');
});

els.signUpBtn.addEventListener('click', async () => {
  const email = els.authEmail.value.trim();
  const password = els.authPassword.value;
  if (!companyEmail(email)) return setAuthMessage('Use your @creativexteriors.com work email.');
  if (password.length < 6) return setAuthMessage('Use a password with at least 6 characters.');
  setAuthMessage('Creating account…');
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) return setAuthMessage(error.message);
  setAuthMessage(data.session ? 'Account created.' : 'Account created. Check your work email to confirm it, then sign in.');
});

els.signOutBtn.addEventListener('click', async () => {
  await client.auth.signOut();
});
els.addAccountBtn.addEventListener('click', openDialog);
els.emptyAddBtn.addEventListener('click', openDialog);
els.closeDialogBtn.addEventListener('click', closeDialog);
els.accountDialog.addEventListener('click', event => { if (event.target === els.accountDialog) closeDialog(); });
els.accountForm.addEventListener('submit', async event => {
  event.preventDefault();
  const name = els.accountNameInput.value.trim();
  if (!name) return;
  if (await addAccount(name)) closeDialog();
});
els.searchInput.addEventListener('input', event => { state.search = event.target.value; render(); });
els.filterSelect.addEventListener('change', event => { state.filter = event.target.value; render(); });
els.toggleHistoryBtn.addEventListener('click', () => {
  state.historyOpen = !state.historyOpen;
  renderCompletionHistory();
});

client.auth.onAuthStateChange((_event, session) => {
  if (session) showApp(session);
  else showAuth();
});

(async function init() {
  const { data: { session } } = await client.auth.getSession();
  if (session) showApp(session);
  else showAuth();
})();
