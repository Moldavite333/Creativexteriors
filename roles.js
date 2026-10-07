const roleStyles = document.createElement('link');
roleStyles.rel = 'stylesheet';
roleStyles.href = 'roles.css?v=20261007-light01';
document.head.appendChild(roleStyles);

state.profile = null;
state.accountAccess = new Map();
state.notesAccountId = null;

Object.assign(els, {
  roleBadge: null,
  teamPanel: null,
  teamList: null,
  notesDialog: null,
  notesTitle: null,
  notesList: null,
  notesForm: null,
  notesInput: null,
  notesVisibility: null,
  closeNotesDialogBtn: null
});

function canManageAll() {
  return ['admin', 'manager'].includes(state.profile?.role);
}

function canUpdateAccountUI(accountId) {
  if (canManageAll()) return true;
  return state.profile?.role === 'crew' && state.accountAccess.get(accountId) === true;
}

async function loadRoleContext() {
  if (!state.session?.user?.id) return;

  const [profileResult, accessResult] = await Promise.all([
    client.from('profiles').select('user_id,email,display_name,role,active').eq('user_id', state.session.user.id).single(),
    client.from('account_access').select('account_id,can_update').eq('user_id', state.session.user.id)
  ]);

  if (profileResult.error) {
    console.error(profileResult.error);
    return;
  }

  state.profile = profileResult.data;
  state.accountAccess = new Map((accessResult.data || []).map(row => [row.account_id, row.can_update === true]));
  renderRoleChrome();
}

function renderRoleChrome() {
  if (!state.profile) return;

  if (!els.roleBadge) {
    els.roleBadge = document.createElement('span');
    els.roleBadge.className = 'role-badge';
    const sync = document.getElementById('syncStatus');
    sync?.insertAdjacentElement('afterend', els.roleBadge);
  }
  els.roleBadge.textContent = (state.profile.role || '').toUpperCase();

  const addButton = document.getElementById('addAccountBtn');
  if (addButton) addButton.hidden = !canManageAll();
  if (els.emptyAddBtn) els.emptyAddBtn.hidden = !canManageAll();

  ensureTeamTab();
}

function ensureTeamTab() {
  const tabs = document.querySelector('.module-tabs');
  if (!tabs) return;

  let teamTab = tabs.querySelector('[data-tab="team"]');
  if (!teamTab) {
    teamTab = document.createElement('button');
    teamTab.className = 'module-tab';
    teamTab.dataset.tab = 'team';
    teamTab.type = 'button';
    teamTab.textContent = 'Team';
    teamTab.addEventListener('click', () => {
      switchTab('team');
      loadTeam();
    });
    tabs.appendChild(teamTab);
  }

  teamTab.hidden = state.profile?.role !== 'admin';

  if (!document.querySelector('[data-panel="team"]')) {
    const panel = document.createElement('section');
    panel.className = 'module-panel';
    panel.dataset.panel = 'team';
    panel.innerHTML = `
      <div class="module-heading"><div><p class="eyebrow">ACCESS CONTROL</p><h2>Team</h2></div></div>
      <div class="summary-card team-help">
        <strong>Company access</strong>
        <p>New Creativexteriors accounts start as Crew. Promote managers here. Client access will be invite-only and property-specific.</p>
      </div>
      <section id="teamList" class="team-list"></section>
    `;
    document.querySelector('main.app-shell')?.appendChild(panel);
    els.teamPanel = panel;
    els.teamList = panel.querySelector('#teamList');
  }
}

async function loadTeam() {
  if (state.profile?.role !== 'admin' || !els.teamList) return;
  els.teamList.innerHTML = '<div class="history-empty">Loading team…</div>';

  const { data, error } = await client
    .from('profiles')
    .select('user_id,email,display_name,role,active,created_at')
    .order('email');

  if (error) {
    els.teamList.innerHTML = '<div class="history-empty">Could not load team.</div>';
    console.error(error);
    return;
  }

  els.teamList.innerHTML = '';
  (data || []).forEach(person => {
    const row = document.createElement('article');
    row.className = 'team-card';
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(person.display_name || person.email)}</strong>
        <span>${escapeHtml(person.email)}</span>
      </div>
      <select aria-label="Role for ${escapeHtml(person.email)}">
        <option value="admin">Admin</option>
        <option value="manager">Manager</option>
        <option value="crew">Crew</option>
        <option value="client">Client</option>
      </select>
    `;
    const select = row.querySelector('select');
    select.value = person.role;
    if (person.user_id === state.session.user.id) {
      select.disabled = true;
      select.title = 'You cannot demote your own active admin account here.';
    } else {
      select.addEventListener('change', async () => {
        const previous = person.role;
        const next = select.value;
        select.disabled = true;
        const { error: updateError } = await client
          .from('profiles')
          .update({ role: next, updated_at: new Date().toISOString() })
          .eq('user_id', person.user_id);
        if (updateError) {
          console.error(updateError);
          select.value = previous;
          alert('Role change failed: ' + updateError.message);
        } else {
          person.role = next;
        }
        select.disabled = false;
      });
    }
    els.teamList.appendChild(row);
  });
}

function ensureNotesDialog() {
  if (els.notesDialog) return;

  const dialog = document.createElement('dialog');
  dialog.id = 'notesDialog';
  dialog.innerHTML = `
    <div class="dialog-card notes-card">
      <div class="dialog-heading">
        <div><p class="eyebrow">PROPERTY COMMUNICATION</p><h2 id="notesTitle">Notes</h2></div>
        <button id="closeNotesDialogBtn" class="icon-btn" type="button" aria-label="Close">×</button>
      </div>
      <div id="notesList" class="notes-list"></div>
      <form id="notesForm" class="notes-form">
        <label>Message
          <textarea id="notesInput" maxlength="4000" placeholder="Add an instruction, update, or special request…" required></textarea>
        </label>
        <label>Visibility
          <select id="notesVisibility">
            <option value="internal">Internal team only</option>
            <option value="client">Visible to client</option>
          </select>
        </label>
        <button class="primary-btn wide" type="submit">Post note</button>
      </form>
    </div>
  `;
  document.body.appendChild(dialog);

  els.notesDialog = dialog;
  els.notesTitle = dialog.querySelector('#notesTitle');
  els.notesList = dialog.querySelector('#notesList');
  els.notesForm = dialog.querySelector('#notesForm');
  els.notesInput = dialog.querySelector('#notesInput');
  els.notesVisibility = dialog.querySelector('#notesVisibility');
  els.closeNotesDialogBtn = dialog.querySelector('#closeNotesDialogBtn');

  els.closeNotesDialogBtn.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  els.notesForm.addEventListener('submit', postPropertyNote);
}

async function openPropertyNotes(account) {
  ensureNotesDialog();
  state.notesAccountId = account.id;
  els.notesTitle.textContent = account.name;
  els.notesInput.value = '';
  els.notesVisibility.value = 'internal';

  const canWrite = canUpdateAccountUI(account.id);
  els.notesInput.disabled = !canWrite;
  els.notesVisibility.disabled = !canWrite;
  els.notesForm.querySelector('button[type="submit"]').hidden = !canWrite;

  els.notesDialog.showModal();
  await loadPropertyNotes(account.id);
}

async function loadPropertyNotes(accountId) {
  els.notesList.innerHTML = '<div class="history-empty">Loading notes…</div>';
  const { data, error } = await client
    .from('property_notes')
    .select('id,body,visibility,created_at,author_id')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    els.notesList.innerHTML = '<div class="history-empty">Could not load notes.</div>';
    return;
  }

  if (!data?.length) {
    els.notesList.innerHTML = '<div class="history-empty">No notes yet.</div>';
    return;
  }

  els.notesList.innerHTML = data.map(note => `
    <article class="note-row">
      <div class="note-meta">
        <span>${note.visibility === 'client' ? 'CLIENT VISIBLE' : 'INTERNAL'}</span>
        <time>${new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(note.created_at))}</time>
      </div>
      <p>${escapeHtml(note.body)}</p>
    </article>
  `).join('');
}

async function postPropertyNote(event) {
  event.preventDefault();
  const body = els.notesInput.value.trim();
  if (!body || !state.notesAccountId) return;

  const { error } = await client.from('property_notes').insert({
    account_id: state.notesAccountId,
    author_id: state.session.user.id,
    body,
    visibility: els.notesVisibility.value
  });

  if (error) {
    console.error(error);
    alert('Could not post note: ' + error.message);
    return;
  }

  els.notesInput.value = '';
  await loadPropertyNotes(state.notesAccountId);
}

const priorBuildAccountCard = buildAccountCard;
buildAccountCard = function(account) {
  const fragment = priorBuildAccountCard(account);
  const card = fragment.querySelector('.account-card');
  if (!card) return fragment;

  const actions = card.querySelector('.account-head-actions');
  const manageButton = card.querySelector('.edit-tasks-btn');
  const deleteButton = card.querySelector('.delete-btn');
  const writable = canUpdateAccountUI(account.id);

  if (manageButton) manageButton.hidden = !writable;
  if (deleteButton) deleteButton.hidden = !canManageAll();

  card.querySelectorAll('.progress-buttons button').forEach(button => {
    button.disabled = !writable;
  });
  card.querySelectorAll('.task-na-btn').forEach(button => {
    button.hidden = !writable;
  });

  const notesButton = document.createElement('button');
  notesButton.type = 'button';
  notesButton.className = 'property-notes-btn';
  notesButton.textContent = 'Notes';
  notesButton.addEventListener('click', () => openPropertyNotes(account));
  actions?.appendChild(notesButton);

  return fragment;
};

const priorShowApp = showApp;
showApp = async function(session) {
  state.session = session;
  await loadRoleContext();
  await priorShowApp(session);
  renderRoleChrome();
};

const priorRender = render;
render = function() {
  priorRender();
  renderRoleChrome();
};

client
  .channel('property-notes-live')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'property_notes' }, payload => {
    if (els.notesDialog?.open && state.notesAccountId) loadPropertyNotes(state.notesAccountId);
  })
  .subscribe();

if (state.session) {
  loadRoleContext().then(() => {
    renderRoleChrome();
    render();
  });
}
