const CACHE_NAME = "farm-ledger-v29";
const BASE = self.registration.scope;
const APP_SHELL = ["","index.html","login.html","manifest.webmanifest","icon-192.png","icon-512.png","icon-512-maskable.png","apple-touch-icon-180.png","css/farm-ledger.css","js/app.js","js/pwa.js","js/ui-fixes.js","dashboard.html","manage.html","records.html","chat.html","admin.html","notifications.html","admin-chat.html","add-record.html","handover.html","verify.html"];
function shellUrl(path){return new URL(path,BASE).href;}
async function cacheResponse(request,response){if(response&&response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(request,copy)).catch(()=>{});}return response;}
async function repairAppJs(response){
 if(!response||!response.ok)return response;
 try{
  const source=await response.text();
  const fixed=source
   .replace('btn.textContent=loginMode?"Login":"Sign Up";};\n$("google-btn")','btn.textContent=loginMode?"Login":"Sign Up";}};\n$("google-btn")')
   .replace('btn.textContent=$("record-id").value?"Update Record":"Save Record";};\nfunction editRecord','btn.textContent=$("record-id").value?"Update Record":"Save Record";}};\nfunction editRecord')
   .replace('btn.innerHTML=$("handover-id").value?\'<i class="fas fa-save"></i> Update Handover\':\'<i class="fas fa-save"></i> Save Handover\';};\nfunction editHandoverRecord','btn.innerHTML=$("handover-id").value?\'<i class="fas fa-save"></i> Update Handover\':\'<i class="fas fa-save"></i> Save Handover\';}};\nfunction editHandoverRecord');
  return new Response(fixed,{status:response.status,statusText:response.statusText,headers:response.headers});
 }catch(e){return response;}
}
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL.map(shellUrl))).then(()=>self.skipWaiting()));});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("farm-ledger-")&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener("message",event=>{if(event.data&&event.data.type==="SKIP_WAITING")self.skipWaiting();});
self.addEventListener("fetch",event=>{
 const request=event.request;if(request.method!=="GET")return;
 const url=new URL(request.url),scopeUrl=new URL(BASE);
 if(url.origin!==scopeUrl.origin||!url.href.startsWith(scopeUrl.href))return;
 if(request.mode==="navigate"){
  event.respondWith((async()=>{const cached=await caches.match(request);const network=fetch(request,{cache:"no-cache"}).then(response=>cacheResponse(request,response)).catch(()=>cached||caches.match(shellUrl("login.html")));if(cached){event.waitUntil(network.then(()=>undefined));return cached;}return network;})());return;
 }
 const isAppJs=url.pathname.endsWith("/js/app.js");
 const isCoreAppAsset=/\/(?:js|css)\//.test(url.pathname)||/\/(?:index|login)\.html$/.test(url.pathname);
 if(isAppJs){event.respondWith((async()=>{const network=await fetch(request,{cache:"no-cache"});const repaired=await repairAppJs(network);await cacheResponse(request,repaired.clone());return repaired;})().catch(()=>caches.match(request)));return;}
 if(isCoreAppAsset){event.respondWith(caches.match(request).then(cached=>{const network=fetch(request,{cache:"no-cache"}).then(response=>cacheResponse(request,response)).catch(()=>cached);return cached||network;}));return;}
 event.respondWith(caches.match(request).then(cached=>{const network=fetch(request).then(response=>cacheResponse(request,response)).catch(()=>cached);return cached||network;}));
});
