/* Custody event UI. Uses Firestore only; no Firebase Storage dependency. */
(function(){
'use strict';
const db=()=>firebase.firestore(),auth=()=>firebase.auth(),email=()=>String(auth().currentUser?.email||'').toLowerCase();
const farm=()=>localStorage.getItem('farm-ledger-selected-farm')||'';
let custodyEvents=[];
async function loadCustodyEvents(){
 const f=farm();if(!f||!auth().currentUser)return;
 try{const snap=await db().collection('custodyEvents').where('farmId','==',f).get();custodyEvents=[];snap.forEach(d=>custodyEvents.push({id:d.id,...d.data()}));window.__farmLedgerCustodyEvents=custodyEvents;}
 catch(e){window.__farmLedgerCustodyEvents=[];}
}
function inject(){
 if(document.body?.dataset?.farmLedgerPage!=='handover')return;
 if(document.getElementById('custody-event-card'))return;
 const anchor=document.getElementById('save-handover')?.closest('.card')||document.querySelector('.content');if(!anchor)return;
 const card=document.createElement('div');card.id='custody-event-card';card.className='card';card.style.marginTop='16px';
 card.innerHTML='<h3><i class="fas fa-route" style="color:#2e7d32"></i> Custody Status</h3><p style="font-size:12px;color:#666">Mark an identified animal as returned or lost. A Tag / ID is required.</p><div class="form-group"><label>Handover</label><select id="custody-handover-select" class="form-input"><option value="">Loading handovers…</option></select></div><div class="form-group"><label>Animal ID</label><select id="custody-animal-select" class="form-input"><option value="">Select a handover first</option></select></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button id="custody-return-btn" class="main-btn" type="button">Mark Returned</button><button id="custody-loss-btn" class="main-btn danger-btn" type="button">Mark Lost</button></div><div id="custody-status" style="font-size:12px;margin-top:8px;color:#666"></div>';
 anchor.parentNode.insertBefore(card,anchor.nextSibling);populate();
}
async function getHandovers(){const f=farm();if(!f)return[];const s=await db().collection('transactions').where('farmId','==',f).get(),out=[];s.forEach(d=>{const r={id:d.id,...d.data()};if(r.type==='handover')out.push(r);});return out.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));}
async function populate(){const hs=await getHandovers(),sel=document.getElementById('custody-handover-select');if(!sel)return;sel.innerHTML='<option value="">Select a handover...</option>'+hs.map(h=>`<option value="${h.id}">${String(h.date||'')} — ${String(h.handoverName||'Unknown recipient')}</option>`).join('');sel.onchange=()=>{const h=hs.find(x=>x.id===sel.value),a=document.getElementById('custody-animal-select');a.innerHTML='<option value="">Select animal ID...</option>'+(Array.isArray(h?.handoverLivestock)?h.handoverLivestock.map((x,i)=>{const id=String(x.inventoryId||x.tagId||'').trim();return id?`<option value="${id}">${id} — ${x.animalName||x.animalType||'Animal'} #${i+1}</option>`:'';}).filter(Boolean).join(''):'');};}
async function event(action){const h=document.getElementById('custody-handover-select')?.value,inventoryId=document.getElementById('custody-animal-select')?.value;if(!h||!inventoryId)return setStatus('Select a handover and an identified animal first.',true);try{await db().collection('custodyEvents').add({farmId:farm(),inventoryId,action,actor:email(),date:new Date().toISOString().slice(0,10),transactionId:h,createdAt:firebase.firestore.FieldValue.serverTimestamp()});await loadCustodyEvents();setStatus(action==='return'?'Animal marked as returned.':'Animal marked as lost.');}catch(e){setStatus(e?.message||'Could not save custody event.',true);}}
function setStatus(t,error){const x=document.getElementById('custody-status');if(x){x.textContent=t;x.style.color=error?'#c62828':'#2e7d32';}}
document.addEventListener('DOMContentLoaded',inject);if(document.readyState!=='loading')inject();
document.addEventListener('change',e=>{if(e.target?.id==='custody-handover-select'){} });
document.addEventListener('click',e=>{if(e.target?.id==='custody-return-btn')event('return');if(e.target?.id==='custody-loss-btn')event('loss');});
if(auth().currentUser)loadCustodyEvents();auth().onAuthStateChanged(()=>loadCustodyEvents());
window.__reloadCustodyEvents=loadCustodyEvents;
})();
