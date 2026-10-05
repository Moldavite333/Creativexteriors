state.editingAccountId = null;

Object.assign(els, {
  taskDialog: document.getElementById('taskDialog'),
  taskForm: document.getElementById('taskForm'),
  taskDialogTitle: document.getElementById('taskDialogTitle'),
  closeTaskDialogBtn: document.getElementById('closeTaskDialogBtn'),
  taskPerennials: document.getElementById('taskPerennials'),
  taskAnnuals: document.getElementById('taskAnnuals'),
  taskRoses: document.getElementById('taskRoses'),
  taskFormMessage: document.getElementById('taskFormMessage')
});

function applicableTasks(account) {
  return TASKS.filter(task => account[`${task.key}Applicable`] !== false);
}

accountPercent = function(account) {
  const tasks = applicableTasks(account);
  if (!tasks.length) return 0;
  return Math.round(tasks.reduce((sum, task) => sum + Number(account[task.key] || 0), 0) / tasks.length);
};

isComplete = function(account) {
  const tasks = applicableTasks(account);
  return tasks.length > 0 && tasks.every(task => Number(account[task.key]) === 100);
};

loadData = async function() {
  setSyncStatus('Syncing…');
  const [accountsResult, workTypesResult, progressResult] = await Promise.all([
    client.from('accounts').select('id,name,created_at,completed_at').order('name'),
    client.from('work_types').select('id,name,sort_order').eq('active', true).order('sort_order'),
    client.from('account_progress').select('account_id,work_type_id,progress,completed_at,applicable')
  ]);

  const error = accountsResult.error || workTypesResult.error || progressResult.error;
  if (error) {
    console.error(error);
    setSyncStatus('Sync error', true);
    return;
  }

  state.workTypes = workTypesResult.data || [];
  const progressMap = new Map((progressResult.data || []).map(row => [`${row.account_id}:${row.work_type_id}`, row]));

  state.accounts = (accountsResult.data || []).map(account => {
    const assembled = { ...account };
    TASKS.forEach(task => {
      assembled[task.key] = 0;
      assembled[`${task.key}CompletedAt`] = null;
      assembled[`${task.key}Applicable`] = true;
    });

    state.workTypes.forEach(workType => {
      const task = taskKeyForWorkType(workType.name);
      if (!task) return;
      const row = progressMap.get(`${account.id}:${workType.id}`);
      assembled[task] = Number(row?.progress || 0);
      assembled[`${task}CompletedAt`] = row?.completed_at || null;
      assembled[`${task}Applicable`] = row?.applicable !== false;
    });

    return assembled;
  });

  render();
  setSyncStatus('Live sync on');
};

function openTaskDialog(account) {
  state.editingAccountId = account.id;
  els.taskDialogTitle.textContent = account.name;
  els.taskPerennials.checked = account.perennialsApplicable !== false;
  els.taskAnnuals.checked = account.annualsApplicable !== false;
  els.taskRoses.checked = account.rosesApplicable !== false;
  els.taskFormMessage.textContent = '';
  els.taskDialog.showModal();
}

function closeTaskDialog() {
  state.editingAccountId = null;
  els.taskDialog.close();
}

async function saveTaskApplicability(accountId, selectedKeys) {
  if (!selectedKeys.size) {
    els.taskFormMessage.textContent = 'Keep at least one task for this property.';
    return false;
  }

  setSyncStatus('Saving…');
  const results = await Promise.all(TASKS.map(async task => {
    const workTypeId = workTypeIdForTask(task.key);
    if (!workTypeId) return { error: null };
    return client.from('account_progress')
      .update({
        applicable: selectedKeys.has(task.key),
        updated_at: new Date().toISOString(),
        updated_by: state.session.user.id
      })
      .eq('account_id', accountId)
      .eq('work_type_id', workTypeId);
  }));

  const error = results.find(result => result.error)?.error;
  if (error) {
    console.error(error);
    els.taskFormMessage.textContent = error.message;
    setSyncStatus('Save failed', true);
    return false;
  }

  await loadData();
  return true;
}

buildAccountCard = function(account) {
  const fragment = els.accountTemplate.content.cloneNode(true);
  const card = fragment.querySelector('.account-card');
  const percent = accountPercent(account);
  const complete = isComplete(account);
  const tasks = applicableTasks(account);

  card.dataset.id = account.id;
  card.classList.toggle('complete', complete);
  fragment.querySelector('.account-name').textContent = account.name;
  fragment.querySelector('.account-percent').textContent = `${percent}%`;
  fragment.querySelector('.account-status').textContent = complete
    ? `COMPLETE · ${formatDate(account.completed_at)}`
    : `IN PROGRESS · ${tasks.length} ${tasks.length === 1 ? 'TASK' : 'TASKS'}`;
  fragment.querySelector('.mini-progress-fill').style.width = `${percent}%`;

  fragment.querySelector('.edit-tasks-btn').addEventListener('click', () => openTaskDialog(account));

  fragment.querySelectorAll('.task-block').forEach(block => {
    const task = block.dataset.task;
    if (account[`${task}Applicable`] === false) {
      block.remove();
      return;
    }

    const value = Number(account[task] || 0);
    const date = account[`${task}CompletedAt`];
    block.querySelector('.task-percent').textContent = value === 100 && date
      ? `100% · ${formatDate(date)}`
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
};

renderCompletionHistory = function() {
  const groups = {
    perennials: state.accounts.filter(a => a.perennialsApplicable !== false && Number(a.perennials) === 100 && a.perennialsCompletedAt),
    annuals: state.accounts.filter(a => a.annualsApplicable !== false && Number(a.annuals) === 100 && a.annualsCompletedAt),
    roses: state.accounts.filter(a => a.rosesApplicable !== false && Number(a.roses) === 100 && a.rosesCompletedAt),
    full: state.accounts.filter(a => isComplete(a) && a.completed_at)
  };

  els.completionHistoryCard.hidden = state.accounts.length === 0;
  els.perennialCompleteCount.textContent = groups.perennials.length;
  els.annualCompleteCount.textContent = groups.annuals.length;
  els.roseCompleteCount.textContent = groups.roses.length;
  els.completionHistoryCount.textContent = groups.full.length;
  els.perennialHistoryList.innerHTML = historyRows(groups.perennials, 'perennialsCompletedAt');
  els.annualHistoryList.innerHTML = historyRows(groups.annuals, 'annualsCompletedAt');
  els.roseHistoryList.innerHTML = historyRows(groups.roses, 'rosesCompletedAt');
  els.fullHistoryList.innerHTML = historyRows(groups.full, 'completed_at');
  els.completionHistoryList.hidden = !state.historyOpen;
  els.toggleHistoryBtn.textContent = state.historyOpen ? 'Hide history' : 'Show history';
};

els.closeTaskDialogBtn.addEventListener('click', closeTaskDialog);
els.taskDialog.addEventListener('click', event => {
  if (event.target === els.taskDialog) closeTaskDialog();
});
els.taskForm.addEventListener('submit', async event => {
  event.preventDefault();
  const selected = new Set();
  if (els.taskPerennials.checked) selected.add('perennials');
  if (els.taskAnnuals.checked) selected.add('annuals');
  if (els.taskRoses.checked) selected.add('roses');

  if (state.editingAccountId && await saveTaskApplicability(state.editingAccountId, selected)) {
    closeTaskDialog();
  }
});

if (state.session) loadData();
