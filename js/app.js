(async function init() {
  Charts.initDefaults();
  initTips();

  const urlParams = new URLSearchParams(window.location.search);

  if (urlParams.has('code')) {
    showLoading('Authentification Strava...', 10);
    try {
      await Auth.handleCallback();
    } catch (e) {
      alert('Erreur authentification: ' + e.message);
      Auth.logout();
      return;
    }
  }

  if (!Auth.hasCredentials()) {
    document.getElementById('setup-modal').classList.remove('hidden');
    document.getElementById('setup-save-btn').addEventListener('click', function() {
      var cid = document.getElementById('setup-client-id').value.trim();
      var csec = document.getElementById('setup-client-secret').value.trim();
      if (!cid || !csec) { alert('Veuillez remplir les deux champs.'); return; }
      Auth.saveCredentials(cid, csec);
      Auth.startOAuth();
    });
    return;
  }

  if (!Auth.isAuthenticated()) {
    Auth.startOAuth();
    return;
  }

  showLoading('Connexion a Strava...', 15);
  let activities = Strava.getCachedRuns();

  try {
    activities = await Strava.fetchAllActivities(function(msg) { showLoading(msg, 30); });
  } catch (e) {
    console.error('Fetch failed:', e.message);
    if (activities.length === 0) {
      showError('Impossible de charger les activites. Verifiez vos identifiants.');
      return;
    }
  }

  if (activities.length === 0) {
    hideLoading();
    document.getElementById('main-content').innerHTML = '<div style="text-align:center;padding:60px 20px;color:#7a7a90;"><div style="font-size:3rem;margin-bottom:16px;">🏃</div><p>Aucune activite trouvee sur Strava.</p></div>';
    return;
  }

  showLoading('Calcul des metriques...', 55);
  const fcmax = Metrics.computeFCmax(activities);
  const zones = Metrics.computeHrZones(fcmax);

  showLoading('Classification...', 72);
  let classifications = Classify.classifyAll(activities, fcmax);
  classifications = Classify.markTaperSessions(activities, classifications);
  activities.forEach(function(a) { a._type = classifications[a.id]; });

  showLoading('Calcul VO2max...', 80);
  const vo2History = Metrics.buildVo2maxHistory(activities, fcmax);

  showLoading('Calcul ATL/CTL/TSB...', 88);
  const atlCtlSeries = Metrics.computeAtlCtlTsb(activities, fcmax);

  showLoading('Preparation interface...', 95);

  const appState = { activities, fcmax, zones, vo2History, atlCtlSeries, classifications };
  UI.init(appState);
  UI.setAthleteName();
  UI.navigateTo('home');
  hideLoading();

  setTimeout(async function() {
    try {
      const recent = activities.slice(0, 200);
      await Strava.fetchStreamsForActivities(recent, null);
      await Strava.fetchAllBestEffortsBackground(recent, null);
    } catch(e) { console.warn('Background fetch:', e.message); }
  }, 3000);
})();

function showLoading(text, pct) {
  var screen = document.getElementById('loading-screen');
  if (screen) screen.classList.remove('hidden');
  if (text) { var el = document.getElementById('loading-text'); if (el) el.textContent = text; }
  if (pct !== undefined) { var bar = document.getElementById('loading-bar'); if (bar) bar.style.width = pct + '%'; }
}
function hideLoading() {
  var screen = document.getElementById('loading-screen');
  if (screen) { screen.style.opacity = '0'; screen.style.transition = 'opacity 0.4s'; setTimeout(function() { screen.classList.add('hidden'); }, 400); }
}
function showError(msg) {
  hideLoading();
  document.getElementById('main-content').innerHTML = '<div style="text-align:center;padding:60px 20px;"><div style="font-size:3rem;margin-bottom:16px;">⚠️</div><p style="color:#f04a8a;">' + msg + '</p><button onclick="Auth.logout()" style="background:transparent;border:1px solid #2a2a34;color:#7a7a90;padding:8px 16px;border-radius:8px;cursor:pointer;margin-top:12px;">Reinitialiser</button></div>';
}
