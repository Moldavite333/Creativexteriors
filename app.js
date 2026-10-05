const STORAGE_KEY = 'creativexteriors-fall-cleanup-v1';

const state = {
  accounts: loadAccounts(),
  search: '',
  filter: 'all'
};

const els = {
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
  filterSelect: document.getElementById('filterSelect')
};

function loadAccounts() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveAccounts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.accounts));
}

function accountPercent(account) {
  return Math.round((Number(account.perennials || 0) + Number(account.annuals || 0)) / 2);
}

function isComplete(account) {
  return Number(account.perennials) === 100 && Number(account.annuals) === 100;
}

function overallPercent() {
  if (!state.accounts.length) return 0;
  const total = state.accounts.reduce((sum, account) => sum + accountPercent(account), 0);
  return Math.round(total / state.accounts.length);
}

function openDialog() {
  els.accountForm.reset();
  els.accountDialog.showModal();
  setTimeout(() => els.accountNameInput.focus(), 50);
}

function closeDialog() {
  els.accountDialog.close();
}

function addAccount(name) {
  state.accounts.push({
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    name: name.trim(),
    perennials: 0,
    annuals: 0,
    createdAt: Date.now()
  });
  saveAccounts();
  render();
}

function setProgress(accountId, task, value) {
  const account = state.accounts.find(item => item.id === accountId);
  if (!account || !['perennials', 'annuals'].includes(task)) return;
  account[task] = Number(value);
  saveAccounts();
  render();
}

function removeAccount(accountId) {
  const account = state.accounts.find(item => item.id === accountId);
  if (!account) return;
  if (!confirm(`Remove ${account.name}?`)) return;
  state.accounts = state.accounts.filter(item => item.id !== accountId);
  saveAccounts();
  render();
}

function filteredAccounts() {
  const query = state.search.trim().toLowerCase();
  return [...state.accounts]
    .filter(account => !query || account.name.toLowerCase().includes(query))
    .filter(account => {
      if (state.filter === 'active') return !isComplete(account);
      if (state.filter === 'complete') return isComplete(account);
      return true;
    })
    .sort((a, b) => {
      const completeDifference = Number(isComplete(a)) - Number(isComplete(b));
      if (completeDifference !== 0) return completeDifference;
      return a.name.localeCompare(b.name);
    });
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
  fragment.querySelector('.account-status').textContent = complete ? 'COMPLETE' : 'IN PROGRESS';
  fragment.querySelector('.mini-progress-fill').style.width = `${percent}%`;

  fragment.querySelectorAll('.task-block').forEach(block => {
    const task = block.dataset.task;
    const value = Number(account[task] || 0);
    block.querySelector('.task-percent').textContent = `${value}%`;
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

function renderSummary() {
  const percent = overallPercent();
  const complete = state.accounts.filter(isComplete).length;
  els.overallPercent.textContent = `${percent}%`;
  els.overallBar.style.width = `${percent}%`;
  els.completeCount.textContent = complete;
  els.accountCount.textContent = state.accounts.length;
}

function render() {
  renderSummary();
  const accounts = filteredAccounts();
  els.accountsList.innerHTML = '';

  accounts.forEach(account => els.accountsList.appendChild(buildAccountCard(account)));

  const hasAnyAccounts = state.accounts.length > 0;
  els.emptyState.hidden = hasAnyAccounts;
  els.controls = undefined;

  if (hasAnyAccounts && accounts.length === 0) {
    els.accountsList.innerHTML = '<div class="empty-state"><h2>No matches</h2><p>Try a different search or filter.</p></div>';
  }
}

els.addAccountBtn.addEventListener('click', openDialog);
els.emptyAddBtn.addEventListener('click', openDialog);
els.closeDialogBtn.addEventListener('click', closeDialog);
els.accountDialog.addEventListener('click', event => {
  if (event.target === els.accountDialog) closeDialog();
});
els.accountForm.addEventListener('submit', event => {
  event.preventDefault();
  const name = els.accountNameInput.value.trim();
  if (!name) return;
  addAccount(name);
  closeDialog();
});
els.searchInput.addEventListener('input', event => {
  state.search = event.target.value;
  render();
});
els.filterSelect.addEventListener('change', event => {
  state.filter = event.target.value;
  render();
});

render();
