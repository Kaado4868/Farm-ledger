const firebaseConfig={
 apiKey:"AIzaSyBNEK3cSaxK0pEI1sOufrVpQkhf2ENK-rw",
 authDomain:"goatledger-132c7.firebaseapp.com",
 projectId:"goatledger-132c7",
 storageBucket:"goatledger-132c7.firebasestorage.app",
 messagingSenderId:"576591882291",
 appId:"1:576591882291:web:9d540d6c99150a63e81b46"
};

firebase.initializeApp(firebaseConfig);
const auth=firebase.auth(),db=firebase.firestore();

// Firestore offline persistence: records are cached locally in IndexedDB and
// writes are queued by Firebase and synchronized automatically when the
// connection returns. synchronizeTabs keeps multiple browser tabs coherent.
let firestoreReady=db.enablePersistence({synchronizeTabs:true}).catch(err=>{
  console.warn("Firestore offline persistence unavailable:",err);
  return null;
});
const googleProvider=new firebase.auth.GoogleAuthProvider();
const SUPER_ADMIN="abdulkadirbukar2006@gmail.com";
const SELECTED_FARM_KEY="farm-ledger-selected-farm";

let currentUser=null,currentFarmId="",records=[],unsubscribeRecords=null,unsubscribeNotifications=null,unsubscribeChats=null,unsubscribeMessages=null,currentChatId="";
let notificationKnownIds=new Set(),notificationInitialized=false;
let selectedGoatImages=[],selectedReceipt=null,selectedHandoverPhotos=[],imagesCleared=false;
let isSuperAdminViewingAsAdmin=false;
let expensePeriod="all";
const $=id=>document.getElementById(id);

let errorToastTimer=null,successToastTimer=null;
function showError(message){
 const text=String(message||"");
 if(!navigator.onLine && /network|offline|failed to get document|unavailable/i.test(text)) return;
 const box=$("error-box"); box.textContent=text; box.style.display="block";
 clearTimeout(errorToastTimer);
 errorToastTimer=setTimeout(()=>box.style.display="none",5000);
}
function showSuccess(message){
 const box=$("success-box"); box.textContent=message; box.style.display="block";
 setTimeout(()=>box.style.display="none",4000);
}
function getVerificationActionCodeSettings(){
 const returnUrl=window.location.origin+window.location.pathname+"?verified=1";
 return {url:returnUrl,handleCodeInApp:false};
}
async function sendBrandedVerificationEmail(user){
 if(!user)throw new Error("No signed-in account was found.");
 await user.sendEmailVerification(getVerificationActionCodeSettings());
}
function handleVerificationReturn(){
 const params=new URLSearchParams(window.location.search);
 if(params.get("verified")==="1"){
  history.replaceState({},document.title,window.location.pathname);
  setTimeout(()=>showSuccess("Email verified. You can now sign in to Farm Ledger."),250);
 }
}
handleVerificationReturn();

function getFriendlyErrorMessage(err){
 const msg=(typeof err==="string"?err:(err?.message||"")).toLowerCase();
 if(msg.includes("invalid_login_credentials")||msg.includes("invalid-credential")||msg.includes("wrong-password")||msg.includes("user-not-found")) return "Invalid email or password.";
 if(msg.includes("email-already-in-use")) return "This email address is already registered.";
 if(msg.includes("invalid-email")) return "Please enter a valid email address.";
 if(msg.includes("weak-password")) return "Password should be at least 8 characters.";
 if(msg.includes("too-many-requests")) return "Too many attempts. Please wait and try again.";
 if(msg.includes("permission-denied")||msg.includes("missing or insufficient permissions")) return "Permission denied. Your account may not have the required farm access.";
 if(msg.includes("network")) return "Network error. Check your connection and try again.";
 return err?.message||"An unexpected error occurred. Please try again.";
}
function money(n){return "₦"+Number(n||0).toLocaleString("en-NG");}
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function animalLabel(type,name){return name&&String(name).trim()?String(name).trim():({goat:"Goat",sheep:"Sheep",cattle:"Cattle",chicken:"Chicken",other:"Animal"}[type]||"Animal");}
function animalIcon(type){return ({goat:"fa-paw",sheep:"fa-paw",cattle:"fa-cow",chicken:"fa-kiwi-bird",other:"fa-paw"}[type]||"fa-paw");}
function isSuperAdmin(){return !!currentUser && (currentUser.email||"").toLowerCase()===SUPER_ADMIN;}
function today(){return new Date().toISOString().slice(0,10);}

function showScreen(id){
  if(id==="dashboard"){
    const page="dashboard.html";
    if(window.location.pathname.endsWith("/"+page)||window.location.pathname.endsWith(page)) return;
    window.location.href=page;
    return;
  }
  document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n=>n.classList.remove("active"));
  ["admin-tools","admin-notifications","admin-chat"].forEach(panelId=>{
    const panel=$(panelId);
    if(panel){panel.classList.add("hidden");panel.style.display="none";}
  });
  document.querySelectorAll(".sub-screen").forEach(panel=>{
    panel.classList.add("hidden");panel.style.display="none";
  });
  const screen=$(id);
  if(screen)screen.classList.add("active");
  const nav=document.querySelector(`.nav-item[data-screen="${id}"]`);
  if(nav)nav.classList.add("active");
  if(id==="admin" && isSuperAdmin()) switchAdminPanel("admin-tools");
  else if(id==="manage"){
    const history=document.querySelector('.manage-tab[data-sub="sub-history"]');
    document.querySelectorAll(".manage-tab").forEach(t=>t.classList.remove("active"));
    if(history)history.classList.add("active");
    const historyPanel=$("sub-history");
    if(historyPanel){historyPanel.classList.remove("hidden");historyPanel.style.display="block";}
  }
}

document.querySelectorAll(".nav-item").forEach(item=>item.onclick=()=>{
  const target=item.dataset.screen;
  if(target==="dashboard"||target==="manage"||target==="chat"||target==="admin"){
    const pageMap={dashboard:"dashboard.html",manage:"manage.html",chat:"chat.html",admin:"admin.html"};
    const page=pageMap[target];
    if(page && !(window.location.pathname.endsWith("/"+page)||window.location.pathname.endsWith(page))){
      window.location.href=page;
      return;
    }
  }
  showScreen(target);
});
function switchAdminPanel(panelId){
 if(!isSuperAdmin())return;
 const panels=["admin-tools","admin-notifications","admin-chat"];
 panels.forEach(id=>{
  const panel=$(id);
  if(panel){
   panel.classList.toggle("hidden",id!==panelId);
   panel.style.display=id===panelId?"block":"none";
  }
 });
 document.querySelectorAll(".admin-panel-tab").forEach(t=>t.classList.toggle("active",t.dataset.adminPanel===panelId));
}
document.querySelectorAll(".admin-panel-tab").forEach(tab=>tab.onclick=()=>{
 switchAdminPanel(tab.dataset.adminPanel);
});

$("open-handover-tab").onclick=()=>{
 showScreen("manage");
 const tab=document.querySelector('.manage-tab[data-sub="sub-handover"]');
 if(tab)tab.click();
};

["history-filter","history-animal-filter","history-from","history-to","history-search"].forEach(id=>{
 const el=$(id); if(!el) return;
 el.addEventListener(el.type==="search"||el.tagName==="INPUT"?"input":"change",()=>render());
});

document.querySelectorAll(".manage-tab").forEach(tab=>{
 tab.onclick=()=>{
  document.querySelectorAll(".manage-tab").forEach(t=>t.classList.remove("active"));
  document.querySelectorAll(".sub-screen").forEach(s=>s.classList.add("hidden"));
  tab.classList.add("active"); $(tab.dataset.sub).classList.remove("hidden");
  if(tab.dataset.sub==="sub-handover"){resetHandoverForm();}
 };
});

$("record-date").valueAsDate=new Date();

let loginMode=true;
$("auth-toggle").onclick=()=>{
 loginMode=!loginMode;
 $("auth-title").textContent=loginMode?"Sign in to your account":"Create a new account";
 $("email-btn").textContent=loginMode?"Login":"Sign Up";
 $("auth-toggle").textContent=loginMode?"Need an account? Register here":"Already have an account? Login here";
 $("password").autocomplete=loginMode?"current-password":"new-password";
 $("password-hint").classList.toggle("hidden",loginMode);
 $("forgot-password").classList.toggle("hidden",!loginMode);
};

$("forgot-password").onclick=async()=>{
 const email=$("email").value.trim().toLowerCase();
 if(!email)return showError("Enter your email address first.");
 try{
  await auth.sendPasswordResetEmail(email);
  showSuccess("Password reset email sent. Check your inbox and spam folder.");
 }catch(e){showError(getFriendlyErrorMessage(e));}
};

$("email-btn").onclick=async()=>{
 const email=$("email").value.trim().toLowerCase(),password=$("password").value;
 if(!email||!password)return showError("Please enter your email and password.");
 if(!loginMode && password.length<8)return showError("Password must be at least 8 characters.");
 const btn=$("email-btn");btn.disabled=true;btn.textContent="Processing...";
 try{
  if(loginMode) await auth.signInWithEmailAndPassword(email,password);
  else{
   const cred=await auth.createUserWithEmailAndPassword(email,password);
   if(cred.user && !cred.user.emailVerified) await sendBrandedVerificationEmail(cred.user);
  }
 }catch(e){showError(getFriendlyErrorMessage(e));}
 finally{btn.disabled=false;btn.textContent=loginMode?"Login":"Sign Up";}
};

$("google-btn").onclick=async()=>{
 try{await auth.signInWithPopup(googleProvider);}
 catch(e){showError(getFriendlyErrorMessage(e));}
};

$("logout").onclick=async()=>{
 if(unsubscribeRecords)unsubscribeRecords();
 unsubscribeRecords=null;isSuperAdminViewingAsAdmin=false;currentFarmId="";localStorage.removeItem(SELECTED_FARM_KEY);
 await auth.signOut();
};
$("pending-logout").onclick=async()=>{if(unsubscribeRecords)unsubscribeRecords();await auth.signOut();};
$("verification-logout").onclick=async()=>{if(unsubscribeRecords)unsubscribeRecords();await auth.signOut();};

$("resend-verification").onclick=async()=>{
 try{await sendBrandedVerificationEmail(auth.currentUser);showSuccess("Verification email sent. Check your inbox for the Farm Ledger verification email.");}
 catch(e){showError(getFriendlyErrorMessage(e));}
};
$("refresh-verification").onclick=async()=>{
 try{
  await auth.currentUser.reload();
  if(auth.currentUser.emailVerified) location.reload();
  else showError("Your email is still not verified.");
 }catch(e){showError(getFriendlyErrorMessage(e));}
};

$("switch-farm-btn").onclick=()=>{
 if(isSuperAdmin()){
  if(unsubscribeRecords)unsubscribeRecords();
  isSuperAdminViewingAsAdmin=true;
  $("switch-farm-btn").classList.add("hidden");
  $("app-view").classList.remove("hidden");
  loadAdminFarms();loadAdminUsers();showScreen("admin");
 }
};


let lastSyncHadPendingWrites=false;
let lastSyncWasFromCache=false;

function updateSyncStatus(pendingWrites, fromCache){
  const bar=$("sync-status-bar"), text=$("sync-status-text");
  if(!bar||!text)return;
  lastSyncHadPendingWrites=!!pendingWrites;
  lastSyncWasFromCache=!!fromCache;

  bar.classList.remove("offline","pending","synced");
  if(!navigator.onLine){
    bar.classList.remove("show");
    return;
  }else if(pendingWrites){
    bar.classList.add("pending");
    text.textContent="Syncing changes…";
  }else{
    bar.classList.add("synced");
    text.textContent=fromCache ? "Using saved data • synced when online" : "Synced";
    setTimeout(()=>{
      if(navigator.onLine && !lastSyncHadPendingWrites && $("sync-status-bar")){
        $("sync-status-bar").classList.remove("show");
      }
    },3500);
  }
  bar.classList.add("show");
}

function refreshConnectionStatus(){
  const bar=$("sync-status-bar"), text=$("sync-status-text");
  if(!bar||!text)return;
  if(!navigator.onLine){
    bar.classList.remove("offline","pending","synced","show");
    return;
  }
  if(lastSyncHadPendingWrites){
    bar.classList.remove("offline","synced");
    bar.classList.add("pending","show");
    text.textContent="Syncing changes…";
  }
}
window.addEventListener("online",refreshConnectionStatus);
window.addEventListener("offline",refreshConnectionStatus);

async function ensureUserProfile(user){
 const email=(user.email||"").toLowerCase();
 if(!email)return null;
 const ref=db.collection("users").doc(email);
 const snap=await ref.get();
 if(!snap.exists && email!==SUPER_ADMIN){
  await ref.set({
   email,
   farmId:"",
   status:"pending",
   createdAt:firebase.firestore.FieldValue.serverTimestamp()
  });
 }
 return (await ref.get()).data()||null;
}

auth.onAuthStateChanged(async user=>{
 currentUser=user;
 $("splash-view").classList.add("hidden");
 ["auth-view","pending-view","verify-view","app-view"].forEach(id=>$(id).classList.add("hidden"));
 if(!user){$("auth-view").classList.remove("hidden");return;}

 $("auth-view").classList.add("hidden");
 try{
  await firestoreReady;
  if(!user.emailVerified){
   $("verify-view").classList.remove("hidden");
   $("verify-message").textContent=`Please verify ${user.email||"your email"} before accessing the farm ledger.`;
   return;
  }

  const email=(user.email||"").toLowerCase();
  if(email===SUPER_ADMIN && !isSuperAdminViewingAsAdmin){
   $("admin-nav").classList.remove("hidden");$("switch-farm-btn").classList.remove("hidden");
   const savedFarm=localStorage.getItem(SELECTED_FARM_KEY)||"";
   if(savedFarm){
    // Restore the last farm immediately; background admin data loading should not
    // make the user wait before seeing their farm.
    currentFarmId=savedFarm;
    isSuperAdminViewingAsAdmin=true;
    $("farm-name").textContent="Farm: "+savedFarm;
    $("app-view").classList.remove("hidden");
    loadRecords();
    startNotificationListener();
    showScreen("dashboard");
   }else{
    $("farm-name").textContent="Super Admin Mode";$("app-view").classList.remove("hidden");
    showScreen("admin");
   }
   // Populate admin controls in the background.
   loadAdminFarms().then(()=>{
    const farm=savedFarm;
    if(farm && $("farm-select") && Array.from($("farm-select").options).some(o=>o.value===farm)){
     $("farm-select").value=farm;
    }else if(farm){
     localStorage.removeItem(SELECTED_FARM_KEY);
     currentFarmId="";
     if(unsubscribeRecords)unsubscribeRecords();
     unsubscribeRecords=null;
     $("app-view").classList.add("hidden");
     isSuperAdminViewingAsAdmin=false;
     showScreen("admin");
    }
   }).catch(()=>{});
   loadAdminUsers().catch(()=>{});
   loadAdminNotifications().catch(()=>{});
   loadAdminChats().catch(()=>{});
   startChatListener();
   return;
  }

  if(email===SUPER_ADMIN){
   $("admin-nav").classList.remove("hidden");$("switch-farm-btn").classList.remove("hidden");
   if(currentFarmId){$("app-view").classList.remove("hidden");loadRecords();startNotificationListener();return;}
  }else $("admin-nav").classList.add("hidden");

  const profile=await ensureUserProfile(user);
  if(profile?.farmId && profile.status!=="revoked"){
   currentFarmId=profile.farmId;
   $("farm-name").textContent="Farm: "+currentFarmId;
   $("app-view").classList.remove("hidden");loadRecords();startChatListener();
  }else{
   $("pending-view").classList.remove("hidden");
  }
 }catch(e){showError("Could not load your account: "+getFriendlyErrorMessage(e));}
});

let lastRecordsListenerRefresh=0;
function loadRecords(){
 if(!currentFarmId)return;
 const now=Date.now();
 if(unsubscribeRecords)unsubscribeRecords();
 lastRecordsListenerRefresh=now;
 unsubscribeRecords=db.collection("transactions")
  .where("farmId","==",currentFarmId)
  .onSnapshot({includeMetadataChanges:true},snapshot=>{
   records=[];
   snapshot.forEach(doc=>records.push({id:doc.id,...doc.data()}));
   records.sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))||Number(b.createdAt?.toMillis?.()||b.createdAt||0)-Number(a.createdAt?.toMillis?.()||a.createdAt||0));
   updateSyncStatus(snapshot.metadata.hasPendingWrites,snapshot.metadata.fromCache);
   render();
  },e=>{
   refreshConnectionStatus();
   if(navigator.onLine)showError(getFriendlyErrorMessage(e));
  });
}

// Firestore already streams changes in real time. These lightweight reconnection
// hooks make the stream self-healing when the phone sleeps, changes network,
// or the installed app is resumed without requiring a refresh button.
window.addEventListener("online",()=>{
 if(currentFarmId && Date.now()-lastRecordsListenerRefresh>1000)loadRecords();
});
document.addEventListener("visibilitychange",()=>{
 if(!document.hidden && currentFarmId && Date.now()-lastRecordsListenerRefresh>15000)loadRecords();
});

function getDateKey(r){return r.date||today();}
function formatDateHeader(date){
 if(!date)return "Undated";
 const d=new Date(date+"T00:00:00");
 return isNaN(d)?"Undated":d.toLocaleDateString("en-NG",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
}
function getPeriodRange(period){
 const end=today();let start="0000-01-01",label="All Time";
 const d=new Date(end+"T00:00:00");
 if(period==="today"){start=end;label="Today";}
 else if(period==="7d"){d.setDate(d.getDate()-6);start=d.toISOString().slice(0,10);label="Last 7 Days";}
 else if(period==="30d"){d.setDate(d.getDate()-29);start=d.toISOString().slice(0,10);label="Last 30 Days";}
 else if(period==="month"){start=end.slice(0,8)+"01";label="This Month";}
 else if(period==="3m"){d.setMonth(d.getMonth()-2);d.setDate(1);start=d.toISOString().slice(0,10);label="Last 3 Months";}
 else if(period==="year"){start=end.slice(0,4)+"-01-01";label="This Year";}
 else if(period==="custom"){start=$("expense-from").value||"0000-01-01";return {start,end:$("expense-to").value||end,label:`${start==="0000-01-01"?"All":start} → ${$("expense-to").value||end}`};}
 return {start,end,label};
}
function calculateFarmMetrics(data){
 let spent=0,lossValue=0;
 const animalTotals={},animalValue={};
 data.forEach(r=>{
  const animal=r.animalType||"goat";
  const count=Math.abs(Number(r.animalCount??r.goatCount??0)||0);
  const amount=Math.max(0,Number(r.amount)||0);
  if(r.type==="death"){
   animalTotals[animal]=(animalTotals[animal]||0)-count;
   lossValue+=amount;
   animalValue[animal]=(animalValue[animal]||0)-amount;
  }else if(r.type==="purchase"){
   // Only livestock purchase records can increase an animal count.
   animalTotals[animal]=(animalTotals[animal]||0)+count;
   animalValue[animal]=(animalValue[animal]||0)+amount;
  }else{
   // Medical, feed, herdsman and other expenses never affect livestock counts/value.
   spent+=amount;
  }
 });
 Object.keys(animalTotals).forEach(a=>{animalTotals[a]=Math.max(0,animalTotals[a]);});
 const totalValue=Math.max(0,Object.values(animalValue).reduce((a,b)=>a+b,0));
 return {spent,lossValue,totalValue,animalTotals};
}
function render(){
 const metrics=calculateFarmMetrics(records);
 $("total-spent").textContent=money(metrics.spent);
 $("total-farm-value").textContent=money(metrics.totalValue);
 $("total-loss-value").textContent=money(metrics.lossValue);
 if($("expense-value-home")) $("expense-value-home").textContent=money(metrics.spent);
 $("total-records-count").textContent=records.length;
 const lossCount=records.filter(r=>r.type==="death").reduce((sum,r)=>sum+Math.abs(Number(r.animalCount??r.goatCount??0)||0),0);
 const purchaseCount=records.filter(r=>r.type==="purchase").length;
 const lastDate=records.map(r=>r.date).filter(Boolean).sort().pop();
 $("snapshot-live-animals").textContent=Math.max(0,records.filter(r=>r.type==="purchase"||r.type==="death").reduce((sum,r)=>{
  const count=Math.abs(Number(r.animalCount??r.goatCount??0)||0);
  return sum+(r.type==="death"?-count:r.type==="purchase"?count:0);
},0));
 $("snapshot-loss-count").textContent=lossCount;
 $("snapshot-purchases").textContent=purchaseCount;
 $("snapshot-last-date").textContent=lastDate?new Date(lastDate+"T00:00:00").toLocaleDateString("en-NG",{day:"2-digit",month:"short",year:"numeric"}):"—";
 const handovers=records.filter(r=>r.type==="handover").sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
 const handedLivestock=handovers.reduce((sum,r)=>sum+Math.max(0,Number(r.animalCount)||((Array.isArray(r.handoverLivestock)?r.handoverLivestock.length:0))),0);
 const expectedReturns=handovers.filter(r=>r.handoverReturnDate&&String(r.handoverReturnDate)>=today()).length;
 $("snapshot-handover-count").textContent=handovers.length;
 $("snapshot-handover-livestock").textContent=handedLivestock;
 $("snapshot-handover-returns").textContent=expectedReturns;
 $("snapshot-handover-last").textContent=handovers[0]?.date?new Date(handovers[0].date+"T00:00:00").toLocaleDateString("en-NG",{day:"2-digit",month:"short",year:"numeric"}):"—";
 $("handover-snapshot-list").innerHTML=handovers.slice(0,3).map(r=>{
  const name=escapeHtml(r.handoverName||"Unknown recipient");
  const count=Math.max(0,Number(r.animalCount)||((Array.isArray(r.handoverLivestock)?r.handoverLivestock.length:0)));
  const returnDate=r.handoverReturnDate?new Date(r.handoverReturnDate+"T00:00:00").toLocaleDateString("en-NG",{day:"2-digit",month:"short"}):"No return date";
  return `<div class="handover-list-row"><strong>${name}</strong><span>${count} animal${count===1?"":"s"} · Return: ${escapeHtml(returnDate)}</span></div>`;
 }).join("");

 const labels={goat:"Goats",sheep:"Sheep",cattle:"Cattle",chicken:"Chicken"};
 const icons={goat:"fa-paw",sheep:"fa-paw",cattle:"fa-cow",chicken:"fa-kiwi-bird",other:"fa-paw"};
 const order=["goat","sheep","cattle","chicken"];
 const active=order.filter(a=>metrics.animalTotals[a]!==undefined || records.some(r=>(r.animalType||"goat")===a));
 const customOtherNames=[...new Set(records.filter(r=>(r.type==="purchase"||r.type==="death")&&(r.animalType||"goat")==="other").map(r=>String(r.animalName||"").trim()).filter(Boolean))];
 const animalItems=active.concat(customOtherNames.map(n=>"other:"+n));
 const makeAnimalCard=a=>{
   if(a.indexOf("other:")===0){
     const name=a.slice(6);
     const total=records.filter(r=>(r.animalType||"goat")==="other"&&String(r.animalName||"").trim()===name).reduce((sum,r)=>{
       const count=Math.abs(Number(r.animalCount??r.goatCount??0)||0);
       return sum+(r.type==="death"?-count:r.type==="purchase"?count:0);
     },0);
     return `<div class="stat-card"><div class="stat-icon"><i class="fas fa-paw"></i></div><div class="stat-info"><h4>Total ${escapeHtml(name)}</h4><h2>${Math.max(0,total)}</h2></div></div>`;
   }
   return `<div class="stat-card"><div class="stat-icon"><i class="fas ${icons[a]}"></i></div><div class="stat-info"><h4>Total ${labels[a]||animalLabel(a)}</h4><h2>${metrics.animalTotals[a]||0}</h2></div></div>`;
 };
 const cards=animalItems.map(makeAnimalCard);
 if(!animalItems.length) cards.length=0;
 $("animal-stats-grid").innerHTML=cards.join("");

 const periodMetrics=calculateExpenseBreakdown(records,getPeriodRange(expensePeriod));
 $("period-expense-total").textContent=money(periodMetrics.total);
 $("period-medical").textContent=money(periodMetrics.medical);
 $("period-feed").textContent=money(periodMetrics.feed);
 $("period-herdsman").textContent=money(periodMetrics.herdsman);
 $("period-other").textContent=money(periodMetrics.other);
 $("expense-period-label").textContent=periodMetrics.label;

 const filter=$("history-filter").value, animalFilter=$("history-animal-filter").value;
 const from=$("history-from").value,to=$("history-to").value,search=$("history-search").value.trim().toLowerCase();
 const filtered=records.filter(r=>{
  const animal=r.animalType||"goat",desc=String(r.description||"").toLowerCase(),author=String(r.author||"").toLowerCase();
  if(filter!=="all"&&r.type!==filter)return false;
  if(animalFilter!=="all"&&animal!==animalFilter)return false;
  if(from&&String(r.date||"")<from)return false;
  if(to&&String(r.date||"")>to)return false;
  if(search&&!`${desc} ${author} ${animalLabel(animal,r.animalName).toLowerCase()}`.includes(search))return false;
  return true;
 });
 renderList($("history-list"),filtered,true);
}
function calculateExpenseBreakdown(data,range){
 const {start,end,label}=range;let total=0,medical=0,feed=0,herdsman=0,other=0;
 data.forEach(r=>{
  if((r.date||"")<start||(r.date||"")>end||r.type==="death"||r.type==="purchase"||r.type==="handover")return;
  const amount=Math.max(0,Number(r.amount)||0);
  if(r.type==="medical"){medical+=amount;total+=amount;}
  else if(r.type==="feed"){feed+=amount;total+=amount;}
  else if(r.type==="herdsman"){herdsman+=amount;total+=amount;}
  else if(r.type==="other"){other+=amount;total+=amount;}
 });
 return {total,medical,feed,herdsman,other,label};
}

document.querySelectorAll("#expense-period-tabs button").forEach(btn=>{
 btn.onclick=()=>{
  document.querySelectorAll("#expense-period-tabs button").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");expensePeriod=btn.dataset.period;
  $("expense-custom-range").classList.toggle("hidden",expensePeriod!=="custom");
  if(expensePeriod==="custom"){
   if(!$("expense-from").value)$("expense-from").value=today().slice(0,8)+"01";
   if(!$("expense-to").value)$("expense-to").value=today();
  }
  render();
 };
});
["expense-from","expense-to"].forEach(id=>$(id).addEventListener("change",()=>{if(expensePeriod==="custom")render();}));

function renderList(container,data,controls){
 container.innerHTML="";
 if(!data.length){container.innerHTML="<p style='text-align:center;color:#888;padding:25px;font-size:14px'>No records found.</p>";return;}
 const groups={};
 data.forEach(r=>(groups[getDateKey(r)]??=[]).push(r));
 Object.keys(groups).sort((a,b)=>b.localeCompare(a)).forEach(date=>{
  const group=document.createElement("div");group.className="date-group";
  group.innerHTML=`<div class="date-heading">${escapeHtml(formatDateHeader(date))}</div>`;
  groups[date].forEach(r=>{
   const animal=r.animalType||"goat",count=Number(r.animalCount??r.goatCount??0)||0;
   const isDeath=r.type==="death";
   const icon=isDeath?"fa-skull-crossbones":r.type==="purchase"?"fa-shopping-cart":r.type==="medical"?"fa-pills":r.type==="feed"?"fa-wheat-awn":r.type==="herdsman"?"fa-user-tie":r.type==="handover"?"fa-hand-holding-heart":"fa-receipt";
   const amountText=isDeath?(count?`-${count} ${animalLabel(animal,r.animalName)}${Math.abs(count)!==1?"s":""}`:`Loss ${money(r.amount)}`):`−${money(r.amount)}`;
   const images=Array.isArray(r.images)?r.images.filter(Boolean):[];
   const hasReceipt=!!r.receipt;
   const div=document.createElement("div");div.className=`txn-row ${isDeath?"death-row":""}`;
   const handoverDetails=r.type==="handover"&&Array.isArray(r.handoverLivestock)?r.handoverLivestock.map((item,i)=>"<div style=\"font-size:11px;color:#555;border-top:1px solid #e5ebe7;padding:7px 0\"><b>#"+(i+1)+" "+escapeHtml(animalLabel(item.animalType,item.animalName))+"</b>"+(item.tagId?" • ID: "+escapeHtml(item.tagId):"")+(item.sex?" • "+escapeHtml(item.sex):"")+(item.age?" • "+escapeHtml(item.age):"")+(item.details?" • "+escapeHtml(item.details):"")+(item.photo?"<br><img src=\""+item.photo+"\" style=\"width:64px;height:64px;object-fit:cover;border-radius:7px;margin-top:5px\">":"")+"</div>").join(""):"";
 const herdsmanDetails=r.type==="herdsman"&&Array.isArray(r.herdsmanLivestock)?r.herdsmanLivestock.map((item,i)=>`<div style="font-size:11px;color:#555;border-top:1px solid #e5ebe7;padding:7px 0"><b>#${i+1} ${escapeHtml(animalLabel(item.animalType,item.animalName))}</b>${item.tagId?` • ID: ${escapeHtml(item.tagId)}`:""}${item.sex?` • ${escapeHtml(item.sex)}`:""}${item.age?` • Age: ${escapeHtml(item.age)}`:""}${item.details?`<br>${escapeHtml(item.details)}`:""}</div>`).join(""):"";
   div.innerHTML=`<div class="txn-icon"><i class="fas ${icon}"></i></div>
    <div class="txn-main"><div class="txn-title">${escapeHtml(r.description||"Untitled record")}</div>
    <div class="txn-sub">${r.type==="handover"?`Handover to: ${escapeHtml(r.handoverName||"Not recorded")} • ${Array.isArray(r.handoverLivestock)?r.handoverLivestock.length:Math.abs(count)} livestock`:r.type==="herdsman"?`Herdsman: ${escapeHtml(r.herdsmanName||"Not recorded")} • ${Array.isArray(r.herdsmanLivestock)?r.herdsmanLivestock.length:Math.abs(count)} livestock`:`${escapeHtml(animalLabel(animal,r.animalName))}${count?` • ${Math.abs(count)} animal(s)`:``}`} • By ${escapeHtml((r.author||"").split("@")[0])} • Tap for details</div>
    <div class="txn-details">
      <div class="txn-detail-label">Record details</div>
      <div style="font-size:12px;color:#555">${isDeath?"Animal loss / death":"Transaction"} • ${escapeHtml(formatDateHeader(r.date||""))}</div>
      ${isDeath?`<div class="record-death-note"><i class="fas fa-skull-crossbones"></i> This record reduces the live ${escapeHtml(animalLabel(animal,r.animalName))} balance by ${Math.abs(count)}.</div>`:""}
      ${r.type==="handover"?`<div style="margin-top:9px;background:#f1f8f2;border-radius:8px;padding:9px"><div class="txn-detail-label">Handover Recipient</div><div style="font-size:12px;color:#555"><b>${escapeHtml(r.handoverName||"Not recorded")}</b>${r.handoverPhone?` • ${escapeHtml(r.handoverPhone)}`:""}</div>${r.handoverLocation?`<div style="font-size:11px;color:#666;margin-top:4px">Destination: ${escapeHtml(r.handoverLocation)}</div>`:""}${r.handoverPurpose?`<div style="font-size:11px;color:#666;margin-top:3px">Purpose: ${escapeHtml(r.handoverPurpose)}${r.handoverReturnDate?" • Return: "+escapeHtml(r.handoverReturnDate):""}</div>`:""}${Array.isArray(r.images)&&r.images.length?`<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:7px">${r.images.map(p=>`<img src="${p}" style="width:64px;height:64px;object-fit:cover;border-radius:7px">`).join("")}</div>`:""}<div class="txn-detail-label" style="margin-top:8px">Livestock (${Array.isArray(r.handoverLivestock)?r.handoverLivestock.length:Math.abs(count)})</div>${handoverDetails||`<div class="txn-empty-detail">No individual livestock details recorded.</div>`}${r.handoverNotes?`<div style="font-size:11px;color:#666;margin-top:8px">Notes: ${escapeHtml(r.handoverNotes)}</div>`:""}</div>`:r.type==="herdsman"?`<div style="margin-top:9px;background:#f7faf8;border-radius:8px;padding:9px"><div class="txn-detail-label">Herdsman</div><div style="font-size:12px;color:#555"><b>${escapeHtml(r.herdsmanName||"Not recorded")}</b>${r.herdsmanPhone?` • ${escapeHtml(r.herdsmanPhone)}`:""}</div><div class="txn-detail-label" style="margin-top:8px">Livestock Given (${Array.isArray(r.herdsmanLivestock)?r.herdsmanLivestock.length:Math.abs(count)})</div>${herdsmanDetails||`<div class="txn-empty-detail">No individual livestock details recorded.</div>`}</div>`:""}
      ${images.length?`<div style="margin-top:9px"><div class="txn-detail-label">Photos</div><div class="txn-images">${images.map((src,i)=>`<img src="${escapeHtml(src)}" alt="Animal photo ${i+1}" data-photo="${i}">`).join("")}</div></div>`:""}
      ${hasReceipt?`<div style="margin-top:9px"><div class="txn-detail-label">Receipt</div><button class="txn-receipt" type="button"><i class="fas fa-receipt"></i> View receipt</button></div>`:""}
      ${!images.length&&!hasReceipt?`<div class="txn-empty-detail" style="margin-top:8px">No photos or receipt attached to this record.</div>`:""}
    </div></div>
    <div><div class="txn-amount ${isDeath?"":"expense"}">${escapeHtml(amountText)}</div>
    ${controls&&isSuperAdmin()?`<div class="txn-actions"><button class="edit-btn" data-id="${escapeHtml(r.id)}">Edit</button><button class="delete-btn" data-id="${escapeHtml(r.id)}">Delete</button></div>`:""}</div>`;

   div.addEventListener("click",e=>{
    if(e.target.closest("button")||e.target.closest("img"))return;
    div.querySelector(".txn-details").classList.toggle("open");
   });
   div.querySelectorAll("[data-photo]").forEach(img=>{
    img.addEventListener("click",e=>{e.stopPropagation();openImage(images[Number(img.dataset.photo)]);});
   });
   div.querySelector(".txn-receipt")?.addEventListener("click",e=>{e.stopPropagation();openImage(r.receipt);});
   div.querySelector(".edit-btn")?.addEventListener("click",e=>{e.stopPropagation();editRecord(r.id);});
   div.querySelector(".delete-btn")?.addEventListener("click",e=>{e.stopPropagation();deleteRecord(r.id);});
   group.appendChild(div);
  });
  container.appendChild(group);
 });
}

function openImage(src){$("viewer-image").src=src;$("image-viewer").style.display="flex";}
$("viewer-close").onclick=()=>$("image-viewer").style.display="none";
$("image-viewer").onclick=e=>{if(e.target===$("image-viewer"))$("image-viewer").style.display="none";};

$("animal-type").onchange=()=>{
 const type=$("animal-type").value;
 const otherName=$("other-animal-name");
 otherName.classList.toggle("hidden",type!=="other");
 if(type!=="other")otherName.value="";
 $("animal-count-label").textContent=`Number of ${animalLabel(type,otherName.value)}s`;
};
$("record-type").onchange=()=>{
 const type=$("record-type").value;
 const isDeath=type==="death";
 $("animal-count-box").style.display=type==="purchase"?"block":"none";
 $("death-count-box").classList.toggle("hidden",!isDeath);
 $("amount-label").textContent=isDeath?"Loss Value (₦) — optional":"Amount (₦)";
 $("record-amount").placeholder=isDeath?"Optional estimated value of lost animal":"50000";
 $("record-amount").min="0";
};

function compressImage(file,maxWidth=320,quality=.45){
 return new Promise((resolve,reject)=>{
  if(!file.type.startsWith("image/"))return reject(new Error("Only image files are allowed."));
  if(file.size>8*1024*1024)return reject(new Error("Image is too large. Maximum 8 MB per image."));
  const reader=new FileReader();reader.onerror=()=>reject(new Error("Could not read image."));
  reader.onload=e=>{
   const img=new Image();img.onerror=()=>reject(new Error("Invalid image."));
   img.onload=()=>{
    const scale=Math.min(1,maxWidth/img.width),canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
    canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
    resolve(canvas.toDataURL("image/jpeg",quality));
   };img.src=e.target.result;
  };reader.readAsDataURL(file);
 });
}
$("goat-images").onchange=async e=>{
 const files=Array.from(e.target.files).slice(0,3);selectedGoatImages=[];$("image-preview").innerHTML="";
 for(const file of files)try{const data=await compressImage(file);selectedGoatImages.push(data);const img=document.createElement("img");img.src=data;img.className="thumbnail";$("image-preview").appendChild(img);}catch(err){showError(getFriendlyErrorMessage(err));}
};
$("receipt-image").onchange=async e=>{
 const file=e.target.files[0];selectedReceipt=null;$("receipt-preview").style.display="none";if(!file)return;
 try{selectedReceipt=await compressImage(file);$("receipt-preview").style.display="block";}catch(err){showError(getFriendlyErrorMessage(err));}
};
$("clear-images-btn").onclick=()=>{
 imagesCleared=true;selectedGoatImages=[];selectedReceipt=null;$("image-preview").innerHTML="";$("receipt-preview").style.display="none";$("clear-images-btn").classList.add("hidden");
};

function resetForm(){
 $("record-id").value="";$("animal-type").value="goat";$("record-type").value="purchase";$("record-amount").value="";$("other-animal-name").value="";$("other-animal-name").classList.add("hidden");
 $("animal-count").value="1";$("death-count").value="1";$("record-description").value="";$("record-date").valueAsDate=new Date();
 $("death-count-box").classList.add("hidden");$("amount-label").textContent="Amount (₦)";$("record-amount").placeholder="50000";
 $("goat-images").value="";$("receipt-image").value="";$("image-preview").innerHTML="";$("receipt-preview").style.display="none";
 $("form-title").innerHTML='<i class="fas fa-plus-circle" style="color:#2e7d32"></i> Create Record';
 $("save-record").textContent="Save Record";$("clear-images-btn").classList.add("hidden");
 selectedGoatImages=[];selectedReceipt=null;imagesCleared=false;$("animal-count-box").style.display="block";
}

$("save-record").onclick=async()=>{
 if(!currentUser||!currentFarmId)return showError("No farm is currently selected.");
 const type=$("record-type").value,animalType=$("animal-type").value;
 const otherAnimalName=animalType==="other"?$("other-animal-name").value.trim():"";
 const amountInput=$("record-amount").value.trim(),amount=amountInput===""?0:Number(amountInput);
 const description=$("record-description").value.trim(),date=$("record-date").value;
 const animalCount=type==="purchase"?Math.max(1,Number($("animal-count").value)||1):type==="death"?Math.max(1,Number($("death-count").value)||1):0;
 if(!Number.isFinite(amount)||amount<0)return showError("Please enter a valid amount.");
 if(amount>1000000000)return showError("Amount is too large.");
 if(!description||description.length>300)return showError("Description is required and must be 300 characters or less.");
 if(animalType==="other"&&(!otherAnimalName||otherAnimalName.length>50))return showError("Please specify the animal name (1-50 characters).");
 if(!date)return showError("Please select a date.");
 if(date>today())return showError("Record date cannot be in the future.");
 const editId=$("record-id").value;
 if(editId&&!isSuperAdmin())return showError("Only the super administrator can update an existing record.");
 const btn=$("save-record");btn.disabled=true;btn.textContent="Saving...";
 try{
  await firestoreReady;
  const now=firebase.firestore.FieldValue.serverTimestamp();
  let data={farmId:currentFarmId,author:currentUser.email.toLowerCase(),type,animalType,animalName:otherAnimalName,animalCount,goatCount:animalType==="goat"&&type==="purchase"?animalCount:0,amount,description,date,images:selectedGoatImages,receipt:selectedReceipt,updatedAt:now};
  if(editId){
   const existing=records.find(r=>r.id===editId);if(!existing)throw new Error("Record not found.");
   if(!selectedGoatImages.length&&!imagesCleared)data.images=existing.images||[];
   else if(imagesCleared&&!selectedGoatImages.length)data.images=[];
   if(!selectedReceipt&&!imagesCleared)data.receipt=existing.receipt||null;
   else if(imagesCleared&&!selectedReceipt)data.receipt=null;
   data.createdAt=existing.createdAt||now;
   await db.collection("transactions").doc(editId).update(data);
  }else{
   data.createdAt=now;await db.collection("transactions").add(data);
  }
  resetForm();showSuccess("Record saved successfully.");document.querySelectorAll(".manage-tab")[0].click();showScreen("manage");
 }catch(e){showError(getFriendlyErrorMessage(e));}
 finally{btn.disabled=false;btn.textContent=$("record-id").value?"Update Record":"Save Record";}
};

function editRecord(id){
 if(!isSuperAdmin())return showError("Only the super administrator can update existing records.");
 const r=records.find(x=>x.id===id);if(!r)return;
 $("record-id").value=r.id;$("animal-type").value=r.animalType||"goat";$("record-type").value=r.type;
 $("other-animal-name").value=r.animalType==="other"?(r.animalName||""):"";
 $("other-animal-name").classList.toggle("hidden",r.animalType!=="other");
 $("record-amount").value=r.amount??0;$("animal-count").value=r.type==="purchase"?(r.animalCount??r.goatCount??1):1;
 $("death-count").value=r.type==="death"?Math.abs(Number(r.animalCount??1)):1;
 $("record-description").value=r.description||"";$("record-date").value=r.date||"";
 $("animal-count-label").textContent=`Number of ${animalLabel($("animal-type").value,$("other-animal-name").value)}s`;
 $("form-title").innerHTML='<i class="fas fa-edit" style="color:#2e7d32"></i> Edit Record';$("save-record").textContent="Update Record";
 $("animal-count-box").style.display=r.type==="purchase"?"block":"none";
 $("death-count-box").classList.toggle("hidden",r.type!=="death");
 $("amount-label").textContent=r.type==="death"?"Loss Value (₦) — optional":"Amount (₦)";
 $("record-amount").placeholder=r.type==="death"?"Optional estimated value of lost animal":"50000";
 selectedGoatImages=[];selectedReceipt=null;imagesCleared=false;
 $("image-preview").innerHTML="";$("receipt-preview").style.display="none";
 if((r.images&&r.images.length)||r.receipt)$("clear-images-btn").classList.remove("hidden");else $("clear-images-btn").classList.add("hidden");
 document.querySelectorAll(".manage-tab")[1].click();showScreen("manage");
}


function renderHerdsmanLivestockRows(count,existing=[]){
 const list=$("herdsman-livestock-list");
 const safeCount=Math.min(100,Math.max(1,Number(count)||1));
 list.innerHTML="";
 for(let i=0;i<safeCount;i++){
  const item=existing[i]||{};
  const row=document.createElement("div");row.className="livestock-row";
  row.innerHTML=`<div class="livestock-row-title">Livestock #${i+1}</div>
   <div class="livestock-grid">
    <div class="form-group"><label>Animal Type</label><select class="form-input livestock-type"><option value="goat">Goat</option><option value="sheep">Sheep</option><option value="cattle">Cattle</option><option value="chicken">Chicken</option><option value="other">Other</option></select></div>
    <div class="form-group"><label>Tag / ID</label><input class="form-input livestock-id" type="text" maxlength="50" placeholder="e.g. G-014"></div>
    <div class="form-group"><label>Sex</label><select class="form-input livestock-sex"><option value="">Select</option><option value="male">Male</option><option value="female">Female</option></select></div>
    <div class="form-group"><label>Age</label><input class="form-input livestock-age" type="text" maxlength="30" placeholder="e.g. 2 years"></div>
    <div class="form-group" style="grid-column:1/-1"><label>Identifying Details</label><input class="form-input livestock-details" type="text" maxlength="150" placeholder="Colour, markings, breed, etc."></div>
   </div>`;
  row.querySelector(".livestock-type").value=item.animalType||"goat";
  row.querySelector(".livestock-id").value=item.tagId||"";
  row.querySelector(".livestock-sex").value=item.sex||"";
  row.querySelector(".livestock-age").value=item.age||"";
  row.querySelector(".livestock-details").value=item.details||"";
  list.appendChild(row);
 }
}
function getHerdsmanLivestock(){
 return Array.from(document.querySelectorAll("#herdsman-livestock-list .livestock-row")).map(row=>({
  animalType:row.querySelector(".livestock-type").value,
  tagId:row.querySelector(".livestock-id").value.trim(),
  sex:row.querySelector(".livestock-sex").value,
  age:row.querySelector(".livestock-age").value.trim(),
  details:row.querySelector(".livestock-details").value.trim()
 }));
}
function renderHandoverLivestockRows(count,existing=[]){
 const list=$("handover-livestock-list"),safeCount=Math.min(20,Math.max(1,Number(count)||1));list.innerHTML="";
 for(let i=0;i<safeCount;i++){
  const item=existing[i]||{},row=document.createElement("div");row.className="livestock-row";
  row.innerHTML='<div class="livestock-row-title">Animal #'+(i+1)+'</div><div class="livestock-grid">'+
   '<div class="form-group"><label>Animal Type</label><select class="form-input handover-livestock-type"><option value="goat">Goat</option><option value="sheep">Sheep</option><option value="cattle">Cattle</option><option value="chicken">Chicken</option><option value="other">Other</option></select></div>'+
   '<div class="form-group"><label>Tag / ID</label><input class="form-input handover-livestock-id" type="text" maxlength="50" placeholder="e.g. G-014"></div>'+
   '<div class="form-group"><label>Sex</label><select class="form-input handover-livestock-sex"><option value="">Select</option><option value="male">Male</option><option value="female">Female</option></select></div>'+
   '<div class="form-group"><label>Age</label><input class="form-input handover-livestock-age" type="text" maxlength="30" placeholder="e.g. 2 years"></div>'+
   '<div class="form-group" style="grid-column:1/-1"><label>Breed / Identifying Details</label><input class="form-input handover-livestock-details" type="text" maxlength="150" placeholder="Breed, colour, markings, etc."></div>'+
   '<div class="form-group" style="grid-column:1/-1"><label>Animal Photo</label><div class="livestock-photo-box"><input class="form-input handover-livestock-photo" type="file" accept="image/*" capture="environment"><div class="livestock-photo-preview"></div></div></div></div>';
  row.querySelector(".handover-livestock-type").value=item.animalType||"goat";row.querySelector(".handover-livestock-id").value=item.tagId||"";row.querySelector(".handover-livestock-sex").value=item.sex||"";row.querySelector(".handover-livestock-age").value=item.age||"";row.querySelector(".handover-livestock-details").value=item.details||"";
  if(item.photo){row.dataset.photo=item.photo;const img=document.createElement("img");img.src=item.photo;row.querySelector(".livestock-photo-preview").appendChild(img);}
  row.querySelector(".handover-livestock-photo").onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const photo=await compressImage(file,300,.42);row.dataset.photo=photo;const preview=row.querySelector(".livestock-photo-preview");preview.innerHTML="";const img=document.createElement("img");img.src=photo;preview.appendChild(img);}catch(err){showError(getFriendlyErrorMessage(err));}};
  list.appendChild(row);
 }
}
function getHandoverLivestock(){
 return Array.from(document.querySelectorAll("#handover-livestock-list .livestock-row")).map(row=>({animalType:row.querySelector(".handover-livestock-type").value,animalName:"",tagId:row.querySelector(".handover-livestock-id").value.trim(),sex:row.querySelector(".handover-livestock-sex").value,age:row.querySelector(".handover-livestock-age").value.trim(),details:row.querySelector(".handover-livestock-details").value.trim(),photo:row.dataset.photo||""}));
}
$("handover-livestock-count").onchange=()=>renderHandoverLivestockRows($("handover-livestock-count").value);
$("handover-photos").onchange=async e=>{const files=Array.from(e.target.files).slice(0,3);selectedHandoverPhotos=[];$("handover-photo-preview").innerHTML="";for(const file of files)try{const data=await compressImage(file,420,.45);selectedHandoverPhotos.push(data);const img=document.createElement("img");img.src=data;$("handover-photo-preview").appendChild(img);}catch(err){showError(getFriendlyErrorMessage(err));}};
function resetHandoverForm(){
 $("handover-id").value="";$("handover-date").valueAsDate=new Date();$("handover-name").value="";$("handover-phone").value="";$("handover-location").value="";$("handover-purpose").value="grazing";$("handover-return-date").value="";$("handover-livestock-count").value="1";$("handover-livestock-list").innerHTML="";$("handover-notes").value="";$("handover-photos").value="";$("handover-photo-preview").innerHTML="";selectedHandoverPhotos=[];
 renderHandoverLivestockRows(1);$("save-handover").innerHTML='<i class="fas fa-save"></i> Save Handover';
}
$("save-handover").onclick=async()=>{
 if(!currentUser||!currentFarmId)return showError("No farm is currently selected.");
 const date=$("handover-date").value,name=$("handover-name").value.trim(),phone=$("handover-phone").value.trim(),location=$("handover-location").value.trim(),purpose=$("handover-purpose").value,returnDate=$("handover-return-date").value,notes=$("handover-notes").value.trim(),livestock=getHandoverLivestock();
 if(!date)return showError("Please select a handover date.");
 if(date>today())return showError("Handover date cannot be in the future.");
 if(returnDate&&returnDate<date)return showError("Expected return date cannot be before the handover date.");
 if(!name||name.length>100)return showError("Please enter the herdsman / caretaker's name.");
 if(!phone||phone.length>30)return showError("Please enter the phone number.");
 if(!livestock.length||livestock.length>20)return showError("Please specify between 1 and 20 livestock items per handover.");
 const btn=$("save-handover");btn.disabled=true;btn.textContent="Saving...";
 try{
  await firestoreReady;
  const data={farmId:currentFarmId,author:currentUser.email.toLowerCase(),type:"handover",animalType:"other",animalName:"",animalCount:livestock.length,goatCount:0,amount:0,description:"Livestock handed to "+name+" for care",date,handoverName:name,handoverPhone:phone,handoverLocation:location,handoverPurpose:purpose,handoverReturnDate:returnDate,handoverNotes:notes,handoverLivestock:livestock,images:selectedHandoverPhotos.slice(0,3),receipt:null,updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
  const editId=$("handover-id").value;
  if(editId){if(!isSuperAdmin())return showError("Only the super administrator can update an existing handover.");await db.collection("transactions").doc(editId).update(data);}
  else{data.createdAt=firebase.firestore.FieldValue.serverTimestamp();await db.collection("transactions").add(data);}
  resetHandoverForm();showSuccess("Livestock handover saved.");document.querySelectorAll(".manage-tab")[0].click();showScreen("manage");
 }catch(e){showError(getFriendlyErrorMessage(e));}
 finally{btn.disabled=false;btn.innerHTML=$("handover-id").value?'<i class="fas fa-save"></i> Update Handover':'<i class="fas fa-save"></i> Save Handover';}
};
function editHandoverRecord(id){
 if(!isSuperAdmin())return showError("Only the super administrator can update existing handovers.");
 const r=records.find(x=>x.id===id);if(!r||r.type!=="handover")return;
 $("handover-id").value=r.id;$("handover-date").value=r.date||"";$("handover-name").value=r.handoverName||"";$("handover-phone").value=r.handoverPhone||"";$("handover-location").value=r.handoverLocation||"";$("handover-purpose").value=r.handoverPurpose||"grazing";$("handover-return-date").value=r.handoverReturnDate||"";$("handover-notes").value=r.handoverNotes||"";$("handover-photos").value="";selectedHandoverPhotos=Array.isArray(r.images)?r.images.slice(0,3):[];$("handover-photo-preview").innerHTML="";selectedHandoverPhotos.forEach(p=>{const img=document.createElement("img");img.src=p;$("handover-photo-preview").appendChild(img);});
 const list=Array.isArray(r.handoverLivestock)?r.handoverLivestock:[];$("handover-livestock-count").value=Math.min(20,Math.max(1,list.length||1));renderHandoverLivestockRows($("handover-livestock-count").value,list);
 $("save-handover").innerHTML='<i class="fas fa-save"></i> Update Handover';
 document.querySelectorAll(".manage-tab").forEach(t=>t.classList.remove("active"));document.querySelectorAll(".sub-screen").forEach(s=>s.classList.add("hidden"));
 const tab=document.querySelector('.manage-tab[data-sub="sub-handover"]');tab.classList.add("active");$("sub-handover").classList.remove("hidden");showScreen("manage");
}

async function deleteRecord(id){
 if(!isSuperAdmin())return showError("Only the super administrator can delete an existing record.");
 if(!confirm("Permanently delete this record? This action cannot be undone."))return;
 try{await firestoreReady;await db.collection("transactions").doc(id).delete();showSuccess("Record deleted successfully.");}
 catch(e){showError(getFriendlyErrorMessage(e));}
}

async function loadAdminFarms(){
 try{
  const doc=await db.collection("metadata").doc("farmList").get(),farms=doc.exists?(doc.data().farms||[]):[];
  const options='<option value="">Select a farm...</option>'+farms.map(f=>`<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join("");
  const existingOptions='<option value="">Select an existing farm...</option>'+farms.map(f=>`<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join("");
  const deleteOptions='<option value="">Select farm to delete...</option>'+farms.map(f=>`<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join("");
  $("farm-select").innerHTML=options;
  $("assign-farm").innerHTML=existingOptions;
  $("import-farm-select").innerHTML=existingOptions;
  $("data-tools-farm").innerHTML=existingOptions;
  $("delete-farm-select").innerHTML=deleteOptions;
  if($("notification-farm"))$("notification-farm").innerHTML=existingOptions;
  if($("chat-farm"))$("chat-farm").innerHTML=existingOptions;
  if($("notification-farm"))$("notification-farm").innerHTML=existingOptions;
  if(currentFarmId&&farms.includes(currentFarmId)){
   $("data-tools-farm").value=currentFarmId;
   $("import-farm-select").value=currentFarmId;
  }
 }catch(e){showError("Could not load farms: "+getFriendlyErrorMessage(e));}
}
function chatMemberMatches(data){const email=(currentUser?.email||"").toLowerCase();const members=Array.isArray(data.members)?data.members.map(x=>String(x).toLowerCase()):[];return members.includes(email)||String(data.createdBy||"").toLowerCase()===email;}
function formatChatTime(ts){const d=ts?.toDate?ts.toDate():(ts?new Date(ts):new Date());return isNaN(d.getTime())?"":d.toLocaleString("en-NG",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});}
function renderChatList(chats){const box=$("chat-list"),badge=$("chat-nav-badge");if(!box)return;if(badge)badge.style.display="none";if(!chats.length){box.innerHTML='<div class="chat-empty">No chats available.</div>';return;}box.innerHTML=chats.map(ch=>'<div class="chat-row" data-chat-id="'+escapeHtml(ch.id)+'"><div class="chat-row-title">'+escapeHtml(ch.name||"Chat")+'</div><div class="chat-row-meta">'+escapeHtml(ch.lastMessage||"No messages yet.")+' • '+escapeHtml(formatChatTime(ch.lastMessageAt))+'</div></div>').join("");box.querySelectorAll(".chat-row").forEach(el=>el.onclick=()=>openChat(el.dataset.chatId,chats.find(x=>x.id===el.dataset.chatId)));}
function startChatListener(){if(unsubscribeChats)unsubscribeChats();if(!currentUser)return;const email=(currentUser.email||"").toLowerCase();let q;if(isSuperAdmin()){q=db.collection("chats");}else{q=db.collection("chats").where("members","array-contains",email);}unsubscribeChats=q.onSnapshot(s=>{const chats=[];s.forEach(d=>{const x=d.data()||{};if(isSuperAdmin()||(!x.farmId||x.farmId===currentFarmId))chats.push({id:d.id,...x});});chats.sort((a,b)=>(b.lastMessageAt?.toMillis?.()||0)-(a.lastMessageAt?.toMillis?.()||0));renderChatList(chats);},e=>{if(navigator.onLine)showError(getFriendlyErrorMessage(e));});}
function openChat(id,ch){currentChatId=id;$("chat-list-view").style.display="none";$("chat-window").classList.add("active");$("chat-window-title").textContent=ch?.name||"Chat";const memberCount=Array.isArray(ch?.members)?ch.members.length:0;$("chat-window-members").textContent=memberCount?("Private chat • "+memberCount+" member"+(memberCount===1?"":"s")):"Private chat";startMessageListener(id);}
function startMessageListener(id){if(unsubscribeMessages)unsubscribeMessages();const box=$("chat-messages");unsubscribeMessages=db.collection("chats").doc(id).collection("messages").orderBy("createdAt","asc").onSnapshot(s=>{const ms=[];s.forEach(d=>ms.push({id:d.id,...d.data()}));box.innerHTML=ms.length?ms.map(m=>{const mine=String(m.sender||"").toLowerCase()===(currentUser?.email||"").toLowerCase();return '<div class="chat-bubble '+(mine?"mine":"theirs")+'"><div class="chat-sender">'+escapeHtml(m.senderName||m.sender||"Member")+'</div>'+escapeHtml(m.text||"")+'<div class="chat-time">'+escapeHtml(formatChatTime(m.createdAt))+'</div></div>';}).join(""):'<div class="chat-empty">No messages yet. Start the conversation.</div>';box.scrollTop=box.scrollHeight;});}
$("chat-back")?.addEventListener("click",()=>{$("chat-window").classList.remove("active");$("chat-list-view").style.display="block";if(unsubscribeMessages){unsubscribeMessages();unsubscribeMessages=null;}currentChatId="";});
async function sendChatMessage(){const input=$("chat-input"),text=input?.value.trim();if(!currentChatId||!text)return;try{const ref=db.collection("chats").doc(currentChatId),sender=(currentUser?.email||"").toLowerCase();await ref.collection("messages").add({text,sender,senderName:currentUser?.displayName||currentUser?.email||"Member",createdAt:firebase.firestore.FieldValue.serverTimestamp()});await ref.set({lastMessage:text,lastMessageSender:sender,lastMessageAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});input.value="";}catch(e){showError(getFriendlyErrorMessage(e));}}
$("chat-send")?.addEventListener("click",sendChatMessage);$("chat-input")?.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChatMessage();}});
function notificationRead(data){
 const email=(currentUser?.email||"").toLowerCase();
 return Array.isArray(data.readBy)&&data.readBy.includes(email);
}
function renderNotifications(items){
 const list=$("notification-list"),badge=$("notification-badge");if(!list)return;
 const unread=items.filter(n=>!n.read).length;
 if(badge){badge.textContent=unread>99?"99+":String(unread);badge.style.display=unread?"flex":"none";}
 if(!items.length){list.innerHTML='<p style="padding:18px;text-align:center;color:#888;font-size:12px">No notifications.</p>';return;}
 list.innerHTML=items.slice(0,50).map(n=>'<div class="notification-item '+(n.read?"":"unread")+'" data-id="'+escapeHtml(n.id)+'"><div class="notification-title">'+escapeHtml(n.title||"Farm Ledger")+'</div><div class="notification-message">'+escapeHtml(n.message||"")+'</div><div class="notification-time">'+escapeHtml(n.createdAt&&n.createdAt.toDate?n.createdAt.toDate().toLocaleString("en-NG",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}):"")+'</div></div>').join("");
 list.querySelectorAll(".notification-item").forEach(el=>el.onclick=async()=>{try{await db.collection("notifications").doc(el.dataset.id).set({readBy:firebase.firestore.FieldValue.arrayUnion((currentUser.email||"").toLowerCase())},{merge:true});}catch(e){}});
}
function showPhoneNotification(n){
 if(!("Notification" in window)||Notification.permission!=="granted")return;
 const opts={body:n.message||"",icon:"/Farm-ledger/icon-192.png",badge:"/Farm-ledger/icon-192.png",tag:"farm-ledger-"+n.id};
 if("serviceWorker" in navigator)navigator.serviceWorker.ready.then(reg=>reg.showNotification(n.title||"Farm Ledger",opts)).catch(()=>{});else try{new Notification(n.title||"Farm Ledger",opts);}catch(e){}
}
function startNotificationListener(){
 if(unsubscribeNotifications)unsubscribeNotifications();
 notificationKnownIds=new Set();notificationInitialized=false;
 if(!currentFarmId)return;
 unsubscribeNotifications=db.collection("notifications").where("farmId","==",currentFarmId).onSnapshot(snapshot=>{
  const items=[];
  snapshot.forEach(doc=>{
   const data=doc.data()||{},n={id:doc.id,...data,read:notificationRead(data)};
   items.push(n);
   if(notificationInitialized&&!notificationKnownIds.has(doc.id)&&(n.type==="bar"||n.type==="both"))showPhoneNotification(n);
   notificationKnownIds.add(doc.id);
  });
  items.sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0));
  renderNotifications(items);notificationInitialized=true;
 },()=>{});
}
async function loadAdminNotifications(){
 const box=$("admin-notification-list");if(!box)return;
 try{
  const snap=await db.collection("notifications").get(),rows=[];
  snap.forEach(doc=>rows.push({id:doc.id,...doc.data()}));
  rows.sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0));
  box.innerHTML=rows.slice(0,20).map(n=>'<div class="notification-item"><div class="notification-title">'+escapeHtml(n.title||"")+'</div><div class="notification-message">'+escapeHtml(n.message||"")+'</div><div class="notification-time">'+escapeHtml(n.farmId||"")+" • "+(n.type==="both"?"In-App + Phone Bar":n.type==="bar"?"Phone Bar":"In-App")+'</div></div>').join("")||'<p style="text-align:center;color:#888;font-size:12px">No notifications sent yet.</p>';
 }catch(e){box.innerHTML='<p style="color:#c62828;font-size:12px">Could not load notifications.</p>';}
}
$("send-notification-btn")?.addEventListener("click",async()=>{
 const farm=$("notification-farm")?.value,title=$("notification-title")?.value.trim(),message=$("notification-message")?.value.trim(),type=$("notification-type")?.value;
 if(!farm)return showError("Select a target farm.");if(!title)return showError("Enter a notification title.");if(!message)return showError("Enter a notification message.");
 try{await db.collection("notifications").add({farmId:farm,title,message,type,createdBy:(currentUser.email||"").toLowerCase(),createdAt:firebase.firestore.FieldValue.serverTimestamp(),readBy:[]});$("notification-title").value="";$("notification-message").value="";showSuccess("Notification sent.");loadAdminNotifications();}catch(e){showError(getFriendlyErrorMessage(e));}
});
function updatePhoneNotificationPermissionUI(){
 const row=$("phone-notification-enable-row");
 const btn=$("enable-phone-notifications");
 if(!row||!btn)return;
 if(!("Notification" in window)){row.style.display="none";return;}
 const permission=Notification.permission;
 row.style.display=permission==="granted"?"none":"block";
}
$("notification-btn")?.addEventListener("click",()=>{
 updatePhoneNotificationPermissionUI();
 $("notification-panel")?.classList.toggle("show");
});
$("notification-close")?.addEventListener("click",()=>$("notification-panel")?.classList.remove("show"));
$("enable-phone-notifications")?.addEventListener("click",async()=>{
 if(!("Notification" in window))return showError("This browser does not support phone notifications.");
 const p=await Notification.requestPermission();
 updatePhoneNotificationPermissionUI();
 if(p==="granted")showSuccess("Phone notifications enabled.");
 else showError("Phone notification permission was not granted.");
});
updatePhoneNotificationPermissionUI();
document.addEventListener("click",e=>{const p=$("notification-panel"),b=$("notification-btn");if(p?.classList.contains("show")&&!p.contains(e.target)&&!b?.contains(e.target))p.classList.remove("show");});
async function loadChatMembers(){
 const farm=$("chat-farm")?.value,box=$("chat-members"); if(!box)return;
 if(!farm){box.innerHTML='<p style="color:#888;font-size:12px">Select a farm first.</p>';return;}
 if(!isSuperAdmin())return;
 try{
  // Farm assignments are stored in users/{email}; farmUsers is not the source of truth.
  const snap=await db.collection("users").where("farmId","==",farm).get(),rows=[];
  snap.forEach(d=>{
   const u=d.data()||{},email=String(u.email||d.id||"").trim().toLowerCase();
   if(email && u.status==="approved")rows.push({id:d.id,...u,email});
  });
  rows.sort((a,b)=>String(a.email||"").localeCompare(String(b.email||"")));
  box.innerHTML=rows.map(u=>'<label style="display:block;padding:7px;font-size:12px"><input type="checkbox" class="chat-member" value="'+escapeHtml(u.email)+'"> '+escapeHtml(u.name||u.email)+'</label>').join("")||'<p style="color:#888;font-size:12px">No approved members found for this farm.</p>';
 }catch(e){box.innerHTML='<p style="color:#c62828;font-size:12px">Could not load members: '+escapeHtml(getFriendlyErrorMessage(e))+'</p>';}
}
async function loadAdminChats(){
 const box=$("admin-chat-list");if(!box)return;
 try{
  const snap=await db.collection("chats").get(),rows=[];
  snap.forEach(d=>rows.push({id:d.id,...d.data()}));
  rows.sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0));
  box.innerHTML=rows.map(ch=>{const count=Array.isArray(ch.members)?ch.members.length:0;return '<div class="notification-item"><div class="notification-title">'+escapeHtml(ch.name||"Chat")+'</div><div class="notification-message">Private chat • '+count+' member'+(count===1?"":"s")+'</div><div style="margin-top:7px"><button type="button" class="danger-btn delete-chat-btn" data-chat-id="'+escapeHtml(ch.id)+'">Delete Chat</button></div></div>';}).join("")||'<p style="text-align:center;color:#888;font-size:12px">No chats yet.</p>';
  box.querySelectorAll(".delete-chat-btn").forEach(btn=>btn.onclick=async()=>{
   if(!confirm("Delete this chat and all its messages?"))return;
   try{
    const id=btn.dataset.chatId, msgs=await db.collection("chats").doc(id).collection("messages").get();
    const batch=db.batch();msgs.forEach(m=>batch.delete(m.ref));batch.delete(db.collection("chats").doc(id));await batch.commit();
    showSuccess("Chat deleted.");loadAdminChats();
   }catch(e){showError(getFriendlyErrorMessage(e));}
  });
 }catch(e){box.innerHTML='<p style="color:#c62828;font-size:12px">Could not load chats.</p>';}
}
$("chat-farm")?.addEventListener("change",loadChatMembers);
$("create-chat-btn")?.addEventListener("click",async()=>{
 const farm=$("chat-farm")?.value,name=$("chat-name")?.value.trim();
 const members=[...document.querySelectorAll(".chat-member:checked")].map(x=>String(x.value||"").trim().toLowerCase()).filter(Boolean);
 if(!farm)return showError("Select a farm.");if(!name)return showError("Enter a chat name.");if(!members.length)return showError("Select at least one member.");
 try{
  await db.collection("chats").add({farmId:farm,name,members,createdBy:(currentUser.email||"").toLowerCase(),createdAt:firebase.firestore.FieldValue.serverTimestamp()});
  $("chat-name").value="";showSuccess("Chat created.");loadAdminChats();
 }catch(e){showError(getFriendlyErrorMessage(e));}
});
function userStatus(data){return data?.status==="revoked"?"Revoked":data?.farmId?"Approved":"Pending";}
async function loadAdminUsers(){
 try{
  const snap=await db.collection("users").get(),container=$("admin-user-list"),pending=$("pending-user-list");
  container.innerHTML="";pending.innerHTML="";
  if(snap.empty){container.innerHTML="<p style='color:#888;font-size:13px;text-align:center;padding:10px'>No registered users found.</p>";pending.innerHTML="<p style='color:#888;font-size:13px'>No pending approvals.</p>";return;}
  let pendingCount=0;
  snap.forEach(doc=>{
   const data=doc.data(),email=doc.id,farm=data.farmId||"Unassigned",status=userStatus(data);
   const div=document.createElement("div");
   div.style.cssText="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f1f3f4;font-size:13px;";
   div.innerHTML=`<div><strong>${escapeHtml(email)}</strong> ${status==="Pending"?'<span class="pending-badge">PENDING</span>':status==="Approved"?'<span class="approved-badge">APPROVED</span>':'<span style="color:#c62828;font-size:10px;font-weight:800">REVOKED</span>'}<br><small style="color:#666">Farm: <b>${escapeHtml(farm)}</b></small></div>
    <div style="display:flex;gap:6px;"><button class="change-user-farm" style="background:#ff9800;color:#fff;border:none;padding:5px 8px;border-radius:6px;font-size:11px;font-weight:600"><i class="fas fa-pen"></i></button>
    <button class="revoke-user" style="background:#d32f2f;color:#fff;border:none;padding:5px 8px;border-radius:6px;font-size:11px;font-weight:600"><i class="fas fa-user-slash"></i></button></div>`;
   div.querySelector(".change-user-farm").onclick=()=>promptChangeUserFarm(email);
   div.querySelector(".revoke-user").onclick=()=>revokeUserAccess(email);
   container.appendChild(div);
   if(status==="Pending"){pendingCount++;const p=div.cloneNode(true);p.querySelector(".change-user-farm").onclick=()=>promptChangeUserFarm(email);p.querySelector(".revoke-user").onclick=()=>revokeUserAccess(email);pending.appendChild(p);}
  });
  if(!pendingCount)pending.innerHTML="<p style='color:#888;font-size:13px'>No pending approvals.</p>";
 }catch(e){showError("Could not load user directory: "+getFriendlyErrorMessage(e));}
}
function promptChangeUserFarm(email){
 if(!isSuperAdmin())return showError("Only the super administrator can assign farm access.");
 $("assign-email").value=email;
 $("assign-farm").focus();
 $("assign-farm").scrollIntoView({behavior:"smooth",block:"center"});
 showSuccess("Select an existing farm from the dropdown, then tap Grant Access.");
}
async function revokeUserAccess(email){
 if(email===SUPER_ADMIN)return showError("The super administrator cannot be revoked from this panel.");
 if(!confirm(`Revoke farm access for ${email}?`))return;
 try{
  await db.collection("users").doc(email).set({farmId:"",status:"revoked",updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
  showSuccess("User access revoked.");await loadAdminUsers();
 }catch(e){showError(getFriendlyErrorMessage(e));}
}
$("enter-farm-btn").onclick=()=>{
 const farm=$("farm-select").value;if(!farm)return showError("Please select a farm first.");
 currentFarmId=farm;localStorage.setItem(SELECTED_FARM_KEY,farm);isSuperAdminViewingAsAdmin=false;$("farm-name").textContent="Farm: "+farm;$("switch-farm-btn").classList.remove("hidden");
 $("app-view").classList.remove("hidden");loadRecords();startNotificationListener();showScreen("dashboard");
};
$("create-farm-btn").onclick=async()=>{
 const farm=$("new-farm-id").value.trim();
 if(farm.length<2||farm.length>60)return showError("Farm name must be 2-60 characters.");
 try{
  await db.collection("metadata").doc("farmList").set({farms:firebase.firestore.FieldValue.arrayUnion(farm)},{merge:true});
  $("new-farm-id").value="";await loadAdminFarms();showSuccess("Farm '"+farm+"' created successfully!");
 }catch(e){showError(getFriendlyErrorMessage(e));}
};
$("delete-farm-btn").onclick=async()=>{
 if(!isSuperAdmin())return showError("Only the super administrator can delete a farm.");
 const farm=$("delete-farm-select").value;
 if(!farm)return showError("Select a farm to delete.");
 if(!confirm(`Delete farm "${farm}"? This will only be allowed if the farm has no users and no transaction records.`))return;
 try{
  const users=await db.collection("users").where("farmId","==",farm).get();
  if(!users.empty)return showError("This farm still has assigned users. Reassign or revoke them first.");
  const tx=await db.collection("transactions").where("farmId","==",farm).limit(1).get();
  if(!tx.empty)return showError("This farm still has transaction records. For safety, delete the records first or keep the farm.");
  await db.collection("metadata").doc("farmList").set({farms:firebase.firestore.FieldValue.arrayRemove(farm)},{merge:true});
  if(currentFarmId===farm){currentFarmId="";localStorage.removeItem(SELECTED_FARM_KEY);if(unsubscribeRecords)unsubscribeRecords();unsubscribeRecords=null;$("app-view").classList.add("hidden");}
  await loadAdminFarms();showSuccess(`Farm "${farm}" deleted successfully.`);
 }catch(e){showError("Could not delete farm: "+getFriendlyErrorMessage(e));}
};

$("assign-user").onclick=async()=>{
 if(!isSuperAdmin())return showError("Only the super administrator can assign farm access.");
 const email=$("assign-email").value.trim().toLowerCase(),farm=$("assign-farm").value;
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return showError("Enter a valid user email.");
 if(!farm)return showError("Select an existing farm from the dropdown.");
 try{
  const farmSnap=await db.collection("metadata").doc("farmList").get();
  const farms=farmSnap.exists?(farmSnap.data().farms||[]):[];
  if(!farms.includes(farm))return showError("That farm no longer exists. Refresh the farm list and select an existing farm.");
  await db.collection("users").doc(email).set({farmId:farm,status:"approved",updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
  $("assign-email").value="";$("assign-farm").value="";await loadAdminFarms();await loadAdminUsers();showSuccess("User approved and assigned successfully.");
 }catch(e){showError(getFriendlyErrorMessage(e));}
};

function parseCSV(text){
 const rows=[];let row=[],cell="",quoted=false;
 for(let i=0;i<text.length;i++){
  const ch=text[i],next=text[i+1];
  if(ch==='"'&&quoted&&next==='"'){cell+='"';i++;continue;}
  if(ch==='"'){quoted=!quoted;continue;}
  if(ch===','&&!quoted){row.push(cell);cell="";continue;}
  if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&next==='\n')i++;row.push(cell);cell="";if(row.some(v=>v.trim()!==""))rows.push(row);row=[];continue;}
  cell+=ch;
 }
 if(cell!==""||row.length){row.push(cell);if(row.some(v=>v.trim()!==""))rows.push(row);}
 return rows;
}
function normalizeAnimal(value){
 const v=String(value||"").trim().toLowerCase();
 return ({goat:"goat",goats:"goat",sheep:"sheep",cattle:"cattle",cow:"cattle",chicken:"chicken",chickens:"chicken",other:"other","other animal":"other","other animals":"other"}[v]||"other");
}
function normalizeType(value){
 const v=String(value||"").trim().toLowerCase();
 if(v.includes("death")||v.includes("loss"))return "death";
 if(v.includes("purchase"))return "purchase";
 if(v.includes("medical")||v.includes("drug"))return "medical";
 if(v.includes("feed")||v.includes("fodder"))return "feed";
 if(v.includes("handover")||v.includes("caretaker")||v.includes("custody"))return "handover";
 if(v.includes("herdsman")||v.includes("worker")||v.includes("salary"))return "herdsman";
 return "other";
}
function validateImportedRecord(r){
 const type=normalizeType(r.type),animalType=normalizeAnimal(r.animalType||r.animal),animalName=animalType==="other"?String(r.animalName||r.animal||"").trim():"",date=String(r.date||"").slice(0,10),description=String(r.description||"").trim();
 const amount=Number(r.amount??0),count=Math.max(0,Number(r.animalCount??r.goatCount??0)||0);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error("Invalid record date.");
 if(date>today())throw new Error("Imported records cannot have future dates.");
 if(!description||description.length>300)throw new Error("Every imported record needs a description of 1-300 characters.");
 if(animalType==="other"&&(!animalName||animalName.length>50))throw new Error("Imported records with Other animal type must specify an animal name of 1-50 characters.");
 if(!Number.isFinite(amount)||amount<0||amount>1000000000)throw new Error("Imported record has an invalid amount.");
 if(type==="purchase"&&count<1)throw new Error("Purchase records must contain at least 1 animal.");
 if(type==="death"&&count<1)throw new Error("Death records must contain at least 1 lost animal.");
 const images=Array.isArray(r.images)?r.images.slice(0,3).filter(x=>typeof x==="string"&&x.length<=500000):[];
 const receipt=typeof r.receipt==="string"&&r.receipt.length<=500000?r.receipt:null;
 const handoverName=type==="handover"?String(r.handoverName||"").trim():"";
 const handoverPurpose=type==="handover"?String(r.handoverPurpose||"").trim():"";
 const handoverReturnDate=type==="handover"?String(r.handoverReturnDate||"").trim():"";
 const handoverPhone=type==="handover"?String(r.handoverPhone||"").trim():"";
 const handoverLocation=type==="handover"?String(r.handoverLocation||"").trim():"";
 const handoverNotes=type==="handover"?String(r.handoverNotes||"").trim():"";
 const handoverLivestock=type==="handover"&&Array.isArray(r.handoverLivestock)?r.handoverLivestock.slice(0,20).map(x=>({animalType:normalizeAnimal(x.animalType||x.animal),animalName:String(x.animalName||"").trim(),tagId:String(x.tagId||"").trim(),sex:String(x.sex||"").trim(),age:String(x.age||"").trim(),details:String(x.details||"").trim(),photo:String(x.photo||"")})):[];
 if(type==="handover"&&(!handoverName||handoverName.length>100||!handoverPhone||handoverPhone.length>30||!handoverLivestock.length))throw new Error("Handover records must include recipient name, phone number and livestock details.");
 if(type==="handover"&&handoverReturnDate&&handoverReturnDate<date)throw new Error("Handover return date cannot be before the handover date.");
 const herdsmanName=type==="herdsman"?String(r.herdsmanName||"").trim():"";
 const herdsmanPhone=type==="herdsman"?String(r.herdsmanPhone||"").trim():"";
 const herdsmanLivestock=type==="herdsman"&&Array.isArray(r.herdsmanLivestock)?r.herdsmanLivestock.slice(0,100).map(x=>({animalType:normalizeAnimal(x.animalType||x.animal),tagId:String(x.tagId||"").trim(),sex:String(x.sex||"").trim(),age:String(x.age||"").trim(),details:String(x.details||"").trim()})):[];
 if(type==="herdsman"&&(!herdsmanName||herdsmanName.length>100||!herdsmanPhone||herdsmanPhone.length>30||!herdsmanLivestock.length))throw new Error("Herdsman records must include name, phone number and livestock details.");
 return {type,animalType,animalName,date,description,amount,animalCount:type==="herdsman"?herdsmanLivestock.length:type==="handover"?handoverLivestock.length:count,images,receipt,herdsmanName,herdsmanPhone,herdsmanLivestock,handoverName,handoverPhone,handoverLocation,handoverPurpose,handoverReturnDate,handoverNotes,handoverLivestock};
}
async function importRecordsFromFile(){
 if(!isSuperAdmin())return showError("Only the super administrator can import records.");
 const farm=$("import-farm-select").value,file=$("import-file").files[0];
 if(!farm)return showError("Select an existing target farm first.");
 if(!file)return showError("Choose a JSON backup or CSV export file.");
 if(file.size>12*1024*1024)return showError("Import file is too large. Maximum 12 MB.");
 const btn=$("import-btn"),status=$("import-status");btn.disabled=true;btn.textContent="Checking file...";status.style.display="none";
 try{
  const text=await file.text();let sourceRecords=[];
  if(file.name.toLowerCase().endsWith(".json")||file.type.includes("json")){
   const parsed=JSON.parse(text);
   if(!Array.isArray(parsed.records))throw new Error("This JSON file is not a Farm Ledger backup.");
   sourceRecords=parsed.records;
  }else{
   const rows=parseCSV(text);
   if(rows.length<2)throw new Error("The CSV file contains no records.");
   const headers=rows[0].map(h=>h.trim().toLowerCase());
   const idx=name=>headers.indexOf(name.toLowerCase());
   const dateI=idx("date"),animalI=idx("animal"),animalNameI=idx("animal name"),typeI=idx("type"),descI=idx("description"),countI=idx("animal count"),amountI=idx("amount (ngn)");
   if(dateI<0||typeI<0||descI<0||amountI<0)throw new Error("CSV must contain Date, Type, Description and Amount (NGN) columns.");
   sourceRecords=rows.slice(1).map(r=>({date:r[dateI],animal:r[animalI],animalName:animalNameI>=0?r[animalNameI]:"",type:r[typeI],description:r[descI],animalCount:countI>=0?r[countI]:0,amount:r[amountI]}));
  }
  if(!sourceRecords.length)return showError("No records found in the selected file.");
  if(sourceRecords.length>400)return showError("Import is limited to 400 records at a time for safety. Split the backup and import it in parts.");
  const clean=sourceRecords.map(validateImportedRecord);
  const farmSnap=await db.collection("metadata").doc("farmList").get();
  const farms=farmSnap.exists?(farmSnap.data().farms||[]):[];
  if(!farms.includes(farm))throw new Error("The selected farm no longer exists.");
  btn.textContent="Importing...";
  let imported=0;
  for(let offset=0;offset<clean.length;offset+=400){
   const batch=db.batch();
   clean.slice(offset,offset+400).forEach(r=>{
    const ref=db.collection("transactions").doc();
    const data={farmId:farm,author:currentUser.email.toLowerCase(),type:r.type,animalType:r.animalType,animalName:r.animalName||"",animalCount:r.animalCount,goatCount:r.animalType==="goat"&&r.type==="purchase"?r.animalCount:0,amount:r.amount,description:r.description,date:r.date,images:r.images||[],receipt:r.receipt||null,herdsmanName:r.herdsmanName||"",herdsmanPhone:r.herdsmanPhone||"",herdsmanLivestock:r.herdsmanLivestock||[],handoverName:r.handoverName||"",handoverPhone:r.handoverPhone||"",handoverLocation:r.handoverLocation||"",handoverPurpose:r.handoverPurpose||"",handoverReturnDate:r.handoverReturnDate||"",handoverNotes:r.handoverNotes||"",handoverLivestock:r.handoverLivestock||[],images:r.images||[],imported:true,importedAt:firebase.firestore.FieldValue.serverTimestamp(),createdAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
    batch.set(ref,data);imported++;
   });
   await batch.commit();
  }
  status.textContent=`Imported ${imported} record${imported===1?"":"s"} into ${farm}. Existing records were not overwritten.`;status.style.display="block";
  $("import-file").value="";
  showSuccess(`Successfully imported ${imported} record${imported===1?"":"s"}.`);
  if(currentFarmId===farm)loadRecords();
 }catch(e){showError("Import failed: "+getFriendlyErrorMessage(e));}
 finally{btn.disabled=false;btn.innerHTML='<i class="fas fa-file-import"></i> Import Records';}
}
$("import-btn").onclick=importRecordsFromFile;

async function getAdminFarmRecords(){
 if(!isSuperAdmin())throw new Error("Only the super administrator can access export data.");
 const farm=$("data-tools-farm").value;
 if(!farm)throw new Error("Select a farm first.");
 const snap=await db.collection("transactions").where("farmId","==",farm).get();
 const data=[];snap.forEach(doc=>data.push({id:doc.id,...doc.data()}));
 data.sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
 return {farm,data};
}
$("export-csv-btn").onclick=async()=>{
 try{
  const {farm,data}=await getAdminFarmRecords();
  if(!data.length)return showError("No records found for this farm.");
  let csv="Date,Animal,Animal Name,Type,Description,Animal Count,Amount (NGN),Author\n";
  data.forEach(r=>{csv+=`"${r.date||""}","${animalLabel(r.animalType||"goat",r.animalName)}","${(r.animalName||"").replace(/"/g,'""')}","${r.type||""}","${(r.description||"").replace(/"/g,'""')}","${r.animalCount??r.goatCount??0}","${r.amount||0}","${(r.author||"").replace(/"/g,'""')}"\n`;});
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"}),link=document.createElement("a");
  link.href=URL.createObjectURL(blob);link.download=`${farm}_ledger_${today()}.csv`;link.click();URL.revokeObjectURL(link.href);
  showSuccess("CSV export created successfully.");
 }catch(e){showError(getFriendlyErrorMessage(e));}
};

$("export-json-btn").onclick=async()=>{
 try{
  const {farm,data}=await getAdminFarmRecords();
  if(!data.length)return showError("No records found for this farm.");
  const payload={backupVersion:2,exportedAt:new Date().toISOString(),farmId:farm,recordCount:data.length,records:data};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),link=document.createElement("a");
  link.href=URL.createObjectURL(blob);link.download=`${farm}_farm_ledger_backup_${today()}.json`;link.click();URL.revokeObjectURL(link.href);
  showSuccess("Full JSON backup created successfully.");
 }catch(e){showError(getFriendlyErrorMessage(e));}
};

$("forgot-password").classList.remove("hidden");
$("password-hint").classList.add("hidden");
$("animal-count-label").textContent="Number of Goats";
$("record-type").dispatchEvent(new Event("change"));
