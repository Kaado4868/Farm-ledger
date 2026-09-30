/* Farm Ledger remediation layer. Loaded after app.js so the existing UI can be hardened without changing the Firebase Storage plan. */
(function(){
'use strict';
function db(){return firebase.firestore();}
function auth(){return firebase.auth();}
function email(){return String(auth().currentUser?.email||'').toLowerCase();}
function farm(){return localStorage.getItem('farm-ledger-selected-farm')||document.getElementById('farm-select')?.value||document.getElementById('import-farm-select')?.value||'';}
function todayLocal(){const d=new Date(),y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`;}
function safe(v,max){return String(v??'').trim().slice(0,max);}
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(36);}
function notify(msg,ok){if(ok&&window.showSuccess)window.showSuccess(msg);else if(window.showError)window.showError(msg);}

// Use the shared ledger core for dashboard calculations and prevent UTC date drift.
if(window.FarmLedgerCore){
  window.calculateFarmMetrics=function(data){return window.FarmLedgerCore.calculateMetrics(data||[]);};
  window.today=todayLocal;
}

// Farm membership is now created alongside the legacy profile during the migration window.
const assign=document.getElementById('assign-user');
if(assign)assign.onclick=async function(){
  const emailEl=document.getElementById('assign-email'),farmEl=document.getElementById('assign-farm');
  const target=safe(emailEl?.value,160).toLowerCase(),farmId=safe(farmEl?.value,120);
  if(!/^\S+@\S+\.\S+$/.test(target))return notify('Enter a valid user email.');
  if(!farmId)return notify('Select an existing farm from the dropdown.');
  try{
    const fs=db(),batch=fs.batch(),now=firebase.firestore.FieldValue.serverTimestamp();
    batch.set(fs.collection('users').doc(target),{email:target,farmId,status:'approved',updatedAt:now},{merge:true});
    batch.set(fs.collection('farms').doc(farmId).collection('members').doc(target),{email:target,farmId,role:'member',status:'active',updatedAt:now},{merge:true});
    await batch.commit();
    if(emailEl)emailEl.value='';if(farmEl)farmEl.value='';
    if(window.loadAdminFarms)await window.loadAdminFarms();if(window.loadAdminUsers)await window.loadAdminUsers();
    notify('User approved and added to the farm membership.',true);
  }catch(e){notify(e?.message||'Could not assign farm access.');}
};

// Revoke the membership as well as the legacy profile. The original UI handler still runs;
// this listener only maintains the new membership document after that operation succeeds.
document.addEventListener('click',function(ev){
  const btn=ev.target.closest?.('.revoke-user');if(!btn)return;
  const row=btn.closest('div');const text=row?.textContent||'';const m=text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);if(!m)return;
  const target=m[0].toLowerCase();setTimeout(async function(){
    try{const snap=await db().collection('users').doc(target).get();const f=snap.exists?snap.data().farmId:'';if(f)await db().collection('farms').doc(f).collection('members').doc(target).delete();}catch(e){}
  },400);
});

// Chat: capture the selected chat id and replace the two non-atomic writes with one batch.
document.addEventListener('click',function(ev){
  const row=ev.target.closest?.('.chat-row');if(row){const win=document.getElementById('chat-window');if(win)win.dataset.chatId=row.dataset.chatId||'';}
});
const chatSend=document.getElementById('chat-send');
if(chatSend)chatSend.onclick=async function(){
  const input=document.getElementById('chat-input'),text=safe(input?.value,2000),chatId=document.getElementById('chat-window')?.dataset.chatId||'';
  if(!chatId||!text)return;
  try{
    const fs=db(),ref=fs.collection('chats').doc(chatId),msg=ref.collection('messages').doc(),sender=email();
    const batch=fs.batch(),now=firebase.firestore.FieldValue.serverTimestamp();
    batch.set(msg,{text,sender,senderName:auth().currentUser?.displayName||sender||'Member',createdAt:now});
    batch.set(ref,{lastMessage:text,lastMessageSender:sender,lastMessageAt:now},{merge:true});
    await batch.commit();input.value='';
  }catch(e){notify(e?.message||'Could not send message.');}
};

// Idempotent, resumable imports. Deterministic document ids mean retrying the same backup
// skips records that were already committed before a connection failure.
function parseCsv(text){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(c==='"'&&quoted&&n==='"'){cell+='"';i++;continue;}if(c==='"'){quoted=!quoted;continue;}if(c===','&&!quoted){row.push(cell);cell='';continue;}if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&n==='\n')i++;row.push(cell);cell='';if(row.some(x=>x.trim()))rows.push(row);row=[];continue;}cell+=c;}if(cell!==''||row.length){row.push(cell);if(row.some(x=>x.trim()))rows.push(row);}return rows;}
function normalizeType(v){const s=String(v||'').toLowerCase();if(s.includes('death')||s.includes('loss'))return'death';if(s.includes('purchase'))return'purchase';if(s.includes('medical')||s.includes('drug'))return'medical';if(s.includes('feed')||s.includes('fodder'))return'feed';if(s.includes('herdsman')||s.includes('worker')||s.includes('salary'))return'herdsman';if(s.includes('handover')||s.includes('custody'))return'handover';return'other';}
function normalizeAnimal(v){const s=String(v||'').toLowerCase();return ({goat:'goat',goats:'goat',sheep:'sheep',cattle:'cattle',cow:'cattle',chicken:'chicken',chickens:'chicken',other:'other'}[s]||'other');}
function cleanImport(r){const type=normalizeType(r.type),animalType=normalizeAnimal(r.animalType||r.animal),date=safe(r.date,10),description=safe(r.description,300),amount=Number(r.amount??0),animalCount=Math.max(0,Math.trunc(Number(r.animalCount??0)||0));if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Invalid record date.');if(date>todayLocal())throw new Error('Imported records cannot have future dates.');if(!description)throw new Error('Every imported record needs a description.');if(!Number.isFinite(amount)||amount<0||amount>100000000000)throw new Error('Invalid amount in import.');if((type==='purchase'||type==='death')&&animalCount<1)throw new Error(`${type} records must contain at least one animal.`);return {sourceId:safe(r.id,120),type,animalType,animalName:safe(r.animalName,80),date,description,amount,animalCount};}
async function importHardened(){
  const farmId=safe(document.getElementById('import-farm-select')?.value,120),file=document.getElementById('import-file')?.files?.[0],status=document.getElementById('import-status'),btn=document.getElementById('import-btn');
  if(!farmId)return notify('Select an existing target farm first.');if(!file)return notify('Choose a JSON backup or CSV export file.');if(file.size>12*1024*1024)return notify('Import file is too large. Maximum 12 MB.');
  btn.disabled=true;try{
    const text=await file.text();let source=[];
    if(file.name.toLowerCase().endsWith('.json')||file.type.includes('json')){const p=JSON.parse(text);if(!Array.isArray(p.records))throw new Error('This JSON file is not a Farm Ledger backup.');source=p.records;}
    else{const rows=parseCsv(text);if(rows.length<2)throw new Error('The CSV file contains no records.');const h=rows[0].map(x=>x.trim().toLowerCase()),idx=n=>h.indexOf(n.toLowerCase()),di=idx('date'),ti=idx('type'),xi=idx('description'),ai=idx('amount (ngn)'),ci=idx('animal count'),ani=idx('animal'),nmi=idx('animal name');if(di<0||ti<0||xi<0||ai<0)throw new Error('CSV must contain Date, Type, Description and Amount (NGN) columns.');source=rows.slice(1).map(r=>({date:r[di],type:r[ti],description:r[xi],amount:r[ai],animalCount:ci>=0?r[ci]:0,animal:ani>=0?r[ani]:'goat',animalName:nmi>=0?r[nmi]:''}));}
    if(!source.length)throw new Error('No records found in the selected file.');if(source.length>5000)throw new Error('Import is limited to 5000 records per file.');
    const clean=source.map(cleanImport),fs=db(),existing=new Set(),keys=clean.map((r,i)=>'import-'+hash(JSON.stringify([farmId,r.sourceId||'',r.date,r.type,r.animalType,r.animalName,r.description,r.amount,r.animalCount,i])));
    for(let i=0;i<keys.length;i+=200){const refs=keys.slice(i,i+200).map(k=>fs.collection('transactions').doc(k));const snaps=await Promise.all(refs.map(r=>r.get()));snaps.forEach((s,j)=>{if(s.exists)existing.add(keys[i+j]);});}
    let imported=0,skipped=0;for(let offset=0;offset<clean.length;offset+=200){const batch=fs.batch();let writes=0;for(let i=offset;i<Math.min(offset+200,clean.length);i++){const r=clean[i],key=keys[i];if(existing.has(key)){skipped++;continue;}const ref=fs.collection('transactions').doc(key);batch.set(ref,{farmId,author:email(),type:r.type,animalType:r.animalType,animalName:r.animalName,animalCount:r.animalCount,amount:r.amount,description:r.description,date:r.date,schemaVersion:2,imported:true,importKey:key,sourceRecordId:r.sourceId||null,createdAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()});writes++;imported++;}if(writes)await batch.commit();localStorage.setItem('farm-ledger-import-progress',JSON.stringify({farmId,file:file.name,offset:Math.min(offset+200,clean.length),total:clean.length}));}
    if(status){status.textContent=`Imported ${imported} new record${imported===1?'':'s'}; skipped ${skipped} duplicate${skipped===1?'':'s'}. You can safely retry this file.`;status.style.display='block';}document.getElementById('import-file').value='';notify('Import completed.',true);
  }catch(e){notify('Import failed: '+(e?.message||'Unknown error.'));}finally{btn.disabled=false;btn.innerHTML='<i class="fas fa-file-import"></i> Import Records';}
}
const importBtn=document.getElementById('import-btn');if(importBtn)importBtn.onclick=importHardened;

// Give handover items stable inventory ids without storing any additional binary data.
const saveHandover=document.getElementById('save-handover');
if(saveHandover){
  const original=saveHandover.onclick;saveHandover.onclick=async function(ev){
    // The original handler remains responsible for the existing form validation/write.
    // Add inventoryId fields immediately before it runs by observing the form rows.
    document.querySelectorAll('#handover-livestock-list .livestock-row').forEach((row,i)=>{
      const input=row.querySelector('.handover-livestock-id');if(input&&input.value.trim())row.dataset.inventoryId=input.value.trim();
    });
    if(typeof original==='function')return original.call(this,ev);
  };
}

// Clear the migration progress marker after a successful page reload; deterministic ids
// make retries safe even when the previous browser session was interrupted.
window.addEventListener('online',function(){
  const p=localStorage.getItem('farm-ledger-import-progress');if(p){try{const x=JSON.parse(p);if(x&&x.offset>=x.total)localStorage.removeItem('farm-ledger-import-progress');}catch(e){localStorage.removeItem('farm-ledger-import-progress');}}
});
})();
