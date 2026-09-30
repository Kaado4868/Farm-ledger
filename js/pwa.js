(function(){
  var deferredInstallPrompt = null;
  var installBtn = document.getElementById('install-app-btn');
  var updateBar = document.getElementById('pwa-update-bar');
  var updateBtn = document.getElementById('pwa-update-btn');
  var offlineBar = document.getElementById('pwa-offline-bar');
  var offlineTimer = null;
  var reloading = false;

  function isStandalone(){
    return window.matchMedia && window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
  }

  function setOfflineState(){
    if (offlineBar) {
      clearTimeout(offlineTimer);
      if (!navigator.onLine) {
        offlineBar.classList.add('show');
        offlineTimer = setTimeout(function(){
          offlineBar.classList.remove('show');
        }, 5000);
      } else {
        offlineBar.classList.remove('show');
      }
    }
    if (window.refreshConnectionStatus) window.refreshConnectionStatus();
  }
  window.addEventListener('online', setOfflineState);
  window.addEventListener('offline', setOfflineState);
  setOfflineState();

  window.addEventListener('beforeinstallprompt', function(event){
    event.preventDefault();
    deferredInstallPrompt = event;
    if (installBtn && !isStandalone()) installBtn.classList.add('show');
  });

  if (installBtn) {
    installBtn.addEventListener('click', async function(){
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      try { await deferredInstallPrompt.userChoice; } catch(e) {}
      deferredInstallPrompt = null;
      installBtn.classList.remove('show');
    });
  }

  window.addEventListener('appinstalled', function(){
    deferredInstallPrompt = null;
    if (installBtn) installBtn.classList.remove('show');
    var help=document.getElementById('pwa-install-help');
    if(help) help.classList.add('hidden');
  });

  function showInstallHelp(){
    var help=document.getElementById('pwa-install-help');
    var text=document.getElementById('pwa-install-help-text');
    if(!help) return;
    if(text){
      if(/iPhone|iPad|iPod/i.test(navigator.userAgent)) text.textContent='In Safari, tap Share, then Add to Home Screen.';
      else text.textContent='If Chrome does not show Install app, open the browser menu (⋮) and choose Add to home screen. If an Install app option appears, choose it.';
    }
    help.classList.remove('hidden');
  }
  var fallbackInstall=document.getElementById('pwa-install-action');
  var fallbackClose=document.getElementById('pwa-install-close');
  if(fallbackInstall) fallbackInstall.addEventListener('click', async function(){
    if(deferredInstallPrompt){
      deferredInstallPrompt.prompt();
      try{await deferredInstallPrompt.userChoice;}catch(e){}
      deferredInstallPrompt=null;
      if(installBtn) installBtn.classList.remove('show');
    }else showInstallHelp();
  });
  if(fallbackClose) fallbackClose.addEventListener('click',function(){
    var help=document.getElementById('pwa-install-help');
    if(help) help.classList.add('hidden');
  });

  function showUpdate(reg){
    if (!updateBar) return;
    updateBar.classList.add('show');
    if (updateBtn) {
      updateBtn.onclick = function(){
        if (reg && reg.waiting) reg.waiting.postMessage({type:'SKIP_WAITING'});
      };
    }
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('/Farm-ledger/service-worker.js', {scope:'/Farm-ledger/'})
        .then(function(reg){
          if (reg.waiting) showUpdate(reg);
          reg.addEventListener('updatefound', function(){
            var worker = reg.installing;
            if (!worker) return;
            worker.addEventListener('statechange', function(){
              if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                showUpdate(reg);
              }
            });
          });
          // Check immediately, when the app becomes visible, and periodically.
          // This makes the Update button appear promptly after a new deployment.
          reg.update().catch(function(){});
          setInterval(function(){ reg.update().catch(function(){}); }, 2 * 60 * 1000);
          document.addEventListener('visibilitychange', function(){
            if (!document.hidden) reg.update().catch(function(){});
          });
        })
        .catch(function(){});
    });

    navigator.serviceWorker.addEventListener('message', function(event){
      if (event.data && event.data.type === 'UPDATE_READY') {
        if (navigator.serviceWorker.controller) {
          document.documentElement.setAttribute('data-update-ready','true');
        }
      }
    });

    navigator.serviceWorker.addEventListener('controllerchange', function(){
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  }
  // Android/Chrome can otherwise leave a standalone PWA with a single back press.
  // Require the second back press within exactly 5 seconds of the warning.
  var backExitDeadline = 0;
  var backTimer = null;
  function armBackExit(){
    backExitDeadline = Date.now() + 5000;
    if (window.showSuccess) window.showSuccess('Press again to exit.');
    clearTimeout(backTimer);
    backTimer = setTimeout(function(){
      backExitDeadline = 0;
    }, 5000);
    history.pushState({farmLedger:true}, document.title, location.href);
  }
  if (window.history && window.history.pushState) {
    history.replaceState({farmLedger:true}, document.title, location.href);
    history.pushState({farmLedger:true}, document.title, location.href);
    window.addEventListener('popstate', function(){
      var appVisible = document.getElementById('app-view') &&
        !document.getElementById('app-view').classList.contains('hidden');
      var viewer = document.getElementById('image-viewer');
      var installHelp = document.getElementById('pwa-install-help');
      if (!appVisible) return;
      if (viewer && viewer.style.display === 'flex') {
        viewer.style.display = 'none';
        history.pushState({farmLedger:true}, document.title, location.href);
        return;
      }
      if (installHelp && !installHelp.classList.contains('hidden')) {
        installHelp.classList.add('hidden');
        history.pushState({farmLedger:true}, document.title, location.href);
        return;
      }
      if (Date.now() <= backExitDeadline) {
        backExitDeadline = 0;
        clearTimeout(backTimer);
        history.go(-1);
        return;
      }
      armBackExit();
    });
  }
})();
