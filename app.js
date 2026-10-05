const SUPABASE_URL = 'https://nsxbkfvmknjskjbgqogd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8xjscIHkKtesTauHl2S62w_AHaWCQUf';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const TASKS = [
  { key: 'perennials', name: 'Perennial Cutbacks' },
  { key: 'annuals', name: 'Annual Pulls' },
  { key: 'roses', name: 'Rose Cutbacks' }
];

const state = {
  accounts: [], workTypes: [], search: '', filter: 'all', session: null,
  channel: null, historyOpen: false, activeTab: 'fall-cutbacks'
};

const els = {
  authScreen: document.getElementById('authScreen'), authForm: document.getElementById('authForm'),
  authEmail: document.getElementById('authEmail'), authPassword: document.getElementById('authPassword'),
  authMessage: document.getElementById('authMessage'), signUpBtn: document.getElementById('signUpBtn'),
  signOutBtn: document.getElementById('signOutBtn'), appShell: document.getElementById('appShell'),
  syncStatus: document.getElementById('syncStatus'), addAccountBtn: document.getElementById('addAccountBtn'),
  emptyAddBtn: document.getElementById('emptyAddBtn'), accountDialog: document.getElementById('accountDialog'),
  closeDialogBtn: document.getElementById('closeDialogBtn'), accountForm: document.getElementById('accountForm'),
  accountNameInput: document.getElementById('accountNameInput'), accountsList: document.getElementById('accountsList'),
  accountTemplate: document.getElementById('accountTemplate'), overallPercent: document.getElementById('overallPercent'),
  overallBar: document.getElementById('overallBar'), completeCount: document.getElementById('completeCount'),
  accountCount: document.getElementById('accountCount'), emptyState: document.getElementById('emptyState'),
  searchInput: document.getElementById('searchInput'), filterSelect: document.getElementById('filterSelect'),
  completionHistoryCard: document.getElementById('completionHistoryCard'),
  completionHistoryCount: document.getElementById('completionHistoryCount'),
  perennialCompleteCount: document.getElementById('perennialCompleteCount'),
  annualCompleteCount: document.getElementById('annualCompleteCount'), roseCompleteCount: document.getElementById('roseCompleteCount'),
  toggleHistoryBtn: document.getElementById('toggleHistoryBtn'), completionHistoryList: document.getElementById('completionHistoryList'),
  perennialHistoryList: document.getElementById('perennialHistoryList'), annualHistoryList: document.getElementById('annualHistoryList'),
  roseHistoryList: document.getElementById('roseHistoryList'), fullHistoryList: document.getElementById('fullHistoryList')
};

function companyEmail(email){ return email.trim().toLowerCase().endsWith('@creativexteriors.com'); }
function setAuthMessage(message){ els.authMessage.textContent = message || ''; }
function setSyncStatus(message,error=false){ els.syncStatus.textContent=message; els.syncStatus.classList.toggle('error',error); }
function formatDate(value){ return value ? new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(new Date(value)) : ''; }
function escapeHtml(value){ return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function taskKeyForWorkType(name){ return TASKS.find(t=>t.name===name)?.key || null; }
function workTypeIdForTask(task){ const match=TASKS.find(t=>t.key===task); return state.workTypes.find(w=>w.name===match?.name)?.id; }
function accountPercent(a){ return Math.round(TASKS.reduce((sum,t)=>sum+Number(a[t.key]||0),0)/TASKS.length); }
function isComplete(a){ return TASKS.every(t=>Number(a[t.key])===100); }
function overallPercent(){ return state.accounts.length ? Math.round(state.accounts.reduce((sum,a)=>sum+accountPercent(a),0)/state.accounts.length) : 0; }

async function loadData(){
  setSyncStatus('Syncing…');
  const [accountsResult,workTypesResult,progressResult]=await Promise.all([
    client.from('accounts').select('id,name,created_at,completed_at').order('name'),
    client.from('work_types').select('id,name,sort_order').eq('active',true).order('sort_order'),
    client.from('account_progress').select('account_id,work_type_id,progress,completed_at')
  ]);
  const error=accountsResult.error||workTypesResult.error||progressResult.error;
  if(error){ console.error(error); setSyncStatus('Sync error',true); return; }
  state.workTypes=workTypesResult.data||[];
  const progressMap=new Map((progressResult.data||[]).map(r=>[`${r.account_id}:${r.work_type_id}`,r]));
  state.accounts=(accountsResult.data||[]).map(account=>{
    const assembled={...account};
    TASKS.forEach(t=>{ assembled[t.key]=0; assembled[`${t.key}CompletedAt`]=null; });
    state.workTypes.forEach(wt=>{
      const task=taskKeyForWorkType(wt.name); if(!task) return;
      const row=progressMap.get(`${account.id}:${wt.id}`);
      assembled[task]=Number(row?.progress||0); assembled[`${task}CompletedAt`]=row?.completed_at||null;
    });
    return assembled;
  });
  render(); setSyncStatus('Live sync on');
}

function filteredAccounts(){
  const q=state.search.trim().toLowerCase();
  return [...state.accounts]
    .filter(a=>!q||a.name.toLowerCase().includes(q))
    .filter(a=>state.filter==='active'?!isComplete(a):state.filter==='complete'?isComplete(a):true)
    .sort((a,b)=>Number(isComplete(a))-Number(isComplete(b))||a.name.localeCompare(b.name));
}

async function addAccount(name){
  setSyncStatus('Saving…');
  const {data:account,error}=await client.from('accounts').insert({name:name.trim()}).select('id,name,created_at,completed_at').single();
  if(error){ alert(error.code==='23505'?'That account already exists.':error.message); setSyncStatus('Save failed',true); return false; }
  const rows=state.workTypes.map(w=>({account_id:account.id,work_type_id:w.id,progress:0,updated_by:state.session.user.id}));
  if(rows.length){ const {error:e}=await client.from('account_progress').insert(rows); if(e){ console.error(e); setSyncStatus('Partial save',true); } }
  await loadData(); return true;
}

async function setProgress(accountId,task,value){
  const workTypeId=workTypeIdForTask(task); if(!workTypeId) return;
  const local=state.accounts.find(a=>a.id===accountId); if(!local) return;
  local[task]=Number(value); render(); setSyncStatus('Saving…');
  const {error}=await client.from('account_progress').upsert({
    account_id:accountId,work_type_id:workTypeId,progress:Number(value),updated_at:new Date().toISOString(),updated_by:state.session.user.id
  },{onConflict:'account_id,work_type_id'});
  if(error){ console.error(error); setSyncStatus('Save failed',true); await loadData(); return; }
  setSyncStatus('Live sync on');
}

async function removeAccount(accountId){
  const account=state.accounts.find(a=>a.id===accountId); if(!account||!confirm(`Remove ${account.name}?`)) return;
  const {error}=await client.from('accounts').delete().eq('id',accountId); if(error){ alert(error.message); return; }
  await loadData();
}

function buildAccountCard(account){
  const fragment=els.accountTemplate.content.cloneNode(true), card=fragment.querySelector('.account-card');
  const percent=accountPercent(account), complete=isComplete(account);
  card.dataset.id=account.id; card.classList.toggle('complete',complete);
  fragment.querySelector('.account-name').textContent=account.name;
  fragment.querySelector('.account-percent').textContent=`${percent}%`;
  fragment.querySelector('.account-status').textContent=complete?`COMPLETE · ${formatDate(account.completed_at)}`:'IN PROGRESS';
  fragment.querySelector('.mini-progress-fill').style.width=`${percent}%`;
  fragment.querySelectorAll('.task-block').forEach(block=>{
    const task=block.dataset.task,value=Number(account[task]||0),date=account[`${task}CompletedAt`];
    block.querySelector('.task-percent').textContent=value===100&&date?`100% · ${formatDate(date)}`:`${value}%`;
    block.querySelectorAll('.progress-buttons button').forEach(button=>{
      const buttonValue=Number(button.dataset.value); button.classList.toggle('active',buttonValue===value);
      button.setAttribute('aria-pressed',buttonValue===value?'true':'false');
      button.addEventListener('click',()=>setProgress(account.id,task,buttonValue));
    });
  });
  fragment.querySelector('.delete-btn').addEventListener('click',()=>removeAccount(account.id)); return fragment;
}

function historyRows(items,dateKey){
  if(!items.length) return '<div class="history-empty">None completed yet.</div>';
  return [...items].sort((a,b)=>new Date(b[dateKey])-new Date(a[dateKey])).map(a=>`<div class="history-row"><span class="history-name">${escapeHtml(a.name)}</span><span class="history-date">${formatDate(a[dateKey])}</span></div>`).join('');
}

function renderCompletionHistory(){
  const groups={
    perennials:state.accounts.filter(a=>Number(a.perennials)===100&&a.perennialsCompletedAt),
    annuals:state.accounts.filter(a=>Number(a.annuals)===100&&a.annualsCompletedAt),
    roses:state.accounts.filter(a=>Number(a.roses)===100&&a.rosesCompletedAt),
    full:state.accounts.filter(a=>isComplete(a)&&a.completed_at)
  };
  els.completionHistoryCard.hidden=state.accounts.length===0;
  els.perennialCompleteCount.textContent=groups.perennials.length; els.annualCompleteCount.textContent=groups.annuals.length;
  els.roseCompleteCount.textContent=groups.roses.length; els.completionHistoryCount.textContent=groups.full.length;
  els.perennialHistoryList.innerHTML=historyRows(groups.perennials,'perennialsCompletedAt');
  els.annualHistoryList.innerHTML=historyRows(groups.annuals,'annualsCompletedAt');
  els.roseHistoryList.innerHTML=historyRows(groups.roses,'rosesCompletedAt');
  els.fullHistoryList.innerHTML=historyRows(groups.full,'completed_at');
  els.completionHistoryList.hidden=!state.historyOpen; els.toggleHistoryBtn.textContent=state.historyOpen?'Hide history':'Show history';
}

function renderSummary(){
  const percent=overallPercent(); els.overallPercent.textContent=`${percent}%`; els.overallBar.style.width=`${percent}%`;
  els.completeCount.textContent=state.accounts.filter(isComplete).length; els.accountCount.textContent=state.accounts.length; renderCompletionHistory();
}
function render(){
  renderSummary(); const accounts=filteredAccounts(); els.accountsList.innerHTML='';
  accounts.forEach(a=>els.accountsList.appendChild(buildAccountCard(a))); els.emptyState.hidden=state.accounts.length>0;
  if(state.accounts.length>0&&accounts.length===0) els.accountsList.innerHTML='<div class="empty-state"><h2>No matches</h2><p>Try a different search or filter.</p></div>';
}
function openDialog(){ els.accountForm.reset(); els.accountDialog.showModal(); setTimeout(()=>els.accountNameInput.focus(),50); }
function closeDialog(){ els.accountDialog.close(); }
function switchTab(tab){
  state.activeTab=tab; document.querySelectorAll('.module-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  document.querySelectorAll('.module-panel').forEach(p=>p.classList.toggle('active',p.dataset.panel===tab));
}
function subscribeRealtime(){
  if(state.channel) client.removeChannel(state.channel);
  state.channel=client.channel('operations-live').on('postgres_changes',{event:'*',schema:'public',table:'accounts'},loadData)
    .on('postgres_changes',{event:'*',schema:'public',table:'account_progress'},loadData).subscribe(status=>{ if(status==='SUBSCRIBED') setSyncStatus('Live sync on'); });
}
async function showApp(session){ state.session=session; els.authScreen.hidden=true; els.appShell.hidden=false; await loadData(); subscribeRealtime(); }
function showAuth(){ state.session=null; els.appShell.hidden=true; els.authScreen.hidden=false; if(state.channel) client.removeChannel(state.channel); }

els.authForm.addEventListener('submit',async e=>{ e.preventDefault(); const email=els.authEmail.value.trim(),password=els.authPassword.value; if(!companyEmail(email)) return setAuthMessage('Use your @creativexteriors.com work email.'); setAuthMessage('Signing in…'); const {error}=await client.auth.signInWithPassword({email,password}); setAuthMessage(error?error.message:''); });
els.signUpBtn.addEventListener('click',async()=>{ const email=els.authEmail.value.trim(),password=els.authPassword.value; if(!companyEmail(email)) return setAuthMessage('Use your @creativexteriors.com work email.'); if(password.length<6) return setAuthMessage('Use a password with at least 6 characters.'); setAuthMessage('Creating account…'); const {data,error}=await client.auth.signUp({email,password}); if(error) return setAuthMessage(error.message); setAuthMessage(data.session?'Account created.':'Account created. Check your work email to confirm it, then sign in.'); });
els.signOutBtn.addEventListener('click',()=>client.auth.signOut()); els.addAccountBtn.addEventListener('click',openDialog); els.emptyAddBtn.addEventListener('click',openDialog); els.closeDialogBtn.addEventListener('click',closeDialog);
els.accountDialog.addEventListener('click',e=>{ if(e.target===els.accountDialog) closeDialog(); });
els.accountForm.addEventListener('submit',async e=>{ e.preventDefault(); const name=els.accountNameInput.value.trim(); if(name&&await addAccount(name)) closeDialog(); });
els.searchInput.addEventListener('input',e=>{state.search=e.target.value;render();}); els.filterSelect.addEventListener('change',e=>{state.filter=e.target.value;render();});
els.toggleHistoryBtn.addEventListener('click',()=>{state.historyOpen=!state.historyOpen;renderCompletionHistory();}); document.querySelectorAll('.module-tab').forEach(btn=>btn.addEventListener('click',()=>switchTab(btn.dataset.tab)));
client.auth.onAuthStateChange((_event,session)=>session?showApp(session):showAuth());
(async()=>{ const {data:{session}}=await client.auth.getSession(); session?showApp(session):showAuth(); })();
